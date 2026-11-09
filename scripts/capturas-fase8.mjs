#!/usr/bin/env node
/**
 * Lote de capturas da Fase 8A (F8-E1), pré-requisito da revisão visual F8-R1 (DESIGN §15.10).
 *
 * Abre um `next start` LOCAL (build da `staging`, apontando para o banco staging) em Playwright WebKit
 * (iPhone 13) e Chromium Android 360 px, nos temas claro e escuro, e salva PNGs em docs/capturas-fase8/
 * com o nome `tela_papel_navegador_tema.png` (`-texto200` = texto a 200 %, `-topo` = só a área visível).
 *
 * Por que local e não a Vercel: o grupo "Ajuda" e a página inicial mudam com NEXT_PUBLIC_SUPORTE_WHATSAPP,
 * que entra no build. Faz-se um build SEM a variável e outro COM um número fictício (só no ambiente do
 * build, nunca em arquivo), e o script roda uma vez em cada um:
 *   CAPTURA_VARIANTE=sem  -> todas as telas (o lote principal), "sem-whatsapp" nas telas que mudam;
 *   CAPTURA_VARIANTE=com  -> só as telas que mudam com a variável, com "com-whatsapp" no nome.
 * O script confere no HTML se o build bate com a variante (procura o link wa.me) e falha se não bater.
 *
 * Dados: oficinas NOVAS desta rodada, "Oficina Captura F8 …", contas `*.RODADA@www.example.org`:
 *   P0 "… zero"     : só o dono, sem telefone            -> Primeiros passos 0 de 4
 *   P2 "… dois"     : telefone + 1 serviço              -> 2 de 4
 *   P3 "… tres"     : telefone + 1 serviço + 1 convite  -> 3 de 4 ("Falta só um")
 *   PD "… dispensar": só o dono                          -> dispensar / Desfazer (volta ao fim de cada captura)
 *   P4 "… completa" : telefone, serviço, atendente e mecânico aceitos, 1 OS com orçamento enviado
 *                     -> cartão some; Ajuda nos 3 papéis; Equipe; página pública do orçamento.
 * Nada em produção, nenhuma migração, só a chave publishable (trava em scripts/so-staging.mjs).
 *
 * Uso (bash), com o servidor local já de pé (`npx next start -p 3100`):
 *   APP_URL=http://localhost:3100 \
 *   CAPTURA_PLAYWRIGHT=/caminho/node_modules/playwright/index.mjs \
 *   CAPTURA_ESTADO=/pasta-temporaria/estado-f8.json \
 *   CAPTURA_VARIANTE=sem node scripts/capturas-fase8.mjs
 * Opções:
 *   CAPTURA_SAIDA   padrão: ../docs/capturas-fase8 (a partir de mechaflow/)
 *   CAPTURA_ESTADO  arquivo FORA do repositório com ids e senhas aleatórias da rodada (para a 2ª variante
 *                   usar as mesmas oficinas). Apague ao terminar.
 *   CAPTURA_SO      regex: só os grupos cujo nome casar.
 *   CAPTURA_NAV     "webkit", "chromium" ou os dois (padrão), para os grupos principais.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes, randomUUID as uuid } from "node:crypto";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { exigirStaging } from "./so-staging.mjs";

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
const APP_URL = (process.env.APP_URL ?? "http://localhost:3100").replace(/\/$/, "");
exigirStaging({ nome: "capturas-fase8", url: URL_SB, chave: CHAVE, envArquivo: env, appUrl: APP_URL });
if (!/staging|localhost|127\.0\.0\.1/.test(APP_URL)) throw new Error("APP_URL precisa ser o staging ou um servidor local.");
const VARIANTE = process.env.CAPTURA_VARIANTE;
if (VARIANTE !== "sem" && VARIANTE !== "com") throw new Error('Defina CAPTURA_VARIANTE=sem ou CAPTURA_VARIANTE=com (ver o cabeçalho).');
const SAIDA = resolve(process.env.CAPTURA_SAIDA ?? fileURLToPath(new URL("../../docs/capturas-fase8", import.meta.url)));
const PW = process.env.CAPTURA_PLAYWRIGHT;
if (!PW) throw new Error("Defina CAPTURA_PLAYWRIGHT (ver o cabeçalho).");
const { webkit, chromium, devices } = await import(pathToFileURL(PW).href);
const ESTADO = process.env.CAPTURA_ESTADO;
const SO = process.env.CAPTURA_SO ? new RegExp(process.env.CAPTURA_SO) : null;
const NAVS = (process.env.CAPTURA_NAV ?? "webkit,chromium").split(",");
const TERMOS = "2026-10-28";
const DOMINIO = "www.example.org";
const ZAP = `${VARIANTE}-whatsapp`;
mkdirSync(SAIDA, { recursive: true });

const novoCliente = () => createClient(URL_SB, CHAVE, { auth: { persistSession: false, autoRefreshToken: false } });
const msg = (r) => r?.error?.message ?? (r?.error ? r.error.code : "sem erro");
const falhas = [];
const feitas = []; // { arquivo, desc, aparelho, tema, texto, largura, scrollWidth }
const notas = [];
function falha(oque, e) {
  const t = `${oque}: ${e?.message ?? e}`.slice(0, 300);
  falhas.push(t);
  console.log(`FALHOU  ${t}`);
}
const nota = (t) => {
  notas.push(t);
  console.log(`\n   ${t}`);
};

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
  const fim = rodada.slice(-4);
  console.log(`\n== Preparo: oficinas novas da rodada ${rodada} ==`);
  const conta = (rotulo) => criarConta(rotulo, rodada);
  const oficina = async (d, nome, telefone) => {
    const r = await d.sb.rpc("criar_oficina", { p_nome_oficina: `Oficina Captura F8 ${nome} ${fim}`, p_nome_dono: "Dono Captura", p_versao_termos: TERMOS, ...(telefone ? { p_telefone: telefone } : {}) });
    if (r.error) throw new Error(`criar_oficina ${nome}: ${msg(r)}`);
    return r.data;
  };
  const servico = async (d) => {
    const s = await d.sb.from("catalogo_servicos").insert({ nome: "Troca de óleo do motor" }).select("id").single();
    if (s.error) throw new Error(`serviço: ${msg(s)}`);
    await d.sb.from("catalogo_servicos_precos").upsert({ servico_id: s.data.id, preco_padrao_centavos: 35000 });
    return s.data.id;
  };

  const d0 = await conta("dono.cap8zero");
  await oficina(d0, "zero");

  const d2 = await conta("dono.cap8dois");
  await oficina(d2, "dois", "(41) 98888-7777");
  await servico(d2);

  const d3 = await conta("dono.cap8tres");
  await oficina(d3, "tres", "(41) 98888-7777");
  await servico(d3);
  const c3 = await d3.sb.rpc("criar_convite", { p_papel: "mecanico" }).single();
  if (c3.error) throw new Error(`convite P3: ${msg(c3)}`);

  const dD = await conta("dono.cap8disp");
  await oficina(dD, "dispensar");

  const d4 = await conta("dono.cap8comp");
  const of4 = await oficina(d4, "completa", "(41) 97777-6666");
  await d4.sb.from("oficinas").update({ vistoria_obrigatoria: false }).eq("id", of4);
  const serv4 = await servico(d4);
  const cM = await d4.sb.rpc("criar_convite", { p_papel: "mecanico" }).single();
  const cA = await d4.sb.rpc("criar_convite", { p_papel: "atendente" }).single();
  const m4 = await conta("mecanico.cap8comp");
  const a4 = await conta("atendente.cap8comp");
  const r1 = await m4.sb.rpc("aceitar_convite", { p_token: cM.data?.token, p_nome: "Mecânico Captura", p_versao_termos: TERMOS });
  const r2 = await a4.sb.rpc("aceitar_convite", { p_token: cA.data?.token, p_nome: "Atendente Captura", p_versao_termos: TERMOS });
  if (r1.error || r2.error) throw new Error(`convites P4: ${msg(r1)}/${msg(r2)}`);
  const os = await d4.sb
    .rpc("abrir_os", {
      p_chave_idempotencia: uuid(), p_placa: "CAP8R01", p_cliente_nome: "Transportadora Captura Sul", p_cliente_telefone: "41987654321",
      p_veiculo_tipo: "caminhao", p_veiculo_marca: "Scania", p_veiculo_modelo: "R 450", p_km: 412000,
      p_sintoma_relatado: "Luz do ABS acesa e barulho no freio dianteiro.", p_modo: "com_orcamento", p_mecanico_id: m4.id,
    })
    .single();
  if (os.error) throw new Error(`abrir_os P4: ${msg(os)}`);
  const osId = os.data.os_id;
  const i1 = await d4.sb.rpc("adicionar_item_os", { p_chave_idempotencia: uuid(), p_os_id: osId, p_tipo: "servico", p_servico_id: serv4, p_quantidade: 1 });
  const i2 = await d4.sb.rpc("adicionar_item_os", { p_chave_idempotencia: uuid(), p_os_id: osId, p_tipo: "peca", p_descricao: "Sensor de ABS dianteiro", p_quantidade: 1, p_preco_unitario_centavos: 38900, p_custo_unitario_centavos: 23000 });
  if (i1.error || i2.error) throw new Error(`itens P4: ${msg(i1)}/${msg(i2)}`);
  const tot = (await d4.sb.from("vw_os").select("total_centavos").eq("id", osId).single()).data?.total_centavos;
  const env4 = await d4.sb.rpc("enviar_orcamento", { p_os_id: osId, p_chave_idempotencia: uuid(), p_total_conferido_centavos: tot }).single();
  if (env4.error || !env4.data?.token) throw new Error(`enviar_orcamento P4: ${msg(env4)}`);

  const so = ({ email, pw, id }) => ({ email, pw, id });
  return {
    rodada,
    contas: { d0: so(d0), d2: so(d2), d3: so(d3), dD: so(dD), d4: so(d4), m4: so(m4), a4: so(a4) },
    p4: { os: osId, token: env4.data.token },
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
const ANDROID_UA = "Mozilla/5.0 (Linux; Android 14; SM-A155M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36";
const android = (w, h) => ({ viewport: { width: w, height: h }, screen: { width: w, height: h + 60 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: ANDROID_UA });
const NAVEGADORES = {
  webkit: { nome: "webkit-iphone13", tipo: () => webkit, opcoes: { ...devices["iPhone 13"], deviceScaleFactor: 2 } },
  chromium: { nome: "chromium-360", tipo: () => chromium, opcoes: android(360, 740) },
  // Extras do DESIGN §15.10
  "webkit-se": {
    nome: "webkit-iphonese",
    tipo: () => webkit,
    // iPhone SE 375 × 667 (tela); a área útil do Safari fica menor, como no descritor do Playwright.
    opcoes: devices["iPhone SE (3rd gen)"] ? { ...devices["iPhone SE (3rd gen)"], deviceScaleFactor: 2 } : { ...devices["iPhone 13"], viewport: { width: 375, height: 548 }, screen: { width: 375, height: 667 }, deviceScaleFactor: 2 },
  },
  "chromium-640": { nome: "chromium-360x640", tipo: () => chromium, opcoes: android(360, 640) },
  "chromium-320": { nome: "chromium-320", tipo: () => chromium, opcoes: android(320, 640) },
  desktop: { nome: "chromium-desktop1280", tipo: () => chromium, opcoes: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 } },
};
const motores = {};
async function navegador(chave) {
  const tipo = NAVEGADORES[chave].tipo();
  const k = tipo === webkit ? "webkit" : "chromium";
  motores[k] ??= await tipo.launch();
  return motores[k];
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
 * Roda `fn` em cada navegador × tema, numa sessão nova. `tirar(tela, {inteira, topo, desc})` salva
 * tela_papel_navegador_tema.png e mede `document.documentElement.scrollWidth`.
 */
