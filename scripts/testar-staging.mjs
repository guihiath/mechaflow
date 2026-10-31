#!/usr/bin/env node
/**
 * Teste de ponta a ponta das Fases 1, 2 e 3 contra o Supabase STAGING (so dados ficticios).
 * Fase 2 (OS): os dois modos ate "entregue", autorizacao, mecanico sem valores pela API
 * (tabelas e views), isolamento entre oficinas, idempotencia e numeracao com aberturas simultaneas.
 * Fase 3: itens lancados pelo mecanico (sem valores, status, "apos a aprovacao"), observacoes
 * fora do alcance do mecanico, fotos no Storage (isolamento, URL assinada que expira, 5 MB,
 * so JPEG, caminho forjado, limite de 40, apagar/editar por papel e status) e idempotencia.
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

  for (const t of ["oficinas", "perfis", "clientes", "veiculos", "catalogo_pecas", "catalogo_pecas_precos", "vw_catalogo_pecas", "convites", "ordens_servico", "os_comercial", "os_itens", "os_itens_precos", "vw_os", "vw_os_totais"]) {
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
  // Fase 2: o mecanico nao le mais "clientes"; o nome vem pela dados_da_placa (sem telefone).
  const placaMec = await mec.sb.rpc("dados_da_placa", { p_placa: "abc-1d23" }).maybeSingle();
  checar("mecanico: dados_da_placa traz o nome do cliente, sem telefone", placaMec.data?.cliente_nome === "Transportes Teste" && placaMec.data?.cliente_telefone === null && placaMec.data?.cliente_modo_padrao === null, placaMec.error?.message);
  const cliLeMec = await mec.sb.from("clientes").select("id, telefone");
  checar("mecanico: nao le a tabela clientes (telefone/documento)", (cliLeMec.data ?? []).length === 0, cliLeMec.error?.code ?? `${cliLeMec.data?.length} linhas`);
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

  await testesFase2({ donoA, mec, at, donoB, ofA: ofA.data, ofB: ofB.data, vei: vei.data, serv: serv.data, peca: peca.data });
  await testesFase3({ donoA, mec, at, donoB, ofA: ofA.data, vei: vei.data, serv: serv.data, peca: peca.data, pend: pend.data });

  console.log("\n== Desativar mecanico ==");
  const desat = await donoA.sb.rpc("atualizar_membro", { p_perfil_id: mec.session.user.id, p_ativo: false });
  checar("dono A: desativa mecanico", !desat.error, desat.error?.message);
  const ctxDesat = (await mec.sb.rpc("meu_contexto").single()).data;
  checar("mecanico desativado: meu_contexto ativo=false", ctxDesat?.ativo === false);
  const nada = await mec.sb.from("veiculos").select("id");
  checar("mecanico desativado: nao ve mais nada", (nada.data ?? []).length === 0);
  const nadaOs = await mec.sb.from("vw_os").select("id");
  checar("mecanico desativado: nao ve mais OS", (nadaOs.data ?? []).length === 0, nadaOs.error?.code);
  const eu = await donoA.sb.rpc("atualizar_membro", { p_perfil_id: donoA.session.user.id, p_ativo: false });
  checar("dono A: nao desativa a si mesmo", eu.error?.message === "nao_pode_alterar_a_si_mesmo", eu.error?.message);

  console.log(`\ninfo    contas criadas nesta rodada: *.${RODADA}@${DOMINIO} (ficam no staging)`);
}

// ------------------------------------------------------------------ 4. Fase 2: OS
const uuid = () => crypto.randomUUID();
const msg = (r) => r?.error?.message ?? (r?.error ? r.error.code : "sem erro");
/** Colunas da vw_os que o mecanico NUNCA pode receber preenchidas (valor, pagamento, contato, autorizacao). */
const COLUNAS_PROIBIDAS_MECANICO = [
  "total_servicos_centavos", "total_pecas_centavos", "total_centavos", "custo_total_centavos", "valor_aprovado_centavos",
  "qtd_itens", "itens_sem_preco", "forma_pagamento", "pago_em", "pagamento_registrado_por_nome", "cliente_telefone",
  "autorizado_por_nome", "autorizado_por_telefone", "autorizacao_registrada_por_nome", "orcamento_aprovado_por_nome",
  "orcamento_aprovacao_canal", "orcamento_aprovacao_registrada_por_nome",
];

async function totalDe(sb, osId) {
  return (await sb.from("vw_os_totais").select("total_centavos, itens_sem_preco, qtd_itens").eq("os_id", osId).maybeSingle()).data;
}

