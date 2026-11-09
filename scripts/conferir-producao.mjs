#!/usr/bin/env node
/**
 * Conferência da PRODUÇÃO depois do deploy (PLANO F8-B1/F8-C5, ARQUITETURA 15.11).
 *
 * SÓ LEITURA: não cria conta, não faz login, não chama RPC que grava, não envia formulário.
 * Faz só GET no app e SELECT com a chave publishable (anon), que devem voltar vazios ou negados.
 *
 * O que confere:
 *  - rotas públicas 200; rota privada sem login vai ao /login; /api/* sem login 401;
 *  - /dev/* e /diagnostico/* 404; sem a faixa TESTE; noindex em todas as páginas;
 *  - endereço antigo (mechaflow-seven.vercel.app) responde 308 para o domínio, no mesmo caminho;
 *  - página pública do orçamento: noindex, no-store, no-referrer e nenhum cookie;
 *  - PWA: manifest, ícones e sw.js;
 *  - anon sem leitura em nenhuma tabela ou view de `public` (lista tirada de database.types.ts);
 *  - nenhum `sb_secret_` nas páginas.
 *
 * Uso (PowerShell):
 *   $env:CONFERIR_SUPABASE_URL="https://<ref-producao>.supabase.co"
 *   $env:CONFERIR_SUPABASE_KEY="sb_publishable_..."      # a publishable de produção (é pública)
 *   node scripts/conferir-producao.mjs
 *
 * Ensaio local, antes de existir a produção (build com NEXT_PUBLIC_AMBIENTE=producao e `next start`):
 *   CONFERIR_ENSAIO=1 CONFERIR_APP=http://localhost:3000 node scripts/conferir-producao.mjs
 *   (sem CONFERIR_SUPABASE_*, usa o staging do .env.local só para os SELECT do anon; pula o 308)
 *
 * Nunca lê o .env.local fora do ensaio. Recusa chave secret/service_role.
 */
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const DOMINIO = "https://mechaflow.com.br";
const ENDERECO_ANTIGO = "https://mechaflow-seven.vercel.app";
const ENSAIO = process.env.CONFERIR_ENSAIO === "1";
const APP = (process.env.CONFERIR_APP ?? DOMINIO).replace(/\/$/, "");

// ------------------------------------------------------------------ travas (antes de qualquer rede)
if (!ENSAIO && APP !== DOMINIO) {
  throw new Error(`Este script só confere ${DOMINIO}. Para ensaiar num servidor local, use CONFERIR_ENSAIO=1. Nada foi feito.`);
}
if (ENSAIO && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(APP)) {
  throw new Error("No ensaio, CONFERIR_APP precisa ser um servidor local (http://localhost:PORTA). Nada foi feito.");
}