async function emCada({ grupo, papel, sessao, texto200 = false, temas = ["claro", "escuro"], navs = NAVS }, fn) {
  if (SO && !SO.test(grupo)) return;
  console.log(`\n== ${grupo} (${papel}${texto200 ? ", texto 200 %" : ""}) ==`);
  for (const chave of navs) {
    const nav = NAVEGADORES[chave];
    for (const tema of temas) {
      const browser = await navegador(chave);
      const ctx = await browser.newContext({ ...nav.opcoes, colorScheme: tema === "escuro" ? "dark" : "light", locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
      if (sessao) await ctx.addCookies(sessao.cookies.map((c) => ({ ...c, url: APP_URL })));
      const page = await ctx.newPage();
      page.setDefaultTimeout(25000);
      const ir = async (caminho) => {
        try {
          await page.goto(`${APP_URL}${caminho}`, { waitUntil: "domcontentloaded" });
        } catch (e) {
          if (!/ERR_ABORTED|interrupted|NS_BINDING_ABORTED|cancelled/i.test(String(e?.message))) throw e;
          await page.waitForTimeout(1500);
          await page.goto(`${APP_URL}${caminho}`, { waitUntil: "domcontentloaded" });
        }
        if (texto200) await page.addStyleTag({ content: TEXTO_200 }).catch(() => {});
        await pronto(page);
        if (texto200) await page.addStyleTag({ content: TEXTO_200 }).catch(() => {});
      };
      const tirar = async (tela, { inteira = true, topo = false, desc = "", papel: quem = papel } = {}) => {
        const t = texto200 ? `${tela}-texto200` : tela;
        const base = `${t}_${quem}_${nav.nome}_${tema}`;
        try {
          const vp = page.viewportSize();
          const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
          const reg = (arquivo, recorte) =>
            feitas.push({ arquivo, desc: `${desc}${recorte}`, aparelho: nav.nome, tema, texto: texto200 ? "200 %" : "100 %", largura: vp.width, scrollWidth, url: new URL(page.url()).pathname });
          if (topo) {
            const b2 = `${t}-topo_${quem}_${nav.nome}_${tema}`;
            await page.screenshot({ path: join(SAIDA, `${b2}.png`) });
            reg(`${b2}.png`, " (área visível)");
          }
          if (inteira) {
            // Página inteira aumentando a área visível (não `fullPage`): as barras fixas ficam no lugar.
            const altura = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight));
            if (altura > vp.height) {
              await page.setViewportSize({ width: vp.width, height: Math.min(altura, 16000) });
              await page.waitForTimeout(300);
            }
            await page.screenshot({ path: join(SAIDA, `${base}.png`) });
            if (altura > vp.height) await page.setViewportSize(vp);
            reg(`${base}.png`, altura > 16000 ? " (página inteira, cortada em 16000 px)" : " (página inteira)");
          }
          process.stdout.write(".");
        } catch (e) {
          falha(base, e);
        }
      };
      try {
        await fn({ page, ir, tirar, nav, tema, chave });
      } catch (e) {
        falha(`${grupo} ${nav.nome} ${tema}`, e);
        // Imagem do erro, fora do índice, para entender a falha (apagar depois de ver).
        await page.screenshot({ path: join(SAIDA, `_erro_${grupo}_${nav.nome}_${tema}.png`) }).catch(() => {});
      }
      await ctx.close();
    }
  }
}

