#!/usr/bin/env node
/**
 * Teste de ponta a ponta da Fase 1 contra o Supabase STAGING (so dados ficticios).
 *
 * Uso:
 *   node scripts/testar-staging.mjs                         # so testes sem login (anon)
 *   TESTE_EMAIL_DOMINIO=algum-dominio-com-mx.com node scripts/testar-staging.mjs
 *   APP_URL=http://localhost:3000 ...                       # tambem testa as paginas do app
 *
 * Requisitos para o teste completo:
 *   - "Confirm email" DESLIGADO no staging (Auth > Sign In / Providers > Email).
 *   - Dominio de e-mail que o Supabase aceite (ele recusa .test e example.com).
 *
 * Usa so a chave publishable do .env.local (nunca a secret). As senhas sao
 * aleatorias, geradas a cada execucao e nunca impressas nem salvas.
 * As contas criadas ficam no staging (sem chave secret nao da para apagar).
 */
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

// ------------------------------------------------------------------ env
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const URL_SB = env.NEXT_PUBLIC_SUPABASE_URL;
const CHAVE = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!URL_SB || !CHAVE) throw new Error("Falta NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY no .env.local");
if (!URL_SB.includes("qjzhzyzmifashtvffxdx")) throw new Error("Este teste so roda no projeto STAGING.");

// TESTE_EMAIL_BASE=fulano@gmail.com gera fulano+rotulo.rodada@gmail.com (com a confirmacao
// desligada nenhum e-mail e enviado). Alternativa: TESTE_EMAIL_DOMINIO=dominio-com-mx.com
const BASE = process.env.TESTE_EMAIL_BASE;
const DOMINIO = BASE ? BASE.split("@")[1] : process.env.TESTE_EMAIL_DOMINIO;
const emailTeste = (rotulo) =>
  BASE ? BASE.replace("@", `+${rotulo}.${RODADA}@`) : `${rotulo}.${RODADA}@${DOMINIO}`;
const APP_URL = process.env.APP_URL;
const TERMOS = "2026-10-28";
const RODADA = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;

// ------------------------------------------------------------------ relatorio
let passou = 0;
let falhou = 0;
function checar(nome, ok, detalhe = "") {
  if (ok) passou++;
  else falhou++;
  console.log(`${ok ? "PASSOU" : "FALHOU"}  ${nome}${detalhe ? `  (${detalhe})` : ""}`);
}
const novoCliente = () => createClient(URL_SB, CHAVE, { auth: { persistSession: false, autoRefreshToken: false } });
const senha = () => `Mf-${randomBytes(12).toString("base64url")}`;

async function criarConta(rotulo) {
  const sb = novoCliente();
  const email = emailTeste(rotulo);
  const pw = senha();
  const { data, error } = await sb.auth.signUp({ email, password: pw });
  if (error) throw new Error(`signUp ${rotulo}: ${error.message}`);
  if (!data.session) throw new Error(`signUp ${rotulo}: sem sessao (confirmacao de e-mail ligada?)`);
  return { sb, email, pw, session: data.session };
}

/** Cookies no formato do @supabase/ssr, para chamar as paginas do app logado. */
async function cookiesDaSessao(session) {
  const jar = new Map();
  const sb = createServerClient(URL_SB, CHAVE, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (lista) => lista.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
    },
  });
  await sb.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
  return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function pagina(caminho, cookie) {
  const r = await fetch(`${APP_URL}${caminho}`, { headers: cookie ? { cookie } : {}, redirect: "manual" });
  return { status: r.status, local: r.headers.get("location"), html: r.status === 200 ? await r.text() : "" };
}

