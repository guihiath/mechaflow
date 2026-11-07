#!/usr/bin/env node
/**
 * Lote de capturas da Fase 7 (F7-E1), pré-requisito da revisão visual F7-R1.
 *
 * Abre o app publicado (Vercel staging, por padrão) em Playwright WebKit (iPhone 13) e Chromium
 * Android 360 px, nos temas claro e escuro, com os 3 papéis, e salva PNGs em docs/capturas-fase7/
 * com o nome `tela_papel_navegador_tema.png`. Os PDFs (OS, resumo final, orçamento) são baixados
 * com a sessão do usuário e convertidos em imagem pelo pdf.js dentro do Chromium.
 *
 * Dados:
 *   - "Oficina Diesel Teste (gabarito7)": SÓ LEITURA (contas do seed, senha SEED_SENHA do .env.local).
 *   - Três oficinas novas e próprias desta rodada, contas `*.RODADA@www.example.org`:
 *       X "Oficina Captura F7 cheia": 30 OS na mesma placa com textos longos, valor alto
 *         (R$ 1.234.567,89), orçamento de 30 itens e de 2 itens, a receber com vários clientes;
 *       Y "Oficina Captura F7 em dia": 1 OS de R$ 1.234.567,89 entregue e paga (a receber vazio);
 *       Z "Oficina Captura F7 nova": nada entregue (painel "primeira vez").
 *   Nada na "Oficina Diesel Teste", nada em produção, nenhuma migração. Só a chave publishable.
 *
 * Uso (bash):
 *   CAPTURA_PLAYWRIGHT=/caminho/node_modules/playwright/index.mjs \
 *   CAPTURA_PDFJS=/caminho/node_modules/pdfjs-dist \
 *   CAPTURA_ESTADO=/pasta-temporaria/estado.json \
 *   node scripts/capturas-fase7.mjs
 * Opções:
 *   APP_URL            padrão: https://mechaflow-git-staging-guihiaths-projects.vercel.app
 *   CAPTURA_SAIDA      padrão: ../docs/capturas-fase7 (a partir de mechaflow/)
 *   CAPTURA_ESTADO     arquivo FORA do repositório onde ficam ids e as senhas aleatórias das contas
 *                      da rodada, para repetir as capturas sem criar outras oficinas. Sem ele, cria
 *                      tudo de novo. Apague o arquivo ao terminar.
 *   CAPTURA_SO         regex: só os grupos cujo nome casar (ex.: "gabarito-dono|pdf").
 *   CAPTURA_NAV        "webkit", "chromium" ou os dois (padrão).
 *   CAPTURA_MES_VAZIO  =1: só o grupo do mês vazio (para um `next start` local com relógio adiantado;
 *                      ver docs/capturas-fase7/INDICE.md).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes, randomUUID as uuid } from "node:crypto";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

// ------------------------------------------------------------------ env
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter((l) => l && !l.trimStart().startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^(["'])(.*)\1$/, "$2")]),
);
const URL_SB = env.NEXT_PUBLIC_SUPABASE_URL;
const CHAVE = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!URL_SB?.includes("qjzhzyzmifashtvffxdx")) throw new Error("Este script só roda no projeto STAGING.");
const APP_URL = (process.env.APP_URL ?? "https://mechaflow-git-staging-guihiaths-projects.vercel.app").replace(/\/$/, "");
if (!/staging|localhost|127\.0\.0\.1/.test(APP_URL))
  throw new Error("APP_URL precisa ser o staging ou um servidor local.");
const SAIDA = resolve(process.env.CAPTURA_SAIDA ?? fileURLToPath(new URL("../../docs/capturas-fase7", import.meta.url)));
const PW = process.env.CAPTURA_PLAYWRIGHT;
const PDFJS = process.env.CAPTURA_PDFJS;
if (!PW || !PDFJS) throw new Error("Defina CAPTURA_PLAYWRIGHT e CAPTURA_PDFJS (ver o cabeçalho).");
const { webkit, chromium, devices } = await import(pathToFileURL(PW).href);
const ESTADO = process.env.CAPTURA_ESTADO;
const SO = process.env.CAPTURA_SO ? new RegExp(process.env.CAPTURA_SO) : null;
const NAVS = (process.env.CAPTURA_NAV ?? "webkit,chromium").split(",");
const TERMOS = "2026-10-28";
const DOMINIO = "www.example.org";
mkdirSync(SAIDA, { recursive: true });

const novoCliente = () => createClient(URL_SB, CHAVE, { auth: { persistSession: false, autoRefreshToken: false } });
const msg = (r) => r?.error?.message ?? (r?.error ? r.error.code : "sem erro");
const falhas = [];
const feitas = [];
function falha(oque, e) {
  const t = `${oque}: ${e?.message ?? e}`.slice(0, 300);
  falhas.push(t);
  console.log(`FALHOU  ${t}`);
}

// ------------------------------------------------------------------ textos de teste (fictícios)
const CLIENTE_LONGO = "Transportadora e Logística Irmãos Albuquerque de Vasconcellos Ltda";
const SINTOMA_LONGO =
  "Motorista relata perda de força na subida da serra com o caminhão carregado, fumaça preta pelo escapamento, luz da injeção acendendo de vez em quando e consumo de diesel bem acima do normal nas últimas três viagens entre Curitiba e Joinville. Também ouviu um chiado vindo da região do turbo quando acelera forte.";
const CAUSA_LONGA =
  "Mangueira de pressurização do turbo rachada perto da abraçadeira do intercooler, bico injetor do 3º cilindro gotejando e filtro de ar saturado de poeira (troca vencida havia 40 mil km).";
const SOLUCAO_LONGA =
  "Trocada a mangueira do turbo e as duas abraçadeiras, feita a limpeza e o teste dos bicos com troca do bico do 3º cilindro, trocado o filtro de ar e feito teste de rodagem de 25 km na serra com o caminhão carregado: sem fumaça e sem perda de força.";
const ITEM_LONGO =
  "Substituição completa do conjunto de embreagem com volante bimassa, rolamento de encosto e retentor traseiro do virabrequim, com regulagem do pedal e teste de rodagem";
const ALTO = 123456789; // R$ 1.234.567,89
const SERVICOS = [
  ["Troca de óleo do motor", 35000],
  ["Regulagem de freios", 48000],
  ["Diagnóstico eletrônico", 30000],
  ["Alinhamento e balanceamento da carreta", 42000],
  ["Revisão do sistema de arrefecimento", 56000],
  ["Troca de lonas e tambores", 89000],
  ["Limpeza e teste de bicos injetores", 61000],
];

// ------------------------------------------------------------------ preparo dos dados
async function criarConta(rotulo, rodada) {
  const sb = novoCliente();
  const email = `${rotulo}.${rodada}@${DOMINIO}`;
  const pw = `Mf-${randomBytes(12).toString("base64url")}`;
  const { data, error } = await sb.auth.signUp({ email, password: pw });
  if (error) throw new Error(`signUp ${rotulo}: ${error.message}`);
  if (!data.session) throw new Error(`signUp ${rotulo}: sem sessão (confirmação de e-mail ligada?)`);
  return { sb, email, pw, id: data.user.id };
}

async function preparar() {
  const rodada = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
  console.log(`\n== Preparo: oficinas novas da rodada ${rodada} ==`);
  const conta = async (rotulo) => criarConta(rotulo, rodada);

  // ---------------- X: cheia
  const dX = await conta("dono.cap7x");
  const ofX = await dX.sb.rpc("criar_oficina", { p_nome_oficina: `Oficina Captura F7 cheia ${rodada.slice(-4)}`, p_nome_dono: "Dono Captura", p_versao_termos: TERMOS, p_telefone: "(41) 98888-7777" });
  if (ofX.error) throw new Error(`criar_oficina X: ${msg(ofX)}`);
  await dX.sb.from("oficinas").update({ documento: "12345678000195", vistoria_obrigatoria: false }).eq("id", ofX.data);
  const cM = await dX.sb.rpc("criar_convite", { p_papel: "mecanico" }).single();
  const cA = await dX.sb.rpc("criar_convite", { p_papel: "atendente" }).single();
  const mX = await conta("mecanico.cap7x");
  const aX = await conta("atendente.cap7x");
  const r1 = await mX.sb.rpc("aceitar_convite", { p_token: cM.data?.token, p_nome: "Mecânico Captura", p_versao_termos: TERMOS });
  const r2 = await aX.sb.rpc("aceitar_convite", { p_token: cA.data?.token, p_nome: "Atendente Captura", p_versao_termos: TERMOS });
  if (r1.error || r2.error) throw new Error(`convites X: ${msg(r1)}/${msg(r2)}`);

  const sb = dX.sb;
  const servIds = [];
  for (const [nome, preco] of SERVICOS) {
    const s = await sb.from("catalogo_servicos").insert({ nome }).select("id").single();
    if (s.error) throw new Error(`serviço: ${msg(s)}`);
    await sb.from("catalogo_servicos_precos").upsert({ servico_id: s.data.id, preco_padrao_centavos: preco });
    servIds.push(s.data.id);
  }
  const veiculos = new Map();
  let km = 412000;
  async function abrir(placa, cliente, { mecanico = null, modo = "direto", sintoma = SINTOMA_LONGO } = {}) {
    const vid = veiculos.get(placa);
    const r = await sb
      .rpc("abrir_os", {
        p_chave_idempotencia: uuid(),
        ...(vid
          ? { p_veiculo_id: vid }
          : { p_placa: placa, p_cliente_nome: cliente.nome, ...(cliente.telefone ? { p_cliente_telefone: cliente.telefone } : {}), p_veiculo_tipo: "caminhao", p_veiculo_marca: "Scania", p_veiculo_modelo: "R 450 Highline 6x2" }),
        p_km: (km += 1375),
        p_sintoma_relatado: sintoma,
        p_modo: modo,
        p_mecanico_id: mecanico,
        ...(modo === "direto" ? { p_autorizado_por_nome: "Sr. Albuquerque (por telefone)" } : {}),
      })
      .single();
    if (r.error) throw new Error(`abrir_os ${placa}: ${msg(r)}`);
    if (!vid) {
      const v = (await sb.from("vw_os").select("veiculo_id").eq("id", r.data.os_id).single()).data;
      veiculos.set(placa, v?.veiculo_id);
    }
    return { id: r.data.os_id, numero: r.data.numero };
  }
  async function item(os, { tipo = "servico", servico = null, descricao = null, qtd = 1, unidade = null, preco = null }) {
    const r = await sb.rpc("adicionar_item_os", {
      p_chave_idempotencia: uuid(), p_os_id: os.id, p_tipo: tipo, p_servico_id: servico, p_descricao: descricao,
      p_quantidade: qtd, p_unidade: unidade, p_preco_unitario_centavos: preco, p_custo_unitario_centavos: tipo === "peca" && preco ? Math.round(preco * 0.6) : null,
    });
    if (r.error) throw new Error(`item: ${msg(r)}`);
  }
  async function entregar(os, { forma = "boleto", pago = false, cliente = sb } = {}) {
    const p = await cliente.rpc("marcar_pronta", { p_os_id: os.id, p_causa: CAUSA_LONGA, p_solucao: SOLUCAO_LONGA });
    const e = await cliente.rpc("entregar_os", { p_os_id: os.id, p_causa: CAUSA_LONGA, p_solucao: SOLUCAO_LONGA, p_forma_pagamento: forma, p_pago: pago });
    if (p.error || e.error) throw new Error(`entregar: ${msg(p)}/${msg(e)}`);
  }

  const HIS = "CAP7H30";
  const cliHis = { nome: CLIENTE_LONGO, telefone: "41987654321" };
  const his = [];
  for (let i = 1; i <= 30; i++) {
    process.stdout.write(`\r   OS ${i}/30 da placa ${HIS}`);
    // A #30 (aberta) é do mecânico: a tela dele com "Ver histórico desta placa" (F7-B11, I6).
    const mecanico = i === 30 || i % 3 === 1 ? mX.id : i % 3 === 2 ? dX.id : null;
    const os = await abrir(HIS, cliHis, { mecanico, modo: i === 29 ? "com_orcamento" : "direto", sintoma: i % 2 ? SINTOMA_LONGO : `Revisão programada dos ${i * 10} mil km.` });
    await item(os, { servico: servIds[i % servIds.length] });
    await item(os, { tipo: "peca", descricao: i % 4 === 0 ? `${ITEM_LONGO} (kit ${i})` : "Filtro de óleo lubrificante", qtd: i === 7 ? 1.5 : 2, preco: 12345 + i });
    if (i % 5 === 0) await item(os, { descricao: `Solda e reforço do suporte do para-choque traseiro, lado do motorista (${i})`, preco: 25000 });
    if (i <= 28) await entregar(os, { forma: i % 2 ? "pix" : "boleto", pago: i % 4 !== 0 });
    else if (i === 29) await sb.rpc("mudar_status_os", { p_os_id: os.id, p_de: "aguardando_orcamento", p_para: "cancelada", p_motivo: "Cliente levou o caminhão para a concessionária, que fez o serviço na garantia de fábrica." });
    else await sb.rpc("mudar_status_os", { p_os_id: os.id, p_de: "aprovada", p_para: "em_andamento" });
    his.push(os);
  }
  console.log("");
  // valor alto: paga e a receber
  const ALT = "CAP1A23";
  const cliAlt = { nome: "Frota Pesada Rodobens Sul", telefone: "41991234567" };
  const altoPago = await abrir(ALT, cliAlt, { mecanico: mX.id, sintoma: "Motor fundido depois de perder o óleo na estrada." });
  await item(altoPago, { descricao: "Retífica completa do motor com troca de pistões, bronzinas e camisas", preco: ALTO });
  await entregar(altoPago, { forma: "pix", pago: true });
  const altoAReceber = await abrir(ALT, cliAlt, { mecanico: mX.id, sintoma: "Câmbio patinando em todas as marchas." });
  await item(altoAReceber, { tipo: "peca", descricao: "Câmbio automatizado novo (unidade de troca)", qtd: 1, preco: ALTO });
  await entregar(altoAReceber, { forma: "boleto", pago: false });
  // mais clientes devendo
  const c1 = await abrir("CAP5C01", { nome: "Auto Posto Beira-Rio", telefone: "4733334444" }, { sintoma: "Pneu furado." });
  await item(c1, { descricao: "Conserto de pneu", preco: 8000 });
  await entregar(c1, { forma: "dinheiro" });
  const c2 = await abrir("CAP5C02", { nome: "José da Silva" }, { sintoma: "Barulho no freio." });
  await item(c2, { servico: servIds[1] });
  await entregar(c2, { forma: "pix" });
  // orçamento de 30 itens (aberto, vira PDF de várias páginas) e de 2 itens
  const ORC = "CAP3R30";
  const orc = await abrir(ORC, { nome: CLIENTE_LONGO, telefone: "41987654322" }, { modo: "com_orcamento", mecanico: mX.id });
  for (let i = 1; i <= 30; i++) {
    await item(orc, {
      tipo: i % 2 ? "servico" : "peca",
      descricao: i === 1 ? "Reforma completa da cabine e do chassi" : `Item ${i}: ${i % 3 ? ITEM_LONGO : "Parafuso de roda"}`,
      qtd: i === 7 ? 1.5 : 1,
      preco: i === 1 ? ALTO : 10000 + i * 137,
    });
  }
  const totOrc = (await sb.from("vw_os").select("total_centavos").eq("id", orc.id).single()).data?.total_centavos;
  const envOrc = await sb.rpc("enviar_orcamento", { p_os_id: orc.id, p_chave_idempotencia: uuid(), p_total_conferido_centavos: totOrc });
  if (envOrc.error) throw new Error(`enviar_orcamento 30: ${msg(envOrc)}`);
  const orc2 = await abrir("CAP3R31", { nome: "Cargas Rápidas Oeste", telefone: "4932221111" }, { modo: "com_orcamento", sintoma: "Luz do ABS acesa." });
  await item(orc2, { servico: servIds[2] });
  await item(orc2, { tipo: "peca", descricao: "Sensor de ABS dianteiro", qtd: 1, preco: 38900 });
  const totOrc2 = (await sb.from("vw_os").select("total_centavos").eq("id", orc2.id).single()).data?.total_centavos;
  const envOrc2 = await sb.rpc("enviar_orcamento", { p_os_id: orc2.id, p_chave_idempotencia: uuid(), p_total_conferido_centavos: totOrc2 });
  if (envOrc2.error) throw new Error(`enviar_orcamento 2: ${msg(envOrc2)}`);

  // ---------------- Y: a receber vazio, painel com valor alto exato
  const dY = await conta("dono.cap7y");
  const ofY = await dY.sb.rpc("criar_oficina", { p_nome_oficina: `Oficina Captura F7 em dia ${rodada.slice(-4)}`, p_nome_dono: "Dona Captura", p_versao_termos: TERMOS, p_telefone: "(41) 97777-6666" });
  if (ofY.error) throw new Error(`criar_oficina Y: ${msg(ofY)}`);
  await dY.sb.from("oficinas").update({ vistoria_obrigatoria: false }).eq("id", ofY.data);
  const cAY = await dY.sb.rpc("criar_convite", { p_papel: "atendente" }).single();
  const aY = await conta("atendente.cap7y");
  const r3 = await aY.sb.rpc("aceitar_convite", { p_token: cAY.data?.token, p_nome: "Atendente Em Dia", p_versao_termos: TERMOS });
  if (r3.error) throw new Error(`convite Y: ${msg(r3)}`);
  const y1 = await dY.sb.rpc("abrir_os", { p_chave_idempotencia: uuid(), p_placa: "CAP9Y01", p_cliente_nome: "Frota Pesada Rodobens Sul", p_cliente_telefone: "41991234567", p_veiculo_tipo: "caminhao", p_veiculo_marca: "Volvo", p_veiculo_modelo: "FH 540", p_km: 98000, p_sintoma_relatado: "Motor fundido.", p_modo: "direto", p_autorizado_por_nome: "Gerente da frota" }).single();
  if (y1.error) throw new Error(`abrir_os Y: ${msg(y1)}`);
  const iy = await dY.sb.rpc("adicionar_item_os", { p_chave_idempotencia: uuid(), p_os_id: y1.data.os_id, p_tipo: "servico", p_descricao: "Retífica completa do motor", p_quantidade: 1, p_preco_unitario_centavos: ALTO });
  const py = await dY.sb.rpc("marcar_pronta", { p_os_id: y1.data.os_id, p_causa: "Falta de óleo", p_solucao: "Retífica" });
  const ey = await dY.sb.rpc("entregar_os", { p_os_id: y1.data.os_id, p_causa: "Falta de óleo", p_solucao: "Retífica", p_forma_pagamento: "pix", p_pago: true });
  if (iy.error || py.error || ey.error) throw new Error(`OS Y: ${msg(iy)}/${msg(py)}/${msg(ey)}`);

  // ---------------- Z: nada entregue
  const dZ = await conta("dono.cap7z");
  const ofZ = await dZ.sb.rpc("criar_oficina", { p_nome_oficina: `Oficina Captura F7 nova ${rodada.slice(-4)}`, p_nome_dono: "Dono Novo", p_versao_termos: TERMOS, p_telefone: "(41) 96666-5555" });
  if (ofZ.error) throw new Error(`criar_oficina Z: ${msg(ofZ)}`);

  const so = ({ email, pw, id }) => ({ email, pw, id });
  return {
    rodada,
    contas: { donoX: so(dX), mecX: so(mX), atX: so(aX), donoY: so(dY), atY: so(aY), donoZ: so(dZ) },
    x: { his: his.map((o) => o.id), hisPlaca: HIS, altoPago: altoPago.id, altoAReceber: altoAReceber.id, altPlaca: ALT, orc: orc.id, orc2: orc2.id },
    y: { os: y1.data.os_id },
  };
}

// ------------------------------------------------------------------ sessão
async function entrar(email, pw) {
  const sb = novoCliente();
  const { data, error } = await sb.auth.signInWithPassword({ email, password: pw });
  if (error) throw new Error(`login ${email.replace(/^[^@+]*/, "…")}: ${error.code ?? error.message}`);
  const jar = new Map();
  const ssr = createServerClient(URL_SB, CHAVE, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (lista) => lista.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
    },
  });
  await ssr.auth.setSession({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
  return { sb, cookies: [...jar].map(([name, value]) => ({ name, value })) };
}

// ------------------------------------------------------------------ navegadores
const NAVEGADORES = {
  webkit: {
    nome: "webkit-iphone13",
    tipo: () => webkit,
    // iPhone 13 (390 x 664 de área útil no Playwright); escala 2 para as imagens não ficarem enormes.
    opcoes: { ...devices["iPhone 13"], deviceScaleFactor: 2 },
    tecladoAltura: 336,
  },
  chromium: {
    nome: "chromium-360",
    tipo: () => chromium,
    opcoes: {
      viewport: { width: 360, height: 740 },
      screen: { width: 360, height: 800 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      userAgent: "Mozilla/5.0 (Linux; Android 14; SM-A155M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
    },
    tecladoAltura: 300,
  },
};
const navegadoresAbertos = {};
async function navegador(chave) {
  navegadoresAbertos[chave] ??= await NAVEGADORES[chave].tipo().launch();
  return navegadoresAbertos[chave];
}

/** Espera o conteúdo em streaming: sem esqueleto, sem aria-busy, fontes prontas. */
async function pronto(page) {
  await page.waitForLoadState("load").catch(() => {});
  await page
    .waitForFunction(() => !document.querySelector('[aria-busy="true"], .animate-pulse') && document.fonts.status === "loaded", null, { timeout: 20000 })
    .catch(() => {});
  await page.waitForTimeout(400);
}

const TEXTO_200 = "html{font-size:200% !important}";

/**
 * Roda `fn(page, tirar)` em cada navegador × tema, numa sessão nova do papel.
 * `tirar(tela, {inteira, topo})` salva tela_papel_navegador_tema.png.
 */
async function emCada({ grupo, papel, sessao, texto200 = false, temas = ["claro", "escuro"] }, fn) {
  if (SO && !SO.test(grupo)) return;
  console.log(`\n== ${grupo} (${papel}${texto200 ? ", texto 200 %" : ""}) ==`);
  for (const chave of NAVS) {
    const nav = NAVEGADORES[chave];
    for (const tema of temas) {
      const browser = await navegador(chave);
      const ctx = await browser.newContext({ ...nav.opcoes, colorScheme: tema === "escuro" ? "dark" : "light", locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
      if (sessao) await ctx.addCookies(sessao.cookies.map((c) => ({ ...c, url: APP_URL })));
      // Botão de comentários da Vercel (só nos endereços de teste): fora da imagem.
      await ctx.addInitScript(() => {
        const s = document.createElement("style");
        s.textContent = "vercel-live-feedback{display:none!important}";
        document.addEventListener("DOMContentLoaded", () => document.head.appendChild(s));
      });
      const page = await ctx.newPage();
      page.setDefaultTimeout(25000);
      const ir = async (caminho) => {
        try {
          await page.goto(`${APP_URL}${caminho}`, { waitUntil: "domcontentloaded" });
        } catch (e) {
          // navegação do app ainda em andamento (ex.: depois de fechar uma folha): tenta de novo
          if (!/ERR_ABORTED|interrupted|NS_BINDING_ABORTED|cancelled/i.test(String(e?.message))) throw e;
          await page.waitForTimeout(1500);
          await page.goto(`${APP_URL}${caminho}`, { waitUntil: "domcontentloaded" });
        }
        if (texto200) await page.addStyleTag({ content: TEXTO_200 }).catch(() => {});
        await pronto(page);
        if (texto200) await page.addStyleTag({ content: TEXTO_200 }).catch(() => {});
      };
      const tirar = async (tela, { inteira = true, topo = false } = {}) => {
        const t = texto200 ? `${tela}-texto200` : tela;
        const base = `${t}_${papel}_${nav.nome}_${tema}`;
        try {
          if (inteira) {
            // Página inteira aumentando a área visível (não `fullPage`): assim as barras fixas
            // ficam no rodapé/topo, como no aparelho, e não no meio da imagem.
            const vp = page.viewportSize();
            const altura = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight));
            if (altura > vp.height) {
              await page.setViewportSize({ width: vp.width, height: Math.min(altura, 16000) });
              await page.waitForTimeout(300);
            }
            await page.screenshot({ path: join(SAIDA, `${base}.png`) });
            if (altura > vp.height) await page.setViewportSize(vp);
            feitas.push(`${base}.png`);
          }
          if (topo) {
            const b2 = `${t}-topo_${papel}_${nav.nome}_${tema}`;
            await page.screenshot({ path: join(SAIDA, `${b2}.png`) });
            feitas.push(`${b2}.png`);
          }
          process.stdout.write(".");
        } catch (e) {
          falha(base, e);
        }
      };
      try {
        await fn({ page, ir, tirar, nav, tema });
      } catch (e) {
        falha(`${grupo} ${nav.nome} ${tema}`, e);
      }
      await ctx.close();
    }
  }
}

const slug = (s) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)
    .replace(/-$/, "");

/** Links das listas do painel (cada número), com um nome curto. */
async function linksDoPainel(page) {
  return page.$$eval('a[href^="/painel/os"], a[href="/a-receber"]', (as) =>
    as.map((a) => ({ href: a.getAttribute("href"), rotulo: (a.getAttribute("aria-label") || a.innerText || "").split(/[:\n]/)[0].trim() })),
  );
}
function nomeLista(l, sufixoMes) {
  if (l.href === "/a-receber") return null;
  const u = new URL(l.href, "http://x");
  const ver = u.searchParams.get("ver");
  const extra = ver === "servico" || ver === "mecanico" ? `-${slug(l.rotulo)}` : "";
  const pag = u.searchParams.get("pagina");
  return `lista-${ver.replace("_", "-")}${extra}${pag ? `-pag${pag}` : ""}-${sufixoMes}`;
}

async function folhaPagamento({ page, tirar, nav }, prefixo) {
  const botao = page.getByRole("button", { name: /^Registrar pagamento da OS/ }).first();
  if (!(await botao.count())) throw new Error("sem botão Registrar pagamento");
  await botao.click();
  await page.getByRole("dialog").waitFor();
  await page.waitForTimeout(600);
  await tirar(`${prefixo}-folha-pagamento`, { inteira: false, topo: true });
  const campo = page.locator('input[name="recebido_em"]');
  await campo.focus();
  await page.waitForTimeout(500);
  await tirar(`${prefixo}-folha-pagamento-foco`, { inteira: false, topo: true });
  // Teclado simulado: a área visível encolhe a altura do teclado (o Playwright não abre teclado virtual).
  // Ordem do aparelho: a área encolhe e o navegador rola o campo focado para dentro dela.
  const vp = page.viewportSize();
  await campo.evaluate((el) => el.blur());
  await page.setViewportSize({ width: vp.width, height: vp.height - nav.tecladoAltura });
  await page.waitForTimeout(300);
  await campo.focus();
  await campo.evaluate((el) => (el.scrollIntoViewIfNeeded ? el.scrollIntoViewIfNeeded() : el.scrollIntoView({ block: "nearest" })));
  await page.waitForTimeout(600);
  await tirar(`${prefixo}-folha-pagamento-teclado-simulado`, { inteira: false, topo: true });
  await page.setViewportSize(vp);
  await page.keyboard.press("Escape").catch(() => {});
}

async function historicoCompleto({ page, ir, tirar }, placa, prefixo) {
  await ir(`/placa/${placa}`);
  await tirar(`${prefixo}`, { topo: true });
  for (let n = 0; n < 5; n++) {
    const mais = page.getByRole("button", { name: /^Mostrar mais/ });
    if (!(await mais.count())) break;
    await mais.click();
    await page.waitForTimeout(300);
    await pronto(page);
  }
  await tirar(`${prefixo}-tudo`);
  const cartao = page.locator('[data-teste="cartao-historico"] button[aria-expanded]').first();
  await cartao.scrollIntoViewIfNeeded();
  await cartao.click();
  await pronto(page);
  await page.waitForTimeout(500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await cartao.scrollIntoViewIfNeeded();
  await tirar(`${prefixo}-cartao-aberto`, { inteira: false, topo: true });
}

// ------------------------------------------------------------------ PDF -> PNG
const PDF_HTML = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#888}canvas{display:block;margin:0 0 16px;background:#fff}</style>
<div id="c"></div>
<script type="module">
import * as pdfjs from "/pdfjs/build/pdf.mjs";
pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/build/pdf.worker.mjs";
window.desenhar = async (b64) => {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const doc = await pdfjs.getDocument({ data: bytes, standardFontDataUrl: "/pdfjs/standard_fonts/", cMapUrl: "/pdfjs/cmaps/", cMapPacked: true }).promise;
  const raiz = document.getElementById("c"); raiz.innerHTML = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const p = await doc.getPage(i);
    const v = p.getViewport({ scale: 2 });
    const cv = document.createElement("canvas"); cv.width = v.width; cv.height = v.height; cv.id = "p" + i;
    raiz.appendChild(cv);
    await p.render({ canvasContext: cv.getContext("2d"), viewport: v }).promise;
  }
  return doc.numPages;
};
window.prontoPdf = true;
</script>`;