/** Confere que o build no ar bate com a variante (link do suporte presente ou não). */
async function conferirVariante(page, onde) {
  const tem = (await page.locator('a[href^="https://wa.me/"]').count()) > 0;
  if (tem !== (VARIANTE === "com")) throw new Error(`${onde}: o build no ar ${tem ? "TEM" : "NÃO tem"} o link do suporte, mas a variante é "${VARIANTE}"`);
}

/** O "Entrar" aparece sem rolar? (DESIGN §15.10-1) */
async function entrarVisivel(page) {
  return page.evaluate(() => {
    const el = [...document.querySelectorAll("a,button")].find((e) => e.textContent.trim() === "Entrar");
    if (!el) return "sem botão Entrar";
    const r = el.getBoundingClientRect();
    return r.bottom <= window.innerHeight ? `Entrar visível sem rolar (base em ${Math.round(r.bottom)} de ${window.innerHeight} px)` : `Entrar FORA da primeira dobra (base em ${Math.round(r.bottom)} de ${window.innerHeight} px)`;
  });
}

// ------------------------------------------------------------------ grupos
async function publico() {
  await emCada({ grupo: "publico", papel: "sem-login" }, async ({ page, ir, tirar, nav, tema }) => {
    await ir("/");
    await conferirVariante(page, "/");
    if (tema === "claro") nota(`/ sem login, ${nav.nome}: ${await entrarVisivel(page)}`);
    await tirar(`inicial-${ZAP}`, { topo: true, desc: "Página inicial `/` sem login" });
    await ir("/termos");
    await tirar(`termos-${ZAP}`, { topo: true, desc: "Termos de uso" });
    const ancora = page.locator('a[href^="#"]').first();
    if (await ancora.count()) {
      await ancora.click();
      await page.waitForTimeout(700);
      await tirar(`termos-${ZAP}-ancora-seguida`, { inteira: false, topo: true, desc: "Termos depois de tocar o 1º item do índice" });
    }
    await ir("/privacidade");
    await tirar(`privacidade-${ZAP}`, { topo: true, desc: "Política de privacidade" });
    if (VARIANTE === "com") return;
    await ir("/cadastro");
    await tirar("cadastro-aceite-2-links", { topo: true, desc: "Cadastro com o aceite de Termos e Privacidade (2 links)" });
    await ir(`/orcamento/${E.p4.token}`);
    await tirar("orcamento-publico", { topo: false, desc: "Página pública do orçamento (link do cliente)" });
    const link = page.getByRole("link", { name: /política de privacidade completa/i });
    if (await link.count()) {
      await link.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      await tirar("orcamento-publico-link-privacidade", { inteira: false, topo: true, desc: "Página pública do orçamento rolada até o aviso e o link da privacidade" });
    } else falha("orcamento-publico", "sem o link da política de privacidade");
    await ir("/auth/confirmar?token_hash=exemplo-de-captura&type=recovery");
    await tirar("auth-confirmar-continuar", { inteira: false, topo: true, desc: "`/auth/confirmar` com link (token fictício, só a tela; o Continuar NÃO foi tocado)" });
    await ir("/auth/confirmar");
    await tirar("auth-confirmar-link-vencido", { inteira: false, topo: true, desc: "`/auth/confirmar` sem token: link vencido ou já usado" });
    await ir("/redefinir-senha");
    await tirar("redefinir-senha-sem-sessao", { inteira: false, topo: true, desc: "`/redefinir-senha` sem sessão: link vencido" });
  });
  await emCada({ grupo: "publico-200", papel: "sem-login", texto200: true }, async ({ page, ir, tirar }) => {
    await ir("/");
    await tirar(`inicial-${ZAP}`, { topo: true, desc: "Página inicial `/` sem login" });
    await ir("/termos");
    await tirar(`termos-${ZAP}`, { topo: true, desc: "Termos de uso" });
    await ir("/privacidade");
    await tirar(`privacidade-${ZAP}`, { topo: true, desc: "Política de privacidade" });
    if (VARIANTE === "com") return;
    await ir("/cadastro");
    await tirar("cadastro-aceite-2-links", { desc: "Cadastro com o aceite de 2 links" });
    await ir(`/orcamento/${E.p4.token}`);
    await tirar("orcamento-publico", { desc: "Página pública do orçamento" });
    await ir("/auth/confirmar?token_hash=exemplo-de-captura&type=recovery");
    await tirar("auth-confirmar-continuar", { desc: "`/auth/confirmar` com link (token fictício)" });
    await ir("/redefinir-senha");
    await tirar("redefinir-senha-sem-sessao", { desc: "`/redefinir-senha` sem sessão" });
    void page;
  });
}