// ------------------------------------------------------------------ 1. sem login
async function testesAnon() {
  console.log("\n== Sem login (anon) ==");
  const anon = novoCliente();
  const cfg = await fetch(`${URL_SB}/auth/v1/settings`, { headers: { apikey: CHAVE } }).then((r) => r.json());
  console.log(`info    confirmacao de e-mail: ${cfg.mailer_autoconfirm ? "DESLIGADA" : "LIGADA"} | cadastro: ${cfg.disable_signup ? "fechado" : "aberto"}`);

  const v = await anon.rpc("ver_convite", { p_token: "0".repeat(64) }).single();
  checar("anon: ver_convite com token inventado = inexistente", v.data?.situacao === "inexistente", v.error?.message);
  const p = await anon.rpc("normalizar_placa", { p_placa: "abc-1d23" });
  checar("anon: normalizar_placa('abc-1d23') = ABC1D23", p.data === "ABC1D23", p.error?.message);

  for (const t of ["oficinas", "perfis", "clientes", "veiculos", "catalogo_pecas", "catalogo_pecas_precos", "vw_catalogo_pecas", "convites"]) {
    const r = await anon.from(t).select("*").limit(1);
    checar(`anon: nao le ${t}`, Boolean(r.error) || (r.data ?? []).length === 0, r.error?.code ?? `${r.data?.length} linhas`);
  }
  const c = await anon.rpc("criar_oficina", { p_nome_oficina: "X", p_nome_dono: "Y", p_versao_termos: TERMOS });
  checar("anon: nao chama criar_oficina", Boolean(c.error), c.error?.code);
  return cfg.mailer_autoconfirm === true;
}