function lerEnvLocal() {
  const caminho = new URL("../.env.local", import.meta.url);
  if (!existsSync(caminho)) return {};
  return Object.fromEntries(
    readFileSync(caminho, "utf8")
      .replace(/^﻿/, "")
      .split(/\r?\n/)
      .filter((l) => l && !l.trimStart().startsWith("#") && l.includes("="))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^(["'])(.*)\1$/, "$2")]),
  );
}
const local = ENSAIO ? lerEnvLocal() : {};
const URL_SB = process.env.CONFERIR_SUPABASE_URL || local.NEXT_PUBLIC_SUPABASE_URL || "";
const CHAVE = process.env.CONFERIR_SUPABASE_KEY || local.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
if (!URL_SB || !CHAVE) {
  throw new Error("Defina CONFERIR_SUPABASE_URL e CONFERIR_SUPABASE_KEY (a chave publishable da produção). Nada foi feito.");
}
if (CHAVE.startsWith("sb_secret_") || /service_role/.test(Buffer.from(CHAVE.split(".")[1] ?? "", "base64url").toString("utf8"))) {
  throw new Error("Esta é uma chave secreta. O script usa só a publishable. Nada foi feito.");
}
if (!/^https:\/\/[a-z0-9]{20}\.supabase\.co\/?$/.test(URL_SB)) {
  throw new Error("CONFERIR_SUPABASE_URL não parece a URL de um projeto Supabase. Nada foi feito.");
}

// ------------------------------------------------------------------ relatório
let passou = 0;
let falhou = 0;
function checar(nome, ok, detalhe = "") {
  if (ok) passou++;
  else falhou++;
  console.log(`${ok ? "PASSOU" : "FALHOU"}  ${nome}${detalhe ? `  (${detalhe})` : ""}`);
}
const titulo = (t) => console.log(`\n== ${t} ==`);

async function get(caminho, base = APP) {
  const r = await fetch(`${base}${caminho}`, { redirect: "manual", headers: { "user-agent": "mechaflow-conferir-producao" } });
  const tipo = r.headers.get("content-type") ?? "";
  const corpo = /text|json|javascript|xml/.test(tipo) ? await r.text() : "";
  if (!corpo) await r.arrayBuffer().catch(() => null);
  return { status: r.status, local: r.headers.get("location"), h: r.headers, tipo, corpo };
}
const det = (r) => `status ${r.status}${r.local ? ` -> ${r.local}` : ""}`;
const noindex = (r) => /noindex/i.test(r.h.get("x-robots-tag") ?? "");
const temFaixaTeste = (html) => html.includes("#F5B800 0 10px") || />\s*TESTE\s*</.test(html);

// ------------------------------------------------------------------ app
titulo(`Páginas públicas (${APP})`);
const publicas = ["/", "/login", "/cadastro", "/termos", "/privacidade", "/esqueci-senha"];
for (const c of publicas) {
  const r = await get(c);
  const falhas = [];
  if (r.status !== 200) falhas.push(det(r));
  if (r.status === 200 && temFaixaTeste(r.corpo)) falhas.push("faixa TESTE presente");
  if (!noindex(r)) falhas.push("sem X-Robots-Tag noindex");
  if (r.corpo.includes("sb_secret_")) falhas.push("sb_secret_ no HTML");
  if (r.h.get("set-cookie")?.includes("sb-")) falhas.push("cookie do Supabase sem login");
  checar(`${c} 200, sem faixa TESTE, com noindex`, falhas.length === 0, falhas.join("; "));
}

titulo("Rotas privadas sem login");
for (const c of ["/inicio", "/os", "/minhas-os", "/equipe", "/painel", "/a-receber", "/configuracoes"]) {
  const r = await get(c);
  const destino = r.local ? new URL(r.local, APP) : null;
  checar(`${c} sem login vai ao /login`, [302, 303, 307, 308].includes(r.status) && destino?.pathname === "/login" && destino.origin === new URL(APP).origin, det(r));
}

titulo("API sem login");
const ZERO = "00000000-0000-0000-0000-000000000000";
for (const c of [`/api/os/${ZERO}/pdf`, `/api/os/${ZERO}/orcamento/1/pdf`, `/api/vistorias/${ZERO}/pdf`]) {
  const r = await get(c);
  checar(`${c} sem login 401`, r.status === 401, det(r));
}

titulo("Rotas de teste");
for (const c of ["/dev", "/dev/fase7", "/dev/fase6/publica/aberto", "/diagnostico/fotos", "/diagnostico/vistoria"]) {
  const r = await get(c);
  checar(`${c} 404`, r.status === 404, det(r));
}

titulo("Página pública do orçamento (token inventado)");
{
  const r = await get(`/orcamento/${"x".repeat(43)}`);
  const h = (n) => r.h.get(n) ?? "";
  checar("responde (200 ou 404), sem erro do servidor", r.status === 200 || r.status === 404, det(r));
  checar("X-Robots-Tag noindex, nofollow", /noindex/.test(h("x-robots-tag")) && /nofollow/.test(h("x-robots-tag")), h("x-robots-tag"));
  checar("Referrer-Policy no-referrer", h("referrer-policy") === "no-referrer", h("referrer-policy"));
  checar("Cache-Control no-store", /no-store/.test(h("cache-control")), h("cache-control"));
  checar("nenhum cookie na resposta", !r.h.get("set-cookie"), h("set-cookie").slice(0, 40));
  checar("sem faixa TESTE nem aviso de teste", !temFaixaTeste(r.corpo) && !r.corpo.includes("Ambiente de teste"));
}

titulo("PWA");
{
  const m = await get("/manifest.webmanifest");
  let manifesto = null;
  try {
    manifesto = JSON.parse(m.corpo);
  } catch {
    /* fica null */
  }
  checar("manifest 200 com nome e ícones", m.status === 200 && manifesto?.name === "MechaFlow" && (manifesto?.icons?.length ?? 0) >= 3, det(m));
  checar("manifest com start_url e display standalone", manifesto?.start_url === "/" && manifesto?.display === "standalone");
  for (const icone of manifesto?.icons ?? []) {
    const r = await fetch(`${APP}${icone.src}`, { redirect: "manual" });
    await r.arrayBuffer();
    checar(`ícone ${icone.src} 200 (${icone.type})`, r.status === 200 && (r.headers.get("content-type") ?? "").startsWith(icone.type), `status ${r.status} ${r.headers.get("content-type")}`);
  }
  const sw = await get("/sw.js");
  checar("sw.js 200 como JavaScript, sem cache", sw.status === 200 && /javascript/.test(sw.tipo) && /no-store|no-cache/.test(sw.h.get("cache-control") ?? ""), `${det(sw)} ${sw.tipo}`);
}

titulo("Endereço antigo");
if (ENSAIO) {
  console.log("PULADO  308 do endereço antigo (só no domínio de verdade)");
} else {
  const r = await get("/login?x=1", ENDERECO_ANTIGO);
  checar(`${ENDERECO_ANTIGO}/login?x=1 responde 308 para ${DOMINIO}/login?x=1`, r.status === 308 && r.local === `${DOMINIO}/login?x=1`, det(r));
}

// ------------------------------------------------------------------ banco (anon, só SELECT)
titulo(`anon no Supabase (${new URL(URL_SB).host})`);
{
  const tipos = readFileSync(new URL("../src/lib/supabase/database.types.ts", import.meta.url), "utf8");
  const bloco = (de, ate) => tipos.slice(tipos.indexOf(`    ${de}: {`), tipos.indexOf(`    ${ate}: {`));
  const nomes = (txt) => [...txt.matchAll(/^ {6}([a-z_0-9]+): \{$/gm)].map((x) => x[1]);
  const objetos = [...nomes(bloco("Tables", "Views")), ...nomes(bloco("Views", "Functions"))];
  checar("lista de tabelas e views lida do database.types.ts", objetos.length >= 30, `${objetos.length} objetos`);
  const anon = createClient(URL_SB, CHAVE, { auth: { persistSession: false, autoRefreshToken: false } });
  const abertos = [];
  for (const o of objetos) {
    const { data, error } = await anon.from(o).select("*").limit(1);
    if (!error && (data ?? []).length > 0) abertos.push(`${o} (linha visível)`);
    else if (!error) abertos.push(`${o} (sem erro: anon tem SELECT, mesmo vazio)`);
  }
  checar(`anon sem leitura nas ${objetos.length} tabelas e views`, abertos.length === 0, abertos.slice(0, 8).join(", "));
}

console.log(`\nResultado: ${passou} passaram, ${falhou} falharam.`);
process.exit(falhou ? 1 : 0);