async function extras() {
  // Primeira dobra do `/` (iPhone SE e 360 × 640), 320 px (página inicial, termos, privacidade), desktop.
  await emCada({ grupo: "extras-dobra", papel: "sem-login", navs: ["webkit-se", "chromium-640"] }, async ({ page, ir, tirar, nav, tema }) => {
    await ir("/");
    if (tema === "claro") nota(`/ sem login, ${nav.nome}: ${await entrarVisivel(page)}`);
    await tirar(`inicial-${ZAP}`, { inteira: false, topo: true, desc: "Primeira dobra da página inicial" });
  });
  await emCada({ grupo: "extras-dobra-200", papel: "sem-login", texto200: true, navs: ["webkit-se", "chromium-640"] }, async ({ ir, tirar }) => {
    await ir("/");
    await tirar(`inicial-${ZAP}`, { inteira: false, topo: true, desc: "Primeira dobra da página inicial" });
  });
  if (VARIANTE === "com") return;
  for (const t200 of [false, true]) {
    await emCada({ grupo: `extras-320${t200 ? "-200" : ""}`, papel: "sem-login", texto200: t200, navs: ["chromium-320"] }, async ({ ir, tirar }) => {
      await ir("/");
      await tirar(`inicial-${ZAP}`, { topo: true, desc: "Página inicial a 320 px" });
      await ir("/termos");
      await tirar(`termos-${ZAP}`, { topo: true, desc: "Termos a 320 px" });
      await ir("/privacidade");
      await tirar(`privacidade-${ZAP}`, { topo: true, desc: "Privacidade a 320 px" });
    });
  }
  await emCada({ grupo: "extras-desktop", papel: "sem-login", navs: ["desktop"] }, async ({ ir, tirar }) => {
    await ir("/");
    await tirar(`inicial-${ZAP}`, { desc: "Página inicial no computador (1280 px)" });
  });
  const s = await sessao(E.contas.d0);
  await emCada({ grupo: "extras-desktop", papel: "dono", sessao: s, navs: ["desktop"] }, async ({ ir, tirar }) => {
    await ir("/inicio");
    await tirar("inicio-passos-0de4", { desc: "Início do dono no computador, Primeiros passos 0 de 4 (cartão em 560 px)" });
  });
}