async function testesFase2({ donoA, mec, at, donoB, ofA, ofB, vei, serv, peca }) {
  const idMec = mec.session.user.id;

  // ---------------------------------------------------------------- modo com_orcamento, placa nova
  console.log("\n== Fase 2: OS com orcamento (placa nova + cliente novo) ==");
  const chaveA = uuid();
  const abrir = {
    p_chave_idempotencia: chaveA,
    p_placa: "def-2g34",
    p_cliente_nome: "Frota Teste OS",
    p_cliente_telefone: "(11) 97777-6666",
    p_veiculo_tipo: "carreta",
    p_km: 120000,
    p_sintoma_relatado: "Luz de injeção acesa",
  };
  const a1 = await donoA.sb.rpc("abrir_os", abrir).single();
  checar("dono A: abrir_os cria cliente + veiculo + OS", Boolean(a1.data?.os_id) && a1.data?.ja_existia === false, msg(a1));
  const osA = a1.data?.os_id;
  const a1b = await donoA.sb.rpc("abrir_os", abrir).single();
  checar("idempotencia: mesma chave devolve a mesma OS (ja_existia)", a1b.data?.os_id === osA && a1b.data?.ja_existia === true && a1b.data?.numero === a1.data?.numero, msg(a1b));
  const vA = (await donoA.sb.from("vw_os").select("status, modo, placa, cliente_nome, km").eq("id", osA).single()).data;
  checar("OS A: aguardando_orcamento, modo do cliente, placa normalizada", vA?.status === "aguardando_orcamento" && vA?.modo === "com_orcamento" && vA?.placa === "DEF2G34" && vA?.cliente_nome === "Frota Teste OS");

  const proib = await donoA.sb.rpc("mudar_status_os", { p_os_id: osA, p_de: "aguardando_orcamento", p_para: "em_andamento" });
  checar("transicao proibida: aguardando -> em_andamento recusada", msg(proib) === "transicao_invalida", msg(proib));
  const semItens = await donoA.sb.rpc("mudar_status_os", { p_os_id: osA, p_de: "aguardando_orcamento", p_para: "orcamento_enviado" });
  checar("orcamento sem itens nao pode ser enviado", msg(semItens) === "orcamento_sem_itens", msg(semItens));

  const iServ = await at.sb.rpc("adicionar_item_os", { p_chave_idempotencia: uuid(), p_os_id: osA, p_tipo: "servico", p_servico_id: serv?.id, p_quantidade: 2 });
  const chavePeca = uuid();
  const iPeca = await at.sb.rpc("adicionar_item_os", { p_chave_idempotencia: chavePeca, p_os_id: osA, p_tipo: "peca", p_peca_id: peca?.id });
  const iPeca2 = await at.sb.rpc("adicionar_item_os", { p_chave_idempotencia: chavePeca, p_os_id: osA, p_tipo: "peca", p_peca_id: peca?.id });
  const iAvulso = await at.sb.rpc("adicionar_item_os", { p_chave_idempotencia: uuid(), p_os_id: osA, p_tipo: "peca", p_descricao: "Anel de vedação", p_quantidade: 4 });
  checar("atendente: adiciona servico, peca do catalogo e peca avulsa", !iServ.error && !iPeca.error && !iAvulso.error, `${msg(iServ)}/${msg(iPeca)}/${msg(iAvulso)}`);
  checar("idempotencia: item reenviado com a mesma chave nao duplica", iPeca2.data === iPeca.data, msg(iPeca2));
  const custoAt = await at.sb.rpc("adicionar_item_os", { p_chave_idempotencia: uuid(), p_os_id: osA, p_tipo: "peca", p_descricao: "X", p_custo_unitario_centavos: 1 });
  checar("atendente: nao envia custo", msg(custoAt) === "acesso_negado", msg(custoAt));

  let t = await totalDe(donoA.sb, osA);
  checar("total no banco: 2 x 150,00 + 89,90 = 389,90 e 1 item sem preco", t?.total_centavos === 38990 && t?.itens_sem_preco === 1 && t?.qtd_itens === 3, JSON.stringify(t));
  const aprovSemPreco = await at.sb.rpc("registrar_resposta_orcamento", { p_os_id: osA, p_de: "aguardando_orcamento", p_aprovou: true, p_canal: "whatsapp" });
  checar("aprovacao com item sem preco recusada", msg(aprovSemPreco) === "os_itens_sem_preco", msg(aprovSemPreco));
  const precoAv = await at.sb.from("os_itens_precos").upsert({ item_id: iAvulso.data, preco_unitario_centavos: 500 });
  const qtdServ = await at.sb.from("os_itens").update({ quantidade: 3 }).eq("id", iServ.data).select("id");
  t = await totalDe(at.sb, osA);
  checar("editar preco e quantidade: 3 x 150 + 89,90 + 4 x 5 = 559,90", !precoAv.error && qtdServ.data?.length === 1 && t?.total_centavos === 55990 && t?.itens_sem_preco === 0, JSON.stringify(t));
  const extra = await at.sb.rpc("adicionar_item_os", { p_chave_idempotencia: uuid(), p_os_id: osA, p_tipo: "servico", p_descricao: "Lavagem", p_preco_unitario_centavos: 1000 });
  const rem = await at.sb.from("os_itens").delete().eq("id", extra.data).select("id");
  t = await totalDe(at.sb, osA);
  checar("remover item: total volta para 559,90", rem.data?.length === 1 && t?.total_centavos === 55990, JSON.stringify(t));

  const env = await at.sb.rpc("mudar_status_os", { p_os_id: osA, p_de: "aguardando_orcamento", p_para: "orcamento_enviado" });
  const reenvio = await donoA.sb.rpc("mudar_status_os", { p_os_id: osA, p_de: "aguardando_orcamento", p_para: "orcamento_enviado" });
  checar("orcamento enviado; reenvio do mesmo passo nao quebra", !env.error && !reenvio.error, `${msg(env)}/${msg(reenvio)}`);
  const pulo = await donoA.sb.rpc("mudar_status_os", { p_os_id: osA, p_de: "orcamento_enviado", p_para: "aprovada" });
  checar("aprovar pelo mudar_status_os e recusado", msg(pulo) === "transicao_invalida", msg(pulo));
  const aprov = await at.sb.rpc("registrar_resposta_orcamento", { p_os_id: osA, p_de: "orcamento_enviado", p_aprovou: true, p_canal: "whatsapp", p_quem_respondeu: "Ricardo" });
  const vAp = (await donoA.sb.from("vw_os").select("status, orcamento_aprovado_em, orcamento_aprovacao_canal, orcamento_aprovado_por_nome, orcamento_aprovacao_registrada_por_nome, valor_aprovado_centavos").eq("id", osA).single()).data;
  checar(
    "aprovacao manual registra canal, quem aprovou, quem marcou, quando e valor",
    !aprov.error && vAp?.status === "aprovada" && Boolean(vAp?.orcamento_aprovado_em) && vAp?.orcamento_aprovacao_canal === "whatsapp" && vAp?.orcamento_aprovado_por_nome === "Ricardo" && vAp?.orcamento_aprovacao_registrada_por_nome === "Atendente Teste" && vAp?.valor_aprovado_centavos === 55990,
    msg(aprov),
  );

  const atrib = await at.sb.rpc("atribuir_mecanico", { p_os_id: osA, p_mecanico_id: idMec });
  checar("atendente atribui o mecanico", !atrib.error, msg(atrib));

  // ---------------------------------------------------------------- mecanico executa (sem valores)
  console.log("\n== Fase 2: mecanico executa sem ver valores ==");
  const comeca = await mec.sb.rpc("mudar_status_os", { p_os_id: osA, p_de: "aprovada", p_para: "em_andamento" });
  checar("mecanico: comeca o servico na OS dele (aprovada -> em_andamento)", !comeca.error, msg(comeca));
  const mecPreco = await mec.sb.rpc("adicionar_item_os", { p_chave_idempotencia: uuid(), p_os_id: osA, p_tipo: "servico", p_descricao: "Y", p_preco_unitario_centavos: 1 });
  checar("mecanico: nao lanca item com preco", msg(mecPreco) === "acesso_negado", msg(mecPreco));
  const vMec = (await mec.sb.from("vw_os").select("*").eq("id", osA).maybeSingle()).data;
  const vazou = COLUNAS_PROIBIDAS_MECANICO.filter((c) => vMec && vMec[c] !== null && vMec[c] !== undefined);
  checar("mecanico: vw_os da OS dele sem valor, pagamento, telefone ou autorizacao", Boolean(vMec) && vazou.length === 0 && vMec?.cliente_nome === "Frota Teste OS", vazou.join(", ") || (vMec ? "" : "sem linha"));
  const itMec = (await mec.sb.from("vw_os_itens").select("*").eq("os_id", osA)).data ?? [];
  checar("mecanico: vw_os_itens com itens, mas preco/subtotal/custo NULL", itMec.length === 3 && itMec.every((i) => i.preco_unitario_centavos === null && i.subtotal_centavos === null && i.custo_unitario_centavos === null), `${itMec.length} itens`);
  for (const tab of ["vw_os_totais", "os_comercial", "os_itens_precos", "os_itens_custos", "clientes"]) {
    const r = await mec.sb.from(tab).select("*");
    checar(`mecanico: 0 linhas em ${tab}`, (r.data ?? []).length === 0, r.error?.code ?? `${r.data?.length} linhas`);
  }
  const gravaPreco = await mec.sb.from("os_itens_precos").upsert({ item_id: iAvulso.data, preco_unitario_centavos: 1 });
  checar("mecanico: nao grava preco de item", Boolean(gravaPreco.error), gravaPreco.error?.code);
  const pronta = await mec.sb.rpc("marcar_pronta", { p_os_id: osA, p_causa: "Sensor com defeito", p_solucao: "Troca do sensor" });
  checar("mecanico: marca como pronta com causa e solucao", !pronta.error, msg(pronta));
  const mecEntrega = await mec.sb.rpc("entregar_os", { p_os_id: osA, p_causa: "abc", p_solucao: "abc", p_forma_pagamento: "pix", p_pago: true });
  checar("mecanico: nao entrega a OS", msg(mecEntrega) === "acesso_negado", msg(mecEntrega));
  const mecEntrega2 = await mec.sb.rpc("mudar_status_os", { p_os_id: osA, p_de: "pronta", p_para: "entregue" });
  checar("mecanico: nao muda para entregue pelo mudar_status_os", Boolean(mecEntrega2.error), msg(mecEntrega2));
  const mecCancela = await mec.sb.rpc("mudar_status_os", { p_os_id: osA, p_de: "pronta", p_para: "cancelada", p_motivo: "nao quero" });
  checar("mecanico: nao cancela", msg(mecCancela) === "acesso_negado", msg(mecCancela));

  // atendente: preco sim, custo nao; dono: custo
  const itAt = (await at.sb.from("vw_os_itens").select("peca_id, preco_unitario_centavos, custo_unitario_centavos").eq("os_id", osA)).data ?? [];
  const pecaAt = itAt.find((i) => i.peca_id === peca?.id);
  checar("atendente: ve preco do item, custo NULL", pecaAt?.preco_unitario_centavos === 8990 && pecaAt?.custo_unitario_centavos === null);
  const custosAt = await at.sb.from("os_itens_custos").select("*");
  checar("atendente: 0 linhas em os_itens_custos", (custosAt.data ?? []).length === 0, custosAt.error?.code);
  const pecaDono = ((await donoA.sb.from("vw_os_itens").select("peca_id, custo_unitario_centavos").eq("os_id", osA)).data ?? []).find((i) => i.peca_id === peca?.id);
  checar("dono: custo do catalogo copiado no item (50,00)", pecaDono?.custo_unitario_centavos === 5000);

  // ---------------------------------------------------------------- fechamento
  console.log("\n== Fase 2: fechamento ==");
  const semForma = await donoA.sb.rpc("entregar_os", { p_os_id: osA, p_causa: "Sensor com defeito", p_solucao: "Troca do sensor", p_forma_pagamento: null, p_pago: false });
  checar("entregar sem forma de pagamento recusado", msg(semForma) === "forma_pagamento_obrigatoria", msg(semForma));
  const entrega = await donoA.sb.rpc("entregar_os", { p_os_id: osA, p_causa: "Sensor com defeito", p_solucao: "Troca do sensor", p_forma_pagamento: "boleto", p_pago: false, p_codigo_falha: "100/1" });
  const vEnt = (await donoA.sb.from("vw_os").select("status, entregue_em, forma_pagamento, pago_em, codigo_falha").eq("id", osA).single()).data;
  checar("dono: entrega a receber (entregue, boleto, sem pago_em)", !entrega.error && vEnt?.status === "entregue" && Boolean(vEnt?.entregue_em) && vEnt?.forma_pagamento === "boleto" && vEnt?.pago_em === null && vEnt?.codigo_falha === "100/1", msg(entrega));
  const pg = await at.sb.rpc("registrar_pagamento", { p_os_id: osA, p_forma_pagamento: "pix" });
  const vPg = (await donoA.sb.from("vw_os").select("pago_em, forma_pagamento").eq("id", osA).single()).data;
  checar("atendente: registra o pagamento depois da entrega", !pg.error && Boolean(vPg?.pago_em) && vPg?.forma_pagamento === "pix", msg(pg));
  const volta = await donoA.sb.rpc("mudar_status_os", { p_os_id: osA, p_de: "entregue", p_para: "em_andamento" });
  checar("entregue -> em_andamento recusado", msg(volta) === "os_fechada", msg(volta));
  const cancEnt = await donoA.sb.rpc("mudar_status_os", { p_os_id: osA, p_de: "entregue", p_para: "cancelada", p_motivo: "teste" });
  checar("cancelar OS entregue recusado", msg(cancEnt) === "os_fechada", msg(cancEnt));
  const itemFechada = await donoA.sb.rpc("adicionar_item_os", { p_chave_idempotencia: uuid(), p_os_id: osA, p_tipo: "servico", p_descricao: "Z" });
  checar("OS entregue nao aceita item novo", msg(itemFechada) === "os_fechada", msg(itemFechada));
  const editaFechada = await donoA.sb.from("os_itens").update({ quantidade: 9 }).eq("id", iServ.data).select("id");
  checar("OS entregue nao aceita editar item", Boolean(editaFechada.error) || editaFechada.data?.length === 0, msg(editaFechada));
  const hist = (await donoA.sb.from("vw_os_historico").select("evento, para_status, por_nome, em").eq("os_id", osA).order("em")).data ?? [];
  const evs = hist.map((h) => h.evento);
  checar("historico com todas as mudancas, com quem e quando", ["criada", "status", "aprovacao", "mecanico", "entregue", "pagamento"].every((e) => evs.includes(e)) && hist.every((h) => h.por_nome && h.em), evs.join(","));
  checar("historico: o mecanico aparece como autor do 'pronta'", hist.some((h) => h.para_status === "pronta" && h.por_nome === "Mecânico Teste"));

  // ---------------------------------------------------------------- modo direto
  console.log("\n== Fase 2: OS servico direto (placa conhecida) ==");
  const semAut = await donoA.sb.rpc("abrir_os", { p_chave_idempotencia: uuid(), p_veiculo_id: vei?.id, p_km: 500000, p_sintoma_relatado: "Freio" });
  checar("direto sem quem autorizou: recusado", msg(semAut) === "autorizacao_obrigatoria", msg(semAut));
  const d1 = await donoA.sb.rpc("abrir_os", { p_chave_idempotencia: uuid(), p_veiculo_id: vei?.id, p_km: 500000, p_sintoma_relatado: "Freio", p_autorizado_por_nome: "Carlos, motorista", p_autorizado_por_telefone: "11977776666" }).single();
  const osD = d1.data?.os_id;
  const vD = (await donoA.sb.from("vw_os").select("status, modo, autorizado_em, autorizado_por_nome, autorizacao_registrada_por_nome").eq("id", osD).single()).data;
  checar("direto: nasce em_andamento com autorizacao (quem e quando) gravada pelo banco", vD?.status === "em_andamento" && vD?.modo === "direto" && Boolean(vD?.autorizado_em) && vD?.autorizado_por_nome === "Carlos, motorista" && vD?.autorizacao_registrada_por_nome === "Dono Teste A", msg(d1));
  const dp = await donoA.sb.rpc("dados_da_placa", { p_placa: "ABC1D23" }).maybeSingle();
  checar("dados_da_placa (dono): avisa a OS aberta e traz o telefone", dp.data?.os_aberta_id === osD && dp.data?.cliente_telefone === "1133334444", msg(dp));
  const mecNaoVe = await mec.sb.from("vw_os").select("id").eq("id", osD);
  checar("mecanico: nao ve OS que nao e dele", (mecNaoVe.data ?? []).length === 0);
  const mecNaoMexe = await mec.sb.rpc("marcar_pronta", { p_os_id: osD });
  checar("mecanico: nao marca pronta OS que nao e dele", msg(mecNaoMexe) === "os_nao_encontrada", msg(mecNaoMexe));
  await donoA.sb.rpc("adicionar_item_os", { p_chave_idempotencia: uuid(), p_os_id: osD, p_tipo: "servico", p_servico_id: serv?.id });
  const dPronta = await donoA.sb.rpc("marcar_pronta", { p_os_id: osD });
  const dEnt = await donoA.sb.rpc("entregar_os", { p_os_id: osD, p_causa: "Pastilha gasta", p_solucao: "Troca das pastilhas", p_forma_pagamento: "dinheiro", p_pago: true });
  const vDE = (await donoA.sb.from("vw_os").select("status, pago_em").eq("id", osD).single()).data;
  const kmV = (await donoA.sb.from("veiculos").select("km_atual").eq("id", vei?.id).single()).data;
  checar("direto: pronta -> entregue e pago; KM do veiculo atualizado", !dPronta.error && !dEnt.error && vDE?.status === "entregue" && Boolean(vDE?.pago_em) && kmV?.km_atual === 500000, `${msg(dPronta)}/${msg(dEnt)}`);

  // ---------------------------------------------------------------- numeracao e concorrencia
  console.log("\n== Fase 2: numeracao e aberturas simultaneas ==");
  const base = { p_veiculo_id: vei?.id, p_km: 500100, p_sintoma_relatado: "Revisão", p_modo: "com_orcamento" };
  const [s1, s2] = await Promise.all([
    donoA.sb.rpc("abrir_os", { ...base, p_chave_idempotencia: uuid() }).single(),
    at.sb.rpc("abrir_os", { ...base, p_chave_idempotencia: uuid() }).single(),
  ]);
  const nums = [s1.data?.numero, s2.data?.numero].sort((x, y) => x - y);
  checar("duas OS ao mesmo tempo: numeros diferentes e consecutivos", !s1.error && !s2.error && nums[0] + 1 === nums[1], `${nums.join(",")} ${msg(s1)}/${msg(s2)}`);
  const chaveDupla = uuid();
  const [c1, c2] = await Promise.all([
    donoA.sb.rpc("abrir_os", { ...base, p_chave_idempotencia: chaveDupla }).single(),
    donoA.sb.rpc("abrir_os", { ...base, p_chave_idempotencia: chaveDupla }).single(),
  ]);
  checar("mesma chave enviada 2x ao mesmo tempo: uma OS so", Boolean(c1.data?.os_id) && c1.data?.os_id === c2.data?.os_id && [c1.data?.ja_existia, c2.data?.ja_existia].filter(Boolean).length === 1, `${msg(c1)}/${msg(c2)}`);
  const todosA = ((await donoA.sb.from("ordens_servico").select("numero")).data ?? []).map((o) => o.numero).sort((x, y) => x - y);
  checar("numeracao da oficina A sem repetir e sem buraco (1..N)", todosA.length >= 4 && todosA.every((n, i) => n === i + 1), todosA.join(","));

  // cancelamento e recusa
  const semMotivo = await donoA.sb.rpc("mudar_status_os", { p_os_id: s1.data?.os_id, p_de: "aguardando_orcamento", p_para: "cancelada" });
  checar("cancelar sem motivo: recusado", msg(semMotivo) === "motivo_obrigatorio", msg(semMotivo));
  const canc = await at.sb.rpc("mudar_status_os", { p_os_id: s1.data?.os_id, p_de: "aguardando_orcamento", p_para: "cancelada", p_motivo: "Aberta por engano" });
  const vC = (await donoA.sb.from("vw_os").select("status, motivo_cancelamento, cancelado_por_nome").eq("id", s1.data?.os_id).single()).data;
  checar("cancelar com motivo: cancelada, com motivo e quem", !canc.error && vC?.status === "cancelada" && vC?.motivo_cancelamento === "Aberta por engano" && vC?.cancelado_por_nome === "Atendente Teste", msg(canc));
  const histC = (await donoA.sb.from("vw_os_historico").select("evento").eq("os_id", s1.data?.os_id)).data ?? [];
  checar("cancelamento fica no historico", histC.some((h) => h.evento === "cancelada"));
  const itemCanc = await donoA.sb.rpc("adicionar_item_os", { p_chave_idempotencia: uuid(), p_os_id: s1.data?.os_id, p_tipo: "servico", p_descricao: "Z" });
  checar("OS cancelada nao aceita item", msg(itemCanc) === "os_fechada", msg(itemCanc));
  const recusa = await donoA.sb.rpc("registrar_resposta_orcamento", { p_os_id: s2.data?.os_id, p_de: "aguardando_orcamento", p_aprovou: false, p_canal: "telefone", p_motivo: "Achou caro", p_cancelar: true });
  const vR = (await donoA.sb.from("vw_os").select("status, motivo_cancelamento").eq("id", s2.data?.os_id).single()).data;
  checar("recusa com cancelamento: cancelada com o motivo da recusa", !recusa.error && vR?.status === "cancelada" && /recusado/i.test(vR?.motivo_cancelamento ?? ""), msg(recusa));

  // texto livre com valor nao chega ao mecanico (I5 da REVISAO-FASE2)
  const LIVRE_CANC = "Cliente pagou R$ 123,45 so do diagnostico";
  const LIVRE_REC = "Achou caro: o outro cobrou R$ 2.800,00";
  const [m1, m2] = await Promise.all([
    donoA.sb.rpc("abrir_os", { ...base, p_chave_idempotencia: uuid(), p_mecanico_id: idMec }).single(),
    donoA.sb.rpc("abrir_os", { ...base, p_chave_idempotencia: uuid(), p_mecanico_id: idMec }).single(),
  ]);
  const osMecCanc = m1.data?.os_id;
  const osMecRec = m2.data?.os_id;
  const cancLivre = await donoA.sb.rpc("mudar_status_os", { p_os_id: osMecCanc, p_de: "aguardando_orcamento", p_para: "cancelada", p_motivo: LIVRE_CANC });
  const recLivre = await donoA.sb.rpc("registrar_resposta_orcamento", { p_os_id: osMecRec, p_de: "aguardando_orcamento", p_aprovou: false, p_canal: "telefone", p_motivo: LIVRE_REC, p_cancelar: true });
  checar("OS do mecanico canceladas com motivo livre (Outro motivo e recusa)", !m1.error && !m2.error && !cancLivre.error && !recLivre.error, `${msg(m1)}/${msg(m2)}/${msg(cancLivre)}/${msg(recLivre)}`);

  console.log("\n== Fase 2: isolamento entre oficinas ==");
  for (const tab of ["ordens_servico", "os_comercial", "os_itens", "os_itens_precos", "os_itens_custos", "os_historico", "vw_os", "vw_os_itens", "vw_os_totais", "vw_os_historico", "vw_catalogo_mais_usados"]) {
    const r = await donoB.sb.from(tab).select("*");
    const daA = (r.data ?? []).filter((x) => x.oficina_id === ofA);
    checar(`dono B: nao ve ${tab} da A`, !r.error && daA.length === 0, r.error?.code ?? `${daA.length} da A`);
  }
  const bLe = await donoB.sb.from("vw_os").select("id").eq("id", osA);
  checar("dono B: nao le a OS da A nem com o id", (bLe.data ?? []).length === 0);
  const bStatus = await donoB.sb.rpc("mudar_status_os", { p_os_id: c1.data?.os_id, p_de: "aguardando_orcamento", p_para: "cancelada", p_motivo: "invasao" });
  checar("dono B: nao muda status de OS da A", msg(bStatus) === "os_nao_encontrada", msg(bStatus));
  const bItem = await donoB.sb.rpc("adicionar_item_os", { p_chave_idempotencia: uuid(), p_os_id: c1.data?.os_id, p_tipo: "servico", p_descricao: "invasao" });
  checar("dono B: nao cria item em OS da A (RPC)", msg(bItem) === "os_nao_encontrada", msg(bItem));
  const bItemDireto = await donoB.sb.from("os_itens").insert({ os_id: c1.data?.os_id, tipo: "servico", descricao: "invasao" });
  checar("dono B: nao cria item em OS da A (insert direto)", Boolean(bItemDireto.error), bItemDireto.error?.code);
  const bUpd = await donoB.sb.from("ordens_servico").update({ sintoma_relatado: "invasao" }).eq("id", c1.data?.os_id).select("id");
  checar("dono B: update em OS da A afeta 0 linhas", !bUpd.error && bUpd.data?.length === 0, bUpd.error?.code);
  const bVei = await donoB.sb.rpc("abrir_os", { p_chave_idempotencia: uuid(), p_veiculo_id: vei?.id, p_km: 1, p_sintoma_relatado: "x", p_modo: "com_orcamento" });
  checar("dono B: nao abre OS com veiculo da A", msg(bVei) === "veiculo_nao_encontrado", msg(bVei));
  const bAbre = await donoB.sb.rpc("abrir_os", { p_chave_idempotencia: chaveA, p_placa: "DEF2G34", p_km: 1, p_sintoma_relatado: "x", p_modo: "com_orcamento", p_cliente_nome: "Cliente B2" }).single();
  checar("dono B: mesma chave e mesma placa em outra oficina = OS #1 da B", bAbre.data?.numero === 1 && bAbre.data?.ja_existia === false, msg(bAbre));
  const aIntacta = (await donoA.sb.from("vw_os").select("status, observacoes").eq("id", c1.data?.os_id).single()).data;
  checar("dono A: OS intacta depois das tentativas da B", aIntacta?.status === "aguardando_orcamento" && aIntacta?.observacoes === null && Boolean(ofB));

  // ---------------------------------------------------------------- paginas do app
  if (APP_URL) {
    console.log(`\n== Fase 2: paginas do app (${APP_URL}) ==`);
    const [ckDono, ckMec, ckAt] = await Promise.all([cookiesDaSessao(donoA.session), cookiesDaSessao(mec.session), cookiesDaSessao(at.session)]);
    const detMec = await pagina(`/os/${osA}`, ckMec);
    checar("app mecanico: /os/[id] sem nenhum R$ nem 'centavos' no HTML/payload", detMec.status === 200 && detMec.html.includes("DEF2G34") && !detMec.html.includes("R$") && !/centavos/i.test(detMec.html), `status ${detMec.status}`);
    for (const [rotulo, id, livre] of [["cancelamento", osMecCanc, "123,45"], ["recusa", osMecRec, "2.800"]]) {
      const pg = await pagina(`/os/${id}`, ckMec);
      checar(
        `app mecanico: /os/[id] cancelada por ${rotulo} sem o texto livre do motivo (nem R$)`,
        pg.status === 200 && pg.html.includes("Cancelada") && !pg.html.includes("R$") && !pg.html.includes(livre),
        `status ${pg.status}`,
      );
    }
    const pgDonoCanc = await pagina(`/os/${osMecCanc}`, ckDono);
    checar("app dono: ve o motivo livre do cancelamento", pgDonoCanc.status === 200 && pgDonoCanc.html.includes("123,45"), `status ${pgDonoCanc.status}`);
    const minhas = await pagina("/minhas-os?entregues=1", ckMec);
    checar("app mecanico: /minhas-os mostra a OS e nenhum R$", minhas.status === 200 && minhas.html.includes("DEF2G34") && !minhas.html.includes("R$"), `status ${minhas.status}`);
    const listaMec = await pagina("/os", ckMec);
    checar("app mecanico: /os manda para /minhas-os", listaMec.html.includes("/minhas-os") || Boolean(listaMec.local?.includes("/minhas-os")), `status ${listaMec.status}`);
    const detDono = await pagina(`/os/${osA}`, ckDono);
    checar("app dono: /os/[id] mostra total e custo", detDono.status === 200 && detDono.html.includes("R$") && detDono.html.includes("Só você vê"), `status ${detDono.status}`);
    const detAt = await pagina(`/os/${osA}`, ckAt);
    checar("app atendente: /os/[id] mostra total, sem custo", detAt.status === 200 && detAt.html.includes("R$") && !detAt.html.includes("Só você vê"), `status ${detAt.status}`);
    const listaAt = await pagina("/os?q=DEF2G34", ckAt);
    checar("app atendente: busca por placa acha a OS", listaAt.status === 200 && listaAt.html.includes(`#${a1.data?.numero}`), `status ${listaAt.status}`);
    const nova = await pagina("/os/nova?placa=ABC1D23", ckDono);
    checar("app dono: /os/nova abre", nova.status === 200 && nova.html.includes("Abrir OS"), `status ${nova.status}`);
    const placaPg = await pagina("/placa?placa=abc-1d23", ckMec);
    checar("app mecanico: /placa mostra o cliente e nenhum telefone", placaPg.status === 200 && placaPg.html.includes("Transportes Teste") && !placaPg.html.includes("3333-4444"), `status ${placaPg.status}`);
  }
}