async function pdfsParaPng(lista) {
  if (SO && !SO.test("pdf")) return;
  console.log("\n== PDFs em imagem ==");
  const browser = await navegador("chromium");
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 1700 } });
  const page = await ctx.newPage();
  await page.route("http://pdf.local/**", async (route) => {
    const u = new URL(route.request().url());
    if (u.pathname === "/") return route.fulfill({ contentType: "text/html", body: PDF_HTML });
    if (u.pathname.startsWith("/pdfjs/")) {
      const arq = join(PDFJS, decodeURIComponent(u.pathname.slice(7)));
      if (!existsSync(arq)) return route.fulfill({ status: 404, body: "" });
      return route.fulfill({ path: arq, contentType: arq.endsWith("mjs") || arq.endsWith(".js") ? "text/javascript" : "application/octet-stream" });
    }
    return route.fulfill({ status: 404, body: "" });
  });
  await page.goto("http://pdf.local/");
  await page.waitForFunction(() => window.prontoPdf === true);
  for (const { nome, papel, caminho, sessao } of lista) {
    try {
      const r = await fetch(`${APP_URL}${caminho}`, { headers: { cookie: sessao.cookies.map((c) => `${c.name}=${c.value}`).join("; ") } });
      if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      writeFileSync(join(SAIDA, `${nome}_${papel}.pdf`), buf);
      const paginas = await page.evaluate((b64) => window.desenhar(b64), buf.toString("base64"));
      for (let i = 1; i <= paginas; i++) {
        const arq = `${nome}-p${i}de${paginas}_${papel}_pdfjs_papel.png`;
        await page.locator(`#p${i}`).screenshot({ path: join(SAIDA, arq) });
        feitas.push(arq);
      }
      console.log(`   ${nome}: ${paginas} página(s), ${Math.round(buf.length / 1024)} KB`);
    } catch (e) {
      falha(`PDF ${nome}`, e);
    }
  }
  await ctx.close();
}