async function desvio() {
  // `/` com sessão: o proxy manda para /entrar, que decide a home do papel.
  const comCookie = async (s) => s.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  for (const [rot, c] of [["dono", E.contas.d4], ["mecanico", E.contas.m4]]) {
    const s = await sessao(c);
    const r1 = await fetch(`${APP_URL}/`, { redirect: "manual", headers: { cookie: await comCookie(s) } });
    nota(`GET / com sessão (${rot}): HTTP ${r1.status} -> ${r1.headers.get("location")}; Cache-Control: ${r1.headers.get("cache-control")}`);
    await emCada({ grupo: "desvio", papel: rot, sessao: s }, async ({ page, ir, tirar, nav, tema }) => {
      const caminhos = [];
      page.on("framenavigated", (f) => f === page.mainFrame() && caminhos.push(new URL(f.url()).pathname));
      await ir("/");
      if (tema === "claro") nota(`/ com sessão (${rot}), ${nav.nome}: ${caminhos.join(" -> ")}`);
      await tirar("desvio-raiz-com-sessao", { inteira: false, topo: true, desc: `\`/\` aberto com sessão: caiu em ${new URL(page.url()).pathname}` });
    });
  }
  const r0 = await fetch(`${APP_URL}/`, { redirect: "manual" });
  nota(`GET / sem sessão: HTTP ${r0.status}; Cache-Control: ${r0.headers.get("cache-control")}`);
}