// ------------------------------------------------------------------ 5. Fase 3: itens do mecanico, observacoes e fotos
const BUCKET_FOTOS = "os-fotos";
// JPEG valido de 1x1 px (as fotos do teste sao minusculas; o banco so confere os numeros informados).
const JPEG_1PX = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
  "base64",
);
const arquivo = (bytes = JPEG_1PX, tipo = "image/jpeg") => new Blob([bytes], { type: tipo });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
/** Texto do erro do Storage (status + mensagem), para o detalhe do checar. */
const errSt = (e) => (e ? [e.status ?? e.statusCode, e.message].filter((x) => x != null && x !== "").join(" ") : "sem erro");
/** Valores (R$) que existem no catalogo/itens do teste: nenhum pode aparecer numa resposta do mecanico. */
const VALORES_DO_TESTE = new Set([15000, 8990, 5000, 2500, 1250, 10000, 4000, 300]);
/** Campos com valor preenchido (nome de coluna de dinheiro ou numero igual a um valor do teste). */
function valoresVazados(x, caminho = "") {
  if (x === null || x === undefined) return [];
  if (Array.isArray(x)) return x.flatMap((v, i) => valoresVazados(v, `${caminho}[${i}]`));
  if (typeof x === "object") {
    return Object.entries(x).flatMap(([k, v]) => {
      const aqui = `${caminho}.${k}`;
      if (/preco|custo|subtotal|total|valor|centavos|pagamento|pago/i.test(k) && v !== null && v !== false) return [aqui];
      return valoresVazados(v, aqui);
    });
  }
  return typeof x === "number" && VALORES_DO_TESTE.has(x) ? [caminho || String(x)] : [];
}