// ------------------------------------------------------------------ 2. fluxo completo
async function testesCompletos() {
  console.log("\n== Dono A: cadastro + criar_oficina ==");
  const donoA = await criarConta("dono.teste");
  const ofA = await donoA.sb.rpc("criar_oficina", {
    p_nome_oficina: `Oficina Teste A ${RODADA}`,
    p_nome_dono: "Dono Teste A",
    p_versao_termos: TERMOS,
    p_telefone: "(11) 98888-7777",
  });
  checar("dono A: criar_oficina devolve id", typeof ofA.data === "string", ofA.error?.message);
  const ctxA = (await donoA.sb.rpc("meu_contexto").single()).data;
  checar("dono A: meu_contexto papel=dono, termos aceitos", ctxA?.papel === "dono" && ctxA?.termos_aceitos === true && ctxA?.oficina_id === ofA.data);
  const dup = await donoA.sb.rpc("criar_oficina", { p_nome_oficina: "Outra", p_nome_dono: "X", p_versao_termos: TERMOS });
  checar("dono A: 2a oficina recusada (usuario_ja_tem_oficina)", dup.error?.message === "usuario_ja_tem_oficina", dup.error?.message);

  console.log("\n== Dono A: cadastros ==");
  const cli = await donoA.sb.from("clientes").insert({ nome: "Transportes Teste", telefone: "(11) 3333-4444", modo_padrao: "servico_direto" }).select("id, telefone").single();
  checar("dono A: cria cliente (telefone normalizado)", cli.data?.telefone === "1133334444", cli.error?.message);
  const vei = await donoA.sb.from("veiculos").insert({ cliente_id: cli.data?.id, placa: "abc-1d23", marca: "Volvo", modelo: "FH 540" }).select("id, placa").single();
  checar("dono A: cria veiculo (placa normalizada ABC1D23)", vei.data?.placa === "ABC1D23", vei.error?.message);
  const ruim = await donoA.sb.from("veiculos").insert({ cliente_id: cli.data?.id, placa: "AB12345" });
  checar("dono A: placa invalida recusada (23514)", ruim.error?.code === "23514", ruim.error?.code);
  const repetida = await donoA.sb.from("veiculos").insert({ cliente_id: cli.data?.id, placa: "ABC1D23" });
  checar("dono A: placa repetida recusada (23505)", repetida.error?.code === "23505", repetida.error?.code);

  const serv = await donoA.sb.from("catalogo_servicos").insert({ nome: "Troca de óleo" }).select("id").single();
  const servPreco = await donoA.sb.from("catalogo_servicos_precos").upsert({ servico_id: serv.data?.id, preco_padrao_centavos: 15000 });
  checar("dono A: cria servico com preco", !serv.error && !servPreco.error, serv.error?.message ?? servPreco.error?.message);
  const peca = await donoA.sb.from("catalogo_pecas").insert({ nome: "Filtro de óleo", codigo: "FO-1" }).select("id").single();
  const [pp, pc] = await Promise.all([
    donoA.sb.from("catalogo_pecas_precos").upsert({ peca_id: peca.data?.id, preco_venda_centavos: 8990 }),
    donoA.sb.from("catalogo_pecas_custos").upsert({ peca_id: peca.data?.id, custo_centavos: 5000 }),
  ]);
  checar("dono A: cria peca com preco e custo", !peca.error && !pp.error && !pc.error, peca.error?.message ?? pp.error?.message ?? pc.error?.message);
  const pend = await donoA.sb.from("catalogo_pecas").insert({ nome: "Peça sem preço" }).select("id").single();
  const vwDono = await donoA.sb.from("vw_catalogo_pecas").select("id, nome, pendente_precificacao, preco_venda_centavos, custo_centavos");
  const filtro = vwDono.data?.find((p) => p.id === peca.data?.id);
  const semPreco = vwDono.data?.find((p) => p.id === pend.data?.id);
  checar("dono A: view mostra preco e custo; trigger tira o pendente", filtro?.preco_venda_centavos === 8990 && filtro?.custo_centavos === 5000 && filtro?.pendente_precificacao === false);
  checar("dono A: peca sem preco fica pendente", semPreco?.pendente_precificacao === true);

  console.log("\n== Convite -> mecanico ==");
  const conv = await donoA.sb.rpc("criar_convite", { p_papel: "mecanico", p_nome_sugerido: "Mecânico Teste" }).single();
  checar("dono A: criar_convite devolve token de 64 hex", /^[0-9a-f]{64}$/.test(conv.data?.token ?? ""), conv.error?.message);
  const visto = await novoCliente().rpc("ver_convite", { p_token: conv.data?.token }).single();
  checar("anon: ver_convite = valido, com nome da oficina e papel", visto.data?.situacao === "valido" && visto.data?.papel === "mecanico" && visto.data?.oficina_nome?.startsWith("Oficina Teste A"));

  const mec = await criarConta("mecanico.teste");
  const aceite = await mec.sb.rpc("aceitar_convite", { p_token: conv.data?.token, p_nome: "Mecânico Teste", p_versao_termos: TERMOS });
  checar("mecanico: aceitar_convite entra na oficina A", aceite.data === ofA.data, aceite.error?.message);
  const usado = await novoCliente().rpc("ver_convite", { p_token: conv.data?.token }).single();
  checar("convite: depois de aceito fica 'usado' (uso unico)", usado.data?.situacao === "usado");
  const ctxM = (await mec.sb.rpc("meu_contexto").single()).data;
  checar("mecanico: meu_contexto papel=mecanico, termos aceitos", ctxM?.papel === "mecanico" && ctxM?.termos_aceitos === true);

  console.log("\n== Mecanico NAO ve valores ==");
  const vwMec = await mec.sb.from("vw_catalogo_pecas").select("id, nome, preco_venda_centavos, custo_centavos");
  checar("mecanico: ve as pecas pela view", (vwMec.data?.length ?? 0) >= 2, vwMec.error?.message);
  checar("mecanico: preco e custo NULL em todas as pecas da view", (vwMec.data ?? []).every((p) => p.preco_venda_centavos === null && p.custo_centavos === null));
  const vsMec = await mec.sb.from("vw_catalogo_servicos").select("id, preco_padrao_centavos");
  checar("mecanico: preco NULL nos servicos da view", (vsMec.data?.length ?? 0) >= 1 && vsMec.data.every((s) => s.preco_padrao_centavos === null));
  for (const t of ["catalogo_pecas_precos", "catalogo_pecas_custos", "catalogo_servicos_precos"]) {
    const r = await mec.sb.from(t).select("*");
    checar(`mecanico: 0 linhas em ${t}`, (r.data ?? []).length === 0, r.error?.code ?? `${r.data?.length} linhas`);
  }
  const placaMec = await mec.sb.from("veiculos").select("placa, cliente:clientes(nome)").eq("placa", "ABC1D23").maybeSingle();
  checar("mecanico: busca veiculo pela placa (com cliente)", placaMec.data?.cliente?.nome === "Transportes Teste", placaMec.error?.message);
  const cliMec = await mec.sb.from("clientes").insert({ nome: "Não pode" });
  checar("mecanico: nao cria cliente", Boolean(cliMec.error), cliMec.error?.code);
  const perfMec = await mec.sb.from("perfis").select("id");
  checar("mecanico: ve so o proprio perfil", perfMec.data?.length === 1);
  const precoMec = await mec.sb.from("catalogo_pecas_precos").upsert({ peca_id: pend.data?.id, preco_venda_centavos: 1 });
  checar("mecanico: nao grava preco", Boolean(precoMec.error), precoMec.error?.code);

  console.log("\n== Atendente: ve preco, nao ve custo ==");
  const convAt = await donoA.sb.rpc("criar_convite", { p_papel: "atendente" }).single();
  const at = await criarConta("atendente.teste");
  const aceiteAt = await at.sb.rpc("aceitar_convite", { p_token: convAt.data?.token, p_nome: "Atendente Teste", p_versao_termos: TERMOS });
  checar("atendente: aceitar_convite", aceiteAt.data === ofA.data, aceiteAt.error?.message);
  const vwAt = (await at.sb.from("vw_catalogo_pecas").select("id, preco_venda_centavos, custo_centavos")).data?.find((p) => p.id === peca.data?.id);
  checar("atendente: ve preco de venda, custo NULL", vwAt?.preco_venda_centavos === 8990 && vwAt?.custo_centavos === null);

  console.log("\n== Isolamento: oficina B nao ve a A ==");
  const donoB = await criarConta("dono.teste.b");
  const ofB = await donoB.sb.rpc("criar_oficina", { p_nome_oficina: `Oficina Teste B ${RODADA}`, p_nome_dono: "Dono Teste B", p_versao_termos: TERMOS });
  checar("dono B: criar_oficina", typeof ofB.data === "string" && ofB.data !== ofA.data, ofB.error?.message);
  for (const t of ["clientes", "veiculos", "catalogo_servicos", "catalogo_pecas", "catalogo_pecas_precos", "catalogo_pecas_custos", "vw_catalogo_pecas", "convites", "termos_aceite"]) {
    const r = await donoB.sb.from(t).select("*");
    const daA = (r.data ?? []).filter((x) => x.oficina_id === ofA.data);
    checar(`dono B: nao ve ${t} da A`, !r.error && daA.length === 0, r.error?.code ?? `${daA.length} da A`);
  }
  const perfB = await donoB.sb.from("perfis").select("id, oficina_id");
  checar("dono B: so ve perfis da propria oficina", (perfB.data ?? []).every((p) => p.oficina_id === ofB.data));
  const ofsB = await donoB.sb.from("oficinas").select("id");
  checar("dono B: so ve a propria oficina", ofsB.data?.length === 1 && ofsB.data[0].id === ofB.data);
  const upd = await donoB.sb.from("clientes").update({ nome: "Hackeado" }).eq("id", cli.data?.id).select("id");
  checar("dono B: update em cliente da A afeta 0 linhas", !upd.error && upd.data?.length === 0, upd.error?.code);
  const del = await donoB.sb.from("veiculos").delete().eq("id", vei.data?.id).select("id");
  checar("dono B: delete em veiculo da A afeta 0 linhas", !del.error && del.data?.length === 0, del.error?.code);
  const fk = await donoB.sb.from("veiculos").insert({ cliente_id: cli.data?.id, placa: "XYZ9876" });
  checar("dono B: nao liga veiculo a cliente da A (FK composta)", Boolean(fk.error), fk.error?.code);
  const cliB = await donoB.sb.from("clientes").insert({ nome: "Cliente B" }).select("id").single();
  const mesmaPlaca = await donoB.sb.from("veiculos").insert({ cliente_id: cliB.data?.id, placa: "ABC1D23" });
  checar("dono B: mesma placa permitida em outra oficina", !mesmaPlaca.error, mesmaPlaca.error?.message);
  const revB = await donoB.sb.rpc("revogar_convite", { p_convite_id: convAt.data?.convite_id });
  checar("dono B: nao revoga convite da A", revB.error?.message === "convite_nao_encontrado", revB.error?.message);
  const membB = await donoB.sb.rpc("atualizar_membro", { p_perfil_id: mec.session.user.id, p_ativo: false });
  checar("dono B: nao desativa mecanico da A", membB.error?.message === "membro_nao_encontrado", membB.error?.message);
  const aindaA = (await donoA.sb.from("clientes").select("nome").eq("id", cli.data?.id).single()).data;
  checar("dono A: cliente intacto depois das tentativas da B", aindaA?.nome === "Transportes Teste");

  // ---------------------------------------------------------------- 3. paginas do app
  if (APP_URL) {
    console.log(`\n== Paginas do app (${APP_URL}) ==`);
    const [ckDono, ckMec] = await Promise.all([cookiesDaSessao(donoA.session), cookiesDaSessao(mec.session)]);
    const catDono = await pagina("/catalogo?aba=pecas", ckDono);
    checar("app dono: /catalogo mostra preco e custo", catDono.status === 200 && catDono.html.includes("R$") && catDono.html.includes("custo"), `status ${catDono.status}`);
    const catMec = await pagina("/catalogo?aba=pecas", ckMec);
    checar("app mecanico: /catalogo sem nenhum R$", catMec.status === 200 && catMec.html.includes("Filtro de óleo") && !catMec.html.includes("R$"), `status ${catMec.status}`);
    const cliMecPg = await pagina("/clientes", ckMec);
    checar("app mecanico: /clientes manda para /minhas-os", cliMecPg.html.includes("/minhas-os") || cliMecPg.local?.includes("/minhas-os"), `status ${cliMecPg.status}`);
    const placaPg = await pagina("/placa?placa=abc-1d23", ckMec);
    checar("app mecanico: /placa acha ABC1D23", placaPg.status === 200 && placaPg.html.includes("ABC1D23"));
    const equipePg = await pagina("/equipe", ckDono);
    checar("app dono: /equipe lista o mecanico", equipePg.status === 200 && equipePg.html.includes("Mecânico Teste"));
  }

  console.log("\n== Desativar mecanico ==");
  const desat = await donoA.sb.rpc("atualizar_membro", { p_perfil_id: mec.session.user.id, p_ativo: false });
  checar("dono A: desativa mecanico", !desat.error, desat.error?.message);
  const ctxDesat = (await mec.sb.rpc("meu_contexto").single()).data;
  checar("mecanico desativado: meu_contexto ativo=false", ctxDesat?.ativo === false);
  const nada = await mec.sb.from("veiculos").select("id");
  checar("mecanico desativado: nao ve mais nada", (nada.data ?? []).length === 0);
  const eu = await donoA.sb.rpc("atualizar_membro", { p_perfil_id: donoA.session.user.id, p_ativo: false });
  checar("dono A: nao desativa a si mesmo", eu.error?.message === "nao_pode_alterar_a_si_mesmo", eu.error?.message);

  console.log(`\ninfo    contas criadas nesta rodada: *.${RODADA}@${DOMINIO} (ficam no staging)`);
}

// ------------------------------------------------------------------ main
const autoconfirm = await testesAnon();
if (!DOMINIO) {
  console.log("\nPULADO  fluxo com login: defina TESTE_EMAIL_DOMINIO (dominio com MX; o Supabase recusa .test e example.com).");
} else if (!autoconfirm) {
  console.log("\nPULADO  fluxo com login: a confirmacao de e-mail esta LIGADA no staging. Desligue em Auth > Providers > Email > Confirm email.");
} else {
  try {
    await testesCompletos();
  } catch (e) {
    falhou++;
    console.log(`FALHOU  erro inesperado: ${e.message}`);
  }
}
console.log(`\nResultado: ${passou} passaram, ${falhou} falharam.`);
process.exit(falhou ? 1 : 0);