async function passos() {
  const casos = [
    ["d0", "inicio-passos-0de4", "Início do dono, oficina nova: Primeiros passos 0 de 4"],
    ["d2", "inicio-passos-2de4", "Início do dono: 2 de 4 (telefone e catálogo feitos)"],
    ["d3", "inicio-passos-3de4", "Início do dono: 3 de 4, \"Falta só um\""],
    ["d4", "inicio-passos-4de4-cartao-some", "Início do dono com os 4 passos feitos: o cartão não aparece"],
  ];
  for (const [k, tela, desc] of casos) {
    const s = await sessao(E.contas[k]);
    await emCada({ grupo: `passos-${k}`, papel: "dono", sessao: s }, async ({ ir, tirar }) => {
      await ir("/inicio");
      await tirar(tela, { topo: true, desc });
    });
    if (k === "d0" || k === "d3")
      await emCada({ grupo: `passos-${k}-200`, papel: "dono", sessao: s, texto200: true }, async ({ ir, tirar }) => {
        await ir("/inicio");
        await tirar(tela, { topo: true, desc });
      });
  }
  // Dispensar e Desfazer (oficina própria, devolvida ao estado "não dispensado" ao fim de cada captura)
  const sD = await sessao(E.contas.dD);
  for (const t200 of [false, true]) {
    await emCada({ grupo: `passos-dispensar${t200 ? "-200" : ""}`, papel: "dono", sessao: sD, texto200: t200 }, async ({ page, ir, tirar }) => {
      try {
        await ir("/inicio");
        await page.getByRole("button", { name: "Dispensar primeiros passos" }).click();
        await page.waitForTimeout(500);
        await tirar("inicio-passos-recem-dispensado-desfazer", { inteira: false, topo: true, desc: "Logo depois de Dispensar: cartão sumiu, aviso com Desfazer (6 s)" });
        if (!t200) {
          await tirar("inicio-passos-recem-dispensado-desfazer", { topo: false, desc: "Logo depois de Dispensar, com o aviso Desfazer" });
          await page.getByRole("button", { name: /^Desfazer/ }).click();
          await page.waitForTimeout(1500);
          await tirar("inicio-passos-desfeito", { inteira: false, topo: true, desc: "Depois de Desfazer: o cartão volta no mesmo lugar" });
          // Dispensado e recarregado (o aviso já sumiu): o Início volta a ser o de antes da Fase 8.
          await sD.sb.rpc("dispensar_primeiros_passos");
          await ir("/inicio");
          await tirar("inicio-passos-dispensado-recarregado", { inteira: false, topo: true, desc: "Dispensado e recarregado: sem o cartão" });
        }
      } finally {
        const r = await sD.sb.rpc("desfazer_dispensar_primeiros_passos");
        if (r.error) falha("desfazer via RPC", msg(r));
      }
    });
  }
}