async function registrarFoto(sb, osId, extra = {}) {
  const id = extra.p_id ?? uuid();
  const r = await sb.rpc("registrar_foto", {
    p_id: id, p_os_id: osId, p_largura: 1600, p_altura: 1200,
    p_tamanho_bytes: JPEG_1PX.length, p_tamanho_miniatura_bytes: JPEG_1PX.length, ...extra,
  }).single();
  return { id, r, caminho: r.data?.caminho, caminho_miniatura: r.data?.caminho_miniatura };
}
const subirArquivo = (sb, caminho, corpo = arquivo(), contentType = "image/jpeg") =>
  sb.storage.from(BUCKET_FOTOS).upload(caminho, corpo, { contentType, upsert: false });
/** Fluxo completo do app (F3.6): registrar -> miniatura -> foto -> confirmar. */
async function fotoEnviada(sb, osId) {
  const f = await registrarFoto(sb, osId);
  const u1 = f.caminho_miniatura ? await subirArquivo(sb, f.caminho_miniatura) : { error: { message: "sem caminho" } };
  const u2 = f.caminho ? await subirArquivo(sb, f.caminho) : { error: { message: "sem caminho" } };
  const c = await sb.rpc("confirmar_foto", { p_id: f.id });
  return { ...f, ok: !f.r.error && !u1.error && !u2.error && !c.error, erro: `${msg(f.r)}/${errSt(u1.error)}/${errSt(u2.error)}/${msg(c)}` };
}
async function baixa(sb, caminho) {
  const r = await sb.storage.from(BUCKET_FOTOS).download(caminho);
  return !r.error && (r.data?.size ?? 0) > 0;
}
/** Apagar como o app faz (P6): arquivos primeiro, depois o registro. */
async function apagarComoApp(sb, f) {
  const rm = await sb.storage.from(BUCKET_FOTOS).remove([f.caminho, f.caminho_miniatura]);
  const ap = await sb.rpc("apagar_foto", { p_id: f.id });
  return { rm, ap };
}