// ------------------------------------------------------------------ principal
async function main() {
  let estado = ESTADO && existsSync(ESTADO) ? JSON.parse(readFileSync(ESTADO, "utf8")) : null;
  if (!estado && !process.env.CAPTURA_MES_VAZIO) {
    estado = await preparar();
    if (ESTADO) writeFileSync(ESTADO, JSON.stringify(estado, null, 2));
  }
  const G = (p) => ({ email: env.SEED_EMAIL_BASE.replace("@", `+mf-${p}-gabarito7@`), pw: env.SEED_SENHA });
  const sessao = async (c) => entrar(c.email, c.pw);

  // ---------------- mês vazio (servidor local com relógio adiantado; só leitura da gabarito7)
  if (process.env.CAPTURA_MES_VAZIO) {
    const s = await sessao(G("dono"));
    await emCada({ grupo: "mes-vazio", papel: "dono", sessao: s }, async ({ ir, tirar }) => {
      await ir("/painel");
      await tirar("painel-mes-vazio-atual-relogio-jan2027", { topo: true });
      await ir("/painel?mes=2026-12");
      await tirar("painel-mes-vazio-passado-relogio-jan2027", { topo: true });
    });
    return;
  }

  // ---------------- gabarito7: dono (só leitura)
  {
    const s = await sessao(G("dono"));
    let primeiraOS = null;
    await emCada({ grupo: "gabarito-dono", papel: "dono", sessao: s }, async ({ page, ir, tirar }) => {
      for (const [mesUrl, sufixo] of [["", "nov"], ["?mes=2026-10", "out"]]) {
        await ir(`/painel${mesUrl}`);
        await tirar(`painel-gabarito-${sufixo}`, { topo: true });
        const links = await linksDoPainel(page);
        const vistos = new Set();
        for (const l of links) {
          const nome = nomeLista(l, sufixo);
          if (!nome || vistos.has(nome)) continue;
          vistos.add(nome);
          await ir(l.href);
          await tirar(nome);
          if (nome === "lista-entregues-nov" && !primeiraOS) {
            primeiraOS = await page.$eval('a[href^="/os/"]', (a) => a.getAttribute("href")).catch(() => null);
          }
        }
      }
      // folha "Escolher mês"
      await ir("/painel");
      await page.getByRole("button", { name: /escolher outro mês/ }).click();
      await page.getByRole("dialog").waitFor();
      await page.waitForTimeout(600);
      await tirar("painel-gabarito-escolher-mes", { inteira: false, topo: true });
      await page.keyboard.press("Escape").catch(() => {});
      if (primeiraOS) {
        await ir(primeiraOS);
        await tirar("os-do-painel-gabarito", { topo: true });
      }
      await ir("/a-receber");
      await tirar("a-receber-gabarito", { topo: true });
      await ir("/placa/TST7A01");
      await tirar("historico-placa-gabarito");
      await ir("/inicio");
      await tirar("inicio-gabarito");
    });
  }
  // ---------------- gabarito7: atendente e mecânico
  {
    const s = await sessao(G("atendente"));
    await emCada({ grupo: "gabarito-atendente", papel: "atendente", sessao: s }, async ({ page, ir, tirar }) => {
      await ir("/painel");
      console.log(`\n   atendente /painel -> ${new URL(page.url()).pathname}`);
      await tirar("redirecionamento-painel-gabarito", { topo: true });
      await ir("/painel/os?ver=entregues");
      console.log(`   atendente /painel/os -> ${new URL(page.url()).pathname}`);
      await tirar("redirecionamento-painel-lista-gabarito", { inteira: false, topo: true });
      await ir("/a-receber");
      await tirar("a-receber-gabarito", { topo: true });
      await ir("/placa/TST7A01");
      await tirar("historico-placa-gabarito");
    });
  }
  {
    const s = await sessao(G("mecanico"));
    await emCada({ grupo: "gabarito-mecanico", papel: "mecanico", sessao: s }, async ({ page, ir, tirar }) => {
      await ir("/painel");
      console.log(`\n   mecânico /painel -> ${new URL(page.url()).pathname}`);
      await tirar("redirecionamento-painel-gabarito", { topo: true });
      await ir("/painel/os?ver=entregues");
      console.log(`   mecânico /painel/os -> ${new URL(page.url()).pathname}`);
      await tirar("redirecionamento-painel-lista-gabarito", { inteira: false, topo: true });
      await ir("/a-receber");
      console.log(`   mecânico /a-receber -> ${new URL(page.url()).pathname}`);
      await ir("/placa/TST7A01");
      await tirar("historico-placa-gabarito");
    });
  }

  // ---------------- X (cheia)
  const C = estado.contas;
  const X = estado.x;
  {
    const s = await sessao(C.donoX);
    await emCada({ grupo: "cheia-dono", papel: "dono", sessao: s }, async (h) => {
      const { page, ir, tirar } = h;
      await ir("/painel");
      await tirar("painel-valor-alto", { topo: true });
      const todos = page.getByRole("button", { name: /^Mostrar todos/ });
      if (await todos.count()) {
        await todos.click();
        await page.waitForTimeout(300);
        await tirar("painel-valor-alto-servicos-todos");
      }
      await ir("/painel/os?ver=entregues");
      await tirar("lista-entregues-30porpagina-pag1");
      const p2 = await page.$eval('a[href*="pagina=2"]', (a) => a.getAttribute("href")).catch(() => null);
      if (p2) {
        await ir(p2);
        await tirar("lista-entregues-30porpagina-pag2");
      }
      await ir("/painel/os?ver=a_receber");
      await tirar("lista-a-receber-valor-alto");
      await ir("/a-receber");
      await tirar("a-receber-cheia", { topo: true });
      await folhaPagamento(h, "a-receber-cheia");
      await ir(`/os/${X.altoAReceber}`);
      await tirar("os-valor-alto-a-receber", { topo: true });
      await ir(`/os/${X.altoPago}`);
      await tirar("os-valor-alto-paga", { topo: true });
      await ir(`/os/${X.orc}`);
      await tirar("os-orcamento-30-itens", { topo: true });
      await ir(`/os/${X.orc}/orcamento/1`);
      await tirar("orcamento-versao-30-itens");
      await historicoCompleto(h, X.hisPlaca, "historico-30os");
    });
    await emCada({ grupo: "cheia-dono-200", papel: "dono", sessao: s, texto200: true }, async (h) => {
      const { ir, tirar } = h;
      await ir("/painel");
      await tirar("painel-valor-alto", { topo: true });
      await ir("/a-receber");
      await tirar("a-receber-cheia", { topo: true });
      await folhaPagamento(h, "a-receber-cheia");
      await ir(`/os/${X.altoAReceber}`);
      await tirar("os-valor-alto-a-receber", { topo: true });
      await ir(`/placa/${X.hisPlaca}`);
      await tirar("historico-30os", { topo: true });
    });
  }
  {
    const s = await sessao(C.atX);
    await emCada({ grupo: "cheia-atendente", papel: "atendente", sessao: s }, async (h) => {
      const { page, ir, tirar } = h;
      await ir("/painel");
      await tirar("redirecionamento-painel-cheia", { inteira: false, topo: true });
      await ir("/a-receber");
      await tirar("a-receber-cheia", { topo: true });
      await folhaPagamento(h, "a-receber-cheia");
      await ir(`/os/${X.altoAReceber}`);
      await tirar("os-valor-alto-a-receber", { topo: true });
      await historicoCompleto(h, X.hisPlaca, "historico-30os");
      void page;
    });
    await emCada({ grupo: "cheia-atendente-200", papel: "atendente", sessao: s, texto200: true }, async ({ ir, tirar }) => {
      await ir("/a-receber");
      await tirar("a-receber-cheia", { topo: true });
    });
  }
  {
    const s = await sessao(C.mecX);
    await emCada({ grupo: "cheia-mecanico", papel: "mecanico", sessao: s }, async (h) => {
      const { ir, tirar } = h;
      await ir("/painel");
      await tirar("redirecionamento-painel-cheia", { inteira: false, topo: true });
      await ir("/minhas-os");
      await tirar("minhas-os-cheia");
      await ir(`/os/${X.his[29]}`);
      await tirar("os-aberta-placa-30os", { topo: true });
      // Rola até a entrada do histórico pela OS (§14.7) e tira a área visível.
      const verHist = h.page.getByRole("link", { name: /^Ver histórico desta placa/ }).first();
      if (await verHist.count()) {
        await verHist.scrollIntoViewIfNeeded();
        await h.page.waitForTimeout(400);
        await tirar("os-aberta-placa-30os-ver-historico", { inteira: false, topo: true });
      } else falha("os-aberta-placa-30os", "sem o link Ver histórico desta placa");
      await historicoCompleto(h, X.hisPlaca, "historico-30os");
    });
    await emCada({ grupo: "cheia-mecanico-200", papel: "mecanico", sessao: s, texto200: true }, async ({ ir, tirar }) => {
      await ir(`/placa/${X.hisPlaca}`);
      await tirar("historico-30os", { topo: true });
    });
  }
  // ---------------- Y (a receber vazio, valor alto exato no painel) e Z (primeira vez)
  {
    const s = await sessao(C.donoY);
    await emCada({ grupo: "emdia-dono", papel: "dono", sessao: s }, async ({ ir, tirar }) => {
      await ir("/painel");
      await tirar("painel-valor-alto-exato-a-receber-zero", { topo: true });
      await ir("/a-receber");
      await tirar("a-receber-vazia", { topo: true });
    });
    await emCada({ grupo: "emdia-dono-200", papel: "dono", sessao: s, texto200: true }, async ({ ir, tirar }) => {
      await ir("/painel");
      await tirar("painel-valor-alto-exato-a-receber-zero", { topo: true });
    });
  }
  {
    const s = await sessao(C.atY);
    await emCada({ grupo: "emdia-atendente", papel: "atendente", sessao: s }, async ({ ir, tirar }) => {
      await ir("/a-receber");
      await tirar("a-receber-vazia", { topo: true });
    });
  }
  {
    const s = await sessao(C.donoZ);
    await emCada({ grupo: "nova-dono", papel: "dono", sessao: s }, async ({ ir, tirar }) => {
      await ir("/painel");
      await tirar("painel-primeira-vez", { topo: true });
      await ir("/a-receber");
      await tirar("a-receber-vazia-oficina-nova", { topo: true });
    });
  }

  // ---------------- PDFs
  {
    const sG = await sessao(G("dono"));
    const sX = await sessao(C.donoX);
    const idsG = (await sG.sb.from("vw_os").select("id, numero").in("numero", [1, 5, 10])).data ?? [];
    const g = Object.fromEntries(idsG.map((o) => [o.numero, o.id]));
    await pdfsParaPng([
      { nome: "pdf-os-aberta-gabarito-os10", papel: "dono", caminho: `/api/os/${g[10]}/pdf`, sessao: sG },
      { nome: "pdf-resumo-final-pago-gabarito-os1", papel: "dono", caminho: `/api/os/${g[1]}/pdf`, sessao: sG },
      { nome: "pdf-resumo-final-a-receber-gabarito-os5", papel: "dono", caminho: `/api/os/${g[5]}/pdf`, sessao: sG },
      { nome: "pdf-resumo-final-valor-alto-pago", papel: "dono", caminho: `/api/os/${X.altoPago}/pdf`, sessao: sX },
      { nome: "pdf-resumo-final-textos-longos", papel: "dono", caminho: `/api/os/${X.his[3]}/pdf`, sessao: sX },
      { nome: "pdf-os-aberta-30-itens", papel: "dono", caminho: `/api/os/${X.orc}/pdf`, sessao: sX },
      { nome: "pdf-orcamento-30-itens", papel: "dono", caminho: `/api/os/${X.orc}/orcamento/1/pdf`, sessao: sX },
      { nome: "pdf-orcamento-2-itens", papel: "dono", caminho: `/api/os/${X.orc2}/orcamento/1/pdf`, sessao: sX },
    ]);
  }
}

try {
  await main();
} catch (e) {
  falha("erro inesperado", e);
}
for (const b of Object.values(navegadoresAbertos)) await b.close();
writeFileSync(join(SAIDA, "_feitas.txt"), feitas.join("\n") + "\n", { flag: "a" });
console.log(`\n\n${feitas.length} capturas; ${falhas.length} falhas.`);
for (const f of falhas) console.log(`  - ${f}`);
process.exit(falhas.length ? 1 : 0);