async function ajuda() {
  const sDono = await sessao(E.contas.d4);
  const sAt = await sessao(E.contas.a4);
  const sMec = await sessao(E.contas.m4);
  for (const t200 of [false, true]) {
    const suf = t200 ? "-200" : "";
    await emCada({ grupo: `ajuda-dono${suf}`, papel: "dono", sessao: sDono, texto200: t200 }, async ({ page, ir, tirar }) => {
      await ir("/mais");
      await conferirVariante(page, "/mais");
      await tirar(`mais-ajuda-${ZAP}`, { desc: "Mais do dono com o grupo Ajuda" });
      await ir("/conta");
      await tirar(`conta-ajuda-${ZAP}`, { desc: "Conta do dono com o grupo Ajuda" });
      if (VARIANTE === "com") return;
      await ir("/mais");
      await page.locator('button[aria-haspopup="dialog"]', { hasText: "Enviar feedback" }).click();
      await page.getByRole("dialog").waitFor();
      await page.waitForTimeout(700);
      await tirar("folha-enviar-feedback", { inteira: false, topo: true, desc: "Folha \"Enviar feedback\" aberta pelo grupo Ajuda do Mais" });
      // Fechar a folha mexe no histórico: espera assentar antes de navegar (senão volta para /mais).
      await page.keyboard.press("Escape").catch(() => {});
      await page.getByRole("dialog").waitFor({ state: "detached" }).catch(() => {});
      await page.waitForTimeout(1500);
      // Equipe: "Gerar link de senha" (sem a chave secreta no servidor local: o erro que o app mostra)
      await ir("/equipe");
      // F8-B5 (I2): o fantasma "Esqueceu a senha? Gerar link" fica no próprio cartão, sem abrir "Gerenciar acesso".
      const botaoSenha = page.getByRole("button", { name: "Gerar link de senha para Mecânico Captura" });
      await botaoSenha.waitFor();
      const bloco = page.locator("div.flex.flex-col.gap-2", { has: botaoSenha });
      await bloco.scrollIntoViewIfNeeded();
      await tirar("equipe-gerar-link-senha", { inteira: !t200, topo: true, desc: "Equipe: fantasma \"Esqueceu a senha? Gerar link\" no cartão do mecânico" });
      await botaoSenha.click();
      await page.waitForFunction(() => !document.body.innerText.includes("Gerando…"), null, { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(600);
      await bloco.scrollIntoViewIfNeeded();
      const caixa = (await bloco.innerText()).replace(/\s+/g, " ");
      if (page.viewportSize().width === 360 && !t200) nota(`Gerar link de senha (local, sem a chave): "${caixa}"`);
      await tirar("equipe-gerar-link-senha-erro", { inteira: false, topo: true, desc: "\"Gerar link de senha\" tocado sem a chave secreta no servidor: o erro que o app mostra" });
    });
    await emCada({ grupo: `ajuda-atendente${suf}`, papel: "atendente", sessao: sAt, texto200: t200 }, async ({ page, ir, tirar }) => {
      await ir("/mais");
      await conferirVariante(page, "/mais");
      await tirar(`mais-ajuda-${ZAP}`, { desc: "Mais do atendente com o grupo Ajuda" });
      await ir("/conta");
      await tirar(`conta-ajuda-${ZAP}`, { desc: "Conta do atendente com o grupo Ajuda" });
    });
    await emCada({ grupo: `ajuda-mecanico${suf}`, papel: "mecanico", sessao: sMec, texto200: t200 }, async ({ page, ir, tirar }) => {
      await ir("/conta");
      await conferirVariante(page, "/conta");
      await tirar(`conta-ajuda-${ZAP}`, { desc: "Conta do mecânico com o grupo Ajuda" });
      if (VARIANTE === "com") return;
      // /redefinir-senha com sessão: o formulário (aqui com a sessão comum, não a de recuperação)
      await ir("/redefinir-senha");
      await tirar("redefinir-senha-com-sessao", { inteira: false, topo: true, desc: "`/redefinir-senha` com sessão: formulário da senha nova (nada foi salvo)" });
    });
  }
}

/**
 * F8-B5 (I3): caminho feliz da senha do funcionário, com a SUPABASE_SECRET_KEY no servidor (não neste
 * script). Oficina própria ("… senha"), para não derrubar a sessão do mecânico dos outros grupos: o
 * "Salvar senha nova" encerra as outras sessões. Em cada navegador × tema × texto: o dono gera o link na
 * Equipe; a mesma aba sai da conta do dono, abre o link, toca "Continuar", cria a senha e vê o destino.
 * Cada link vale uma vez e gerar outro cancela o anterior, então tudo acontece em sequência na mesma aba.
 */
async function senha() {
  if (SO && !SO.test("senha") && !SO.test("senha-200")) return;
  const rodada = E.rodada;
  const d = await criarConta("dono.cap8senha", rodada);
  const of = await d.sb.rpc("criar_oficina", { p_nome_oficina: `Oficina Captura F8 senha ${rodada.slice(-4)}`, p_nome_dono: "Dono Captura", p_versao_termos: TERMOS, p_telefone: "(41) 97777-5555" });
  if (of.error) throw new Error(`criar_oficina senha: ${msg(of)}`);
  const c = await d.sb.rpc("criar_convite", { p_papel: "mecanico" }).single();
  const m = await criarConta("mecanico.cap8senha", rodada);
  const ac = await m.sb.rpc("aceitar_convite", { p_token: c.data?.token, p_nome: "Mecânico Senha", p_versao_termos: TERMOS });
  if (c.error || ac.error) throw new Error(`convite senha: ${msg(c)}/${msg(ac)}`);
  const sDono = await sessao(d);
  for (const t200 of [false, true]) {
    await emCada({ grupo: `senha${t200 ? "-200" : ""}`, papel: "dono", sessao: sDono, texto200: t200 }, async ({ page, ir, tirar, chave }) => {
      const estilo = async () => {
        await pronto(page);
        if (t200) await page.addStyleTag({ content: TEXTO_200 }).catch(() => {});
        await page.waitForTimeout(300);
      };
      // 1. Dono gera o link na Equipe
      await ir("/equipe");
      await page.getByRole("button", { name: "Gerar link de senha para Mecânico Senha" }).click();
      const titulo = page.getByRole("heading", { name: /Link de senha de Mecânico Senha/ });
      await titulo.waitFor({ timeout: 20000 });
      // Título da caixa logo abaixo do cabeçalho fixo: é onde o dono está quando a caixa abre.
      await titulo.evaluate((el) => {
        el.scrollIntoView({ block: "start" });
        window.scrollBy(0, -(document.querySelector("header")?.getBoundingClientRect().height ?? 0) - 16);
      });
      await page.waitForTimeout(400);
      const zap = page.getByRole("link", { name: "Enviar pelo WhatsApp" });
      const posZap = await zap.evaluate((el) => {
        const nav = [...document.querySelectorAll("nav")].map((n) => n.getBoundingClientRect()).find((r) => r.bottom >= window.innerHeight - 1);
        const limite = nav ? nav.top : window.innerHeight;
        return { base: Math.round(el.getBoundingClientRect().bottom), limite: Math.round(limite) };
      });
      nota(`Link gerado (${chave}${t200 ? ", 200 %" : ""}): "Enviar pelo WhatsApp" ${posZap.base <= posZap.limite ? "na primeira tela" : "ABAIXO da dobra"} (base ${posZap.base} px, limite ${posZap.limite} px)`);
      const link = (await page.locator("p.font-mono").first().textContent() ?? "").trim();
      if (!link.includes("/auth/confirmar?")) throw new Error(`link inesperado: ${link.replace(/token_hash=[^&]+/, "token_hash=…")}`);
      await tirar("equipe-link-senha-gerado", { inteira: !t200, topo: true, desc: "Equipe: caixa \"Link de senha de …\" com Enviar pelo WhatsApp, Copiar link e Fechar (link real)" });
      // "Ver o link" abre e fecha
      const verLink = page.locator("summary", { hasText: "Ver o link" });
      const url = page.locator("p.font-mono").first();
      const fechadoAntes = !(await url.isVisible());
      await verLink.click();
      await url.waitFor({ state: "visible", timeout: 5000 });
      await url.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await tirar("equipe-link-senha-ver-o-link", { inteira: false, topo: true, desc: "Equipe: \"Ver o link\" aberto" });
      await verLink.click();
      await url.waitFor({ state: "hidden", timeout: 5000 });
      nota(`"Ver o link" (${chave}${t200 ? ", 200 %" : ""}): fechado no início ${fechadoAntes ? "sim" : "NÃO"}, abre e fecha ok`);
      if (chave === "chromium") {
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: APP_URL }).catch(() => {});
        await page.getByRole("button", { name: "Copiar link" }).click();
        await page.getByText(/Link copiado. Cole na conversa/).waitFor();
        await page.getByText(/Link copiado. Cole na conversa/).scrollIntoViewIfNeeded();
        await tirar("equipe-link-senha-copiado", { inteira: false, topo: true, desc: "Equipe: depois de \"Copiar link\"" });
      }
      // 2. Sai da conta do dono (só nesta aba) e abre o link como o mecânico abriria no WhatsApp
      await page.context().clearCookies();
      await page.goto(link, { waitUntil: "domcontentloaded" });
      await estilo();
      await page.getByRole("button", { name: /Continuar/ }).waitFor();
      await tirar("auth-confirmar-link-valido", { papel: "mecanico", inteira: false, topo: true, desc: "`/auth/confirmar` com link real e válido, antes do Continuar" });
      // 3. Continuar troca o token pela sessão de recuperação e vai para /redefinir-senha
      await page.getByRole("button", { name: /Continuar/ }).click();
      await page.waitForURL((u) => u.pathname.startsWith("/redefinir-senha"), { timeout: 25000 });
      await estilo();
      await page.getByLabel("Senha nova", { exact: true }).waitFor();
      await tirar("redefinir-senha-recuperacao", { papel: "mecanico", inteira: false, topo: true, desc: "`/redefinir-senha` com a sessão de recuperação (depois do Continuar)" });
      // 4. Salva a senha nova e mostra para onde o mecânico vai
      const nova = `Mf-${randomBytes(12).toString("base64url")}`;
      await page.getByLabel("Senha nova", { exact: true }).fill(nova);
      await page.getByLabel("Repita a senha nova", { exact: true }).fill(nova);
      await page.getByRole("button", { name: "Salvar senha nova" }).click();
      await page.waitForURL((u) => !u.pathname.startsWith("/redefinir-senha") && u.pathname !== "/entrar", { timeout: 30000 });
      await estilo();
      const destino = new URL(page.url()).pathname;
      if (chave === "chromium" && !t200) nota(`Senha do funcionário: depois de "Salvar senha nova" o mecânico chega em ${destino}`);
      await tirar("senha-nova-salva-destino", { papel: "mecanico", topo: true, inteira: !t200, desc: `Mecânico logo depois de "Salvar senha nova" (${destino})` });
    });
  }
}