async function testesFase3({ donoA, mec, at, donoB, ofA, vei, serv, peca, pend }) {
  const idMec = mec.session.user.id;
  const respostasMec = []; // tudo que o mecanico recebeu nesta fase: nenhuma pode ter valor
  const guardaMec = (r) => (respostasMec.push(r?.data ?? null), r);
  const OBS = "Cliente paga R$ 999,00 no pix; ligar 11 95555-4444";

  console.log("\n== Fase 3: segundo mecanico (para os testes de 'outro mecanico') ==");
  const convM2 = await donoA.sb.rpc("criar_convite", { p_papel: "mecanico", p_nome_sugerido: "Mecânico Dois" }).single();
  const mec2 = await criarConta("mecanico2.teste");
  const aceiteM2 = await mec2.sb.rpc("aceitar_convite", { p_token: convM2.data?.token, p_nome: "Mecânico Dois", p_versao_termos: TERMOS });
  checar("mecanico 2: entra na oficina A", aceiteM2.data === ofA, msg(aceiteM2));
  const idMec2 = mec2.session.user.id;

  // ---------------------------------------------------------------- OS do mecanico + observacoes
  console.log("\n== Fase 3: observacoes do balcao ==");
  const abM = await donoA.sb.rpc("abrir_os", {
    p_chave_idempotencia: uuid(), p_veiculo_id: vei?.id, p_km: 500200, p_sintoma_relatado: "Vazamento de ar",
    p_modo: "com_orcamento", p_mecanico_id: idMec, p_observacoes: OBS,
  }).single();
  const osM = abM.data?.os_id;
  checar("dono A: abre OS com orcamento atribuida ao mecanico, com observacao", Boolean(osM), msg(abM));
  const obsDono = (await donoA.sb.from("vw_os").select("observacoes").eq("id", osM).single()).data;
  const obsAt = (await at.sb.from("vw_os").select("observacoes").eq("id", osM).single()).data;
  checar("dono e atendente leem a mesma observacao na vw_os", obsDono?.observacoes === OBS && obsAt?.observacoes === OBS);
  const obsMecVw = guardaMec(await mec.sb.from("vw_os").select("*").eq("id", osM).maybeSingle());
  checar("mecanico: vw_os da OS dele com observacoes NULL", Boolean(obsMecVw.data) && obsMecVw.data.observacoes === null, msg(obsMecVw));
  const obsMecOs = await mec.sb.from("ordens_servico").select("*").eq("id", osM);
  const obsMecCom = await mec.sb.from("os_comercial").select("*");
  const textoMec = JSON.stringify([obsMecVw.data, obsMecOs.data, obsMecCom.data]);
  checar(
    "mecanico: o texto da observacao nao vem em ordens_servico, vw_os nem os_comercial",
    (obsMecOs.data ?? []).length === 1 && !("observacoes" in (obsMecOs.data?.[0] ?? {})) && (obsMecCom.data ?? []).length === 0 && !textoMec.includes("95555") && !textoMec.includes("999,00"),
    msg(obsMecOs),
  );
  const obsMecUpd = await mec.sb.from("os_comercial").update({ observacoes: "mecanico escreveu" }).eq("os_id", osM).select("os_id");
  checar("mecanico: nao altera a observacao", Boolean(obsMecUpd.error) || (obsMecUpd.data ?? []).length === 0, msg(obsMecUpd));
  const obsAtUpd = await at.sb.from("os_comercial").update({ observacoes: `${OBS} (revisado)` }).eq("os_id", osM).select("os_id");
  const obsDono2 = (await donoA.sb.from("vw_os").select("observacoes").eq("id", osM).single()).data;
  checar("atendente edita a observacao pelo os_comercial; o dono ve o texto novo", obsAtUpd.data?.length === 1 && obsDono2?.observacoes === `${OBS} (revisado)`, msg(obsAtUpd));

  // ---------------------------------------------------------------- mecanico lanca
  console.log("\n== Fase 3: mecanico lanca itens (aguardando_orcamento) ==");
  const chaveServ = uuid();
  const lServ = guardaMec(await mec.sb.rpc("adicionar_item_os", { p_chave_idempotencia: chaveServ, p_os_id: osM, p_tipo: "servico", p_servico_id: serv?.id, p_quantidade: 2 }));
  const lServ2 = guardaMec(await mec.sb.rpc("adicionar_item_os", { p_chave_idempotencia: chaveServ, p_os_id: osM, p_tipo: "servico", p_servico_id: serv?.id, p_quantidade: 2 }));
  const chavePeca = uuid();
  const [lPeca, lPeca2] = await Promise.all([
    mec.sb.rpc("adicionar_item_os", { p_chave_idempotencia: chavePeca, p_os_id: osM, p_tipo: "peca", p_peca_id: peca?.id }),
    mec.sb.rpc("adicionar_item_os", { p_chave_idempotencia: chavePeca, p_os_id: osM, p_tipo: "peca", p_peca_id: peca?.id }),
  ]);
  guardaMec(lPeca);
  guardaMec(lPeca2);
  const lAvulso = guardaMec(await mec.sb.rpc("adicionar_item_os", { p_chave_idempotencia: uuid(), p_os_id: osM, p_tipo: "peca", p_descricao: "Mangueira de ar", p_quantidade: 1 }));
  const lPend = guardaMec(await mec.sb.rpc("adicionar_item_os", { p_chave_idempotencia: uuid(), p_os_id: osM, p_tipo: "peca", p_peca_id: pend?.id }));
  checar(
    "mecanico: lanca servico e peca do catalogo, peca avulsa e peca do catalogo sem preco (so recebe o id)",
    [lServ, lPeca, lAvulso, lPend].every((r) => !r.error && typeof r.data === "string" && /^[0-9a-f-]{36}$/.test(r.data)),
    [lServ, lPeca, lAvulso, lPend].map(msg).join("/"),
  );
  checar("idempotencia: mecanico reenvia o item com a mesma chave (em sequencia e ao mesmo tempo) e nao duplica", lServ2.data === lServ.data && lPeca.data === lPeca2.data && !lPeca2.error, `${msg(lServ2)}/${msg(lPeca2)}`);
  const mecCusto = await mec.sb.rpc("adicionar_item_os", { p_chave_idempotencia: uuid(), p_os_id: osM, p_tipo: "peca", p_descricao: "X", p_custo_unitario_centavos: 1 });
  checar("mecanico: nao manda custo (acesso_negado)", msg(mecCusto) === "acesso_negado", msg(mecCusto));
  const mecDireto = await mec.sb.from("os_itens").insert({ os_id: osM, oficina_id: ofA, tipo: "servico", descricao: "direto" });
  checar("mecanico: insert direto em os_itens recusado (so pela RPC)", Boolean(mecDireto.error), mecDireto.error?.code);

  const itensDono = async () => (await donoA.sb.from("vw_os_itens").select("id, descricao, quantidade, preco_unitario_centavos, custo_unitario_centavos, lancado_pelo_mecanico, apos_aprovacao, precificado_pelo_balcao_em, lancado_por_nome").eq("os_id", osM)).data ?? [];
  let iD = await itensDono();
  const porId = (id) => iD.find((i) => i.id === id);
  checar(
    "banco: servico do catalogo com preco copiado (150,00) e peca com preco e custo (89,90 / 50,00)",
    porId(lServ.data)?.preco_unitario_centavos === 15000 && porId(lPeca.data)?.preco_unitario_centavos === 8990 && porId(lPeca.data)?.custo_unitario_centavos === 5000,
    JSON.stringify(iD.map((i) => [i.descricao, i.preco_unitario_centavos, i.custo_unitario_centavos])),
  );
  checar("banco: avulso e catalogo sem preco ficam SEM preco", porId(lAvulso.data)?.preco_unitario_centavos === null && porId(lPend.data)?.preco_unitario_centavos === null);
  checar(
    "dono: itens marcados 'lancado pelo mecanico', com o nome, sem 'apos a aprovacao' e nao precificados",
    iD.length === 4 && iD.every((i) => i.lancado_pelo_mecanico === true && i.lancado_por_nome === "Mecânico Teste" && i.apos_aprovacao === false && i.precificado_pelo_balcao_em === null),
    `${iD.length} itens`,
  );
  const totAt = (await at.sb.from("vw_os").select("itens_mecanico, itens_sem_preco").eq("id", osM).single()).data;
  checar("atendente: vw_os conta 4 itens do mecanico e 2 sem preco", totAt?.itens_mecanico === 4 && totAt?.itens_sem_preco === 2, JSON.stringify(totAt));

  // o que o mecanico le
  const itMec = guardaMec(await mec.sb.from("vw_os_itens").select("*").eq("os_id", osM));
  checar(
    "mecanico: vw_os_itens com preco/subtotal/custo NULL e 'pode alterar' nos dele",
    (itMec.data ?? []).length === 4 && itMec.data.every((i) => i.preco_unitario_centavos === null && i.subtotal_centavos === null && i.custo_unitario_centavos === null && i.mecanico_pode_alterar === true),
    msg(itMec),
  );
  guardaMec(await mec.sb.from("os_itens").select("*").eq("os_id", osM));
  for (const tab of ["os_itens_precos", "os_itens_custos", "vw_os_totais"]) {
    const r = guardaMec(await mec.sb.from(tab).select("*"));
    checar(`mecanico: 0 linhas em ${tab} (com itens lancados por ele)`, (r.data ?? []).length === 0, r.error?.code ?? `${r.data?.length} linhas`);
  }

  // editar / remover os dele
  const alt = guardaMec(await mec.sb.rpc("alterar_item_mecanico", { p_item_id: lAvulso.data, p_quantidade: 3, p_descricao: "Mangueira de ar 1/2" }));
  const alt2 = await mec.sb.rpc("alterar_item_mecanico", { p_item_id: lAvulso.data, p_quantidade: 3, p_descricao: "Mangueira de ar 1/2" });
  iD = await itensDono();
  checar("mecanico: altera quantidade e descricao do item dele; reenvio nao quebra", !alt.error && !alt2.error && Number(porId(lAvulso.data)?.quantidade) === 3 && porId(lAvulso.data)?.descricao === "Mangueira de ar 1/2", `${msg(alt)}/${msg(alt2)}`);
  const altQtd = await mec.sb.rpc("alterar_item_mecanico", { p_item_id: lAvulso.data, p_quantidade: 0 });
  checar("mecanico: quantidade 0 recusada (quantidade_invalida)", msg(altQtd) === "quantidade_invalida", msg(altQtd));
  const altNada = await mec.sb.rpc("alterar_item_mecanico", { p_item_id: uuid(), p_quantidade: 1 });
  checar("mecanico: alterar item inexistente = item_nao_encontrado", msg(altNada) === "item_nao_encontrado", msg(altNada));
  const lRem = await mec.sb.rpc("adicionar_item_os", { p_chave_idempotencia: uuid(), p_os_id: osM, p_tipo: "servico", p_descricao: "Item para remover" });
  const rem1 = guardaMec(await mec.sb.rpc("remover_item_mecanico", { p_item_id: lRem.data }));
  const rem2 = guardaMec(await mec.sb.rpc("remover_item_mecanico", { p_item_id: lRem.data }));
  checar("mecanico: remove o item dele (true) e o reenvio devolve false", rem1.data === true && rem2.data === false, `${msg(rem1)}/${msg(rem2)}`);

  // item do balcao
  console.log("\n== Fase 3: mecanico nao mexe no que nao e dele ==");
  const balcao = await at.sb.rpc("adicionar_item_os", { p_chave_idempotencia: uuid(), p_os_id: osM, p_tipo: "servico", p_descricao: "Diagnóstico", p_preco_unitario_centavos: 10000 });
  checar("atendente: lanca item com preco na OS do mecanico", !balcao.error, msg(balcao));
  const altBalcao = await mec.sb.rpc("alterar_item_mecanico", { p_item_id: balcao.data, p_quantidade: 5 });
  const remBalcao = await mec.sb.rpc("remover_item_mecanico", { p_item_id: balcao.data });
  checar("mecanico: nao altera nem remove item do balcao (item_de_outra_pessoa)", msg(altBalcao) === "item_de_outra_pessoa" && msg(remBalcao) === "item_de_outra_pessoa", `${msg(altBalcao)}/${msg(remBalcao)}`);
  const updDireto = await mec.sb.from("os_itens").update({ quantidade: 9 }).eq("id", balcao.data).select("id");
  const delDireto = await mec.sb.from("os_itens").delete().eq("id", balcao.data).select("id");
  checar("mecanico: update/delete direto em item do balcao afeta 0 linhas", (Boolean(updDireto.error) || updDireto.data?.length === 0) && (Boolean(delDireto.error) || delDireto.data?.length === 0), `${msg(updDireto)}/${msg(delDireto)}`);
  const podeBalcao = (await mec.sb.from("vw_os_itens").select("id, mecanico_pode_alterar").eq("id", balcao.data).single()).data;
  checar("mecanico: item do balcao com mecanico_pode_alterar = false", podeBalcao?.mecanico_pode_alterar === false);

  // outro mecanico / outra OS
  const abO = await donoA.sb.rpc("abrir_os", { p_chave_idempotencia: uuid(), p_veiculo_id: vei?.id, p_km: 500300, p_sintoma_relatado: "Embreagem", p_modo: "com_orcamento", p_mecanico_id: idMec2 }).single();
  const osO = abO.data?.os_id;
  const itM2 = await mec2.sb.rpc("adicionar_item_os", { p_chave_idempotencia: uuid(), p_os_id: osO, p_tipo: "servico", p_descricao: "Regular embreagem" });
  checar("mecanico 2: lanca item na OS dele", !abO.error && !itM2.error, `${msg(abO)}/${msg(itM2)}`);
  const altOutraOS = await mec.sb.rpc("alterar_item_mecanico", { p_item_id: itM2.data, p_quantidade: 2 });
  const remOutraOS = await mec.sb.rpc("remover_item_mecanico", { p_item_id: itM2.data });
  const addOutraOS = await mec.sb.rpc("adicionar_item_os", { p_chave_idempotencia: uuid(), p_os_id: osO, p_tipo: "servico", p_descricao: "invasao" });
  checar(
    "mecanico: nao altera, remove nem lanca em OS de outro mecanico (os_nao_encontrada)",
    msg(altOutraOS) === "os_nao_encontrada" && msg(remOutraOS) === "os_nao_encontrada" && msg(addOutraOS) === "os_nao_encontrada",
    `${msg(altOutraOS)}/${msg(remOutraOS)}/${msg(addOutraOS)}`,
  );
  const reatr = await at.sb.rpc("atribuir_mecanico", { p_os_id: osO, p_mecanico_id: idMec });
  const altM2 = await mec.sb.rpc("alterar_item_mecanico", { p_item_id: itM2.data, p_quantidade: 2 });
  const remM2 = await mec.sb.rpc("remover_item_mecanico", { p_item_id: itM2.data });
  checar("OS passada para o mecanico: ele nao altera nem remove o item do mecanico 2 (item_de_outra_pessoa)", !reatr.error && msg(altM2) === "item_de_outra_pessoa" && msg(remM2) === "item_de_outra_pessoa", `${msg(reatr)}/${msg(altM2)}/${msg(remM2)}`);
  const m2Perdeu = await mec2.sb.rpc("alterar_item_mecanico", { p_item_id: itM2.data, p_quantidade: 2 });
  checar("mecanico 2: depois que a OS mudou de mecanico, nao mexe mais no item dele", msg(m2Perdeu) === "os_nao_encontrada", msg(m2Perdeu));
  const bAlt = await donoB.sb.rpc("alterar_item_mecanico", { p_item_id: lAvulso.data, p_quantidade: 9 });
  const bRem = await donoB.sb.rpc("remover_item_mecanico", { p_item_id: lAvulso.data });
  checar("dono B: nao usa as RPCs do mecanico (acesso_negado)", msg(bAlt) === "acesso_negado" && msg(bRem) === "acesso_negado", `${msg(bAlt)}/${msg(bRem)}`);
  const atAlt = await at.sb.rpc("alterar_item_mecanico", { p_item_id: lAvulso.data, p_quantidade: 9 });
  checar("atendente: alterar_item_mecanico e so do mecanico (acesso_negado)", msg(atAlt) === "acesso_negado", msg(atAlt));

  // precificado pelo balcao
  console.log("\n== Fase 3: balcao precifica; status que bloqueiam o mecanico ==");
  const precoAv = await at.sb.from("os_itens_precos").upsert({ item_id: lAvulso.data, preco_unitario_centavos: 2500 });
  const precoPend = await at.sb.from("os_itens_precos").upsert({ item_id: lPend.data, preco_unitario_centavos: 1250 });
  iD = await itensDono();
  checar("atendente precifica os itens sem preco; ficam 'precificado pelo balcao'", !precoAv.error && !precoPend.error && Boolean(porId(lAvulso.data)?.precificado_pelo_balcao_em) && Boolean(porId(lPend.data)?.precificado_pelo_balcao_em), `${msg(precoAv)}/${msg(precoPend)}`);
  checar("preco copiado do catalogo no lancamento do mecanico NAO trava o item", porId(lServ.data)?.precificado_pelo_balcao_em === null);
  const altPrec = await mec.sb.rpc("alterar_item_mecanico", { p_item_id: lAvulso.data, p_quantidade: 4 });
  const remPrec = await mec.sb.rpc("remover_item_mecanico", { p_item_id: lAvulso.data });
  checar("mecanico: item precificado pelo balcao vira so leitura (item_ja_precificado)", msg(altPrec) === "item_ja_precificado" && msg(remPrec) === "item_ja_precificado", `${msg(altPrec)}/${msg(remPrec)}`);

  const envia = await at.sb.rpc("mudar_status_os", { p_os_id: osM, p_de: "aguardando_orcamento", p_para: "orcamento_enviado" });
  checar("atendente envia o orcamento", !envia.error, msg(envia));
  const addEnv = await mec.sb.rpc("adicionar_item_os", { p_chave_idempotencia: uuid(), p_os_id: osM, p_tipo: "servico", p_descricao: "X" });
  const altEnv = await mec.sb.rpc("alterar_item_mecanico", { p_item_id: lServ.data, p_quantidade: 3 });
  const remEnv = await mec.sb.rpc("remover_item_mecanico", { p_item_id: lServ.data });
  checar(
    "orcamento_enviado: mecanico nao lanca, altera nem remove (status_nao_permite_itens)",
    [addEnv, altEnv, remEnv].every((r) => msg(r) === "status_nao_permite_itens"),
    [addEnv, altEnv, remEnv].map(msg).join("/"),
  );
  const podeEnv = guardaMec(await mec.sb.from("vw_os_itens").select("id, mecanico_pode_alterar").eq("os_id", osM));
  checar("orcamento_enviado: nenhum item com mecanico_pode_alterar", (podeEnv.data ?? []).length === 5 && podeEnv.data.every((i) => i.mecanico_pode_alterar === false));

  // ---------------------------------------------------------------- apos a aprovacao
  console.log("\n== Fase 3: itens depois da aprovacao ==");
  // 2 x 150 + 89,90 + 3 x 25 + 12,50 + 100 = 577,40
  const TOTAL_APROVADO = 30000 + 8990 + 7500 + 1250 + 10000;
  const aprova = await at.sb.rpc("registrar_resposta_orcamento", { p_os_id: osM, p_de: "orcamento_enviado", p_aprovou: true, p_canal: "whatsapp", p_quem_respondeu: "Ricardo" });
  const vAp = (await donoA.sb.from("vw_os").select("status, valor_aprovado_centavos, total_centavos").eq("id", osM).single()).data;
  checar("aprovacao registra o valor aprovado = total (577,40)", !aprova.error && vAp?.status === "aprovada" && vAp?.valor_aprovado_centavos === TOTAL_APROVADO && vAp?.total_centavos === TOTAL_APROVADO, `${msg(aprova)} ${JSON.stringify(vAp)}`);
  const apServ = guardaMec(await mec.sb.rpc("adicionar_item_os", { p_chave_idempotencia: uuid(), p_os_id: osM, p_tipo: "servico", p_servico_id: serv?.id }));
  const apCorreia = guardaMec(await mec.sb.rpc("adicionar_item_os", { p_chave_idempotencia: uuid(), p_os_id: osM, p_tipo: "peca", p_descricao: "Correia" }));
  checar("aprovada: mecanico lanca do catalogo e avulso", !apServ.error && !apCorreia.error, `${msg(apServ)}/${msg(apCorreia)}`);
  iD = await itensDono();
  const vAp2 = (await donoA.sb.from("vw_os").select("status, valor_aprovado_centavos, total_centavos, itens_apos_aprovacao, itens_sem_preco").eq("id", osM).single()).data;
  checar("itens novos marcados 'apos a aprovacao'; os antigos nao", porId(apServ.data)?.apos_aprovacao === true && porId(apCorreia.data)?.apos_aprovacao === true && porId(lServ.data)?.apos_aprovacao === false && vAp2?.itens_apos_aprovacao === 2, JSON.stringify(vAp2));
  checar(
    "status continua 'aprovada', total aprovado mantido (577,40) e total atual sobe (+150,00)",
    vAp2?.status === "aprovada" && vAp2?.valor_aprovado_centavos === TOTAL_APROVADO && vAp2?.total_centavos === TOTAL_APROVADO + 15000 && vAp2?.itens_sem_preco === 1,
    JSON.stringify(vAp2),
  );

  const comeca = await mec.sb.rpc("mudar_status_os", { p_os_id: osM, p_de: "aprovada", p_para: "em_andamento" });
  const emAnd = guardaMec(await mec.sb.rpc("adicionar_item_os", { p_chave_idempotencia: uuid(), p_os_id: osM, p_tipo: "peca", p_descricao: "Abraçadeira", p_quantidade: 2 }));
  const altEmAnd = await mec.sb.rpc("alterar_item_mecanico", { p_item_id: emAnd.data, p_quantidade: 4 });
  iD = await itensDono();
  checar("em_andamento (com orcamento): mecanico lanca e altera; item marcado 'apos a aprovacao'", !comeca.error && !emAnd.error && !altEmAnd.error && porId(emAnd.data)?.apos_aprovacao === true && Number(porId(emAnd.data)?.quantidade) === 4, `${msg(comeca)}/${msg(emAnd)}/${msg(altEmAnd)}`);
  const vEA = (await donoA.sb.from("vw_os").select("status, valor_aprovado_centavos").eq("id", osM).single()).data;
  checar("em_andamento: total aprovado continua o mesmo", vEA?.status === "em_andamento" && vEA?.valor_aprovado_centavos === TOTAL_APROVADO, JSON.stringify(vEA));

  // mecanico sem valores em nenhuma resposta (inclui as views depois de tudo lancado)
  guardaMec(await mec.sb.from("vw_os").select("*").eq("id", osM).maybeSingle());
  guardaMec(await mec.sb.from("vw_os_itens").select("*").eq("os_id", osM));
  guardaMec(await mec.sb.from("vw_os_historico").select("*").eq("os_id", osM));
  const vazados = valoresVazados(respostasMec);
  checar(`mecanico: nenhuma das ${respostasMec.length} respostas da API dele traz preco, custo, subtotal ou total`, vazados.length === 0, vazados.slice(0, 5).join(", "));

  if (APP_URL) {
    const [ckMec, ckDono] = await Promise.all([cookiesDaSessao(mec.session), cookiesDaSessao(donoA.session)]);
    const detMec = await pagina(`/os/${osM}`, ckMec);
    checar(
      "app mecanico: /os/[id] com itens lancados por ele, sem 'R$' nem 'centavos' no HTML/payload",
      detMec.status === 200 && detMec.html.includes("Abraçadeira") && detMec.html.includes("Você lançou") && !detMec.html.includes("R$") && !/centavos/i.test(detMec.html) && !detMec.html.includes("95555"),
      `status ${detMec.status}`,
    );
    const detDono = await pagina(`/os/${osM}`, ckDono);
    checar("app dono: /os/[id] mostra 'Lançado por' e 'Após a aprovação'", detDono.status === 200 && detDono.html.includes("Lançado por") && /Após a aprovação/i.test(detDono.html), `status ${detDono.status}`);
    const semPrecoPg = await pagina("/os?status=sem_preco", ckDono);
    checar("app dono: /os?status=sem_preco lista a OS do mecanico", semPrecoPg.status === 200 && semPrecoPg.html.includes(`/os/${osM}`), `status ${semPrecoPg.status}`);
  }

  // pronta: bloqueia o mecanico; sem preco bloqueia a entrega
  const pronta = await mec.sb.rpc("marcar_pronta", { p_os_id: osM, p_causa: "Mangueira rompida", p_solucao: "Troca da mangueira" });
  const addPr = await mec.sb.rpc("adicionar_item_os", { p_chave_idempotencia: uuid(), p_os_id: osM, p_tipo: "servico", p_descricao: "X" });
  const altPr = await mec.sb.rpc("alterar_item_mecanico", { p_item_id: apCorreia.data, p_quantidade: 2 });
  const remPr = await mec.sb.rpc("remover_item_mecanico", { p_item_id: apCorreia.data });
  checar("pronta: mecanico nao lanca, altera nem remove (status_nao_permite_itens)", !pronta.error && [addPr, altPr, remPr].every((r) => msg(r) === "status_nao_permite_itens"), [pronta, addPr, altPr, remPr].map(msg).join("/"));
  const entregaBloq = await donoA.sb.rpc("entregar_os", { p_os_id: osM, p_causa: "Mangueira rompida", p_solucao: "Troca da mangueira", p_forma_pagamento: "pix", p_pago: true });
  checar("entrega bloqueada com itens do mecanico sem preco (os_itens_sem_preco)", msg(entregaBloq) === "os_itens_sem_preco", msg(entregaBloq));
  await donoA.sb.from("os_itens_precos").upsert({ item_id: apCorreia.data, preco_unitario_centavos: 4000 });
  await donoA.sb.from("os_itens_precos").upsert({ item_id: emAnd.data, preco_unitario_centavos: 300 });
  const entrega = await donoA.sb.rpc("entregar_os", { p_os_id: osM, p_causa: "Mangueira rompida", p_solucao: "Troca da mangueira", p_forma_pagamento: "pix", p_pago: true });
  const vEnt = (await donoA.sb.from("vw_os").select("status, valor_aprovado_centavos, itens_sem_preco").eq("id", osM).single()).data;
  checar("depois de precificar, entrega; total aprovado registrado continua 577,40", !entrega.error && vEnt?.status === "entregue" && vEnt?.valor_aprovado_centavos === TOTAL_APROVADO && vEnt?.itens_sem_preco === 0, `${msg(entrega)} ${JSON.stringify(vEnt)}`);
  const addEnt = await mec.sb.rpc("adicionar_item_os", { p_chave_idempotencia: uuid(), p_os_id: osM, p_tipo: "servico", p_descricao: "X" });
  const altEnt = await mec.sb.rpc("alterar_item_mecanico", { p_item_id: lServ.data, p_quantidade: 1 });
  checar("entregue: mecanico nao lanca nem altera (os_fechada)", msg(addEnt) === "os_fechada" && msg(altEnt) === "os_fechada", `${msg(addEnt)}/${msg(altEnt)}`);
  const cancO = await donoA.sb.rpc("mudar_status_os", { p_os_id: osO, p_de: "aguardando_orcamento", p_para: "cancelada", p_motivo: "teste" });
  const addCanc = await mec.sb.rpc("adicionar_item_os", { p_chave_idempotencia: uuid(), p_os_id: osO, p_tipo: "servico", p_descricao: "X" });
  checar("cancelada: mecanico nao lanca (os_fechada)", !cancO.error && msg(addCanc) === "os_fechada", `${msg(cancO)}/${msg(addCanc)}`);

  // ---------------------------------------------------------------- fotos
  console.log("\n== Fase 3: fotos (registro, caminho, idempotencia) ==");
  const abF = await donoA.sb.rpc("abrir_os", { p_chave_idempotencia: uuid(), p_veiculo_id: vei?.id, p_km: 500400, p_sintoma_relatado: "Fotos", p_autorizado_por_nome: "Carlos", p_mecanico_id: idMec }).single();
  const osF = abF.data?.os_id;
  checar("dono A: abre OS direta (em_andamento) do mecanico para as fotos", Boolean(osF), msg(abF));
  const fm = await registrarFoto(mec.sb, osF, { p_categoria: "antes", p_legenda: "  frente  " });
  checar(
    "registrar_foto: caminho <oficina>/<os>/<id>.jpg e miniatura <id>_mini.jpg, calculados pelo banco",
    fm.caminho === `${ofA}/${osF}/${fm.id}.jpg` && fm.caminho_miniatura === `${ofA}/${osF}/${fm.id}_mini.jpg` && fm.r.data?.enviada === false && fm.r.data?.ja_existia === false,
    msg(fm.r),
  );
  const fmDe = await registrarFoto(mec.sb, osF, { p_id: fm.id });
  checar("idempotencia: registrar de novo com o mesmo id devolve o mesmo registro (ja_existia)", fmDe.r.data?.ja_existia === true && fmDe.caminho === fm.caminho, msg(fmDe.r));
  const fmOutra = await registrarFoto(mec.sb, osM, { p_id: fm.id });
  checar("mesmo id em outra OS: foto_invalida", msg(fmOutra.r) === "foto_invalida", msg(fmOutra.r));
  const conf0 = await mec.sb.rpc("confirmar_foto", { p_id: fm.id });
  checar("confirmar sem os arquivos: foto_nao_enviada", msg(conf0) === "foto_nao_enviada", msg(conf0));
  const upMini = await subirArquivo(mec.sb, fm.caminho_miniatura);
  const conf1 = await mec.sb.rpc("confirmar_foto", { p_id: fm.id });
  checar("confirmar so com a miniatura: foto_nao_enviada", !upMini.error && msg(conf1) === "foto_nao_enviada", `${errSt(upMini.error)}/${msg(conf1)}`);
  const upFoto = await subirArquivo(mec.sb, fm.caminho);
  const upFoto2 = await subirArquivo(mec.sb, fm.caminho);
  checar("reenviar o mesmo arquivo nao sobrescreve (409 / ja existe)", !upFoto.error && Boolean(upFoto2.error) && /409|exist|duplicate/i.test(errSt(upFoto2.error)), `${errSt(upFoto.error)} | ${errSt(upFoto2.error)}`);
  const conf2 = await mec.sb.rpc("confirmar_foto", { p_id: fm.id });
  const conf3 = await mec.sb.rpc("confirmar_foto", { p_id: fm.id });
  const fmDe2 = await registrarFoto(mec.sb, osF, { p_id: fm.id });
  checar("confirmar_foto e idempotente; registrar depois devolve enviada = true", !conf2.error && !conf3.error && fmDe2.r.data?.enviada === true, `${msg(conf2)}/${msg(conf3)}`);
  const legenda = (await donoA.sb.from("vw_os_fotos").select("categoria, legenda, criado_por_nome").eq("id", fm.id).single()).data;
  checar("foto do mecanico na galeria com categoria, legenda normalizada e nome", legenda?.categoria === "antes" && legenda?.legenda === "frente" && legenda?.criado_por_nome === "Mecânico Teste", JSON.stringify(legenda));
  const upDepois = await mec.sb.storage.from(BUCKET_FOTOS).upload(fm.caminho, arquivo(), { contentType: "image/jpeg", upsert: true });
  checar("ninguem sobrescreve foto enviada (upsert recusado)", Boolean(upDepois.error), errSt(upDepois.error));

  const fd = await fotoEnviada(donoA.sb, osF);
  const fm2 = await fotoEnviada(mec.sb, osF);
  const fm3 = await fotoEnviada(mec.sb, osF);
  checar("dono e mecanico enviam fotos pelo fluxo do app (registrar -> subir -> confirmar)", fd.ok && fm2.ok && fm3.ok, `${fd.erro} | ${fm2.erro}`);
  const galMec = guardaMec(await mec.sb.from("vw_os_fotos").select("id, pode_apagar").eq("os_id", osF));
  const pode = Object.fromEntries((galMec.data ?? []).map((f) => [f.id, f.pode_apagar]));
  checar("mecanico: galeria com 4 fotos; pode apagar so as dele", galMec.data?.length === 4 && pode[fm.id] === true && pode[fd.id] === false, msg(galMec));
  const qtdF = guardaMec(await mec.sb.from("vw_os").select("qtd_fotos").eq("id", osF).single());
  checar("mecanico: vw_os.qtd_fotos = 4", qtdF.data?.qtd_fotos === 4, msg(qtdF));

  console.log("\n== Fase 3: Storage — isolamento ==");
  checar("dono A baixa a foto e a miniatura", (await baixa(donoA.sb, fd.caminho)) && (await baixa(donoA.sb, fd.caminho_miniatura)));
  checar("mecanico baixa foto da OS dele (inclusive a do dono)", await baixa(mec.sb, fd.caminho));
  const listaA = await donoA.sb.storage.from(BUCKET_FOTOS).list(`${ofA}/${osF}`);
  checar("dono A lista a pasta da OS (8 arquivos = 4 fotos + 4 miniaturas)", (listaA.data ?? []).length === 8, errSt(listaA.error) || `${listaA.data?.length}`);
  const pendA = await registrarFoto(donoA.sb, osF); // registro pendente do dono, para os testes de upload alheio

  const bBaixa = await baixa(donoB.sb, fd.caminho);
  const bAssina = await donoB.sb.storage.from(BUCKET_FOTOS).createSignedUrl(fd.caminho, 60);
  const bAssinaV = await donoB.sb.storage.from(BUCKET_FOTOS).createSignedUrls([fd.caminho, fd.caminho_miniatura], 60);
  const bLista = await donoB.sb.storage.from(BUCKET_FOTOS).list(`${ofA}/${osF}`);
  const bListaRaiz = await donoB.sb.storage.from(BUCKET_FOTOS).list(ofA);
  checar("dono B: nao baixa foto da A com o caminho na mao", !bBaixa);
  checar("dono B: nao gera URL assinada da foto da A (uma ou varias)", Boolean(bAssina.error) && !bAssina.data?.signedUrl && (Boolean(bAssinaV.error) || (bAssinaV.data ?? []).every((u) => !u.signedUrl)), `${errSt(bAssina.error)} | ${errSt(bAssinaV.error)}`);
  checar("dono B: nao lista a pasta da A (nem a da OS, nem a da oficina)", (bLista.data ?? []).length === 0 && (bListaRaiz.data ?? []).length === 0, `${bLista.data?.length}/${bListaRaiz.data?.length}`);
  const bSobe = await subirArquivo(donoB.sb, `${ofA}/${osF}/${uuid()}.jpg`);
  const bSobePend = await subirArquivo(donoB.sb, pendA.caminho);
  checar("dono B: nao sobe arquivo na pasta da A (caminho inventado nem de registro pendente da A)", Boolean(bSobe.error) && Boolean(bSobePend.error), `${errSt(bSobe.error)} | ${errSt(bSobePend.error)}`);
  const bRm = await donoB.sb.storage.from(BUCKET_FOTOS).remove([fd.caminho, fd.caminho_miniatura]);
  checar("dono B: remove com o caminho da A nao apaga nada (arquivo continua para a A)", (bRm.data ?? []).length === 0 && (await baixa(donoA.sb, fd.caminho)), errSt(bRm.error));
  const bReg = await registrarFoto(donoB.sb, osF);
  const bAp = await donoB.sb.rpc("apagar_foto", { p_id: fd.id });
  const bEd = await donoB.sb.rpc("editar_foto", { p_id: fd.id, p_legenda: "invasao" });
  const bConf = await donoB.sb.rpc("confirmar_foto", { p_id: pendA.id });
  checar(
    "dono B: RPCs de foto nao alcancam a A (registrar os_nao_encontrada, apagar false, editar/confirmar foto_nao_encontrada)",
    msg(bReg.r) === "os_nao_encontrada" && bAp.data === false && msg(bEd) === "foto_nao_encontrada" && msg(bConf) === "foto_nao_encontrada",
    `${msg(bReg.r)}/${bAp.data}/${msg(bEd)}/${msg(bConf)}`,
  );
  const bTab = await donoB.sb.from("vw_os_fotos").select("id").eq("os_id", osF);
  const bTab2 = await donoB.sb.from("os_fotos").select("id").eq("os_id", osF);
  checar("dono B: 0 linhas em vw_os_fotos e os_fotos da OS da A", (bTab.data ?? []).length === 0 && (bTab2.data ?? []).length === 0);
  const aindaD = (await donoA.sb.from("vw_os_fotos").select("legenda").eq("id", fd.id).single()).data;
  checar("dono A: foto intacta depois das tentativas da B", Boolean(aindaD) && aindaD.legenda === null);

  // mecanico 2 (sem ve_todas_os) nao ve a OS do mecanico 1
  const m2Baixa = await baixa(mec2.sb, fd.caminho);
  const m2Assina = await mec2.sb.storage.from(BUCKET_FOTOS).createSignedUrl(fm.caminho, 60);
  const m2Lista = await mec2.sb.storage.from(BUCKET_FOTOS).list(`${ofA}/${osF}`);
  const m2Gal = await mec2.sb.from("vw_os_fotos").select("id").eq("os_id", osF);
  checar("mecanico 2: nao baixa, nao assina, nao lista e nao ve na galeria fotos de OS que nao e dele", !m2Baixa && Boolean(m2Assina.error) && (m2Lista.data ?? []).length === 0 && (m2Gal.data ?? []).length === 0, `${errSt(m2Assina.error)}`);
  const m2Reg = await registrarFoto(mec2.sb, osF);
  const m2Sobe = await subirArquivo(mec2.sb, pendA.caminho);
  checar("mecanico 2: nao registra foto nem sobe arquivo na OS de outro", msg(m2Reg.r) === "os_nao_encontrada" && Boolean(m2Sobe.error), `${msg(m2Reg.r)}/${errSt(m2Sobe.error)}`);
  const mSobePend = await subirArquivo(mec.sb, pendA.caminho);
  const mForjado = await subirArquivo(mec.sb, `${ofA}/${osM}/${uuid()}.jpg`);
  const mForjado2 = await subirArquivo(mec.sb, `${ofA}/${osF}/${uuid()}_mini.jpg`);
  checar("caminho forjado recusado: mecanico nao sobe sem registro dele (registro do dono, OS de outra pasta, id inventado)", Boolean(mSobePend.error) && Boolean(mForjado.error) && Boolean(mForjado2.error), `${errSt(mSobePend.error)} | ${errSt(mForjado.error)}`);

  // mecanico com ve_todas_os: ve, mas nao lanca nem envia foto
  const veTodas = await donoA.sb.rpc("atualizar_membro", { p_perfil_id: idMec2, p_ve_todas_os: true });
  const m2VeOS = await mec2.sb.from("vw_os").select("id").eq("id", osF);
  const m2VeFoto = await baixa(mec2.sb, fd.caminho);
  const m2LancaVT = await mec2.sb.rpc("adicionar_item_os", { p_chave_idempotencia: uuid(), p_os_id: osF, p_tipo: "servico", p_descricao: "X" });
  const m2FotoVT = await registrarFoto(mec2.sb, osF);
  const m2ApVT = await mec2.sb.rpc("apagar_foto", { p_id: fm.id });
  checar(
    "mecanico 2 com ve_todas_os: ve a OS e a foto, mas nao lanca, nao envia e nao apaga",
    !veTodas.error && m2VeOS.data?.length === 1 && m2VeFoto && msg(m2LancaVT) === "acesso_negado" && msg(m2FotoVT.r) === "acesso_negado" && msg(m2ApVT) === "foto_nao_pode_apagar",
    `${msg(veTodas)}/${m2VeOS.data?.length}/${m2VeFoto}/${msg(m2LancaVT)}/${msg(m2FotoVT.r)}/${msg(m2ApVT)}`,
  );
  await donoA.sb.rpc("atualizar_membro", { p_perfil_id: idMec2, p_ve_todas_os: false });

  // anon e URL publica
  const anon = novoCliente();
  const anBaixa = await baixa(anon, fd.caminho);
  const anAssina = await anon.storage.from(BUCKET_FOTOS).createSignedUrl(fd.caminho, 60);
  const anLista = await anon.storage.from(BUCKET_FOTOS).list(`${ofA}/${osF}`);
  const anSobe = await subirArquivo(anon, pendA.caminho);
  const anRpc = await anon.rpc("registrar_foto", { p_id: uuid(), p_os_id: osF, p_largura: 1, p_altura: 1, p_tamanho_bytes: 1, p_tamanho_miniatura_bytes: 1 });
  checar("anon: nao baixa, nao assina, nao lista, nao sobe e nao chama registrar_foto", !anBaixa && Boolean(anAssina.error) && (anLista.data ?? []).length === 0 && Boolean(anSobe.error) && Boolean(anRpc.error), `${errSt(anAssina.error)} | ${errSt(anSobe.error)} | ${anRpc.error?.code}`);
  const publica = await fetch(`${URL_SB}/storage/v1/object/public/${BUCKET_FOTOS}/${fd.caminho}`);
  checar("URL publica (sem assinatura) nao abre a foto (bucket privado)", publica.status !== 200, `status ${publica.status}`);
  const semAss = await fetch(`${URL_SB}/storage/v1/object/${BUCKET_FOTOS}/${fd.caminho}`, { headers: { apikey: CHAVE } });
  checar("URL do objeto so com a chave publishable (sem login) nao abre", semAss.status !== 200, `status ${semAss.status}`);

  // URL assinada: abre e expira
  const ass = await donoA.sb.storage.from(BUCKET_FOTOS).createSignedUrl(fd.caminho, 3);
  const assAgora = ass.data?.signedUrl ? await fetch(ass.data.signedUrl) : null;
  checar("URL assinada abre a foto dentro do prazo", assAgora?.status === 200 && (await assAgora.arrayBuffer()).byteLength === JPEG_1PX.length, `${errSt(ass.error)} status ${assAgora?.status}`);
  await esperar(6000);
  const assDepois = ass.data?.signedUrl ? await fetch(ass.data.signedUrl) : null;
  checar("URL assinada EXPIRA (recusada depois do prazo)", Boolean(assDepois) && assDepois.status !== 200, `status ${assDepois?.status}`);
  const assMec = await mec.sb.storage.from(BUCKET_FOTOS).createSignedUrls([fm.caminho_miniatura, fd.caminho_miniatura], 900);
  checar("mecanico assina as miniaturas da OS dele (900 s)", !assMec.error && (assMec.data ?? []).length === 2 && assMec.data.every((u) => Boolean(u.signedUrl)), errSt(assMec.error));

  // tamanho e tipo
  console.log("\n== Fase 3: Storage — tamanho, tipo e limite de 40 ==");
  const regGrande = await registrarFoto(donoA.sb, osF, { p_tamanho_bytes: 6 * 1024 * 1024 });
  checar("registrar_foto com mais de 5 MB: foto_grande_demais", msg(regGrande.r) === "foto_grande_demais", msg(regGrande.r));
  const regInv = await registrarFoto(donoA.sb, osF, { p_largura: 0 });
  checar("registrar_foto com largura 0: foto_invalida", msg(regInv.r) === "foto_invalida", msg(regInv.r));
  const grande = await subirArquivo(donoA.sb, pendA.caminho, arquivo(Buffer.alloc(5 * 1024 * 1024 + 1024, 0xff)));
  checar("bucket recusa arquivo maior que 5 MB", Boolean(grande.error) && /413|too large|maximum|size/i.test(errSt(grande.error)), errSt(grande.error));
  const png = await subirArquivo(donoA.sb, pendA.caminho_miniatura, arquivo(JPEG_1PX, "image/png"), "image/png");
  checar("bucket recusa arquivo que nao e JPEG", Boolean(png.error) && /mime|not supported|415/i.test(errSt(png.error)), errSt(png.error));
  const apPend = await donoA.sb.rpc("apagar_foto", { p_id: pendA.id });
  checar("dono apaga o registro pendente que sobrou", apPend.data === true, msg(apPend));

  // limite de 40 por OS (registros pendentes recentes contam)
  const abL = await donoA.sb.rpc("abrir_os", { p_chave_idempotencia: uuid(), p_veiculo_id: vei?.id, p_km: 500500, p_sintoma_relatado: "Limite de fotos", p_modo: "com_orcamento" }).single();
  const osL = abL.data?.os_id;
  const doLimite = [];
  doLimite.push(await fotoEnviada(at.sb, osL), await fotoEnviada(at.sb, osL));
  for (let i = 0; i < 38; i++) doLimite.push(await registrarFoto(at.sb, osL));
  const okLimite = doLimite.every((f) => (f.ok ?? !f.r.error));
  const f41 = await registrarFoto(at.sb, osL);
  checar("40 fotos na OS (2 enviadas + 38 em envio); a 41a e recusada (limite_fotos)", okLimite && msg(f41.r) === "limite_fotos", `${doLimite.filter((f) => f.r.error).length} falhas / ${msg(f41.r)}`);
  const f41De = await registrarFoto(at.sb, osL, { p_id: doLimite[5].id });
  checar("no limite, reenviar o registro de uma foto que ja existe continua funcionando", f41De.r.data?.ja_existia === true, msg(f41De.r));
  await at.sb.rpc("apagar_foto", { p_id: doLimite[39].id });
  const f41b = await registrarFoto(at.sb, osL);
  checar("depois de apagar uma, a proxima volta a ser aceita", !f41b.r.error, msg(f41b.r));

  // ---------------------------------------------------------------- apagar / editar por papel e status
  console.log("\n== Fase 3: apagar e editar foto por papel e status ==");
  const edM = await mec.sb.rpc("editar_foto", { p_id: fm.id, p_categoria: "diagnostico", p_legenda: "Vazamento" });
  const edM2 = await mec.sb.rpc("editar_foto", { p_id: fm.id, p_categoria: "diagnostico", p_legenda: "Vazamento" });
  const fmEd = (await donoA.sb.from("vw_os_fotos").select("categoria, legenda").eq("id", fm.id).single()).data;
  checar("OS aberta: mecanico edita tipo e legenda da foto dele; reenvio nao quebra", !edM.error && !edM2.error && fmEd?.categoria === "diagnostico" && fmEd?.legenda === "Vazamento", `${msg(edM)}/${msg(edM2)}`);
  const edMd = await mec.sb.rpc("editar_foto", { p_id: fd.id, p_legenda: "nao pode" });
  const apMd = await mec.sb.rpc("apagar_foto", { p_id: fd.id });
  const rmMd = await mec.sb.storage.from(BUCKET_FOTOS).remove([fd.caminho, fd.caminho_miniatura]);
  checar(
    "OS aberta: mecanico nao edita nem apaga foto do dono (RPC e Storage)",
    msg(edMd) === "foto_nao_pode_editar" && msg(apMd) === "foto_nao_pode_apagar" && (rmMd.data ?? []).length === 0 && (await baixa(donoA.sb, fd.caminho)),
    `${msg(edMd)}/${msg(apMd)}/${rmMd.data?.length}`,
  );
  const edPend = await donoA.sb.rpc("editar_foto", { p_id: f41b.id, p_legenda: "x" });
  checar("foto ainda nao enviada nao se edita (foto_nao_encontrada)", msg(edPend) === "foto_nao_encontrada", msg(edPend));
  const apM2 = await apagarComoApp(mec.sb, fm2);
  const apM2b = await mec.sb.rpc("apagar_foto", { p_id: fm2.id });
  checar("OS aberta: mecanico apaga a foto dele (2 arquivos + registro); reenvio devolve false", (apM2.rm.data ?? []).length === 2 && apM2.ap.data === true && apM2b.data === false && !(await baixa(donoA.sb, fm2.caminho)), `${errSt(apM2.rm.error)}/${msg(apM2.ap)}/${apM2b.data}`);
  const apAt = await apagarComoApp(at.sb, fm3);
  checar("OS aberta: atendente apaga foto do mecanico", (apAt.rm.data ?? []).length === 2 && apAt.ap.data === true, `${errSt(apAt.rm.error)}/${msg(apAt.ap)}`);

  const prF = await donoA.sb.rpc("marcar_pronta", { p_os_id: osF });
  const enF = await donoA.sb.rpc("entregar_os", { p_os_id: osF, p_causa: "Fotos", p_solucao: "Fotos", p_forma_pagamento: "pix", p_pago: true });
  checar("OS das fotos entregue", !prF.error && !enF.error, `${msg(prF)}/${msg(enF)}`);
  const mRegEnt = await registrarFoto(mec.sb, osF);
  checar("entregue: mecanico nao envia foto (os_fechada)", msg(mRegEnt.r) === "os_fechada", msg(mRegEnt.r));
  const atFotoEnt = await fotoEnviada(at.sb, osF);
  checar("entregue: atendente ainda envia foto", atFotoEnt.ok, atFotoEnt.erro);
  const mEdEnt = await mec.sb.rpc("editar_foto", { p_id: fm.id, p_legenda: "x" });
  const mApEnt = await apagarComoApp(mec.sb, fm);
  checar("entregue: mecanico nao edita nem apaga a propria foto", msg(mEdEnt) === "foto_nao_pode_editar" && msg(mApEnt.ap) === "foto_nao_pode_apagar" && (mApEnt.rm.data ?? []).length === 0 && (await baixa(donoA.sb, fm.caminho)), `${msg(mEdEnt)}/${msg(mApEnt.ap)}/${mApEnt.rm.data?.length}`);
  const atEdEnt = await at.sb.rpc("editar_foto", { p_id: fd.id, p_legenda: "x" });
  const atApEnt = await apagarComoApp(at.sb, atFotoEnt);
  checar("entregue: atendente nao edita nem apaga (nem a foto que ele acabou de enviar)", msg(atEdEnt) === "foto_nao_pode_editar" && msg(atApEnt.ap) === "foto_nao_pode_apagar" && (atApEnt.rm.data ?? []).length === 0, `${msg(atEdEnt)}/${msg(atApEnt.ap)}/${atApEnt.rm.data?.length}`);
  const dEdEnt = await donoA.sb.rpc("editar_foto", { p_id: fd.id, p_categoria: "entrega", p_legenda: "" });
  const dApEnt = await apagarComoApp(donoA.sb, fd);
  checar("entregue: so o dono edita e apaga (o Storage confirma os 2 arquivos removidos)", !dEdEnt.error && (dApEnt.rm.data ?? []).length === 2 && dApEnt.ap.data === true, `${msg(dEdEnt)}/${errSt(dApEnt.rm.error)}/${msg(dApEnt.ap)}`);
  // Depois de apagar: quem nunca baixou a foto nao consegue; quem ja baixou pode receber a copia
  // em cache do Storage por alguns segundos (ver relatorio do F3-B7), so ele.
  const [atPos, bPos, anPos] = await Promise.all([baixa(at.sb, fd.caminho), baixa(donoB.sb, fd.caminho), baixa(novoCliente(), fd.caminho)]);
  checar("foto apagada: quem nunca baixou (atendente), dono B e anon nao baixam", !atPos && !bPos && !anPos, `${atPos}/${bPos}/${anPos}`);
  const [donoPos, mecPos, m2Pos] = await Promise.all([baixa(donoA.sb, fd.caminho), baixa(mec.sb, fd.caminho), baixa(mec2.sb, fd.caminho)]);
  const cache = (x) => (x ? "AINDA baixa (cache)" : "nao baixa");
  console.log(`info    foto apagada, logo depois, quem ja tinha baixado: dono ${cache(donoPos)}; mecanico ${cache(mecPos)}; mecanico 2 (baixou com ve_todas_os, ja desligado) ${cache(m2Pos)}`);

  console.log("\n== Fase 3: mecanico sem valores (fotos e listas) ==");
  guardaMec(await mec.sb.from("vw_os_fotos").select("*").eq("os_id", osF));
  guardaMec(await mec.sb.from("vw_os").select("*"));
  const vazados2 = valoresVazados(respostasMec);
  checar(`mecanico: ${respostasMec.length} respostas da Fase 3 sem nenhum valor`, vazados2.length === 0, vazados2.slice(0, 5).join(", "));
  if (APP_URL) {
    const ckMec = await cookiesDaSessao(mec.session);
    const minhas = await pagina("/minhas-os?entregues=1", ckMec);
    checar("app mecanico: /minhas-os sem R$ nem 'centavos' com as OS da Fase 3", minhas.status === 200 && !minhas.html.includes("R$") && !/centavos/i.test(minhas.html), `status ${minhas.status}`);
    const detF = await pagina(`/os/${osF}`, ckMec);
    checar("app mecanico: /os/[id] com fotos sem R$ nem 'centavos'", detF.status === 200 && !detF.html.includes("R$") && !/centavos/i.test(detF.html), `status ${detF.status}`);
  }
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