async function vitrine() {
  await emCada({ grupo: "vitrine", papel: "sem-login" }, async ({ ir, tirar }) => {
    await ir("/dev/fase8");
    await tirar("vitrine-dev-fase8", { topo: true, desc: "Vitrine `/dev/fase8`" });
  });
}

// ------------------------------------------------------------------ principal
let E;
const sessao = async (c) => entrar(c.email, c.pw);

async function main() {
  E = ESTADO && existsSync(ESTADO) ? JSON.parse(readFileSync(ESTADO, "utf8")) : null;
  if (!E) {
    E = await preparar();
    if (ESTADO) writeFileSync(ESTADO, JSON.stringify(E, null, 2));
  }
  console.log(`Rodada ${E.rodada}, variante ${VARIANTE}, app ${APP_URL}`);
  await publico();
  await extras();
  if (VARIANTE === "sem") {
    await desvio();
    await passos();
  }
  await ajuda();
  if (VARIANTE === "sem") await vitrine();
  if (VARIANTE === "sem") await senha();
}

try {
  await main();
} catch (e) {
  falha("erro inesperado", e);
}
for (const b of Object.values(motores)) await b.close();
const arqFeitas = join(SAIDA, "_feitas.json");
const antes = existsSync(arqFeitas) ? JSON.parse(readFileSync(arqFeitas, "utf8")) : { rodada: E?.rodada, capturas: [], notas: [] };
const nomes = new Set(feitas.map((f) => f.arquivo));
writeFileSync(
  arqFeitas,
  JSON.stringify({ rodada: E?.rodada, capturas: [...antes.capturas.filter((f) => !nomes.has(f.arquivo)), ...feitas], notas: [...antes.notas, ...notas.map((n) => `[${VARIANTE}] ${n}`)], falhas: [...(antes.falhas ?? []), ...falhas] }, null, 2),
);
console.log(`\n\n${feitas.length} capturas; ${falhas.length} falhas.`);
for (const f of falhas) console.log(`  - ${f}`);
process.exit(falhas.length ? 1 : 0);
