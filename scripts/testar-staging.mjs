#!/usr/bin/env node
/**
 * Teste de ponta a ponta das Fases 1, 2, 3, 4 e 6 contra o Supabase STAGING (so dados ficticios).
 * Fase 2 (OS): os dois modos ate "entregue", autorizacao, mecanico sem valores pela API
 * (tabelas e views), isolamento entre oficinas, idempotencia e numeracao com aberturas simultaneas.
 * Fase 3: itens lancados pelo mecanico (sem valores, status, "apos a aprovacao"), observacoes
 * fora do alcance do mecanico, fotos no Storage (isolamento, URL assinada que expira, 5 MB,
 * so JPEG, caminho forjado, limite de 40, apagar/editar por papel e status) e idempotencia.
 * Fase 4: vistoria de entrada pela API nos 3 papeis (checklist copiado, avarias, fotos e
 * assinatura PNG no bucket "vistorias", conclusao e suas recusas), imutabilidade depois de
 * concluida (tabelas, RPCs e Storage), complemento, anular, isolamento, mecanico (17.6),
 * obrigatoriedade, idempotencia com reenvio simultaneo e, com APP_URL, o PDF e as paginas.
 * Objetos da vistoria: NULL = nao informado, [] = "Nenhum objeto" (exige a migracao
 * 20261102000001_fase4_objetos_nao_informado no staging).
 * Fase 6: orcamento por link com cliente anon de verdade (so a chave publishable): lista fechada,
 * tokens, versao congelada, trava, prova imutavel, convivencia, concorrencia real, limite,
 * isolamento, mecanico e, com APP_URL, cabecalhos e HTML da pagina publica e telas do balcao.
 *
 * Uso:
 *   node scripts/testar-staging.mjs                         # so testes sem login (anon)
 *   TESTE_EMAIL_DOMINIO=www.example.org node scripts/testar-staging.mjs
 *   APP_URL=http://localhost:3000 ...                       # tambem testa as paginas do app
 *   TESTE_SO_FASE6=1 ...                                    # so a Fase 6, com 4 contas e 2 oficinas
 *   TESTE_PLAYWRIGHT=/caminho/playwright/index.mjs ...      # com APP_URL: cliques no navegador
 *
 * Requisitos para o teste completo:
 *   - "Confirm email" DESLIGADO no staging (Auth > Sign In / Providers > Email).
 *   - Dominio de e-mail reservado que o Supabase aceite (ele recusa .test e example.com; subdominio
 *     de dominio reservado com endereco, como www.example.org, nao tem caixa de ninguem). Nao usar o
 *     e-mail de uma pessoa: com a confirmacao desligada nada e enviado, mas as contas ficam no staging.
 *
 * Usa so a chave publishable do .env.local (nunca a secret). As senhas sao
 * aleatorias, geradas a cada execucao e nunca impressas nem salvas.
 * As contas criadas ficam no staging (sem chave secret nao da para apagar).
 */
import { readdirSync, readFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { crc32, deflateSync } from "node:zlib";
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
if (BASE?.includes("hiath63")) throw new Error("Nao use o e-mail do Guilherme nas contas de teste: use TESTE_EMAIL_DOMINIO=www.example.org.");
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

/** `ValorQuebravel` separa o valor no HTML (`<wbr>` e marcadores do React): procurar pelo texto como a tela mostra, tambem nas buscas do que NAO pode aparecer. */
const semMarcasDeValor = (html) => html.replace(/<wbr\s*\/?>|<!-- -->/g, "");

async function pagina(caminho, cookie) {
  const r = await fetch(`${APP_URL}${caminho}`, { headers: cookie ? { cookie } : {}, redirect: "manual" });
  return { status: r.status, local: r.headers.get("location"), html: r.status === 200 ? semMarcasDeValor(await r.text()) : "" };
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
  const { mec2 } = await testesFase3({ donoA, mec, at, donoB, ofA: ofA.data, vei: vei.data, serv: serv.data, peca: peca.data, pend: pend.data });
  await testesFase4({ donoA, mec, mec2, at, donoB, ofA: ofA.data, ofB: ofB.data, vei: vei.data });
  await testesFase6({ donoA, mec, at, donoB, ofA: ofA.data, ofB: ofB.data });

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
  return { mec2 };
}

// ------------------------------------------------------------------ 6. Fase 4: vistoria do veiculo
const BUCKET_VIST = "vistorias";
/** PNG valido (RGB, fundo branco) gerado aqui: a assinatura do teste (o PDF embute de verdade). */
function pngBranco(largura, altura) {
  const bloco = (tipo, dados) => {
    const tam = Buffer.alloc(4);
    tam.writeUInt32BE(dados.length);
    const td = Buffer.concat([Buffer.from(tipo, "latin1"), dados]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([tam, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largura, 0);
  ihdr.writeUInt32BE(altura, 4);
  ihdr[8] = 8; // 8 bits
  ihdr[9] = 2; // RGB
  const linhas = Buffer.alloc((largura * 3 + 1) * altura, 0xff);
  for (let y = 0; y < altura; y++) linhas[y * (largura * 3 + 1)] = 0; // filtro 0 em cada linha
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloco("IHDR", ihdr), bloco("IDAT", deflateSync(linhas)), bloco("IEND", Buffer.alloc(0))]);
}
// 320 x 96 (nenhum desses numeros esta em VALORES_DO_TESTE)
const PNG_ASSINATURA = pngBranco(320, 96);
const pngBlob = () => new Blob([PNG_ASSINATURA], { type: "image/png" });
const NOME_ASSINA = "Carlos Motorista";
const subirV = (sb, caminho, corpo = arquivo(), contentType = "image/jpeg", upsert = false) =>
  sb.storage.from(BUCKET_VIST).upload(caminho, corpo, { contentType, upsert });
/** Tamanho do arquivo baixado do bucket vistorias (0 = nao baixou). */
async function tamanhoV(sb, caminho) {
  if (!caminho) return 0;
  const r = await sb.storage.from(BUCKET_VIST).download(caminho);
  return r.error ? 0 : (r.data?.size ?? 0);
}
const recusou = (r) => Boolean(r?.error) || (r?.data ?? []).length === 0;

async function registrarFotoV(sb, vistoriaId, tipo, extra = {}) {
  const id = extra.p_id ?? uuid();
  const r = await sb.rpc("registrar_foto_vistoria", {
    p_id: id, p_vistoria_id: vistoriaId, p_tipo: tipo, p_largura: 1600, p_altura: 1200,
    p_tamanho_bytes: JPEG_1PX.length, p_tamanho_miniatura_bytes: JPEG_1PX.length, ...extra,
  }).single();
  return { id, r, caminho: r.data?.caminho, caminho_miniatura: r.data?.caminho_miniatura };
}
/** Fluxo do app (ARQUITETURA 12.3): registrar -> miniatura -> foto -> confirmar. */
async function fotoV(sb, vistoriaId, tipo, extra = {}) {
  const f = await registrarFotoV(sb, vistoriaId, tipo, extra);
  const u1 = f.caminho_miniatura ? await subirV(sb, f.caminho_miniatura) : { error: { message: "sem caminho" } };
  const u2 = f.caminho ? await subirV(sb, f.caminho) : { error: { message: "sem caminho" } };
  const c = await sb.rpc("confirmar_foto_vistoria", { p_id: f.id });
  return { ...f, ok: !f.r.error && !u1.error && !u2.error && !c.error, erro: `${msg(f.r)}/${errSt(u1.error)}/${errSt(u2.error)}/${msg(c)}` };
}
/** Assinatura: registrar -> subir o PNG (o "confirmar" e o proprio concluir_vistoria). */
async function assinarV(sb, vistoriaId, { id = uuid(), nome = NOME_ASSINA, subir = true } = {}) {
  const r = await sb.rpc("registrar_assinatura_vistoria", {
    p_vistoria_id: vistoriaId, p_assinatura_id: id, p_nome: nome, p_largura: 320, p_altura: 96, p_tamanho_bytes: PNG_ASSINATURA.length,
  });
  const u = subir && r.data ? await subirV(sb, r.data, pngBlob(), "image/png") : { error: subir ? { message: "sem caminho" } : null };
  return { id, caminho: r.data, r, ok: !r.error && !u.error, erro: `${msg(r)}/${errSt(u.error)}` };
}

async function testesFase4({ donoA, mec, mec2, at, donoB, ofA, ofB, vei }) {
  const idMec = mec.session.user.id;
  const idMec2 = mec2.session.user.id;
  const respostasMec = []; // tudo que o mecanico recebeu na Fase 4: nenhuma resposta pode ter valor
  const guardaMec = (r) => (respostasMec.push(r?.data ?? null), r);
  const abrirOS = async (extra = {}) => {
    const r = await donoA.sb.rpc("abrir_os", { p_chave_idempotencia: uuid(), p_veiculo_id: vei?.id, p_km: 600000, p_sintoma_relatado: "Vistoria", p_autorizado_por_nome: "Carlos, motorista", ...extra }).single();
    return r.data?.os_id;
  };
  const vw = async (sb, id) => (await sb.from("vw_vistorias").select("*").eq("id", id).maybeSingle()).data;
  const itensDe = async (sb, vid) => (await sb.from("vistoria_itens").select("id, ordem, descricao, situacao, observacao").eq("vistoria_id", vid).order("ordem")).data ?? [];
  /** Vistoria curta (sem avarias, sem assinatura com motivo): para a obrigatoriedade. */
  async function vistoriaRapida(sb, osId, motivo = "recusou") {
    const ini = await sb.rpc("iniciar_vistoria", { p_os_id: osId }).single();
    const vid = ini.data?.vistoria_id;
    const ok1 = await sb.rpc("marcar_itens_restantes_ok", { p_vistoria_id: vid });
    const ok2 = await sb.rpc("salvar_vistoria", { p_vistoria_id: vid, p_sem_avarias: true });
    const c = await sb.rpc("concluir_vistoria", { p_vistoria_id: vid, p_sem_assinatura_motivo: motivo });
    return { vid, ok: !ini.error && !ok1.error && !ok2.error && !c.error, erro: [ini, ok1, ok2, c].map(msg).join("/") };
  }
  /** Vistoria inteira como a tela faz: entrada, checklist, avaria com foto, painel, objetos, assinatura, concluir. */
  async function vistoriaCompleta(rotulo, sb, osId, km, nomeQuemFez) {
    const ini = await sb.rpc("iniciar_vistoria", { p_os_id: osId }).single();
    const vid = ini.data?.vistoria_id;
    if (rotulo.startsWith("mecanico")) guardaMec(ini);
    checar(`${rotulo}: inicia a vistoria de entrada (rascunho novo)`, Boolean(vid) && ini.data?.status === "rascunho" && ini.data?.ja_existia === false, msg(ini));
    const sv = await sb.rpc("salvar_vistoria", { p_vistoria_id: vid, p_km: km, p_horimetro: 12500, p_combustivel: "meio", p_objetos: ["Rádio", "  Extintor ", "Rádio"], p_observacoes: "Para-brisa trincado no canto" });
    const itens = await itensDe(sb, vid);
    const m1 = await sb.rpc("marcar_item_vistoria", { p_item_id: itens[0]?.id, p_situacao: "com_problema", p_observacao: "Desgaste" });
    const m2 = await sb.rpc("marcar_item_vistoria", { p_item_id: itens[1]?.id, p_situacao: "nao_se_aplica" });
    const resto = await sb.rpc("marcar_itens_restantes_ok", { p_vistoria_id: vid });
    checar(
      `${rotulo}: salva KM/horimetro/combustivel/objetos/observacoes e marca o checklist (1 problema, 1 N/A, "resto ok")`,
      !sv.error && itens.length >= 16 && !m1.error && !m2.error && resto.data === itens.length - 2,
      `${msg(sv)}/${itens.length} itens/${msg(m1)}/${msg(m2)}/${resto.data}`,
    );
    const avId = uuid();
    const av = await sb.rpc("salvar_avaria", { p_id: avId, p_vistoria_id: vid, p_lado: "lateral_direita", p_descricao: "Amassado no para-lama" });
    const fAv = await fotoV(sb, vid, "avaria", { p_avaria_id: avId });
    const fPa = await fotoV(sb, vid, "painel");
    checar(
      `${rotulo}: avaria com foto e foto do painel (registrar -> subir no bucket vistorias -> confirmar); caminho calculado pelo banco`,
      !av.error && fAv.ok && fPa.ok && fAv.caminho === `${ofA}/${osId}/${vid}/${fAv.id}.jpg` && fAv.caminho_miniatura === `${ofA}/${osId}/${vid}/${fAv.id}_mini.jpg`,
      `${msg(av)} | ${fAv.erro} | ${fPa.erro}`,
    );
    const as = await assinarV(sb, vid);
    checar(`${rotulo}: assinatura PNG registrada e enviada (.../assinatura_<id>.png)`, as.ok && as.caminho === `${ofA}/${osId}/${vid}/assinatura_${as.id}.png`, as.erro);
    const conc = await sb.rpc("concluir_vistoria", { p_vistoria_id: vid });
    const v = await vw(sb, vid);
    if (rotulo.startsWith("mecanico")) guardaMec({ data: v });
    checar(
      `${rotulo}: conclui (hash SHA-256) e a vistoria guarda tudo (KM, combustivel, objetos, checklist, avaria, 2 fotos, assinatura, quem/quando)`,
      /^[0-9a-f]{64}$/.test(conc.data ?? "") && v?.status === "concluida" && v.hash_conteudo === conc.data && v.km === km && v.horimetro === 12500 && v.combustivel === "meio" &&
        [...(v.objetos ?? [])].sort().join("|") === "Extintor|Rádio" && v.observacoes === "Para-brisa trincado no canto" && v.itens_marcados === v.itens_total && v.itens_com_problema === 1 &&
        v.qtd_avarias === 1 && v.qtd_fotos === 2 && v.fotos_pendentes === 0 && v.assinado_por_nome === NOME_ASSINA && v.assinatura_caminho === as.caminho && Boolean(v.concluida_em) && v.concluida_por_nome === nomeQuemFez,
      `${msg(conc)} ${JSON.stringify(v && { status: v.status, km: v.km, objetos: v.objetos, marcados: v.itens_marcados, total: v.itens_total, fotos: v.qtd_fotos, por: v.concluida_por_nome })}`,
    );
    return { vid, osId, itens, avId, fAv, fPa, as, hash: conc.data };
  }

  // ---------------------------------------------------------------- checklist padrao e modelo copiado
  console.log("\n== Fase 4: checklist padrao da oficina ==");
  for (const [rot, sb, of] of [["oficina A", donoA.sb, ofA], ["oficina B (nova)", donoB.sb, ofB]]) {
    const mod = await sb.from("checklist_modelos").select("id, padrao, oficina_id");
    const its = await sb.from("checklist_modelo_itens").select("id, ativo");
    checar(`${rot}: nasce com o checklist padrao de caminhao (1 modelo, 16 itens ativos)`, mod.data?.length === 1 && mod.data[0].padrao === true && mod.data[0].oficina_id === of && (its.data ?? []).filter((i) => i.ativo).length === 16, `${msg(mod)} ${mod.data?.length} modelos, ${its.data?.length} itens`);
  }
  const modeloA = (await donoA.sb.from("checklist_modelos").select("id").single()).data?.id;
  const itensModelo = (await donoA.sb.from("checklist_modelo_itens").select("id, descricao, ordem, ativo").order("ordem")).data ?? [];
  const atIns = await at.sb.from("checklist_modelo_itens").insert({ modelo_id: modeloA, descricao: "Invasão" }).select("id");
  const mecUpd = await mec.sb.from("checklist_modelo_itens").update({ descricao: "Invasão" }).eq("id", itensModelo[0]?.id).select("id");
  const bUpdMod = await donoB.sb.from("checklist_modelo_itens").update({ descricao: "Invasão" }).eq("id", itensModelo[0]?.id).select("id");
  const delMod = await donoA.sb.from("checklist_modelo_itens").delete().eq("id", itensModelo[0]?.id).select("id");
  checar("checklist: atendente nao adiciona, mecanico e dono B nao editam, ninguem apaga (desativar)", Boolean(atIns.error) && recusou(mecUpd) && recusou(bUpdMod) && recusou(delMod), [atIns, mecUpd, bUpdMod, delMod].map((r) => r.error?.code ?? r.data?.length).join("/"));
  const extra = await donoA.sb.from("checklist_modelo_itens").insert({ modelo_id: modeloA, descricao: "  Item   extra do teste " }).select("id, descricao, ordem").single();
  const ultimaOrdem = Math.max(...itensModelo.map((i) => i.ordem));
  checar("dono: adiciona item no fim do modelo (descricao normalizada)", extra.data?.descricao === "Item extra do teste" && extra.data?.ordem === ultimaOrdem + 1, msg(extra));

  // ---------------------------------------------------------------- vistoria inteira nos 3 papeis
  console.log("\n== Fase 4: vistoria inteira (dono, atendente, mecanico na OS dele) ==");
  const os1 = await abrirOS({ p_mecanico_id: idMec }); // do mecanico: ele ve a vistoria que o dono fez
  const os2 = await abrirOS();
  const os3 = await abrirOS({ p_mecanico_id: idMec });
  checar("dono A: abre as OS diretas da Fase 4", Boolean(os1 && os2 && os3));
  const V1 = await vistoriaCompleta("dono", donoA.sb, os1, 600500, "Dono Teste A");
  const osKm = (await donoA.sb.from("vw_os").select("km, vistoria_entrada_id, vistoria_entrada_status").eq("id", os1).single()).data;
  const veiKm = (await donoA.sb.from("veiculos").select("km_atual").eq("id", vei?.id).single()).data;
  checar("KM unico: o KM da vistoria fica na OS e no veiculo; vw_os mostra a vistoria feita", osKm?.km === 600500 && veiKm?.km_atual >= 600500 && osKm?.vistoria_entrada_id === V1.vid && osKm?.vistoria_entrada_status === "concluida", JSON.stringify({ osKm, veiKm }));
  checar("modelo copiado: a vistoria do dono tem os 16 itens + o item extra", V1.itens.length === 17 && V1.itens.some((i) => i.descricao === "Item extra do teste") && V1.itens[0]?.descricao === itensModelo[0]?.descricao, `${V1.itens.length} itens`);
  const hist1 = (await donoA.sb.from("vw_os_historico").select("evento, observacao, por_nome").eq("os_id", os1)).data ?? [];
  checar("historico: 'Vistoria de entrada concluida' por quem fez", hist1.some((h) => h.evento === "vistoria" && /concluída/.test(h.observacao ?? "") && h.por_nome === "Dono Teste A"), JSON.stringify(hist1.filter((h) => h.evento === "vistoria")));

  // editar o modelo depois nao muda a vistoria
  const ren = await donoA.sb.from("checklist_modelo_itens").update({ descricao: "Item extra renomeado" }).eq("id", extra.data?.id).select("id");
  const des = await donoA.sb.from("checklist_modelo_itens").update({ ativo: false }).eq("id", itensModelo[0]?.id).select("id");
  const itensV1 = await itensDe(donoA.sb, V1.vid);
  checar("dono renomeia e desativa itens do modelo; a vistoria concluida continua com a descricao que tinha", ren.data?.length === 1 && des.data?.length === 1 && itensV1.length === 17 && itensV1.some((i) => i.descricao === "Item extra do teste") && !itensV1.some((i) => i.descricao === "Item extra renomeado") && itensV1[0]?.descricao === itensModelo[0]?.descricao, `${msg(ren)}/${msg(des)}`);
  const V2 = await vistoriaCompleta("atendente", at.sb, os2, 600600, "Atendente Teste");
  checar("vistoria nova copia o modelo NOVO (sem o desativado, com o nome novo)", V2.itens.length === 16 && V2.itens.some((i) => i.descricao === "Item extra renomeado") && !V2.itens.some((i) => i.descricao === itensModelo[0]?.descricao), `${V2.itens.length} itens`);
  await donoA.sb.from("checklist_modelo_itens").update({ ativo: true }).eq("id", itensModelo[0]?.id);
  await donoA.sb.from("checklist_modelo_itens").update({ ativo: false }).eq("id", extra.data?.id);
  const V3 = await vistoriaCompleta("mecanico", mec.sb, os3, 600700, "Mecânico Teste");

  // ---------------------------------------------------------------- uma entrada por OS
  console.log("\n== Fase 4: uma vistoria de entrada por OS ==");
  const de1 = await at.sb.rpc("iniciar_vistoria", { p_os_id: os1 }).single();
  const de2 = guardaMec(await mec.sb.rpc("iniciar_vistoria", { p_os_id: os1, p_tipo: "entrada" }).single());
  checar("iniciar de novo (atendente, mecanico) na OS com vistoria concluida devolve a MESMA (ja_existia)", de1.data?.vistoria_id === V1.vid && de1.data?.ja_existia === true && de1.data?.status === "concluida" && de2.data?.vistoria_id === V1.vid, `${msg(de1)}/${msg(de2)}`);
  const insDir = await donoA.sb.from("vistorias").insert({ oficina_id: ofA, os_id: os1, veiculo_id: vei?.id, tipo: "entrada" }).select("id");
  checar("insert direto em vistorias recusado (so pela RPC)", Boolean(insDir.error), insDir.error?.code);
  const qtdOs1 = (await donoA.sb.from("vistorias").select("id").eq("os_id", os1)).data ?? [];
  checar("a OS continua com uma vistoria so", qtdOs1.length === 1, `${qtdOs1.length}`);

  // ---------------------------------------------------------------- objetos: nao informado (REVISAO-FASE4 C1)
  console.log("\n== Fase 4: objetos (NULL = nao informado; [] = Nenhum objeto) ==");
  const osObjNull = await abrirOS({ p_mecanico_id: idMec });
  const osObjVazio = await abrirOS();
  const iniObj = await donoA.sb.rpc("iniciar_vistoria", { p_os_id: osObjNull }).single();
  const VObjNull = iniObj.data?.vistoria_id;
  const objDe = async (id) => (await vw(donoA.sb, id))?.objetos;
  const salvarObj = (sb, args) => sb.rpc("salvar_vistoria", { p_vistoria_id: VObjNull, ...args });
  checar("vistoria nova nasce com objetos NULL (nao informado), sem 'Nenhum objeto' sozinho", Boolean(VObjNull) && (await objDe(VObjNull)) === null, `${msg(iniObj)} ${JSON.stringify(await objDe(VObjNull))}`);
  const svOutraParte = await salvarObj(donoA.sb, { p_km: 600800, p_combustivel: "meio" });
  checar("salvar outra parte (KM, combustivel) nao inventa objetos", !svOutraParte.error && (await objDe(VObjNull)) === null, msg(svOutraParte));
  const svMarca = await salvarObj(donoA.sb, { p_objetos: ["Documentos", "Rádio PX"] });
  const objMarcados = await objDe(VObjNull);
  const svLimpa = await salvarObj(donoA.sb, { p_limpar_objetos: true });
  const objLimpos = await objDe(VObjNull);
  const svLimpa2 = await salvarObj(donoA.sb, { p_limpar_objetos: true });
  checar("marcar grava a lista; limpar (p_limpar_objetos) volta a NULL; reenvio do limpar nao quebra", !svMarca.error && objMarcados?.join("|") === "Documentos|Rádio PX" && !svLimpa.error && objLimpos === null && !svLimpa2.error && (await objDe(VObjNull)) === null, `${msg(svMarca)}/${msg(svLimpa)}/${msg(svLimpa2)} ${JSON.stringify(objMarcados)} -> ${JSON.stringify(objLimpos)}`);
  const svNenhum = await salvarObj(donoA.sb, { p_objetos: [] });
  const objNenhum = await objDe(VObjNull);
  const svNenhumKm = await salvarObj(donoA.sb, { p_km: 600800 });
  const objNenhumKm = await objDe(VObjNull);
  checar("'Nenhum objeto' grava lista vazia e p_objetos ausente nao muda", !svNenhum.error && Array.isArray(objNenhum) && objNenhum.length === 0 && !svNenhumKm.error && Array.isArray(objNenhumKm) && objNenhumKm.length === 0, `${msg(svNenhum)} ${JSON.stringify(objNenhum)} ${JSON.stringify(objNenhumKm)}`);
  const svBrancos = await salvarObj(donoA.sb, { p_objetos: ["  ", ""] });
  const objBrancos = await objDe(VObjNull);
  const svMecLimpa = guardaMec(await salvarObj(mec.sb, { p_limpar_objetos: true }));
  const svAtLimpa = await salvarObj(at.sb, { p_objetos: ["Ferramentas"], p_limpar_objetos: true });
  const objDepoisPapeis = await objDe(VObjNull);
  checar("lista so com brancos = NULL; mecanico da OS e atendente limpam; limpar vence p_objetos", !svBrancos.error && objBrancos === null && !svMecLimpa.error && !svAtLimpa.error && objDepoisPapeis === null, `${msg(svBrancos)}/${msg(svMecLimpa)}/${msg(svAtLimpa)} ${JSON.stringify(objDepoisPapeis)}`);
  const svMec2Limpa = await salvarObj(mec2.sb, { p_limpar_objetos: true });
  const svBLimpa = await salvarObj(donoB.sb, { p_limpar_objetos: true });
  checar("mecanico de outra OS e oficina B nao limpam", Boolean(svMec2Limpa.error) && msg(svBLimpa) === "vistoria_nao_encontrada", `${msg(svMec2Limpa)}/${msg(svBLimpa)}`);

  // Concluir nao exige objetos (DESIGN 12.8: nao esta em "Para concluir, falta"; o resumo diz "nao informado").
  const faltaObj1 = await donoA.sb.rpc("marcar_itens_restantes_ok", { p_vistoria_id: VObjNull });
  const faltaObj2 = await salvarObj(donoA.sb, { p_sem_avarias: true });
  const concNull = await donoA.sb.rpc("concluir_vistoria", { p_vistoria_id: VObjNull, p_sem_assinatura_motivo: "motorista_ausente" });
  const vNull = await vw(donoA.sb, VObjNull);
  const confNull = await donoA.sb.rpc("conferir_vistoria", { p_vistoria_id: VObjNull });
  checar("concluir com objetos NULL e aceito: fica NULL, hash gravado e conferir_vistoria = true", !faltaObj1.error && !faltaObj2.error && /^[0-9a-f]{64}$/.test(concNull.data ?? "") && vNull?.status === "concluida" && vNull?.objetos === null && confNull.data === true, `${msg(concNull)} ${JSON.stringify(vNull?.objetos)} conferir=${JSON.stringify(confNull.data)}`);
  const reconcNull = await donoA.sb.rpc("concluir_vistoria", { p_vistoria_id: VObjNull });
  checar("reenvio do concluir com objetos NULL devolve o mesmo hash", reconcNull.data === concNull.data, msg(reconcNull));
  const limpaConc = await salvarObj(donoA.sb, { p_limpar_objetos: true });
  const marcaConc = await salvarObj(donoA.sb, { p_objetos: [] });
  const updConc = await donoA.sb.from("vistorias").update({ objetos: [] }).eq("id", VObjNull).select("id");
  const vNull2 = await vw(donoA.sb, VObjNull);
  checar("depois de concluida, objetos nao mudam (RPC = vistoria_concluida; update direto recusado)", msg(limpaConc) === "vistoria_concluida" && msg(marcaConc) === "vistoria_concluida" && recusou(updConc) && vNull2?.objetos === null, `${msg(limpaConc)}/${msg(marcaConc)}/${updConc.error?.code ?? updConc.data?.length}`);

  const iniVazio = await donoA.sb.rpc("iniciar_vistoria", { p_os_id: osObjVazio }).single();
  const VObjVazio = iniVazio.data?.vistoria_id;
  await donoA.sb.rpc("marcar_itens_restantes_ok", { p_vistoria_id: VObjVazio });
  const svVazio = await donoA.sb.rpc("salvar_vistoria", { p_vistoria_id: VObjVazio, p_sem_avarias: true, p_objetos: [] });
  const concVazio = await donoA.sb.rpc("concluir_vistoria", { p_vistoria_id: VObjVazio, p_sem_assinatura_motivo: "recusou" });
  const vVazio = await vw(donoA.sb, VObjVazio);
  const confVazio = await donoA.sb.rpc("conferir_vistoria", { p_vistoria_id: VObjVazio });
  checar("concluir com 'Nenhum objeto' mantem a lista vazia e o hash confere", !svVazio.error && !concVazio.error && Array.isArray(vVazio?.objetos) && vVazio.objetos.length === 0 && confVazio.data === true, `${msg(svVazio)}/${msg(concVazio)} ${JSON.stringify(vVazio?.objetos)}`);

  // ---------------------------------------------------------------- recusas do concluir
  console.log("\n== Fase 4: concluir recusado (itens, foto pendente, avaria, assinatura) ==");
  const os4 = await abrirOS();
  const i4 = await at.sb.rpc("iniciar_vistoria", { p_os_id: os4 }).single();
  const V4 = i4.data?.vistoria_id;
  const c1 = await at.sb.rpc("concluir_vistoria", { p_vistoria_id: V4 });
  checar("concluir com item do checklist sem marcar: vistoria_itens_sem_marcar", msg(c1) === "vistoria_itens_sem_marcar", msg(c1));
  const itens4 = await itensDe(at.sb, V4);
  const semSit = await at.sb.rpc("marcar_item_vistoria", { p_item_id: itens4[0]?.id, p_situacao: null });
  checar("marcar item sem situacao: situacao_obrigatoria", msg(semSit) === "situacao_obrigatoria", msg(semSit));
  await at.sb.rpc("marcar_itens_restantes_ok", { p_vistoria_id: V4 });
  const fPend = await registrarFotoV(at.sb, V4, "painel");
  const c2 = await at.sb.rpc("concluir_vistoria", { p_vistoria_id: V4 });
  checar("concluir com foto da vistoria pendente (registrada, nao enviada): vistoria_fotos_pendentes", !fPend.r.error && msg(c2) === "vistoria_fotos_pendentes", `${msg(fPend.r)}/${msg(c2)}`);
  const conf0 = await at.sb.rpc("confirmar_foto_vistoria", { p_id: fPend.id });
  checar("confirmar sem o arquivo no bucket: foto_nao_enviada", msg(conf0) === "foto_nao_enviada", msg(conf0));
  const gif = await subirV(at.sb, fPend.caminho, arquivo(JPEG_1PX, "image/gif"), "image/gif");
  const grande = await subirV(at.sb, fPend.caminho, arquivo(Buffer.alloc(5 * 1024 * 1024 + 1024, 0xff)));
  checar("bucket vistorias recusa arquivo que nao e JPEG/PNG e maior que 5 MB", Boolean(gif.error) && Boolean(grande.error), `${errSt(gif.error)} | ${errSt(grande.error)}`);
  await subirV(at.sb, fPend.caminho_miniatura);
  await subirV(at.sb, fPend.caminho);
  const conf1 = await at.sb.rpc("confirmar_foto_vistoria", { p_id: fPend.id });
  const c3 = await at.sb.rpc("concluir_vistoria", { p_vistoria_id: V4 });
  checar("foto enviada; concluir sem dizer se tem avaria: avarias_nao_informadas", !conf1.error && msg(c3) === "avarias_nao_informadas", `${msg(conf1)}/${msg(c3)}`);
  const semAv = await at.sb.rpc("salvar_vistoria", { p_vistoria_id: V4, p_sem_avarias: true });
  const av4 = uuid();
  const nova4 = await at.sb.rpc("salvar_avaria", { p_id: av4, p_vistoria_id: V4, p_lado: "traseira" });
  const sa4 = (await vw(at.sb, V4))?.sem_avarias;
  const semAv2 = await at.sb.rpc("salvar_vistoria", { p_vistoria_id: V4, p_sem_avarias: true });
  const semLado = await at.sb.rpc("salvar_avaria", { p_id: uuid(), p_vistoria_id: V4 });
  checar("'Sem avarias' marcado e desmarcado pela avaria nova; marcar com avaria = vistoria_tem_avarias; avaria sem lado = lado_obrigatorio", !semAv.error && !nova4.error && sa4 === false && msg(semAv2) === "vistoria_tem_avarias" && msg(semLado) === "lado_obrigatorio", `${msg(semAv)}/${msg(nova4)}/${sa4}/${msg(semAv2)}/${msg(semLado)}`);
  const c4 = await at.sb.rpc("concluir_vistoria", { p_vistoria_id: V4 });
  checar("concluir com avaria sem foto e sem descricao: avaria_incompleta", msg(c4) === "avaria_incompleta", msg(c4));
  const tres = [];
  for (let i = 0; i < 3; i++) tres.push(await registrarFotoV(at.sb, V4, "avaria", { p_avaria_id: av4 }));
  const quarta = await registrarFotoV(at.sb, V4, "avaria", { p_avaria_id: av4 });
  checar("ate 3 fotos por avaria: a 4a e recusada (limite_fotos_avaria)", tres.every((f) => !f.r.error) && msg(quarta.r) === "limite_fotos_avaria", `${tres.map((f) => msg(f.r)).join(",")}/${msg(quarta.r)}`);
  const apag = await Promise.all(tres.map((f) => at.sb.rpc("apagar_foto_vistoria", { p_id: f.id })));
  checar("rascunho: atendente descarta as fotos pendentes (apagar_foto_vistoria = true)", apag.every((r) => r.data === true), apag.map(msg).join(","));
  await at.sb.rpc("salvar_avaria", { p_id: av4, p_vistoria_id: V4, p_descricao: "Lanterna quebrada" });
  const c5 = await at.sb.rpc("concluir_vistoria", { p_vistoria_id: V4 });
  await at.sb.rpc("salvar_vistoria", { p_vistoria_id: V4, p_assinado_por_nome: "Fulano de Tal" });
  const c6 = await at.sb.rpc("concluir_vistoria", { p_vistoria_id: V4 });
  checar("concluir sem assinatura (nem com o nome guardado): assinatura_obrigatoria", msg(c5) === "assinatura_obrigatoria" && msg(c6) === "assinatura_obrigatoria", `${msg(c5)}/${msg(c6)}`);
  const semNome = await assinarV(at.sb, V4, { nome: " ", subir: false });
  const assGrande = await at.sb.rpc("registrar_assinatura_vistoria", { p_vistoria_id: V4, p_assinatura_id: uuid(), p_nome: "Fulano", p_largura: 320, p_altura: 96, p_tamanho_bytes: 600 * 1024 });
  checar("assinatura sem nome: nome_assinatura_obrigatorio; PNG > 512 KB: assinatura_invalida", msg(semNome.r) === "nome_assinatura_obrigatorio" && msg(assGrande) === "assinatura_invalida", `${msg(semNome.r)}/${msg(assGrande)}`);
  const assSemArq = await assinarV(at.sb, V4, { subir: false });
  const c7 = await at.sb.rpc("concluir_vistoria", { p_vistoria_id: V4 });
  checar("concluir com a assinatura registrada mas sem o PNG no bucket: assinatura_nao_enviada", !assSemArq.r.error && msg(c7) === "assinatura_nao_enviada", `${msg(assSemArq.r)}/${msg(c7)}`);
  const c8 = await at.sb.rpc("concluir_vistoria", { p_vistoria_id: V4, p_sem_assinatura_motivo: "sumiu" });
  checar("'sem assinatura' com motivo fora da lista: recusado", Boolean(c8.error), msg(c8));
  const c9 = await at.sb.rpc("concluir_vistoria", { p_vistoria_id: V4, p_sem_assinatura_motivo: "motorista_ausente" });
  const v4 = await vw(at.sb, V4);
  checar("'sem assinatura' com motivo valido (motorista_ausente): conclui e descarta a assinatura registrada", /^[0-9a-f]{64}$/.test(c9.data ?? "") && v4?.status === "concluida" && v4.sem_assinatura_motivo === "motorista_ausente" && v4.assinatura_caminho === null && v4.assinado_por_nome === null, `${msg(c9)} ${JSON.stringify(v4 && { s: v4.status, m: v4.sem_assinatura_motivo, c: v4.assinatura_caminho })}`);
  const hist4 = (await at.sb.from("vw_os_historico").select("evento, observacao").eq("os_id", os4)).data ?? [];
  checar("historico: 'concluida sem assinatura (motorista ausente)'", hist4.some((h) => h.evento === "vistoria" && /sem assinatura \(motorista ausente\)/.test(h.observacao ?? "")));

  // ---------------------------------------------------------------- idempotencia simultanea
  console.log("\n== Fase 4: idempotencia com reenvio simultaneo (mesma chave) ==");
  const os5 = await abrirOS();
  const [s1, s2] = await Promise.all([donoA.sb.rpc("iniciar_vistoria", { p_os_id: os5 }).single(), at.sb.rpc("iniciar_vistoria", { p_os_id: os5 }).single()]);
  const V5 = s1.data?.vistoria_id;
  checar("iniciar_vistoria 2x ao mesmo tempo (dono e atendente): uma vistoria so", Boolean(V5) && V5 === s2.data?.vistoria_id && [s1.data?.ja_existia, s2.data?.ja_existia].filter(Boolean).length === 1, `${msg(s1)}/${msg(s2)}`);
  const it5 = await itensDe(donoA.sb, V5);
  const mm = await Promise.all([1, 2].map(() => donoA.sb.rpc("marcar_item_vistoria", { p_item_id: it5[0]?.id, p_situacao: "com_problema", p_observacao: "Trinca" })));
  const rr = await Promise.all([1, 2].map(() => donoA.sb.rpc("marcar_itens_restantes_ok", { p_vistoria_id: V5 })));
  checar("marcar item e 'resto ok' 2x ao mesmo tempo: sem erro, cada item marcado uma vez", mm.every((r) => !r.error) && rr.every((r) => !r.error) && rr[0].data + rr[1].data === it5.length - 1, `${mm.map(msg)}/${rr.map((r) => r.data)}`);
  const av5 = uuid();
  const aa = await Promise.all([1, 2].map(() => donoA.sb.rpc("salvar_avaria", { p_id: av5, p_vistoria_id: V5, p_lado: "frente", p_descricao: "Risco no para-choque" })));
  const avs5 = (await donoA.sb.from("vistoria_avarias").select("id").eq("vistoria_id", V5)).data ?? [];
  checar("salvar_avaria 2x ao mesmo tempo com o mesmo id: uma avaria", aa.every((r) => !r.error) && avs5.length === 1, `${aa.map(msg)}/${avs5.length}`);
  const f5 = uuid();
  const ff = await Promise.all([1, 2].map(() => registrarFotoV(donoA.sb, V5, "avaria", { p_id: f5, p_avaria_id: av5 })));
  checar("registrar_foto_vistoria 2x ao mesmo tempo: mesmo caminho, um so registro (um ja_existia)", ff.every((f) => !f.r.error) && ff[0].caminho === ff[1].caminho && [ff[0].r.data?.ja_existia, ff[1].r.data?.ja_existia].filter(Boolean).length === 1, ff.map((f) => msg(f.r)).join("/"));
  const ups = await Promise.all([subirV(donoA.sb, ff[0].caminho_miniatura), subirV(donoA.sb, ff[0].caminho_miniatura)]);
  await subirV(donoA.sb, ff[0].caminho);
  const cc = await Promise.all([1, 2].map(() => donoA.sb.rpc("confirmar_foto_vistoria", { p_id: f5 })));
  const fotos5 = (await donoA.sb.from("vw_vistoria_fotos").select("id, enviada_em").eq("vistoria_id", V5)).data ?? [];
  checar("upload 2x ao mesmo tempo (um entra, o outro 409) e confirmar 2x: uma foto enviada", ups.filter((u) => !u.error).length === 1 && cc.every((r) => !r.error) && fotos5.length === 1 && Boolean(fotos5[0].enviada_em), `${ups.map((u) => errSt(u.error))}/${cc.map(msg)}`);
  const as5 = uuid();
  const ra = await Promise.all([1, 2].map(() => donoA.sb.rpc("registrar_assinatura_vistoria", { p_vistoria_id: V5, p_assinatura_id: as5, p_nome: NOME_ASSINA, p_largura: 320, p_altura: 96, p_tamanho_bytes: PNG_ASSINATURA.length })));
  await subirV(donoA.sb, ra[0].data, pngBlob(), "image/png");
  checar("registrar_assinatura 2x ao mesmo tempo com o mesmo id: mesmo caminho", ra.every((r) => !r.error) && ra[0].data === ra[1].data, ra.map(msg).join("/"));
  const co = await Promise.all([1, 2].map(() => donoA.sb.rpc("concluir_vistoria", { p_vistoria_id: V5 })));
  checar("concluir 2x ao mesmo tempo: sem erro e o mesmo hash", co.every((r) => !r.error) && /^[0-9a-f]{64}$/.test(co[0].data ?? "") && co[0].data === co[1].data, co.map(msg).join("/"));
  const cm5 = uuid();
  const cp = await Promise.all([donoA.sb.rpc("complementar_vistoria", { p_id: cm5, p_vistoria_id: V5, p_texto: "Cliente voltou" }), at.sb.rpc("complementar_vistoria", { p_id: cm5, p_vistoria_id: V5, p_texto: "Cliente voltou" })]);
  const comps5 = (await donoA.sb.from("vw_vistoria_complementos").select("id").eq("vistoria_id", V5)).data ?? [];
  checar("complementar 2x ao mesmo tempo com o mesmo id: um complemento", cp.every((r) => !r.error) && comps5.length === 1, `${cp.map(msg)}/${comps5.length}`);
  const hist5 = ((await donoA.sb.from("vw_os_historico").select("evento").eq("os_id", os5)).data ?? []).filter((h) => h.evento === "vistoria");
  checar("historico sem eventos duplicados pelo reenvio (1 conclusao + 1 complemento)", hist5.length === 2, `${hist5.length}`);

  // ---------------------------------------------------------------- imutabilidade
  console.log("\n== Fase 4: depois de concluida ninguem altera nem apaga ==");
  const pastaV1 = `${ofA}/${os1}/${V1.vid}`;
  for (const [rot, sb] of [["dono", donoA.sb], ["atendente", at.sb], ["mecanico", mec.sb]]) {
    const diretas = [
      await sb.from("vistorias").update({ observacoes: "alterado" }).eq("id", V1.vid).select("id"),
      await sb.from("vistorias").update({ status: "rascunho" }).eq("id", V1.vid).select("id"),
      await sb.from("vistorias").delete().eq("id", V1.vid).select("id"),
      await sb.from("vistoria_itens").update({ situacao: "ok" }).eq("vistoria_id", V1.vid).select("id"),
      await sb.from("vistoria_itens").delete().eq("vistoria_id", V1.vid).select("id"),
      await sb.from("vistoria_itens").insert({ oficina_id: ofA, vistoria_id: V1.vid, ordem: 99, descricao: "Invasão" }).select("id"),
      await sb.from("vistoria_avarias").update({ descricao: "alterado" }).eq("id", V1.avId).select("id"),
      await sb.from("vistoria_avarias").delete().eq("id", V1.avId).select("id"),
      await sb.from("vistoria_fotos").update({ legenda: "alterado" }).eq("vistoria_id", V1.vid).select("id"),
      await sb.from("vistoria_fotos").delete().eq("vistoria_id", V1.vid).select("id"),
    ];
    checar(`${rot}: update/delete/insert direto em vistorias, vistoria_itens, vistoria_avarias e vistoria_fotos recusados (${diretas.length})`, diretas.every(recusou), diretas.map((r) => r.error?.code ?? r.data?.length).join(","));
    const rpcs = [
      ["salvar_vistoria", { p_vistoria_id: V1.vid, p_observacoes: "alterado" }],
      ["salvar_vistoria", { p_vistoria_id: V1.vid, p_km: 1 }],
      ["marcar_item_vistoria", { p_item_id: V1.itens[0]?.id, p_situacao: "ok" }],
      ["marcar_itens_restantes_ok", { p_vistoria_id: V1.vid }],
      ["salvar_avaria", { p_id: V1.avId, p_vistoria_id: V1.vid, p_descricao: "alterado" }],
      ["salvar_avaria", { p_id: uuid(), p_vistoria_id: V1.vid, p_lado: "frente", p_descricao: "nova" }],
      ["remover_avaria", { p_id: V1.avId }],
      ["registrar_foto_vistoria", { p_id: uuid(), p_vistoria_id: V1.vid, p_tipo: "painel", p_largura: 10, p_altura: 10, p_tamanho_bytes: 10, p_tamanho_miniatura_bytes: 10 }],
      ["apagar_foto_vistoria", { p_id: V1.fAv.id }],
      ["apagar_foto_vistoria", { p_id: V1.fPa.id }],
      ["registrar_assinatura_vistoria", { p_vistoria_id: V1.vid, p_assinatura_id: uuid(), p_nome: "Outro", p_largura: 10, p_altura: 10, p_tamanho_bytes: 10 }],
      ["registrar_assinatura_vistoria", { p_vistoria_id: V1.vid, p_assinatura_id: V1.as.id, p_nome: "Outro", p_largura: 10, p_altura: 10, p_tamanho_bytes: 10 }],
    ];
    const res = [];
    for (const [f, a] of rpcs) res.push(await sb.rpc(f, a));
    if (rot === "mecanico") res.forEach(guardaMec);
    const errados = res.map((r, i) => [rpcs[i][0], msg(r)]).filter(([, m]) => m !== "vistoria_concluida");
    checar(`${rot}: ${rpcs.length} chamadas de RPC de edicao recusadas com vistoria_concluida`, errados.length === 0, errados.map(([f, m]) => `${f}=${m}`).join(" "));
    const B = sb.storage.from(BUCKET_VIST);
    const st = [
      ["sobrescrever foto", await B.upload(V1.fAv.caminho, arquivo(), { contentType: "image/jpeg", upsert: true })],
      ["sobrescrever miniatura", await B.upload(V1.fAv.caminho_miniatura, arquivo(), { contentType: "image/jpeg", upsert: true })],
      ["sobrescrever assinatura", await B.upload(V1.as.caminho, pngBlob(), { contentType: "image/png", upsert: true })],
      ["subir de novo no caminho da foto", await B.upload(V1.fPa.caminho, arquivo(), { contentType: "image/jpeg" })],
      ["mover foto", await B.move(V1.fPa.caminho, `${pastaV1}/${uuid()}.jpg`)],
      ["mover assinatura", await B.move(V1.as.caminho, `${pastaV1}/assinatura_${uuid()}.png`)],
      ["copiar foto", await B.copy(V1.fPa.caminho, `${pastaV1}/${uuid()}.jpg`)],
      ["acrescentar foto", await B.upload(`${pastaV1}/${uuid()}.jpg`, arquivo(), { contentType: "image/jpeg" })],
      ["acrescentar assinatura", await B.upload(`${pastaV1}/assinatura_${uuid()}.png`, pngBlob(), { contentType: "image/png" })],
    ];
    const rm = await B.remove([V1.fAv.caminho, V1.fAv.caminho_miniatura, V1.fPa.caminho, V1.as.caminho]);
    const passaram = st.filter(([, r]) => !r.error).map(([n]) => n);
    checar(`${rot}: Storage recusa sobrescrever, mover, copiar e acrescentar (${st.length}); remover apaga 0 arquivos`, passaram.length === 0 && (rm.data ?? []).length === 0, passaram.join(", ") || `${rm.data?.length} removidos ${errSt(rm.error)}`);
  }
  const [tF, tM, tP, tA] = await Promise.all([tamanhoV(donoA.sb, V1.fAv.caminho), tamanhoV(donoA.sb, V1.fAv.caminho_miniatura), tamanhoV(donoA.sb, V1.fPa.caminho), tamanhoV(donoA.sb, V1.as.caminho)]);
  const lista1 = await donoA.sb.storage.from(BUCKET_VIST).list(pastaV1);
  const v1d = await vw(donoA.sb, V1.vid);
  const conf1v = await donoA.sb.rpc("conferir_vistoria", { p_vistoria_id: V1.vid });
  checar(
    "depois das tentativas: arquivos com o mesmo tamanho, pasta com 5 arquivos, dados iguais e conferir_vistoria = true",
    tF === JPEG_1PX.length && tM === JPEG_1PX.length && tP === JPEG_1PX.length && tA === PNG_ASSINATURA.length && (lista1.data ?? []).length === 5 &&
      v1d?.observacoes === "Para-brisa trincado no canto" && v1d?.qtd_avarias === 1 && v1d?.qtd_fotos === 2 && v1d?.km === 600500 && v1d?.hash_conteudo === V1.hash && conf1v.data === true,
    `${tF}/${tM}/${tP}/${tA} lista ${lista1.data?.length} conferir ${msg(conf1v)}=${conf1v.data}`,
  );
  const conc2 = await donoA.sb.rpc("concluir_vistoria", { p_vistoria_id: V1.vid });
  checar("concluir de novo devolve o mesmo hash (reenvio)", conc2.data === V1.hash, msg(conc2));

  // ---------------------------------------------------------------- complemento
  console.log("\n== Fase 4: complemento (so acrescenta) ==");
  const cId = uuid();
  const TEXTO_C = "Cliente avisou de um risco no para-choque";
  const comp1 = await donoA.sb.rpc("complementar_vistoria", { p_id: cId, p_vistoria_id: V1.vid, p_texto: TEXTO_C });
  const comp1b = await donoA.sb.rpc("complementar_vistoria", { p_id: cId, p_vistoria_id: V1.vid, p_texto: "Texto trocado" });
  const fc = await fotoV(donoA.sb, V1.vid, "outro", { p_complemento_id: cId });
  const fcAv = await registrarFotoV(donoA.sb, V1.vid, "avaria", { p_avaria_id: V1.avId, p_complemento_id: cId });
  const comps = (await donoA.sb.from("vw_vistoria_complementos").select("*").eq("vistoria_id", V1.vid)).data ?? [];
  checar(
    "dono: complemento com texto e foto aceito; reenvio com o mesmo id nao duplica nem troca o texto; foto de 'avaria' no complemento = foto_invalida",
    !comp1.error && !comp1b.error && fc.ok && comps.length === 1 && comps[0].texto === TEXTO_C && comps[0].qtd_fotos === 1 && comps[0].criado_por_nome === "Dono Teste A" && msg(fcAv.r) === "foto_invalida",
    `${msg(comp1)}/${msg(comp1b)}/${fc.erro}/${comps.length}/${msg(fcAv.r)}`,
  );
  const updC = await donoA.sb.from("vistoria_complementos").update({ texto: "alterado" }).eq("id", cId).select("id");
  const delC = await donoA.sb.from("vistoria_complementos").delete().eq("id", cId).select("id");
  const apC = await donoA.sb.rpc("apagar_foto_vistoria", { p_id: fc.id });
  const updFC = await donoA.sb.from("vistoria_fotos").update({ legenda: "x" }).eq("id", fc.id).select("id");
  const stC = await subirV(donoA.sb, fc.caminho, arquivo(), "image/jpeg", true);
  const rmC = await donoA.sb.storage.from(BUCKET_VIST).remove([fc.caminho, fc.caminho_miniatura]);
  checar(
    "complemento nao se edita nem apaga (tabela, apagar_foto_vistoria = vistoria_concluida, Storage)",
    recusou(updC) && recusou(delC) && msg(apC) === "vistoria_concluida" && recusou(updFC) && Boolean(stC.error) && (rmC.data ?? []).length === 0 && (await tamanhoV(donoA.sb, fc.caminho)) === JPEG_1PX.length,
    `${updC.error?.code}/${delC.error?.code}/${msg(apC)}/${errSt(stC.error)}/${rmC.data?.length}`,
  );
  const compM = guardaMec(await mec.sb.rpc("complementar_vistoria", { p_id: uuid(), p_vistoria_id: V1.vid, p_texto: "Mecânico viu vazamento" }));
  const compA = await at.sb.rpc("complementar_vistoria", { p_id: uuid(), p_vistoria_id: V1.vid, p_texto: "Atendente: foto extra" });
  checar("mecanico (OS dele, aberta) e atendente tambem complementam", !compM.error && !compA.error, `${msg(compM)}/${msg(compA)}`);
  const conf1c = await donoA.sb.rpc("conferir_vistoria", { p_vistoria_id: V1.vid });
  checar("complemento fica fora do hash: conferir_vistoria continua true", conf1c.data === true, msg(conf1c));

  // ---------------------------------------------------------------- anular
  console.log("\n== Fase 4: anular (so o dono) ==");
  const anAt = await at.sb.rpc("anular_vistoria", { p_vistoria_id: V2.vid, p_motivo: "Feita na OS errada" });
  const anMec = await mec.sb.rpc("anular_vistoria", { p_vistoria_id: V3.vid, p_motivo: "Feita na OS errada" });
  const anSem = await donoA.sb.rpc("anular_vistoria", { p_vistoria_id: V2.vid, p_motivo: " " });
  checar("atendente e mecanico nao anulam (acesso_negado); dono sem motivo = motivo_obrigatorio", msg(anAt) === "acesso_negado" && msg(anMec) === "acesso_negado" && msg(anSem) === "motivo_obrigatorio", `${msg(anAt)}/${msg(anMec)}/${msg(anSem)}`);
  const MOTIVO_AN = "Feita na OS errada: era outro caminhão";
  const an1 = await donoA.sb.rpc("anular_vistoria", { p_vistoria_id: V2.vid, p_motivo: MOTIVO_AN });
  const an2 = await donoA.sb.rpc("anular_vistoria", { p_vistoria_id: V2.vid, p_motivo: "outro motivo" });
  const v2a = await vw(donoA.sb, V2.vid);
  const os2a = (await donoA.sb.from("vw_os").select("vistoria_entrada_id, vistoria_entrada_status").eq("id", os2).single()).data;
  checar("dono anula com motivo (reenvio nao troca o motivo); a OS volta a 'Sem vistoria'", !an1.error && !an2.error && v2a?.status === "anulada" && v2a?.motivo_anulacao === MOTIVO_AN && v2a?.anulada_por_nome === "Dono Teste A" && os2a?.vistoria_entrada_status === null, `${msg(an1)}/${msg(an2)} ${JSON.stringify(os2a)}`);
  const svAn = await at.sb.rpc("salvar_vistoria", { p_vistoria_id: V2.vid, p_observacoes: "x" });
  const cpAn = await donoA.sb.rpc("complementar_vistoria", { p_id: uuid(), p_vistoria_id: V2.vid, p_texto: "x" });
  const updAn = await donoA.sb.from("vistorias").update({ motivo_anulacao: "x" }).eq("id", V2.vid).select("id");
  const rmAn = await donoA.sb.storage.from(BUCKET_VIST).remove([V2.fAv.caminho, V2.as.caminho]);
  checar("anulada nao muda nem recebe complemento (vistoria_anulada) e os arquivos ficam", msg(svAn) === "vistoria_anulada" && msg(cpAn) === "vistoria_anulada" && recusou(updAn) && (rmAn.data ?? []).length === 0 && (await tamanhoV(donoA.sb, V2.as.caminho)) === PNG_ASSINATURA.length, `${msg(svAn)}/${msg(cpAn)}/${rmAn.data?.length}`);
  const novaV2 = await at.sb.rpc("iniciar_vistoria", { p_os_id: os2 }).single();
  checar("depois de anulada, a OS aceita nova vistoria de entrada (outro id, rascunho)", Boolean(novaV2.data?.vistoria_id) && novaV2.data.vistoria_id !== V2.vid && novaV2.data.ja_existia === false && novaV2.data.status === "rascunho", msg(novaV2));
  const histAn = (await donoA.sb.from("vw_os_historico").select("evento, observacao").eq("os_id", os2)).data ?? [];
  checar("historico do dono: 'anulada' com o motivo", histAn.some((h) => h.evento === "vistoria" && h.observacao?.includes("anulada") && h.observacao?.includes("outro caminhão")));

  // ---------------------------------------------------------------- mecanico conforme 17.6
  console.log("\n== Fase 4: mecanico (faz so na OS dele, ve a das OS que ve) ==");
  const os6 = await abrirOS({ p_mecanico_id: idMec });
  const iR = await donoA.sb.rpc("iniciar_vistoria", { p_os_id: os6 }).single();
  const VR = iR.data?.vistoria_id; // fica em rascunho (PDF 409, mecanico 2)
  const fRasc = await registrarFotoV(donoA.sb, VR, "painel"); // pendente do dono: para os uploads alheios
  checar("rascunho do dono na OS do mecanico (fica em rascunho)", Boolean(VR) && !fRasc.r.error, `${msg(iR)}/${msg(fRasc.r)}`);
  const mVe = guardaMec(await mec.sb.from("vw_vistorias").select("*").eq("id", V1.vid).maybeSingle());
  const mIt = guardaMec(await mec.sb.from("vistoria_itens").select("*").eq("vistoria_id", V1.vid));
  const mAv = guardaMec(await mec.sb.from("vistoria_avarias").select("*").eq("vistoria_id", V1.vid));
  const mFt = guardaMec(await mec.sb.from("vw_vistoria_fotos").select("*").eq("vistoria_id", V1.vid));
  const mCp = guardaMec(await mec.sb.from("vw_vistoria_complementos").select("*").eq("vistoria_id", V1.vid));
  const [mBf, mBa] = await Promise.all([tamanhoV(mec.sb, V1.fAv.caminho), tamanhoV(mec.sb, V1.as.caminho)]);
  const mUrl = await mec.sb.storage.from(BUCKET_VIST).createSignedUrls([V1.fAv.caminho_miniatura, V1.as.caminho], 900);
  checar(
    "mecanico ve a vistoria que o dono fez na OS dele (vistoria, itens, avarias, fotos, complementos, arquivos, URL assinada)",
    Boolean(mVe.data) && (mIt.data ?? []).length === 17 && (mAv.data ?? []).length === 1 && (mFt.data ?? []).length >= 3 && (mCp.data ?? []).length === 3 && mBf > 0 && mBa > 0 && !mUrl.error && (mUrl.data ?? []).every((u) => Boolean(u.signedUrl)),
    `${(mFt.data ?? []).length} fotos ${(mCp.data ?? []).length} compl. ${mBf}/${mBa} ${errSt(mUrl.error)}`,
  );
  checar("mecanico: pode_editar=false na concluida, pode_complementar=true, pode_anular=false", mVe.data?.pode_editar === false && mVe.data?.pode_complementar === true && mVe.data?.pode_anular === false, JSON.stringify(mVe.data && [mVe.data.pode_editar, mVe.data.pode_complementar, mVe.data.pode_anular]));
  const mNaoVe = await mec.sb.from("vw_vistorias").select("id").in("id", [V2.vid, novaV2.data?.vistoria_id, V4]);
  const mNaoBaixa = await tamanhoV(mec.sb, V2.fAv.caminho);
  const mIni2 = await mec.sb.rpc("iniciar_vistoria", { p_os_id: os4 });
  const mSalva = await mec.sb.rpc("salvar_vistoria", { p_vistoria_id: novaV2.data?.vistoria_id, p_observacoes: "x" });
  const mComp = await mec.sb.rpc("complementar_vistoria", { p_id: uuid(), p_vistoria_id: V4, p_texto: "x" });
  checar(
    "mecanico em OS que nao e dele: nao ve vistoria nem arquivo, nao inicia, nao edita e nao complementa",
    (mNaoVe.data ?? []).length === 0 && mNaoBaixa === 0 && ["os_nao_encontrada", "acesso_negado"].includes(msg(mIni2)) && msg(mSalva) === "vistoria_nao_encontrada" && msg(mComp) === "vistoria_nao_encontrada",
    `${mNaoVe.data?.length}/${mNaoBaixa}/${msg(mIni2)}/${msg(mSalva)}/${msg(mComp)}`,
  );
  const mSalvaR = guardaMec(await mec.sb.rpc("salvar_vistoria", { p_vistoria_id: VR, p_combustivel: "cheio" }));
  checar("mecanico continua a vistoria que o dono comecou na OS dele", !mSalvaR.error, msg(mSalvaR));
  // mecanico 2 (sem ve_todas_os): nada da OS do mecanico 1
  const m2Ve = await mec2.sb.from("vw_vistorias").select("id").in("id", [V1.vid, VR, V3.vid]);
  const m2Bx = await tamanhoV(mec2.sb, V1.as.caminho);
  const m2Url = await mec2.sb.storage.from(BUCKET_VIST).createSignedUrl(V1.fAv.caminho, 60);
  const m2Ini = await mec2.sb.rpc("iniciar_vistoria", { p_os_id: os6 });
  const m2Sv = await mec2.sb.rpc("salvar_vistoria", { p_vistoria_id: VR, p_observacoes: "x" });
  const m2Up = await subirV(mec2.sb, fRasc.caminho);
  checar(
    "mecanico 2 (OS de outro): nao ve, nao baixa, nao assina URL, nao inicia, nao edita, nao sobe arquivo",
    (m2Ve.data ?? []).length === 0 && m2Bx === 0 && Boolean(m2Url.error) && ["os_nao_encontrada", "acesso_negado"].includes(msg(m2Ini)) && msg(m2Sv) === "vistoria_nao_encontrada" && Boolean(m2Up.error),
    `${m2Ve.data?.length}/${m2Bx}/${errSt(m2Url.error)}/${msg(m2Ini)}/${msg(m2Sv)}/${errSt(m2Up.error)}`,
  );
  const vt = await donoA.sb.rpc("atualizar_membro", { p_perfil_id: idMec2, p_ve_todas_os: true });
  const vtVe = await mec2.sb.from("vw_vistorias").select("id, pode_editar, pode_complementar").eq("id", V1.vid).maybeSingle();
  const vtBx = await tamanhoV(mec2.sb, V1.fAv.caminho);
  const vtIni = await mec2.sb.rpc("iniciar_vistoria", { p_os_id: os6 });
  const vtSv = await mec2.sb.rpc("salvar_vistoria", { p_vistoria_id: VR, p_observacoes: "x" });
  const vtCp = await mec2.sb.rpc("complementar_vistoria", { p_id: uuid(), p_vistoria_id: V1.vid, p_texto: "x" });
  checar(
    "mecanico 2 com ve_todas_os: ve a vistoria e baixa a foto, mas nao inicia, nao edita e nao complementa (acesso_negado)",
    !vt.error && Boolean(vtVe.data) && vtVe.data.pode_complementar === false && vtBx > 0 && msg(vtIni) === "acesso_negado" && msg(vtSv) === "acesso_negado" && msg(vtCp) === "acesso_negado",
    `${msg(vt)}/${Boolean(vtVe.data)}/${vtBx}/${msg(vtIni)}/${msg(vtSv)}/${msg(vtCp)}`,
  );
  await donoA.sb.rpc("atualizar_membro", { p_perfil_id: idMec2, p_ve_todas_os: false });
  const cpRasc = await donoA.sb.rpc("complementar_vistoria", { p_id: uuid(), p_vistoria_id: VR, p_texto: "x" });
  checar("complementar vistoria em rascunho: vistoria_nao_concluida", msg(cpRasc) === "vistoria_nao_concluida", msg(cpRasc));
  guardaMec(await mec.sb.from("vw_os").select("*").in("id", [os1, os3, os6]));
  const vazados = valoresVazados(respostasMec).filter((c) => !/\.itens_total$/.test(c)); // itens_total = quantidade de itens do checklist
  checar(`mecanico: nenhuma das ${respostasMec.length} respostas da Fase 4 traz preco, custo, total ou pagamento`, vazados.length === 0, vazados.slice(0, 5).join(", "));

  // ---------------------------------------------------------------- oficina B e anon
  console.log("\n== Fase 4: oficina B e anon nao alcancam a vistoria da A ==");
  for (const t of ["vistorias", "vistoria_itens", "vistoria_avarias", "vistoria_fotos", "vistoria_complementos", "vw_vistorias", "vw_vistoria_fotos", "vw_vistoria_complementos", "checklist_modelos", "checklist_modelo_itens"]) {
    const r = await donoB.sb.from(t).select("*");
    const daA = (r.data ?? []).filter((x) => x.oficina_id === ofA);
    checar(`dono B: nao ve ${t} da A`, !r.error && daA.length === 0, r.error?.code ?? `${daA.length} da A`);
  }
  const bId = await donoB.sb.from("vw_vistorias").select("id").eq("id", V1.vid);
  const bId2 = await donoB.sb.from("vistoria_itens").select("id").eq("vistoria_id", V1.vid);
  checar("dono B: nem com o id da vistoria", (bId.data ?? []).length === 0 && (bId2.data ?? []).length === 0);
  const BB = donoB.sb.storage.from(BUCKET_VIST);
  const bBx = await Promise.all([V1.fAv.caminho, V1.fAv.caminho_miniatura, V1.fPa.caminho, V1.as.caminho, fc.caminho].map((c) => tamanhoV(donoB.sb, c)));
  const bUrl = await BB.createSignedUrl(V1.as.caminho, 60);
  const bUrls = await BB.createSignedUrls([V1.fAv.caminho, V1.as.caminho], 60);
  const bLs = await BB.list(pastaV1);
  const bLs2 = await BB.list(ofA);
  checar("dono B: nao baixa foto, miniatura, painel, assinatura nem foto do complemento com o caminho na mao", bBx.every((n) => n === 0), bBx.join(","));
  checar("dono B: nao gera URL assinada (uma ou varias) e nao lista as pastas da A", Boolean(bUrl.error) && (Boolean(bUrls.error) || (bUrls.data ?? []).every((u) => !u.signedUrl)) && (bLs.data ?? []).length === 0 && (bLs2.data ?? []).length === 0, `${errSt(bUrl.error)} | ${errSt(bUrls.error)} | ${bLs.data?.length}/${bLs2.data?.length}`);
  const bSobe = await subirV(donoB.sb, fRasc.caminho);
  const bSobe2 = await subirV(donoB.sb, `${pastaV1}/${uuid()}.jpg`);
  const bRm = await BB.remove([V1.fAv.caminho, V1.as.caminho, fRasc.caminho]);
  checar("dono B: nao sobe (registro pendente da A nem caminho inventado) e nao apaga", Boolean(bSobe.error) && Boolean(bSobe2.error) && (bRm.data ?? []).length === 0 && (await tamanhoV(donoA.sb, V1.as.caminho)) === PNG_ASSINATURA.length, `${errSt(bSobe.error)} | ${bRm.data?.length}`);
  const bRpcs = [
    ["iniciar_vistoria", { p_os_id: os1 }, "os_nao_encontrada"],
    ["salvar_vistoria", { p_vistoria_id: VR, p_observacoes: "invasao" }, "vistoria_nao_encontrada"],
    ["marcar_item_vistoria", { p_item_id: V1.itens[0]?.id, p_situacao: "ok" }, "item_nao_encontrado"],
    ["marcar_itens_restantes_ok", { p_vistoria_id: VR }, "vistoria_nao_encontrada"],
    ["salvar_avaria", { p_id: uuid(), p_vistoria_id: VR, p_lado: "frente" }, "vistoria_nao_encontrada"],
    ["registrar_foto_vistoria", { p_id: uuid(), p_vistoria_id: VR, p_tipo: "painel", p_largura: 1, p_altura: 1, p_tamanho_bytes: 1, p_tamanho_miniatura_bytes: 1 }, "vistoria_nao_encontrada"],
    ["confirmar_foto_vistoria", { p_id: fRasc.id }, "foto_nao_encontrada"],
    ["registrar_assinatura_vistoria", { p_vistoria_id: VR, p_assinatura_id: uuid(), p_nome: "Invasor", p_largura: 1, p_altura: 1, p_tamanho_bytes: 1 }, "vistoria_nao_encontrada"],
    ["concluir_vistoria", { p_vistoria_id: VR }, "vistoria_nao_encontrada"],
    ["complementar_vistoria", { p_id: uuid(), p_vistoria_id: V1.vid, p_texto: "invasao" }, "vistoria_nao_encontrada"],
    ["anular_vistoria", { p_vistoria_id: V1.vid, p_motivo: "invasao" }, "vistoria_nao_encontrada"],
    ["conferir_vistoria", { p_vistoria_id: V1.vid }, "vistoria_nao_encontrada"],
  ];
  const bRes = [];
  for (const [f, a] of bRpcs) bRes.push(await donoB.sb.rpc(f, a));
  const bRemAv = await donoB.sb.rpc("remover_avaria", { p_id: V1.avId });
  const bApF = await donoB.sb.rpc("apagar_foto_vistoria", { p_id: V1.fPa.id });
  const bErr = bRes.map((r, i) => [bRpcs[i][0], msg(r), bRpcs[i][2]]).filter(([, m, e]) => m !== e);
  checar(`dono B: ${bRpcs.length + 2} RPCs da vistoria nao alcancam a A (remover_avaria/apagar_foto = false)`, bErr.length === 0 && bRemAv.data === false && bApF.data === false, bErr.map(([f, m]) => `${f}=${m}`).join(" ") + ` ${bRemAv.data}/${bApF.data}`);
  const v1b = await vw(donoA.sb, V1.vid);
  const vrB = await vw(donoA.sb, VR);
  checar("dono A: vistorias intactas depois das tentativas da B", v1b?.status === "concluida" && v1b.qtd_avarias === 1 && vrB?.status === "rascunho" && vrB.observacoes === null && vrB.combustivel === "cheio");

  const anon = novoCliente();
  const anTabs = [];
  for (const t of ["vistorias", "vistoria_itens", "vistoria_avarias", "vistoria_fotos", "vistoria_complementos", "vw_vistorias", "vw_vistoria_fotos", "vw_vistoria_complementos", "checklist_modelos", "checklist_modelo_itens"]) {
    const r = await anon.from(t).select("*").limit(1);
    if (!(Boolean(r.error) || (r.data ?? []).length === 0)) anTabs.push(t);
  }
  checar("anon: nao le nenhuma tabela/view da vistoria nem o checklist", anTabs.length === 0, anTabs.join(","));
  const anR = await Promise.all([
    anon.rpc("iniciar_vistoria", { p_os_id: os1 }),
    anon.rpc("concluir_vistoria", { p_vistoria_id: VR }),
    anon.rpc("conferir_vistoria", { p_vistoria_id: V1.vid }),
    anon.rpc("complementar_vistoria", { p_id: uuid(), p_vistoria_id: V1.vid, p_texto: "x" }),
  ]);
  const anBx = await tamanhoV(anon, V1.as.caminho);
  const anUrl = await anon.storage.from(BUCKET_VIST).createSignedUrl(V1.fAv.caminho, 60);
  const anLs = await anon.storage.from(BUCKET_VIST).list(pastaV1);
  const anUp = await subirV(anon, fRasc.caminho);
  const pub = await fetch(`${URL_SB}/storage/v1/object/public/${BUCKET_VIST}/${V1.as.caminho}`);
  checar(
    "anon: nao chama as RPCs, nao baixa, nao assina URL, nao lista, nao sobe; URL publica nao abre (bucket privado)",
    anR.every((r) => Boolean(r.error)) && anBx === 0 && Boolean(anUrl.error) && (anLs.data ?? []).length === 0 && Boolean(anUp.error) && pub.status !== 200,
    `${anR.map((r) => r.error?.code).join(",")}/${anBx}/${errSt(anUrl.error)}/${anLs.data?.length}/${errSt(anUp.error)}/${pub.status}`,
  );

  // ---------------------------------------------------------------- obrigatoriedade
  console.log("\n== Fase 4: vistoria obrigatoria (bloqueia pronta e entregue) ==");
  const os7 = await abrirOS({ p_mecanico_id: idMec });
  const os8 = await abrirOS();
  const os9 = await abrirOS();
  const ofOff = (await donoA.sb.from("oficinas").select("vistoria_obrigatoria").eq("id", ofA).single()).data;
  checar("oficina nova comeca com a vistoria opcional", ofOff?.vistoria_obrigatoria === false, JSON.stringify(ofOff));
  const pr8 = await donoA.sb.rpc("marcar_pronta", { p_os_id: os8 }); // pronta antes de ligar a chave
  const atLiga = await at.sb.from("oficinas").update({ vistoria_obrigatoria: true }).eq("id", ofA).select("id");
  const liga = await donoA.sb.from("oficinas").update({ vistoria_obrigatoria: true }).eq("id", ofA).select("id, vistoria_obrigatoria");
  checar("atendente nao liga a chave; o dono liga", recusou(atLiga) && liga.data?.[0]?.vistoria_obrigatoria === true && !pr8.error, `${atLiga.error?.code ?? atLiga.data?.length}/${msg(liga)}/${msg(pr8)}`);
  const b1 = guardaMec(await mec.sb.rpc("marcar_pronta", { p_os_id: os7, p_causa: "Teste", p_solucao: "Teste" }));
  const b2 = await donoA.sb.rpc("mudar_status_os", { p_os_id: os7, p_de: "em_andamento", p_para: "pronta" });
  const b3 = await donoA.sb.rpc("entregar_os", { p_os_id: os8, p_causa: "Teste", p_solucao: "Teste", p_forma_pagamento: "pix", p_pago: true });
  checar("ligada: sem vistoria, mecanico e dono nao marcam pronta e o dono nao entrega (vistoria_obrigatoria)", [b1, b2, b3].every((r) => msg(r) === "vistoria_obrigatoria"), [b1, b2, b3].map(msg).join("/"));
  const livreItem = guardaMec(await mec.sb.rpc("adicionar_item_os", { p_chave_idempotencia: uuid(), p_os_id: os7, p_tipo: "servico", p_descricao: "Regulagem" }));
  const livreFoto = await registrarFoto(mec.sb, os7);
  const livreAbre = await abrirOS();
  checar("ligada: abrir OS, lancar item e registrar foto da OS continuam livres", !livreItem.error && !livreFoto.r.error && Boolean(livreAbre), `${msg(livreItem)}/${msg(livreFoto.r)}`);
  await mec.sb.rpc("remover_item_mecanico", { p_item_id: livreItem.data });
  await mec.sb.rpc("apagar_foto", { p_id: livreFoto.id });
  const r7 = await mec.sb.rpc("iniciar_vistoria", { p_os_id: os7 }).single();
  const b4 = await mec.sb.rpc("marcar_pronta", { p_os_id: os7 });
  checar("vistoria em rascunho nao basta (vistoria_obrigatoria)", !r7.error && msg(b4) === "vistoria_obrigatoria", `${msg(r7)}/${msg(b4)}`);
  const vr7 = await vistoriaRapida(mec.sb, os7, "recusou");
  const ok7 = await mec.sb.rpc("marcar_pronta", { p_os_id: os7, p_causa: "Teste", p_solucao: "Teste" });
  checar("mecanico conclui a vistoria ('sem assinatura: recusou') e entao marca pronta", vr7.ok && !ok7.error, `${vr7.erro}/${msg(ok7)}`);
  const vr8 = await vistoriaRapida(at.sb, os8, "motorista_ausente");
  const ok8 = await donoA.sb.rpc("entregar_os", { p_os_id: os8, p_causa: "Teste", p_solucao: "Teste", p_forma_pagamento: "pix", p_pago: true });
  checar("OS ja pronta: com a vistoria concluida (atendente), o dono entrega", vr8.ok && !ok8.error, `${vr8.erro}/${msg(ok8)}`);
  const desliga = await donoA.sb.from("oficinas").update({ vistoria_obrigatoria: false }).eq("id", ofA).select("id, vistoria_obrigatoria");
  const ok9a = await donoA.sb.rpc("marcar_pronta", { p_os_id: os9 });
  const ok9b = await donoA.sb.rpc("entregar_os", { p_os_id: os9, p_causa: "Teste", p_solucao: "Teste", p_forma_pagamento: "dinheiro", p_pago: true });
  const vos9 = (await donoA.sb.from("vw_os").select("status, vistoria_entrada_status").eq("id", os9).single()).data;
  checar("desligada: OS sem vistoria fica pronta e e entregue; vw_os sem vistoria (NULL)", desliga.data?.[0]?.vistoria_obrigatoria === false && !ok9a.error && !ok9b.error && vos9?.status === "entregue" && vos9?.vistoria_entrada_status === null, `${msg(desliga)}/${msg(ok9a)}/${msg(ok9b)}`);
  const ent9 = await donoA.sb.rpc("iniciar_vistoria", { p_os_id: os9 });
  checar("OS entregue nao inicia vistoria (os_fechada)", msg(ent9) === "os_fechada", msg(ent9));

  // ---------------------------------------------------------------- APP_URL: PDF e paginas
  if (APP_URL) {
    console.log(`\n== Fase 4: PDF e paginas (${APP_URL}) ==`);
    const [ckDono, ckAt, ckMec, ckMec2, ckB] = await Promise.all([donoA, at, mec, mec2, donoB].map((u) => cookiesDaSessao(u.session)));
    const pdf = async (id, cookie) => {
      const r = await fetch(`${APP_URL}/api/vistorias/${id}/pdf`, { headers: cookie ? { cookie } : {}, redirect: "manual" });
      const buf = Buffer.from(await r.arrayBuffer());
      return { status: r.status, tipo: r.headers.get("content-type") ?? "", cache: r.headers.get("cache-control") ?? "", inicio: buf.subarray(0, 5).toString("latin1"), bytes: buf.length };
    };
    const pdfOk = (p) => p.status === 200 && p.tipo.startsWith("application/pdf") && p.inicio === "%PDF-" && /no-store/.test(p.cache) && p.bytes > 1000;
    const det = (p) => `${p.status} ${p.tipo} ${p.inicio} ${p.cache} ${p.bytes} B`;
    for (const [rot, ck] of [["dono", ckDono], ["atendente", ckAt], ["mecanico (OS dele)", ckMec]]) {
      const p = await pdf(V1.vid, ck);
      checar(`PDF ${rot}: 200 application/pdf, comeca com %PDF, Cache-Control no-store`, pdfOk(p), det(p));
    }
    const pSemAss = await pdf(V4, ckAt);
    const pAnul = await pdf(V2.vid, ckDono);
    checar("PDF da vistoria 'sem assinatura' e da anulada tambem saem (200)", pdfOk(pSemAss) && pdfOk(pAnul), `${det(pSemAss)} | ${det(pAnul)}`);
    const pB = await pdf(V1.vid, ckB);
    const pM2 = await pdf(V1.vid, ckMec2);
    const pAnon = await pdf(V1.vid, null);
    const pRasc = await pdf(VR, ckDono);
    const pLixo = await pdf("nao-e-uuid", ckDono);
    checar("PDF: oficina B = 404, mecanico de outra OS = 404", pB.status === 404 && pM2.status === 404, `${det(pB)} | ${det(pM2)}`);
    checar("PDF: sem login = 401", pAnon.status === 401, det(pAnon));
    checar("PDF: vistoria em rascunho = 409; id invalido = 404", pRasc.status === 409 && pLixo.status === 404, `${det(pRasc)} | ${det(pLixo)}`);
    checar("PDF: respostas de erro tambem sem cache", [pB, pAnon, pRasc].every((p) => /no-store/.test(p.cache)), [pB, pAnon, pRasc].map((p) => p.cache).join(" | "));

    const pObjNull = await pdf(VObjNull, ckDono);
    checar("PDF da vistoria com objetos NULL sai (200)", pdfOk(pObjNull), det(pObjNull));
    const lObjNull = await pagina(`/os/${osObjNull}/vistoria`, ckMec);
    const lObjVazio = await pagina(`/os/${osObjVazio}/vistoria`, ckDono);
    checar("leitura: objetos NULL = 'Objetos: nao informado.' (nunca 'Nenhum objeto')", lObjNull.status === 200 && lObjNull.html.includes("Objetos: não informado.") && !lObjNull.html.includes("Nenhum objeto"), `status ${lObjNull.status}`);
    checar("leitura: lista vazia = 'Nenhum objeto.'", lObjVazio.status === 200 && lObjVazio.html.includes("Nenhum objeto.") && !lObjVazio.html.includes("Objetos: não informado."), `status ${lObjVazio.status}`);
    const lAnulada = await pagina(`/os/${os2}/vistoria?ver=${V2.vid}`, ckDono);
    checar("anulada: cabecalho 'Vistoria anulada · placa', faixa acima da assinatura e motivo legivel", lAnulada.status === 200 && lAnulada.html.includes("Vistoria anulada · ") && lAnulada.html.includes("faixa-anulada") && lAnulada.html.includes("feita na OS errada (era outro caminhão)."), `status ${lAnulada.status}`);

    const os10 = await abrirOS({ p_mecanico_id: idMec });
    const dSem = await pagina(`/os/${os10}`, ckDono);
    const dFeita = await pagina(`/os/${os1}`, ckDono);
    checar("app dono: detalhe da OS sem vistoria mostra 'Sem vistoria'", dSem.status === 200 && dSem.html.includes("Sem vistoria"), `status ${dSem.status}`);
    checar("app dono: detalhe da OS com vistoria concluida mostra 'Vistoria feita'", dFeita.status === 200 && dFeita.html.includes("Vistoria feita"), `status ${dFeita.status}`);
    const lDono = await pagina(`/os/${os1}/vistoria`, ckDono);
    checar("app dono: leitura da vistoria concluida abre (assinatura e 'Complementar')", lDono.status === 200 && lDono.html.includes(NOME_ASSINA) && lDono.html.includes("Complementar"), `status ${lDono.status}`);
    for (const [rot, cam, marca] of [
      ["detalhe da OS com vistoria", `/os/${os1}`, "Vistoria feita"],
      ["detalhe da OS sem vistoria", `/os/${os10}`, "Sem vistoria"],
      ["leitura da vistoria feita pelo dono", `/os/${os1}/vistoria`, NOME_ASSINA],
      ["leitura da vistoria dele", `/os/${os3}/vistoria`, NOME_ASSINA],
      ["vistoria em rascunho (5 passos)", `/os/${os6}/vistoria`, "ABC1D23"],
      ["/minhas-os", "/minhas-os?entregues=1", "ABC1D23"],
    ]) {
      const pg = await pagina(cam, ckMec);
      checar(`app mecanico: ${rot} sem 'R$' nem 'centavos' no HTML/payload`, pg.status === 200 && pg.html.includes(marca) && !pg.html.includes("R$") && !/centavos/i.test(pg.html), `status ${pg.status}${pg.local ? ` -> ${pg.local}` : ""}${pg.status === 200 && !pg.html.includes(marca) ? ` sem '${marca}'` : ""}`);
    }
  }
}

// ------------------------------------------------------------------ Fase 6: orcamento por link
// Criterios "testar-staging" do PLANO 19.4. O cliente e `anon` de verdade: so a chave publishable,
// sem sessao, um cliente novo por chamada (como dois aparelhos). A oficina e as contas sao as desta
// rodada. Nunca abre wa.me. Sem chave secreta nao da para simular validade vencida: esse caso fica
// no fase6_orcamento.sql (ver ARQUITETURA 13.14).
const clienteAnon = (headers) =>
  createClient(URL_SB, CHAVE, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    ...(headers ? { global: { headers } } : {}),
  });
const verLink = (token) => clienteAnon().rpc("ver_orcamento", { p_token: token });
const responderLink = (token, aprovou, nome = null, motivo = null, headers) =>
  clienteAnon(headers).rpc("responder_orcamento", { p_token: token, p_aprovou: aprovou, p_nome: nome, p_motivo: motivo });
const chavesDe = (o) => Object.keys(o ?? {}).sort().join(",");
const CHAVES_DOCUMENTO = "cliente_nome,condicoes_pagamento,itens,oficina_nome,oficina_telefone,os_numero,prazo_estimado,subtotal_pecas_centavos,subtotal_servicos_centavos,total_centavos,veiculo_marca,veiculo_modelo,veiculo_placa";
const CHAVES_ITEM = "descricao,preco_unitario_centavos,quantidade,subtotal_centavos,tipo,unidade";
const CHAVES_RESPOSTA = "nome,respondido_em,tipo";
const SO_SITUACAO = (d, s) => chavesDe(d) === "situacao" && d?.situacao === s;
const reais = (c) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2 }).format(c / 100);
const telFormatado = (t) => `(${t.slice(0, 2)}) ${t.slice(2, 7)}-${t.slice(7)}`;
const LETRAS = "ABCDEFGHJKLMNPRSTUVWXYZ";
const aleatorioDe = (s, n) => Array.from(randomBytes(n), (b) => s[b % s.length]).join("");
const placaNova = () => `${aleatorioDe(LETRAS, 3)}${aleatorioDe("0123456789", 1)}${aleatorioDe(LETRAS, 1)}${aleatorioDe("0123456789", 2)}`;
const digitos = (n) => aleatorioDe("0123456789", n);
/** A janela do limite vira a cada 10 min: nao comecar a contar em cima da virada. */
async function foraDaVirada() {
  const resto = 600 - (Math.floor(Date.now() / 1000) % 600);
  if (resto < 45) await esperar((resto + 2) * 1000);
}

// Valores longos e unicos: buscar no HTML nao pode bater por acaso em nome de arquivo ou id.
const PRECO_SERV = 8642917;
const PRECO_PECA = 3517391;
const CUSTO_PECA = 7315927;
const TOTAL_F6 = PRECO_SERV + 2 * PRECO_PECA;

async function testesFase6({ donoA, mec, at, donoB, ofA }) {
  const idMec = mec.session.user.id;
  const respostasMec = [];
  const guardaMec = (r) => (respostasMec.push(r?.data ?? null), r);
  let seq = 0;

  /** OS nova com cliente e placa proprios. `itens: false` abre sem item. */
  async function novaOS({ sb = donoA.sb, itens = true, mecanico = idMec, modo = "com_orcamento" } = {}) {
    const n = ++seq;
    const marcas = {
      n,
      placa: placaNova(),
      telefone: `119${digitos(8)}`,
      documento: digitos(11),
      cliente: `Cliente F6 ${RODADA} ${n}`,
      sintoma: `SINTOMA-SECRETO-${RODADA}-${n}`,
      observacao: `OBSERVACAO-INTERNA-${RODADA}-${n}`,
      servico: `Servico F6 ${RODADA} ${n}`,
      peca: `Peca F6 ${RODADA} ${n}`,
    };
    const ab = await sb
      .rpc("abrir_os", {
        p_chave_idempotencia: uuid(),
        p_placa: marcas.placa,
        p_cliente_nome: marcas.cliente,
        p_cliente_telefone: marcas.telefone,
        p_veiculo_tipo: "carreta",
        p_veiculo_marca: "Scania",
        p_veiculo_modelo: "R 450",
        p_km: 100000 + n,
        p_sintoma_relatado: marcas.sintoma,
        p_modo: modo,
        p_mecanico_id: mecanico,
        p_observacoes: marcas.observacao,
        ...(modo === "direto" ? { p_autorizado_por_nome: "Autorizador F6" } : {}),
      })
      .single();
    if (ab.error) throw new Error(`abrir_os F6: ${ab.error.message}`);
    const os = ab.data.os_id;
    const cid = (await sb.from("vw_os").select("cliente_id").eq("id", os).single()).data?.cliente_id;
    await sb.from("clientes").update({ documento: marcas.documento }).eq("id", cid);
    if (itens) {
      const a = await sb.rpc("adicionar_item_os", { p_chave_idempotencia: uuid(), p_os_id: os, p_tipo: "servico", p_descricao: marcas.servico, p_preco_unitario_centavos: PRECO_SERV });
      const b = await sb.rpc("adicionar_item_os", { p_chave_idempotencia: uuid(), p_os_id: os, p_tipo: "peca", p_descricao: marcas.peca, p_quantidade: 2, p_preco_unitario_centavos: PRECO_PECA, p_custo_unitario_centavos: CUSTO_PECA });
      if (a.error || b.error) throw new Error(`itens F6: ${msg(a)}/${msg(b)}`);
      marcas.itemServico = a.data;
      marcas.itemPeca = b.data;
    }
    return { id: os, numero: ab.data.numero, ...marcas };
  }
  const enviar = (sb, id, total = TOTAL_F6, chave = uuid(), extra = {}) =>
    sb.rpc("enviar_orcamento", { p_os_id: id, p_chave_idempotencia: chave, p_total_conferido_centavos: total, ...extra }).single();
  const reenviar = (sb, id, chave = uuid()) => sb.rpc("reenviar_orcamento", { p_os_id: id, p_chave_idempotencia: chave }).single();
  /** OS nova ja enviada, com o token na mao. */
  async function osComLink(opcoes) {
    const os = await novaOS(opcoes);
    const e = await enviar(donoA.sb, os.id);
    if (e.error) throw new Error(`enviar F6: ${e.error.message}`);
    return { ...os, token: e.data.token };
  }
  const vwOs = async (id, sb = donoA.sb) =>
    (await sb.from("vw_os").select("status, modo, valor_aprovado_centavos, total_centavos, orcamento_aprovacao_canal, orcamento_aprovado_por_nome, orcamento_aprovacao_registrada_por_nome, orcamento_respondido, orcamento_respondido_em, orcamento_link_situacao, orcamento_itens_travados, itens_apos_aprovacao").eq("id", id).single()).data;
  const provasDe = async (id, sb = donoA.sb) => (await sb.from("vw_orcamento_provas").select("*").eq("os_id", id).order("respondido_em")).data ?? [];
  const versoesDe = async (id, sb = donoA.sb) => (await sb.from("vw_orcamento_versoes").select("*").eq("os_id", id).order("numero")).data ?? [];
  const linksDe = async (id, sb = donoA.sb) => (await sb.from("orcamento_links").select("id, versao_id, expira_em, criado_em, revogado_em, revogado_motivo").eq("os_id", id).order("criado_em")).data ?? [];
  const histDe = async (id, sb = donoA.sb) => (await sb.from("vw_os_historico").select("evento, de_status, para_status, observacao, por, por_nome, em").eq("os_id", id).order("em")).data ?? [];
  /** Tudo que abrir o link nao pode mudar. */
  const estadoDe = async (id) => JSON.stringify({ os: await vwOs(id), provas: await provasDe(id), versoes: await versoesDe(id), links: await linksDe(id), hist: await histDe(id) });

  // ---------------------------------------------------------------- anon
  console.log("\n== Fase 6: anon nao le nada do sistema ==");
  const tabelas = objetosDaApi();
  checar(`anon: lista de tabelas e views vem das migracoes (${tabelas.length})`, tabelas.length > 40 && tabelas.includes("orcamento_respostas") && tabelas.includes("vw_orcamento_provas"), String(tabelas.length));
  const lidas = [];
  for (const t of tabelas) {
    const r = await clienteAnon().from(t).select("*").limit(1);
    if ((r.data ?? []).length > 0) lidas.push(t);
  }
  checar("anon: 0 linhas em toda tabela e view das migracoes", lidas.length === 0, lidas.join(", "));
  const insAnon = await clienteAnon().from("orcamento_respostas").insert({ aprovou: true });
  checar("anon: nao grava resposta direto na tabela", Boolean(insAnon.error), insAnon.error?.code);
  for (const [fn, args] of [
    ["enviar_orcamento", { p_os_id: uuid(), p_chave_idempotencia: uuid(), p_total_conferido_centavos: 1 }],
    ["reenviar_orcamento", { p_os_id: uuid(), p_chave_idempotencia: uuid() }],
    ["cancelar_link_orcamento", { p_os_id: uuid() }],
    ["alterar_orcamento", { p_os_id: uuid() }],
    ["previa_orcamento", { p_os_id: uuid() }],
    ["conferir_orcamento", { p_versao_id: uuid() }],
    ["registrar_resposta_orcamento", { p_os_id: uuid(), p_de: "orcamento_enviado", p_aprovou: true, p_canal: "telefone" }],
    ["mudar_status_os", { p_os_id: uuid(), p_de: "aprovada", p_para: "aguardando_orcamento" }],
  ]) {
    const r = await clienteAnon().rpc(fn, args);
    checar(`anon: nao executa ${fn}`, Boolean(r.error) && r.data === null, r.error?.code ?? "sem erro");
  }
  const logadoVer = await donoA.sb.rpc("ver_orcamento", { p_token: "0".repeat(64) });
  const logadoResp = await donoA.sb.rpc("responder_orcamento", { p_token: "0".repeat(64), p_aprovou: true, p_nome: "Dono" });
  checar("logado: nao chama as RPCs publicas (42501)", logadoVer.error?.code === "42501" && logadoResp.error?.code === "42501", `${logadoVer.error?.code}/${logadoResp.error?.code}`);

  // ---------------------------------------------------------------- envio
  console.log("\n== Fase 6: envio ==");
  const semItem = await novaOS({ itens: false });
  const eSem = await enviar(donoA.sb, semItem.id, 0);
  checar("nao envia orcamento sem item", msg(eSem) === "orcamento_sem_itens", msg(eSem));
  const semPreco = await novaOS({ itens: false });
  await donoA.sb.rpc("adicionar_item_os", { p_chave_idempotencia: uuid(), p_os_id: semPreco.id, p_tipo: "peca", p_descricao: "Sem preco F6" });
  const eSemPreco = await enviar(at.sb, semPreco.id, 0);
  checar("nao envia orcamento com item sem preco", msg(eSemPreco) === "os_itens_sem_preco", msg(eSemPreco));
  const statusSem = await vwOs(semPreco.id);
  checar("envio recusado nao muda a OS nem gera link", statusSem?.status === "aguardando_orcamento" && (await linksDe(semPreco.id)).length === 0 && (await versoesDe(semPreco.id)).length === 0);
  const direta = await novaOS({ itens: false, modo: "direto" });
  const eDireta = await enviar(donoA.sb, direta.id, 0);
  checar("modo direto nao envia orcamento", msg(eDireta) === "transicao_invalida", msg(eDireta));

  const A = await novaOS();
  const eTotal = await enviar(donoA.sb, A.id, TOTAL_F6 + 1);
  checar("total diferente do que a tela mostrou: orcamento_mudou, nada gerado", msg(eTotal) === "orcamento_mudou" && (await linksDe(A.id)).length === 0, msg(eTotal));
  const eMec = guardaMec(await enviar(mec.sb, A.id));
  checar("mecanico nao envia", msg(eMec) === "acesso_negado", msg(eMec));
  const previa = await donoA.sb.rpc("previa_orcamento", { p_os_id: A.id });
  checar("previa nao grava versao", previa.data?.documento?.total_centavos === TOTAL_F6 && (await versoesDe(A.id)).length === 0, msg(previa));
  const eA = await enviar(at.sb, A.id, TOTAL_F6, uuid(), { p_prazo_estimado: "3 dias", p_condicoes_pagamento: "Pix" });
  const tokenA = eA.data?.token;
  checar("atendente envia: token de 64 hex, versao 1, OS em orcamento_enviado", /^[0-9a-f]{64}$/.test(tokenA ?? "") && eA.data?.versao_numero === 1 && eA.data?.ja_existia === false && (await vwOs(A.id))?.status === "orcamento_enviado", msg(eA));
  const fimValidade = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "medium" }).format(new Date(eA.data?.expira_em));
  const dia10 = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", dateStyle: "short" }).format(new Date(Date.now() + 10 * 86400000));
  checar("validade: 23:59:59 do 10o dia no fuso da oficina", fimValidade === `${dia10} 23:59:59`, fimValidade);

  // ---------------------------------------------------------------- lista fechada
  console.log("\n== Fase 6: o link so mostra aquele orcamento ==");
  const vA = await verLink(tokenA);
  checar("anon: ver_orcamento responde sem login, situacao aberto", vA.data?.situacao === "aberto", msg(vA));
  checar("anon: chaves da resposta exatamente as da lista", chavesDe(vA.data) === "documento,expira_em,resposta,situacao" && vA.data?.resposta === null, chavesDe(vA.data));
  checar("anon: chaves do documento exatamente as da lista", chavesDe(vA.data?.documento) === CHAVES_DOCUMENTO, chavesDe(vA.data?.documento));
  checar("anon: chaves de cada item exatamente as da lista", (vA.data?.documento?.itens ?? []).length === 2 && vA.data.documento.itens.every((i) => chavesDe(i) === CHAVES_ITEM), chavesDe(vA.data?.documento?.itens?.[0]));
  const docA = vA.data?.documento;
  checar("anon: documento certo (placa, cliente, subtotais, total, prazo, condicoes)", docA?.veiculo_placa === A.placa && docA?.cliente_nome === A.cliente && docA?.subtotal_servicos_centavos === PRECO_SERV && docA?.subtotal_pecas_centavos === 2 * PRECO_PECA && docA?.total_centavos === TOTAL_F6 && docA?.prazo_estimado === "3 dias" && docA?.condicoes_pagamento === "Pix", JSON.stringify(docA)?.slice(0, 200));
  const jsonA = JSON.stringify(vA.data);
  const proibidosA = proibidosDe(A, ofA);
  const achadosA = proibidosA.filter((t) => jsonA.includes(t));
  checar("anon: resposta sem custo, telefone, documento, sintoma, observacao, mecanico nem id interno", achadosA.length === 0, achadosA.join(", "));
  checar("anon: resposta sem nome de chave proibido", !/custo|margem|documento_cliente|telefone_cliente|oficina_id|os_id|versao|hash|mecanico|sintoma|observac/i.test(Object.keys(vA.data ?? {}).concat(Object.keys(docA ?? {})).join(",")));

  const B = await osComLink();
  const zB = await novaOS({ sb: donoB.sb, itens: false, mecanico: null });
  await donoB.sb.rpc("adicionar_item_os", { p_chave_idempotencia: uuid(), p_os_id: zB.id, p_tipo: "servico", p_descricao: zB.servico, p_preco_unitario_centavos: 123456 });
  const eZ = await enviar(donoB.sb, zB.id, 123456);
  const [vB, vZ] = await Promise.all([verLink(B.token), verLink(eZ.data?.token)]);
  const [jB, jZ] = [JSON.stringify(vB.data), JSON.stringify(vZ.data)];
  checar("token de outra OS da oficina traz so a dele", jB.includes(B.placa) && !jB.includes(A.placa) && !jB.includes(A.servico) && !jB.includes(A.cliente), B.placa);
  checar("token de outra oficina traz so a dela", jZ.includes(zB.placa) && !jZ.includes(A.placa) && !jZ.includes(`Oficina Teste A`), zB.placa);
  const hashToken = createHash("sha256").update(tokenA).digest("hex");
  for (const [rot, tk] of [["inventado", "0".repeat(64)], ["aleatorio", randomBytes(32).toString("hex")], ["malformado", "x"], ["vazio", ""], ["com SQL", "' or '1'='1"], ["hash do token real", hashToken]]) {
    const [v, r] = await Promise.all([verLink(tk), responderLink(tk, true, "Invasor Teste")]);
    checar(`token ${rot}: nao_encontrado, so { situacao }, na leitura e na resposta`, SO_SITUACAO(v.data, "nao_encontrado") && SO_SITUACAO(r.data, "nao_encontrado"), `${JSON.stringify(v.data)} ${JSON.stringify(r.data)} ${msg(v)}`);
  }
  const linkCru = await donoA.sb.from("orcamento_links").select("token_hash").eq("os_id", A.id);
  const linkTudo = await donoA.sb.from("orcamento_links").select("*").eq("os_id", A.id);
  checar("dono nao le token_hash, nem por select *", Boolean(linkCru.error) && Boolean(linkTudo.error), `${linkCru.error?.code}/${linkTudo.error?.code}`);
  const tudoA = JSON.stringify({ l: await linksDe(A.id), v: await versoesDe(A.id), h: await histDe(A.id) });
  checar("o token nao aparece em nenhuma linha que o balcao le", !tudoA.includes(tokenA));
  const peloGet = await fetch(`${URL_SB}/rest/v1/rpc/ver_orcamento?p_token=${tokenA}`, { headers: { apikey: CHAVE, Authorization: `Bearer ${CHAVE}` } });
  const textoGet = await peloGet.text();
  checar("PostgREST: ver_orcamento por GET falha e nao entrega dado", !peloGet.ok && !textoGet.includes(A.placa) && !textoGet.includes(A.servico), `${peloGet.status}`);

  // ---------------------------------------------------------------- congelada + trava
  console.log("\n== Fase 6: versao congelada e itens travados ==");
  const servCat = await donoA.sb.from("catalogo_servicos").insert({ nome: `Servico catalogo F6 ${RODADA}` }).select("id").single();
  await donoA.sb.from("catalogo_servicos_precos").upsert({ servico_id: servCat.data?.id, preco_padrao_centavos: 400000 });
  const C = await novaOS({ itens: false });
  await donoA.sb.rpc("adicionar_item_os", { p_chave_idempotencia: uuid(), p_os_id: C.id, p_tipo: "servico", p_servico_id: servCat.data?.id });
  const eC = await enviar(donoA.sb, C.id, 400000);
  const cAntes = (await verLink(eC.data?.token)).data?.documento;
  const mudaCat = await donoA.sb.from("catalogo_servicos_precos").upsert({ servico_id: servCat.data?.id, preco_padrao_centavos: 999900 });
  const cid = (await donoA.sb.from("vw_os").select("cliente_id").eq("id", C.id).single()).data?.cliente_id;
  const mudaCli = await donoA.sb.from("clientes").update({ nome: `Nome novo F6 ${RODADA}` }).eq("id", cid);
  const cDepois = (await verLink(eC.data?.token)).data?.documento;
  checar("mudar catalogo e cliente depois do envio nao muda a pagina", !mudaCat.error && !mudaCli.error && Boolean(cAntes) && JSON.stringify(cAntes) === JSON.stringify(cDepois), `${msg(mudaCat)}/${msg(mudaCli)}`);

  const custoDepois = await donoA.sb.from("os_itens_custos").upsert({ item_id: A.itemPeca, custo_unitario_centavos: CUSTO_PECA + 1 });
  checar("custo continua livre para o dono e nao muda a pagina", !custoDepois.error && JSON.stringify((await verLink(tokenA)).data?.documento) === JSON.stringify(docA), msg(custoDepois));
  for (const [rot, sb] of [["dono", donoA.sb], ["atendente", at.sb]]) {
    const upd = await sb.from("os_itens").update({ descricao: "Mudou" }).eq("id", A.itemServico).select("id");
    const prc = await sb.from("os_itens_precos").update({ preco_unitario_centavos: 1 }).eq("item_id", A.itemServico).select("item_id");
    const del = await sb.from("os_itens").delete().eq("id", A.itemServico).select("id");
    const delP = await sb.from("os_itens_precos").delete().eq("item_id", A.itemServico).select("item_id");
    const add = await sb.rpc("adicionar_item_os", { p_chave_idempotencia: uuid(), p_os_id: A.id, p_tipo: "servico", p_descricao: "Novo", p_preco_unitario_centavos: 1 });
    checar(`${rot}: escrita direta em os_itens e os_itens_precos e adicionar item: orcamento_travado`, [upd, prc, del, delP, add].every((r) => msg(r) === "orcamento_travado"), [upd, prc, del, delP, add].map(msg).join("/"));
  }
  const updMecTrava = guardaMec(await mec.sb.from("os_itens").update({ descricao: "Mudou" }).eq("id", A.itemServico).select("id"));
  checar("mecanico: nao muda item travado", Boolean(updMecTrava.error) || (updMecTrava.data ?? []).length === 0, msg(updMecTrava));
  const vTrav = await vwOs(A.id);
  checar("vw_os: itens travados, total intacto, link aberto", vTrav?.orcamento_itens_travados === true && vTrav?.total_centavos === TOTAL_F6 && vTrav?.orcamento_link_situacao === "aberto", JSON.stringify(vTrav));

  // ---------------------------------------------------------------- reenviar, cancelar, alterar
  console.log("\n== Fase 6: reenviar, cancelar link, alterar ==");
  const chaveR = uuid();
  const r1 = await reenviar(donoA.sb, A.id, chaveR);
  const velhoSub = await verLink(tokenA);
  const respVelho = await responderLink(tokenA, true, "Cliente Velho");
  checar("reenviar: mesma versao, token novo; o antigo vira substituido, so { situacao }", r1.data?.versao_numero === 1 && r1.data?.token !== tokenA && SO_SITUACAO(velhoSub.data, "substituido") && SO_SITUACAO(respVelho.data, "substituido"), `${JSON.stringify(velhoSub.data)} ${JSON.stringify(respVelho.data)}`);
  checar("reenviar: resposta com o token antigo nao grava nada", (await provasDe(A.id)).length === 0 && (await vwOs(A.id))?.status === "orcamento_enviado");
  const r1b = await reenviar(donoA.sb, A.id, chaveR);
  const sub2 = await verLink(r1.data?.token);
  const links2 = await linksDe(A.id);
  checar("reenviar repetido (mesma chave): sem versao nova, token trocado, 1 link ativo", r1b.data?.ja_existia === true && SO_SITUACAO(sub2.data, "substituido") && (await verLink(r1b.data?.token)).data?.situacao === "aberto" && links2.filter((l) => !l.revogado_em).length === 1 && (await versoesDe(A.id)).length === 1, JSON.stringify(r1b.data && { ja: r1b.data.ja_existia }));
  const tokenR = r1b.data?.token;
  const canc = await at.sb.rpc("cancelar_link_orcamento", { p_os_id: A.id });
  const vCanc = await verLink(tokenR);
  const respCanc = await responderLink(tokenR, true, "Cliente Cancelado");
  const vwCanc = await vwOs(A.id);
  checar("cancelar link: encerrado, OS continua enviada e travada", canc.data === true && SO_SITUACAO(vCanc.data, "encerrado") && SO_SITUACAO(respCanc.data, "encerrado") && vwCanc?.status === "orcamento_enviado" && vwCanc?.orcamento_itens_travados === true, msg(canc));
  const canc2 = await at.sb.rpc("cancelar_link_orcamento", { p_os_id: A.id });
  checar("cancelar de novo: false (nao havia link ativo)", canc2.data === false, msg(canc2));
  const delTrava = await donoA.sb.from("os_itens").delete().eq("id", A.itemServico).select("id");
  checar("link cancelado: itens continuam travados", msg(delTrava) === "orcamento_travado", msg(delTrava));
  const r2 = await reenviar(at.sb, A.id);
  checar("reenviar depois de cancelar funciona, mesma versao", r2.data?.versao_numero === 1 && (await verLink(r2.data?.token)).data?.situacao === "aberto", msg(r2));

  const paginaAberta = r2.data?.token;
  const alt = await donoA.sb.rpc("alterar_orcamento", { p_os_id: A.id });
  const vAlt = await verLink(paginaAberta);
  const antesResp = await provasDe(A.id);
  const respAlt = await responderLink(paginaAberta, true, "Cliente Pagina Velha");
  const vwAlt = await vwOs(A.id);
  checar("alterar: link antigo vira atualizado, so { situacao }", !alt.error && SO_SITUACAO(vAlt.data, "atualizado") && SO_SITUACAO(respAlt.data, "atualizado"), `${msg(alt)} ${JSON.stringify(respAlt.data)}`);
  checar("pagina aberta na versao antiga: aviso e nada gravado", antesResp.length === 0 && (await provasDe(A.id)).length === 0 && vwAlt?.status === "aguardando_orcamento");
  const alt2 = await donoA.sb.rpc("alterar_orcamento", { p_os_id: A.id });
  checar("alterar de novo nao faz nada", !alt2.error && (await vwOs(A.id))?.status === "aguardando_orcamento", msg(alt2));
  const editar = await donoA.sb.from("os_itens_precos").update({ preco_unitario_centavos: PRECO_SERV + 100 }).eq("item_id", A.itemServico).select("item_id");
  const e2 = await enviar(donoA.sb, A.id, TOTAL_F6 + 100);
  const v2 = await verLink(e2.data?.token);
  const versoesA = await versoesDe(A.id);
  checar("depois de alterar: itens liberados, novo envio = versao 2 com o valor novo", editar.data?.length === 1 && e2.data?.versao_numero === 2 && v2.data?.documento?.total_centavos === TOTAL_F6 + 100, `${msg(editar)}/${msg(e2)}`);
  checar("versao 1 continua guardada com o valor antigo", versoesA.length === 2 && versoesA[0].total_centavos === TOTAL_F6 && versoesA[1].total_centavos === TOTAL_F6 + 100);
  const repete = await enviar(donoA.sb, A.id, TOTAL_F6 + 100);
  checar("enviar outra chave com versao vigente: orcamento_ja_enviado", msg(repete) === "orcamento_ja_enviado", msg(repete));
  const tokenA2 = e2.data?.token;

  // ---------------------------------------------------------------- aprovar
  console.log("\n== Fase 6: aprovar pelo link ==");
  for (const [rot, args, erro] of [
    ["sem nome", [tokenA2, true, null], "nome_obrigatorio"],
    ["com 1 letra", [tokenA2, true, "A"], "nome_obrigatorio"],
    ["com 81 letras", [tokenA2, true, "A".repeat(81)], "nome_grande_demais"],
  ]) {
    const r = await responderLink(...args);
    checar(`aprovar ${rot}: ${erro}, nada gravado`, r.data?.situacao === "aberto" && r.data?.erro === erro && (await provasDe(A.id)).length === 0, JSON.stringify(r.data));
  }
  const NOME_CLI = `Carlos Prova ${RODADA}`;
  // Forjar o CF-Connecting-IP nem chega ao banco: a Cloudflare barra (403). Sem resposta gravada.
  const IP_FORJADO = "203.0.113.77";
  const forjaCf = await responderLink(tokenA2, true, NOME_CLI, null, { "CF-Connecting-IP": IP_FORJADO });
  checar("forjar CF-Connecting-IP: barrado na borda (403), nada gravado", forjaCf.status === 403 && forjaCf.data === null && (await provasDe(A.id)).length === 0, `${forjaCf.status}`);
  const XFF_FORJADO = "198.51.100.9";
  const resp = await responderLink(tokenA2, true, NOME_CLI, null, { "X-Forwarded-For": XFF_FORJADO, "User-Agent": `NavegadorF6/${RODADA}` });
  checar("anon aprova: aplicada, com a resposta", resp.data?.situacao === "aprovado" && resp.data?.aplicada === true && chavesDe(resp.data?.resposta) === CHAVES_RESPOSTA && resp.data?.resposta?.tipo === "aprovou" && resp.data?.resposta?.nome === NOME_CLI, JSON.stringify(resp.data));
  const vwAp = await vwOs(A.id);
  checar("OS aprovada, valor aprovado = total da versao, canal link, sem usuario", vwAp?.status === "aprovada" && vwAp?.valor_aprovado_centavos === TOTAL_F6 + 100 && vwAp?.orcamento_aprovacao_canal === "link" && vwAp?.orcamento_aprovado_por_nome === NOME_CLI && vwAp?.orcamento_aprovacao_registrada_por_nome === null, JSON.stringify(vwAp));
  const provasA = await provasDe(A.id);
  checar("1 prova: canal link, nome, valor, versao 2, sem usuario", provasA.length === 1 && provasA[0].canal === "link" && provasA[0].aprovou === true && provasA[0].respondente_nome === NOME_CLI && provasA[0].valor_centavos === TOTAL_F6 + 100 && provasA[0].versao_numero === 2 && provasA[0].registrada_por_nome === null, JSON.stringify(provasA[0]));
  const confere = await at.sb.rpc("conferir_orcamento", { p_versao_id: versoesA[1].id });
  checar("hash confere com o conteudo", confere.data === true, msg(confere));
  const histAp = (await histDe(A.id)).filter((h) => h.evento === "aprovacao");
  checar("historico: aprovacao sem usuario, texto do link para o balcao", histAp.length === 1 && histAp[0].por === null && histAp[0].observacao === `por link. Nome informado: ${NOME_CLI}` && histAp[0].para_status === "aprovada", JSON.stringify(histAp));
  const histMec = guardaMec({ data: await histDe(A.id, mec.sb) }).data;
  const apMec = histMec.filter((h) => h.evento === "aprovacao");
  checar("historico do mecanico: aprovacao sem canal e sem nome; nada de evento do link com texto", apMec.length === 1 && apMec[0].observacao === null && !JSON.stringify(histMec).includes(NOME_CLI) && histMec.filter((h) => h.evento === "orcamento_link").every((h) => h.observacao === null), JSON.stringify(apMec));
  const rede = await donoA.sb.from("orcamento_resposta_rede").select("ip, ip_fonte, user_agent").eq("resposta_id", provasA[0].id).maybeSingle();
  console.log(`info    fonte do IP da prova: ${rede.data?.ip_fonte ?? "NULL"}; IP gravado ${rede.data?.ip ? "preenchido" : "NULL"}`);
  checar("prova: IP pela Cloudflare; X-Forwarded-For forjado nao vale", rede.data?.ip_fonte === "cf-connecting-ip" && Boolean(rede.data?.ip) && rede.data?.ip !== XFF_FORJADO, `${rede.data?.ip_fonte} ${msg(rede)}`);
  checar("prova: navegador gravado do cabecalho", rede.data?.user_agent === `NavegadorF6/${RODADA}`, rede.data?.user_agent);

  const repetir = await responderLink(tokenA2, true, NOME_CLI);
  checar("repetir a mesma resposta: sucesso, sem duplicar", repetir.data?.situacao === "aprovado" && repetir.data?.aplicada === false && (await provasDe(A.id)).length === 1, JSON.stringify(repetir.data));
  const trocar = await responderLink(tokenA2, false, null, "Mudei de ideia");
  checar("recusar depois de aprovar: vale a primeira", trocar.data?.situacao === "aprovado" && trocar.data?.aplicada === false && trocar.data?.resposta?.tipo === "aprovou" && (await vwOs(A.id))?.status === "aprovada", JSON.stringify(trocar.data));
  const vAprov = await verLink(tokenA2);
  checar("pagina depois de aprovar mostra o orcamento e a resposta", vAprov.data?.situacao === "aprovado" && vAprov.data?.documento?.total_centavos === TOTAL_F6 + 100 && chavesDe(vAprov.data?.resposta) === CHAVES_RESPOSTA, chavesDe(vAprov.data));
  checar("respondidos: conta a OS aprovada pelo link", vwAp?.orcamento_respondido === true && Boolean(vwAp?.orcamento_respondido_em));

  // ---------------------------------------------------------------- item depois da aprovacao
  console.log("\n== Fase 6: item depois da aprovacao ==");
  const ITEM_APOS = 4210873;
  const depois = await at.sb.rpc("adicionar_item_os", { p_chave_idempotencia: uuid(), p_os_id: A.id, p_tipo: "servico", p_descricao: `Apos aprovacao F6 ${RODADA}`, p_preco_unitario_centavos: ITEM_APOS });
  const marcado = (await donoA.sb.from("vw_os_itens").select("apos_aprovacao").eq("id", depois.data).single()).data;
  const vwDep = await vwOs(A.id);
  checar("item novo marcado 'apos a aprovacao'", !depois.error && marcado?.apos_aprovacao === true && vwDep?.itens_apos_aprovacao === 1, msg(depois));
  checar("aprovado continua o total da versao; atual soma o item", vwDep?.status === "aprovada" && vwDep?.valor_aprovado_centavos === TOTAL_F6 + 100 && vwDep?.total_centavos === TOTAL_F6 + 100 + ITEM_APOS, JSON.stringify(vwDep));
  const vDep = await versoesDe(A.id);
  checar("versao aprovada nao muda; a pagina continua igual", JSON.stringify(vDep) === JSON.stringify(versoesA) && !JSON.stringify((await verLink(tokenA2)).data).includes("Apos aprovacao F6"));
  const conf2 = await donoA.sb.rpc("conferir_orcamento", { p_versao_id: versoesA[1].id });
  checar("hash continua conferindo depois do item novo", conf2.data === true, msg(conf2));

  // ---------------------------------------------------------------- imutavel
  console.log("\n== Fase 6: versao e prova nao mudam, para os 3 papeis ==");
  const fotoProva = JSON.stringify(await provasDe(A.id));
  const fotoVersao = JSON.stringify(await versoesDe(A.id));
  for (const [rot, u] of [["dono", donoA], ["atendente", at], ["mecanico", mec]]) {
    const tent = [
      await u.sb.from("orcamento_versoes").update({ total_centavos: 1 }).eq("os_id", A.id).select("id"),
      await u.sb.from("orcamento_versoes").delete().eq("os_id", A.id).select("id"),
      await u.sb.from("orcamento_respostas").update({ aprovou: false, respondente_nome: "Outro" }).eq("os_id", A.id).select("id"),
      await u.sb.from("orcamento_respostas").delete().eq("os_id", A.id).select("id"),
      await u.sb.from("orcamento_links").update({ expira_em: "2099-01-01T00:00:00Z" }).eq("os_id", A.id).select("id"),
      await u.sb.from("orcamento_links").delete().eq("os_id", A.id).select("id"),
      await u.sb.from("orcamento_resposta_rede").delete().eq("resposta_id", provasA[0].id).select("resposta_id"),
      await u.sb.from("orcamento_versoes").insert({ os_id: A.id, numero: 99 }).select("id"),
    ];
    const barrou = tent.every((r) => Boolean(r.error) || (r.data ?? []).length === 0);
    checar(`${rot}: nao altera nem apaga versao, resposta, link ou rede`, barrou, tent.map((r) => r.error?.code ?? `${r.data?.length}`).join("/"));
  }
  checar("depois das tentativas: prova e versao iguais", JSON.stringify(await provasDe(A.id)) === fotoProva && JSON.stringify(await versoesDe(A.id)) === fotoVersao);

  // ---------------------------------------------------------------- desfazer
  console.log("\n== Fase 6: desfazer ==");
  const desfMec = guardaMec(await mec.sb.rpc("mudar_status_os", { p_os_id: A.id, p_de: "aprovada", p_para: "aguardando_orcamento" }));
  checar("mecanico nao desfaz a aprovacao", msg(desfMec) === "acesso_negado", msg(desfMec));
  const desf = await at.sb.rpc("mudar_status_os", { p_os_id: A.id, p_de: "aprovada", p_para: "aguardando_orcamento" });
  const vwDesf = await vwOs(A.id);
  const prDesf = (await provasDe(A.id))[0];
  checar("desfazer: volta para aguardando, limpa o estado atual", !desf.error && vwDesf?.status === "aguardando_orcamento" && vwDesf?.valor_aprovado_centavos === null && vwDesf?.orcamento_respondido === false, msg(desf));
  checar("desfazer: a prova fica, marcada com quem e quando", prDesf?.respondente_nome === NOME_CLI && prDesf?.valor_centavos === TOTAL_F6 + 100 && Boolean(prDesf?.desfeita_em) && prDesf?.desfeita_por_nome === "Atendente Teste", JSON.stringify(prDesf));
  const [vDesf, rDesf] = [await verLink(tokenA2), await responderLink(tokenA2, true, NOME_CLI)];
  checar("desfazer: o link nao volta a valer (encerrado, so { situacao })", SO_SITUACAO(vDesf.data, "encerrado") && SO_SITUACAO(rDesf.data, "encerrado") && (await provasDe(A.id)).length === 1, `${JSON.stringify(vDesf.data)} ${JSON.stringify(rDesf.data)}`);
  const motivoLink = (await linksDe(A.id)).at(-1)?.revogado_motivo;
  checar("desfazer: motivo da revogacao = desfeito; historico evento desfazer", motivoLink === "desfeito" && (await histDe(A.id)).some((h) => h.evento === "desfazer" && h.de_status === "aprovada"), motivoLink);
  const conf3 = await donoA.sb.rpc("conferir_orcamento", { p_versao_id: versoesA[1].id });
  const desfRecolhe = await donoA.sb.from("orcamento_respostas").update({ desfeita_em: null }).eq("id", prDesf?.id).select("id");
  checar("desfeita: hash confere e a marca nao sai", conf3.data === true && (Boolean(desfRecolhe.error) || (desfRecolhe.data ?? []).length === 0) && Boolean((await provasDe(A.id))[0]?.desfeita_em), `${msg(conf3)}/${desfRecolhe.error?.code}`);

  // ---------------------------------------------------------------- recusar
  console.log("\n== Fase 6: recusar pelo link ==");
  const R = await osComLink();
  const MOTIVO = `Achei caro ${RODADA}`;
  const rRec = await responderLink(R.token, false, null, MOTIVO);
  const vwRec = await vwOs(R.id);
  checar("anon recusa sem nome: aplicada; nome nulo aceito", rRec.data?.situacao === "recusado" && rRec.data?.aplicada === true && rRec.data?.resposta?.tipo === "recusou" && rRec.data?.resposta?.nome === null, JSON.stringify(rRec.data));
  checar("recusa nunca cancela: volta para aguardando, itens liberados, em respondidos", vwRec?.status === "aguardando_orcamento" && vwRec?.orcamento_itens_travados === false && vwRec?.orcamento_respondido === true && vwRec?.orcamento_link_situacao === "recusado", JSON.stringify(vwRec));
  const histRec = (await histDe(R.id)).filter((h) => h.evento === "recusa");
  checar("historico do balcao: recusa com o motivo, sem usuario", histRec.length === 1 && histRec[0].por === null && histRec[0].observacao === `Cliente recusou por link: ${MOTIVO}`, JSON.stringify(histRec));
  const histRecMec = guardaMec({ data: await histDe(R.id, mec.sb) }).data.filter((h) => h.evento === "recusa");
  checar("historico do mecanico: recusa sem o motivo", histRecMec.length === 1 && histRecMec[0].observacao === null, JSON.stringify(histRecMec));
  const vRec = await verLink(R.token);
  checar("pagina da recusa: o motivo nao volta", vRec.data?.situacao === "recusado" && chavesDe(vRec.data?.resposta) === CHAVES_RESPOSTA && !JSON.stringify(vRec.data).includes(MOTIVO), JSON.stringify(vRec.data?.resposta));
  const rRec1 = await responderLink(R.token, true, "Mudei de Ideia");
  checar("aprovar depois de recusar pelo link: vale a primeira", rRec1.data?.situacao === "recusado" && rRec1.data?.aplicada === false && (await vwOs(R.id))?.status === "aguardando_orcamento", JSON.stringify(rRec1.data));
  const grande = await osComLink();
  const rGrande = await responderLink(grande.token, false, null, "M".repeat(501));
  checar("motivo com mais de 500: motivo_grande_demais, nada gravado", rGrande.data?.erro === "motivo_grande_demais" && (await provasDe(grande.id)).length === 0, JSON.stringify(rGrande.data));
  const maoDepois = await at.sb.rpc("registrar_resposta_orcamento", { p_os_id: R.id, p_de: "aguardando_orcamento", p_aprovou: true, p_canal: "telefone", p_quem_respondeu: "Motorista" });
  const vwMaoD = await vwOs(R.id);
  const prR = await provasDe(R.id);
  checar("recusa no link + aceite por telefone: aprovada, duas respostas guardadas, nao conta em respondidos", !maoDepois.error && vwMaoD?.status === "aprovada" && vwMaoD?.orcamento_respondido === false && prR.length === 2 && prR[0].canal === "link" && prR[1].canal === "telefone" && prR[1].registrada_por_nome === "Atendente Teste", `${msg(maoDepois)} ${JSON.stringify(vwMaoD)}`);
  checar("link recusado e depois marcado a mao: encerrado", SO_SITUACAO((await verLink(R.token)).data, "encerrado"));

  // ---------------------------------------------------------------- mao, cancelar, modo
  console.log("\n== Fase 6: convivencia com a mao, cancelar e trocar modo ==");
  const M = await osComLink();
  const maoAp = await at.sb.rpc("registrar_resposta_orcamento", { p_os_id: M.id, p_de: "orcamento_enviado", p_aprovou: true, p_canal: "telefone", p_quem_respondeu: "Ricardo" });
  const vwM = await vwOs(M.id);
  const prM = await provasDe(M.id);
  const hM = await histDe(M.id);
  checar("a mao com link ativo: aprova, valor = versao, marcado por quem marcou", !maoAp.error && vwM?.status === "aprovada" && vwM?.valor_aprovado_centavos === TOTAL_F6 && vwM?.orcamento_aprovacao_canal === "telefone" && vwM?.orcamento_aprovacao_registrada_por_nome === "Atendente Teste" && vwM?.orcamento_respondido === false, msg(maoAp));
  checar("a mao: prova com canal telefone, usa a versao enviada", prM.length === 1 && prM[0].canal === "telefone" && prM[0].versao_numero === 1 && prM[0].respondente_nome === "Ricardo" && (await versoesDe(M.id)).length === 1, JSON.stringify(prM[0]));
  const [vM, rM] = [await verLink(M.token), await responderLink(M.token, true, "Cliente Tarde")];
  checar("a mao: revoga o link (encerrado), nada gravado", SO_SITUACAO(vM.data, "encerrado") && SO_SITUACAO(rM.data, "encerrado") && (await provasDe(M.id)).length === 1 && (await linksDe(M.id))[0].revogado_motivo === "resposta_manual");
  const hAprovM = hM.filter((h) => h.evento === "aprovacao");
  const hAprovA = (await histDe(A.id)).filter((h) => h.evento === "aprovacao");
  checar("historico distingue a mao (por quem marcou) do link (sem usuario)", hAprovM[0]?.observacao === "por telefone" && hAprovM[0]?.por_nome === "Atendente Teste" && hAprovA[0]?.por === null && hAprovA[0]?.observacao?.startsWith("por link"), JSON.stringify([hAprovM[0], hAprovA[0]]));
  const MR = await osComLink();
  const maoRec = await donoA.sb.rpc("registrar_resposta_orcamento", { p_os_id: MR.id, p_de: "orcamento_enviado", p_aprovou: false, p_canal: "whatsapp", p_motivo: "Vai pensar" });
  checar("recusa a mao com link ativo: revoga, volta para aguardando, nao conta em respondidos", !maoRec.error && (await vwOs(MR.id))?.status === "aguardando_orcamento" && (await vwOs(MR.id))?.orcamento_respondido === false && SO_SITUACAO((await verLink(MR.token)).data, "encerrado") && (await provasDe(MR.id)).length === 1, msg(maoRec));
  const AC = await osComLink();
  const cancOS = await donoA.sb.rpc("mudar_status_os", { p_os_id: AC.id, p_de: "orcamento_enviado", p_para: "cancelada", p_motivo: "Cliente desistiu" });
  const [vAC, rAC] = [await verLink(AC.token), await responderLink(AC.token, true, "Cliente Tarde")];
  checar("cancelar a OS revoga o link (encerrado)", !cancOS.error && SO_SITUACAO(vAC.data, "encerrado") && SO_SITUACAO(rAC.data, "encerrado") && (await linksDe(AC.id))[0].revogado_motivo === "cancelada" && (await provasDe(AC.id)).length === 0, msg(cancOS));
  const APr = await osComLink();
  await responderLink(APr.token, true, "Cliente Prova");
  const fotoAPr = JSON.stringify(await provasDe(APr.id));
  const cancAPr = await donoA.sb.rpc("mudar_status_os", { p_os_id: APr.id, p_de: "aprovada", p_para: "cancelada", p_motivo: "Cliente desistiu" });
  checar("cancelar OS aprovada nao apaga a prova", !cancAPr.error && JSON.stringify(await provasDe(APr.id)) === fotoAPr && SO_SITUACAO((await verLink(APr.token)).data, "encerrado"), msg(cancAPr));
  const MD = await osComLink();
  const modo = await at.sb.rpc("trocar_modo_os", { p_os_id: MD.id, p_modo: "direto", p_autorizado_por_nome: "Autorizador F6" });
  const vwMD = await vwOs(MD.id);
  checar("trocar para direto revoga o link (encerrado) e comeca o servico", !modo.error && vwMD?.status === "em_andamento" && vwMD?.modo === "direto" && SO_SITUACAO((await verLink(MD.token)).data, "encerrado") && (await linksDe(MD.id))[0].revogado_motivo === "modo_direto", msg(modo));
  const ant = await novaOS();
  const antE = await donoA.sb.rpc("mudar_status_os", { p_os_id: ant.id, p_de: "aguardando_orcamento", p_para: "orcamento_enviado" });
  const antA = await at.sb.rpc("registrar_resposta_orcamento", { p_os_id: ant.id, p_de: "orcamento_enviado", p_aprovou: true, p_canal: "presencial" });
  const verAnt = await versoesDe(ant.id);
  checar("OS antiga sem link aprova a mao e congela uma versao manual", !antE.error && !antA.error && (await vwOs(ant.id))?.status === "aprovada" && verAnt.length === 1 && verAnt[0].origem === "manual", `${msg(antE)}/${msg(antA)}`);

  // ---------------------------------------------------------------- respondidos e mecanico comeca
  const respondidos = await donoA.sb.from("vw_os").select("id, orcamento_respondido_em").eq("orcamento_respondido", true).order("orcamento_respondido_em");
  const O = await osComLink();
  const contaAntes = respondidos.data?.length ?? 0;
  await responderLink(O.token, true, "Cliente Comeca");
  const contaDepois = (await donoA.sb.from("vw_os").select("id", { count: "exact", head: true }).eq("orcamento_respondido", true)).count;
  const comeca = guardaMec(await mec.sb.rpc("mudar_status_os", { p_os_id: O.id, p_de: "aprovada", p_para: "em_andamento" }));
  const contaFim = (await donoA.sb.from("vw_os").select("id", { count: "exact", head: true }).eq("orcamento_respondido", true)).count;
  checar("respondidos: entra ao responder, sai quando o mecanico comeca", contaDepois === contaAntes + 1 && !comeca.error && contaFim === contaAntes, `${contaAntes} -> ${contaDepois} -> ${contaFim} ${msg(comeca)}`);
  const atResp = await at.sb.from("vw_os").select("id", { count: "exact", head: true }).eq("orcamento_respondido", true);
  checar("atendente tambem conta os respondidos", atResp.count === contaFim, String(atResp.count));

  // ---------------------------------------------------------------- concorrencia
  console.log("\n== Fase 6: concorrencia real (conexoes separadas) ==");
  const RODADAS = 3;
  let vencedorLink = 0;
  let vencedorMao = 0;
  for (let i = 1; i <= RODADAS; i++) {
    const c1 = await osComLink();
    const [a1, a2] = await Promise.all([responderLink(c1.token, true, "Cliente Um"), responderLink(c1.token, true, "Cliente Dois")]);
    const pr1 = await provasDe(c1.id);
    const apl1 = [a1, a2].filter((r) => r.data?.aplicada === true).length;
    const nomesIguais = a1.data?.resposta?.nome === a2.data?.resposta?.nome && a1.data?.resposta?.nome === pr1[0]?.respondente_nome;
    checar(`rodada ${i}: duas aprovacoes juntas gravam 1, as duas veem a mesma`, apl1 === 1 && pr1.length === 1 && a1.data?.situacao === "aprovado" && a2.data?.situacao === "aprovado" && nomesIguais && (await histDe(c1.id)).filter((h) => h.evento === "aprovacao").length === 1, JSON.stringify([a1.data ?? msg(a1), a2.data ?? msg(a2)]).slice(0, 220));

    const c2 = await osComLink();
    const [b1, b2] = await Promise.all([responderLink(c2.token, true, "Cliente Um"), responderLink(c2.token, false, null, "Nao quero")]);
    const pr2 = await provasDe(c2.id);
    const st2 = (await vwOs(c2.id))?.status;
    const apl2 = [b1, b2].filter((r) => r.data?.aplicada === true).length;
    const coerente = pr2.length === 1 && ((pr2[0].aprovou && st2 === "aprovada") || (!pr2[0].aprovou && st2 === "aguardando_orcamento")) && b1.data?.resposta?.tipo === b2.data?.resposta?.tipo;
    checar(`rodada ${i}: aprovar x recusar grava so 1, status coerente`, apl2 === 1 && coerente, `${st2} ${JSON.stringify([b1.data?.situacao, b2.data?.situacao])}`);

    const c3 = await osComLink();
    const [l3, m3] = await Promise.all([
      responderLink(c3.token, true, "Cliente Link"),
      at.sb.rpc("registrar_resposta_orcamento", { p_os_id: c3.id, p_de: "orcamento_enviado", p_aprovou: true, p_canal: "telefone", p_quem_respondeu: "Cliente Mao" }),
    ]);
    const pr3 = await provasDe(c3.id);
    const ganhouLink = l3.data?.aplicada === true;
    const ganhouMao = !m3.error && l3.data?.situacao === "encerrado";
    if (ganhouLink) vencedorLink++;
    if (ganhouMao) vencedorMao++;
    const aviso = !ganhouLink || msg(m3) === "cliente_ja_respondeu";
    checar(`rodada ${i}: link x mao grava so 1; quem perde recebe o aviso certo`, pr3.length === 1 && (ganhouLink !== ganhouMao) && aviso && (await vwOs(c3.id))?.status === "aprovada" && pr3[0].canal === (ganhouLink ? "link" : "telefone"), `${JSON.stringify(l3.data)} ${msg(m3)}`);

    const c4 = await novaOS();
    const chave = uuid();
    const [e1, e2b] = await Promise.all([enviar(donoA.sb, c4.id, TOTAL_F6, chave), enviar(createClient(URL_SB, CHAVE, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${donoA.session.access_token}` } } }), c4.id, TOTAL_F6, chave)]);
    const links4 = await linksDe(c4.id);
    const [t1, t2] = await Promise.all([verLink(e1.data?.token), verLink(e2b.data?.token)]);
    const sits = [t1.data?.situacao, t2.data?.situacao].sort().join(",");
    const hist4 = (await histDe(c4.id)).filter((h) => h.evento === "orcamento_link");
    checar(`rodada ${i}: toque duplo no balcao = 1 versao, 1 link ativo, 1 evento, vale so o ultimo token`, !e1.error && !e2b.error && (await versoesDe(c4.id)).length === 1 && links4.filter((l) => !l.revogado_em).length === 1 && sits === "aberto,substituido" && hist4.length === 1 && [e1, e2b].filter((r) => r.data?.ja_existia === false).length === 1, `${msg(e1)}/${msg(e2b)} ${sits} ${hist4.length}`);

    const c5 = await novaOS();
    const [e51, e52] = await Promise.all([enviar(donoA.sb, c5.id), enviar(at.sb, c5.id)]);
    checar(`rodada ${i}: dois atendentes, chaves diferentes: um envia, o outro recebe orcamento_ja_enviado`, [e51, e52].filter((r) => !r.error).length === 1 && [e51, e52].filter((r) => msg(r) === "orcamento_ja_enviado").length === 1 && (await versoesDe(c5.id)).length === 1, `${msg(e51)}/${msg(e52)}`);

    const c6 = await osComLink();
    const [l6, alt6] = await Promise.all([responderLink(c6.token, true, "Cliente Link"), donoA.sb.rpc("alterar_orcamento", { p_os_id: c6.id })]);
    const pr6 = await provasDe(c6.id);
    const st6 = (await vwOs(c6.id))?.status;
    const ok6 = (l6.data?.aplicada === true && msg(alt6) === "cliente_ja_respondeu" && st6 === "aprovada" && pr6.length === 1) || (l6.data?.situacao === "atualizado" && !alt6.error && st6 === "aguardando_orcamento" && pr6.length === 0);
    checar(`rodada ${i}: responder x alterar: uma das duas, nunca as duas`, ok6, `${JSON.stringify(l6.data?.situacao)} ${msg(alt6)} ${st6}`);
  }
  console.log(`info    link x mao, quem ganhou em ${RODADAS} rodadas: link ${vencedorLink}, mao ${vencedorMao}`);

  // ---------------------------------------------------------------- limite
  console.log("\n== Fase 6: limite de tentativas ==");
  await foraDaVirada();
  const L = await osComLink();
  let normal = 0;
  for (let i = 0; i < 10; i++) if ((await verLink(L.token)).data?.situacao === "aberto") normal++;
  checar("cliente normal abre o link 10 vezes sem bloqueio", normal === 10, String(normal));
  let abertas = normal;
  for (let f = 0; f < 11; f++) {
    const lote = await Promise.all(Array.from({ length: 10 }, () => verLink(L.token)));
    abertas += lote.filter((r) => r.data?.situacao === "aberto").length;
  }
  const excesso = await verLink(L.token);
  checar("120 leituras passam; a 121a recebe limite, so { situacao }", abertas === 120 && SO_SITUACAO(excesso.data, "limite"), `${abertas} ${JSON.stringify(excesso.data)}`);
  const naoDerruba = await responderLink(L.token, true, "A");
  checar("limite de leitura nao bloqueia a resposta (contagens separadas)", naoDerruba.data?.erro === "nome_obrigatorio", JSON.stringify(naoDerruba.data));
  let tent = 1;
  for (let f = 0; f < 3; f++) {
    const n = f === 2 ? 9 : 10;
    const lote = await Promise.all(Array.from({ length: n }, () => responderLink(L.token, true, "A")));
    tent += lote.filter((r) => r.data?.erro === "nome_obrigatorio").length;
  }
  const excR = await responderLink(L.token, true, "Cliente Normal");
  checar("30 tentativas de resposta passam; a 31a recebe limite e nada grava", tent === 30 && SO_SITUACAO(excR.data, "limite") && (await provasDe(L.id)).length === 0 && (await vwOs(L.id))?.status === "orcamento_enviado", `${tent} ${JSON.stringify(excR.data)}`);
  const Lnovo = await reenviar(donoA.sb, L.id);
  checar("o limite e por link: link novo abre normal", (await verLink(Lnovo.data?.token)).data?.situacao === "aberto", msg(Lnovo));

  // ---------------------------------------------------------------- isolamento
  console.log("\n== Fase 6: oficina B e mecanico ==");
  const Iso = await osComLink();
  await responderLink(Iso.token, true, "Cliente Isolado");
  const fotoIso = await estadoDe(Iso.id);
  const verIso = (await versoesDe(Iso.id))[0];
  for (const t of ["orcamento_versoes", "orcamento_respostas", "vw_orcamento_versoes", "vw_orcamento_provas", "vw_orcamento_situacao", "orcamento_links", "vw_os_historico"]) {
    const r = await donoB.sb.from(t).select(t === "orcamento_links" ? "id" : "*").eq("os_id", Iso.id);
    checar(`dono B: 0 linhas da A em ${t}, com o id na mao`, !r.error && (r.data ?? []).length === 0, r.error?.code ?? `${r.data?.length}`);
  }
  const redeB = await donoB.sb.from("orcamento_resposta_rede").select("ip").eq("oficina_id", ofA);
  checar("dono B: 0 linhas de IP da A", (redeB.data ?? []).length === 0, redeB.error?.code ?? `${redeB.data?.length}`);
  for (const [fn, args] of [
    ["enviar_orcamento", { p_os_id: Iso.id, p_chave_idempotencia: uuid(), p_total_conferido_centavos: TOTAL_F6 }],
    ["reenviar_orcamento", { p_os_id: Iso.id, p_chave_idempotencia: uuid() }],
    ["cancelar_link_orcamento", { p_os_id: Iso.id }],
    ["alterar_orcamento", { p_os_id: Iso.id }],
    ["previa_orcamento", { p_os_id: Iso.id }],
    ["registrar_resposta_orcamento", { p_os_id: Iso.id, p_de: "aprovada", p_aprovou: false, p_canal: "telefone" }],
    ["mudar_status_os", { p_os_id: Iso.id, p_de: "aprovada", p_para: "aguardando_orcamento" }],
    ["trocar_modo_os", { p_os_id: Iso.id, p_modo: "direto", p_autorizado_por_nome: "Invasor" }],
  ]) {
    const r = await donoB.sb.rpc(fn, args);
    checar(`dono B: ${fn} na OS da A = os_nao_encontrada`, msg(r) === "os_nao_encontrada", msg(r));
  }
  const confB = await donoB.sb.rpc("conferir_orcamento", { p_versao_id: verIso?.id });
  checar("dono B: conferir_orcamento da A = versao_nao_encontrada", msg(confB) === "versao_nao_encontrada", msg(confB));
  const editB = await donoB.sb.from("orcamento_respostas").update({ respondente_nome: "B" }).eq("os_id", Iso.id).select("id");
  checar("dono B: nao altera a prova da A", Boolean(editB.error) || (editB.data ?? []).length === 0, editB.error?.code);
  checar("OS da A intacta depois das tentativas da B", (await estadoDe(Iso.id)) === fotoIso);

  for (const t of ["orcamento_versoes", "orcamento_links", "orcamento_respostas", "orcamento_resposta_rede", "vw_orcamento_versoes", "vw_orcamento_provas", "vw_orcamento_situacao"]) {
    const r = guardaMec(await mec.sb.from(t).select(t === "orcamento_links" ? "id" : t === "orcamento_resposta_rede" ? "resposta_id" : "*"));
    checar(`mecanico: 0 linhas em ${t}`, (r.data ?? []).length === 0, r.error?.code ?? `${r.data?.length}`);
  }
  const vwM2 = guardaMec(await mec.sb.from("vw_os").select("*").eq("id", Iso.id).maybeSingle()).data;
  const vazouF6 = [...COLUNAS_PROIBIDAS_MECANICO, "orcamento_link_situacao", "orcamento_itens_travados", "orcamento_respondido", "orcamento_respondido_em"].filter((c) => vwM2 && vwM2[c] !== null && vwM2[c] !== undefined);
  checar("mecanico: vw_os sem valor nem nada do link", Boolean(vwM2) && vazouF6.length === 0, vazouF6.join(", ") || (vwM2 ? "" : "sem linha"));
  for (const [fn, args] of [
    ["reenviar_orcamento", { p_os_id: Iso.id, p_chave_idempotencia: uuid() }],
    ["cancelar_link_orcamento", { p_os_id: Iso.id }],
    ["alterar_orcamento", { p_os_id: Iso.id }],
    ["previa_orcamento", { p_os_id: Iso.id }],
    ["conferir_orcamento", { p_versao_id: verIso?.id }],
    ["registrar_resposta_orcamento", { p_os_id: Iso.id, p_de: "aprovada", p_aprovou: false, p_canal: "telefone" }],
  ]) {
    const r = guardaMec(await mec.sb.rpc(fn, args));
    checar(`mecanico: ${fn} = acesso_negado`, msg(r) === "acesso_negado", msg(r));
  }
  const itensAt = await at.sb.from("vw_os_itens").select("custo_unitario_centavos").eq("os_id", Iso.id);
  const verAt = JSON.stringify(await versoesDe(Iso.id, at.sb));
  checar("atendente: le a versao, sem custo; custo do item NULL", verAt.includes(Iso.servico) && !verAt.includes(String(CUSTO_PECA)) && !/custo/i.test(verAt) && (itensAt.data ?? []).length === 2 && itensAt.data.every((i) => i.custo_unitario_centavos === null));
  const itensMecF6 = guardaMec(await mec.sb.from("vw_os_itens").select("*").eq("os_id", Iso.id));
  const vazF6 = valoresVazados(respostasMec);
  const jMec = JSON.stringify(respostasMec);
  const numerosF6 = [PRECO_SERV, PRECO_PECA, CUSTO_PECA, TOTAL_F6, ITEM_APOS, tokenA2, NOME_CLI].filter((v) => jMec.includes(String(v)));
  checar(`mecanico: ${respostasMec.length} respostas da Fase 6 sem nenhum valor, link ou token`, itensMecF6.data?.length === 2 && vazF6.length === 0 && numerosF6.length === 0, [...vazF6.slice(0, 5), ...numerosF6].join(", "));

  // ---------------------------------------------------------------- APP_URL
  if (!APP_URL) return;
  await testesFase6Paginas({ donoA, at, mec, ofA, osComLink, vwOs, provasDe, linksDe, estadoDe, A, B, R, M, Iso, NOME_CLI, MOTIVO, ITEM_APOS, MD, AC });
}

/** Tabelas e views publicas criadas pelas migracoes (a API so serve o schema public). */
function objetosDaApi() {
  const pasta = new URL("../supabase/migrations/", import.meta.url);
  const nomes = new Set();
  for (const a of readdirSync(pasta).filter((f) => f.endsWith(".sql"))) {
    const sql = readFileSync(new URL(a, pasta), "utf8");
    for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?(?:table|view)\s+(?:if\s+not\s+exists\s+)?public\.([a-z0-9_]+)/gi)) nomes.add(m[1]);
    for (const m of sql.matchAll(/drop\s+(?:table|view)\s+(?:if\s+exists\s+)?public\.([a-z0-9_]+)/gi)) nomes.delete(m[1]);
  }
  return [...nomes].sort();
}

/** O que nunca pode sair na pagina publica da OS `os`. */
function proibidosDe(os, oficinaId) {
  return [
    String(CUSTO_PECA), reais(CUSTO_PECA), String(CUSTO_PECA + 1), reais(CUSTO_PECA + 1),
    os.telefone, telFormatado(os.telefone), os.documento, os.sintoma, os.observacao,
    "Mecânico Teste", os.id, oficinaId, "custo_", "margem", "hash_", "token_hash", "os_id", "oficina_id", "mecanico",
  ];
}

// ------------------------------------------------------------------ Fase 6 com APP_URL
async function testesFase6Paginas(c) {
  const { donoA, at, mec, ofA, osComLink, vwOs, estadoDe, A, B, R, M, Iso, NOME_CLI, MOTIVO, ITEM_APOS, MD, AC } = c;
  console.log(`\n== Fase 6: pagina publica (${APP_URL}) ==`);
  const abrir = async (token, opcoes = {}) => {
    const r = await fetch(`${APP_URL}/orcamento/${token}`, { redirect: "manual", ...opcoes });
    return { status: r.status, h: r.headers, html: semMarcasDeValor(await r.text()) };
  };
  const P = await osComLink();
  const antes = await estadoDe(P.id);
  const pg = await abrir(P.token);
  const cab = (r, nome) => r.h.get(nome) ?? "";
  checar("pagina: abre sem login (200), mostra o orcamento", pg.status === 200 && pg.html.includes(P.placa) && pg.html.includes(P.servico) && pg.html.includes(reais(TOTAL_F6)), `status ${pg.status}`);
  const cabecalhosOk = (r) => /noindex/.test(cab(r, "x-robots-tag")) && /no-store/.test(cab(r, "cache-control")) && cab(r, "referrer-policy") === "no-referrer" && !r.h.has("set-cookie");
  const detCab = (r) => ["x-robots-tag", "cache-control", "referrer-policy", "set-cookie"].map((n) => `${n}=${cab(r, n)}`).join(" | ");
  checar("pagina: noindex, no-store, no-referrer, sem cookie", cabecalhosOk(pg), detCab(pg));
  checar("pagina: meta noindex no HTML", /<meta[^>]+name="robots"[^>]+noindex/.test(pg.html));

  const head = /<head[^>]*>([\s\S]*?)<\/head>/.exec(pg.html)?.[1] ?? "";
  const titulos = [...pg.html.matchAll(/<title[^>]*>([^<]*)<\/title>/g)].map((m) => m[1]);
  checar("pagina: <title> fixo", titulos.length >= 1 && titulos.every((t) => t === "Orçamento para sua aprovação"), titulos.join(" | "));
  const metas = [...pg.html.matchAll(/<meta[^>]+(?:property|name)="(og:[^"]+|twitter:[^"]+|description)"[^>]*>/g)].map((m) => m[0]);
  const noHead = [P.placa, P.cliente, P.servico, reais(TOTAL_F6), "Oficina Teste", "Scania", `#${P.numero}`].filter((t) => head.includes(t) || metas.join("").includes(t));
  checar("pagina: <head> e previa sem nome, placa, valor nem oficina", head.length > 0 && noHead.length === 0, noHead.join(", ") || `${metas.length} metas`);
  checar("pagina: previa com texto fixo", metas.some((m) => m.includes("og:title") && m.includes("Orçamento para sua aprovação")) && metas.some((m) => m.includes("og:description") && m.includes("Toque para ver o orçamento e responder.")), metas.join(" ").slice(0, 200));

  const origem = new URL(APP_URL).origin;
  const scripts = [...pg.html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
  const fora = scripts.filter((s) => { try { return new URL(s, APP_URL).origin !== origem; } catch { return true; } });
  checar(`pagina: ${scripts.length} scripts, todos do proprio app`, scripts.length > 0 && fora.length === 0, fora.join(", "));
  checar("pagina: sem analytics nem service worker", !/googletagmanager|google-analytics|gtag\(|segment\.|hotjar|clarity\.ms|sentry|vercel-insights|vitals\.vercel|manifest\.webmanifest|service-worker/i.test(pg.html));

  const P2 = await osComLink();
  const proibidos = [...proibidosDe(P, ofA), P2.placa, P2.servico, P2.peca, P2.cliente, P2.telefone, P2.documento, Iso.placa, Iso.servico, A.placa, A.servico];
  const achados = proibidos.filter((t) => pg.html.includes(t));
  checar("HTML publico: nada de custo, margem, telefone, documento, sintoma, observacao, mecanico, id, nem itens e placa de outra OS", achados.length === 0, achados.join(", "));

  for (const [rot, op] of [
    ["GET de novo", {}],
    ["HEAD", { method: "HEAD" }],
    ["HEAD com User-Agent do WhatsApp", { method: "HEAD", headers: { "user-agent": "WhatsApp/2.23.20.0" } }],
    ["GET com User-Agent do WhatsApp", { headers: { "user-agent": "WhatsApp/2.23.20.0" } }],
    ["GET com User-Agent do Facebook", { headers: { "user-agent": "facebookexternalhit/1.1" } }],
  ]) {
    const r = await abrir(P.token, op);
    checar(`${rot}: 200 com os cabecalhos certos`, r.status === 200 && cabecalhosOk(r), `${r.status} ${detCab(r)}`);
  }
  checar("abrir o link (GET e HEAD, tambem como robo) nao muda nada", (await estadoDe(P.id)) === antes);

  const [pg1, pg2] = [await abrir(P.token), await abrir(P2.token)];
  const [pg1b] = [await abrir(P.token)];
  checar("2 tokens em sequencia: cada um mostra so o seu (sem cache)", pg1.html.includes(P.placa) && !pg1.html.includes(P2.placa) && pg2.html.includes(P2.placa) && !pg2.html.includes(P.placa) && pg1b.html.includes(P.placa) && !pg1b.html.includes(P2.placa));

  const semDado = (r, os) => [os.placa, os.cliente, os.servico, os.peca, reais(TOTAL_F6), "Oficina Teste A"].filter((t) => r.html.includes(t));
  const estados = [
    ["token inventado", "0".repeat(64), A],
    ["substituido (token antigo da OS B)", null, B],
    ["atualizado", null, A],
    ["encerrado por marcar a mao", M.token, M],
    ["encerrado por cancelar a OS", AC.token, AC],
    ["encerrado por trocar o modo", MD.token, MD],
  ];
  const Sub = await osComLink();
  const reSub = await donoA.sb.rpc("reenviar_orcamento", { p_os_id: Sub.id, p_chave_idempotencia: uuid() }).single();
  estados[1] = ["substituido", Sub.token, Sub];
  const Alt = await osComLink();
  await donoA.sb.rpc("alterar_orcamento", { p_os_id: Alt.id });
  estados[2] = ["atualizado", Alt.token, Alt];
  for (const [rot, tk, os] of estados) {
    const r = await abrir(tk);
    const vaz = semDado(r, os);
    checar(`pagina ${rot}: sem nenhum dado do orcamento`, r.status === 200 && vaz.length === 0 && cabecalhosOk(r), vaz.join(", ") || `${r.status}`);
  }
  checar("reenviar da OS do estado substituido funcionou", !reSub.error, msg(reSub));
  const pRec = await abrir(R.token);
  checar("pagina de link respondido e depois marcado a mao: sem dado nem motivo", !pRec.html.includes(R.placa) && !pRec.html.includes(MOTIVO));
  const Ra = await osComLink();
  const MOT2 = `Motivo pagina ${RODADA}`;
  await responderLink(Ra.token, false, null, MOT2);
  const pRa = await abrir(Ra.token);
  checar("pagina recusada: mostra a recusa, nunca o motivo", pRa.status === 200 && pRa.html.includes(Ra.placa) && !pRa.html.includes(MOT2), `status ${pRa.status}`);
  const Aa = await osComLink();
  const NOME2 = `Nome Pagina ${RODADA}`;
  await responderLink(Aa.token, true, NOME2);
  const pAa = await abrir(Aa.token);
  checar("pagina aprovada: mostra o orcamento e o nome informado", pAa.status === 200 && pAa.html.includes(Aa.placa) && pAa.html.includes(NOME2) && cabecalhosOk(pAa), `status ${pAa.status}`);

  // ---------------------------------------------------------------- balcao
  console.log("\n== Fase 6: telas do balcao ==");
  const [ckDono, ckAt, ckMec] = await Promise.all([donoA, at, mec].map((u) => cookiesDaSessao(u.session)));
  const qtdResp = (await donoA.sb.from("vw_os").select("id", { count: "exact", head: true }).eq("orcamento_respondido", true)).count;
  const lista = await pagina("/os?status=respondidos", ckAt);
  checar("/os?status=respondidos: lista quem respondeu e nao lista quem nao respondeu", lista.status === 200 && lista.html.includes(`/os/${Aa.id}`) && lista.html.includes(`/os/${Ra.id}`) && !lista.html.includes(`/os/${P.id}`) && !lista.html.includes(`/os/${M.id}`), `status ${lista.status}`);
  checar("/os?status=respondidos: etiquetas 'Cliente aprovou' e 'Cliente recusou', 1 cartao por OS", lista.html.includes("Cliente aprovou") && lista.html.includes("Cliente recusou"));
  const listaOs = await pagina("/os", ckDono);
  const posChip = [listaOs.html.indexOf(">Abertas<"), listaOs.html.indexOf(">Respondidos<"), listaOs.html.indexOf(">Orçamento<")];
  checar("/os: chip 'Respondidos' logo depois de 'Abertas', com a contagem", listaOs.status === 200 && posChip[0] > 0 && posChip[1] > posChip[0] && posChip[2] > posChip[1] && listaOs.html.includes("status=respondidos"), `${listaOs.status} ${posChip.join(",")} (qtd ${qtdResp})`);
  const inicio = await pagina("/inicio", ckDono);
  checar("/inicio: cartao de respondidos leva ao filtro", inicio.status === 200 && inicio.html.includes("clientes responderam") && inicio.html.includes("/os?status=respondidos"), `status ${inicio.status}`);

  const dA = await pagina(`/os/${Aa.id}`, ckDono);
  checar("detalhe aprovado no link: prova, nome informado, desfazer, linha do tempo", dA.status === 200 && dA.html.includes("Aprovado pelo cliente") && dA.html.includes("no link") && dA.html.includes(`Nome informado`) && dA.html.includes("Desfazer aprovação") && dA.html.includes(`Cliente aprovou pelo link · Nome informado: ${NOME2}`) && dA.html.includes("gerou o link (versão 1)"), `status ${dA.status}`);
  const dM = await pagina(`/os/${M.id}`, ckDono);
  checar("detalhe marcado a mao: 'Fulano marcou', nao 'pelo link'", dM.status === 200 && dM.html.includes("Atendente Teste marcou: cliente aprovou por telefone") && !dM.html.includes("Cliente aprovou pelo link") && dM.html.includes("Desfazer aprovação"), `status ${dM.status}`);
  const dAdesf = await pagina(`/os/${A.id}`, ckDono);
  checar("detalhe depois de desfazer: 'desfez a aprovacao', gerou, cancelou e alterou na linha do tempo", dAdesf.status === 200 && dAdesf.html.includes("Atendente Teste desfez a aprovação") && dAdesf.html.includes("gerou um link novo") && dAdesf.html.includes("cancelou o link") && dAdesf.html.includes("alterou o orçamento: link anterior cancelado") && dAdesf.html.includes(`Cliente aprovou pelo link · Nome informado: ${NOME_CLI}`), `status ${dAdesf.status}`);
  const dR = await pagina(`/os/${Ra.id}`, ckAt);
  checar("detalhe recusado no link: destaque, motivo e linha do tempo", dR.status === 200 && dR.html.includes("Cliente recusou pelo link") && dR.html.includes(MOT2) && dR.html.includes(`Cliente recusou pelo link: ${MOT2}`), `status ${dR.status}`);
  const Ap = await osComLink();
  await responderLink(Ap.token, true, "Cliente Item");
  await at.sb.rpc("adicionar_item_os", { p_chave_idempotencia: uuid(), p_os_id: Ap.id, p_tipo: "servico", p_descricao: `Item Depois ${RODADA}`, p_preco_unitario_centavos: ITEM_APOS });
  const dAp = await pagina(`/os/${Ap.id}`, ckDono);
  checar("detalhe com item depois da aprovacao: 'Após a aprovação', aprovado x atual", dAp.status === 200 && /Após a aprovação/i.test(dAp.html) && dAp.html.includes(reais(TOTAL_F6)) && dAp.html.includes(reais(TOTAL_F6 + ITEM_APOS)), `status ${dAp.status}`);
  const listaAp = await pagina("/os?status=respondidos", ckDono);
  checar("/os: OS acima do aprovado continua com a etiqueta", listaAp.html.includes(`/os/${Ap.id}`) && /Acima do aprovado/i.test(listaAp.html));
  const atAp = await pagina(`/os/${Ap.id}`, ckAt);
  checar("atendente: detalhe sem custo", atAp.status === 200 && !atAp.html.includes(String(CUSTO_PECA)) && !atAp.html.includes(reais(CUSTO_PECA)) && !atAp.html.includes("Só você vê"), `status ${atAp.status}`);

  // ---------------------------------------------------------------- mecanico
  console.log("\n== Fase 6: telas do mecanico ==");
  const lancar = await mec.sb.rpc("adicionar_item_os", { p_chave_idempotencia: uuid(), p_os_id: Ap.id, p_tipo: "servico", p_descricao: `Lancado F6 ${RODADA}` });
  checar("mecanico lanca item na OS aprovada pelo link", !lancar.error, msg(lancar));
  const proibidosMec = (os, extras = []) => [
    "R$", reais(PRECO_SERV), String(PRECO_SERV), reais(PRECO_PECA), String(PRECO_PECA), reais(CUSTO_PECA), String(CUSTO_PECA), reais(TOTAL_F6), String(TOTAL_F6), reais(ITEM_APOS), String(ITEM_APOS),
    os.token, `/orcamento/${os.token}`, "/enviar", "Nome informado", "Link ativo", "Enviar orçamento", "Alterar orçamento", "Cancelar link", "Código de conferência", "Valor aprovado", "pelo link", "gerou o link", os.telefone, telFormatado(os.telefone), os.documento, os.observacao, ...extras,
  ].filter(Boolean);
  const achar = (html, lista) => lista.filter((t) => html.includes(t)).concat(/centavos/i.test(html) ? ["centavos"] : []);
  const mAp = await pagina(`/os/${Ap.id}`, ckMec);
  const vzAp = achar(mAp.html, proibidosMec(Ap, ["Cliente Item"]));
  checar("mecanico: detalhe da OS aprovada pelo link sem valor, link, token, nome ou prova no HTML", mAp.status === 200 && mAp.html.includes(Ap.placa) && mAp.html.includes("Cliente aprovou.") && vzAp.length === 0, vzAp.join(", ") || `status ${mAp.status}`);
  // `podeAlterar` e permissao, sem valor: o que nao pode vazar e valor, link e token.
  checar("mecanico: a chave sem valor podeAlterar pode ir no payload e nao reprova", mAp.html.includes("podeAlterar") && vzAp.length === 0, `tem podeAlterar: ${mAp.html.includes("podeAlterar")}`);
  const Ar = await osComLink();
  const MOT3 = `Motivo mecanico ${RODADA}`;
  await responderLink(Ar.token, false, null, MOT3);
  const mAr = await pagina(`/os/${Ar.id}`, ckMec);
  const vzAr = achar(mAr.html, proibidosMec(Ar, [MOT3]));
  checar("mecanico: OS recusada pelo link com o texto fixo, sem motivo nem valor", mAr.status === 200 && mAr.html.includes("Cliente recusou o orçamento.") && vzAr.length === 0, vzAr.join(", ") || `status ${mAr.status}`);
  const Am = await osComLink();
  const mAm = await pagina(`/os/${Am.id}`, ckMec);
  const vzAm = achar(mAm.html, proibidosMec(Am));
  checar("mecanico: OS com link ativo sem cartao do link, sem valor, sem token", mAm.status === 200 && mAm.html.includes(Am.placa) && vzAm.length === 0, vzAm.join(", ") || `status ${mAm.status}`);
  const naoAcha = (r, os) => (r.status === 404 || r.status === 200) && r.html.includes("OS não encontrada") && !r.html.includes(os.placa) && !r.html.includes(os.servico) && !r.html.includes(reais(TOTAL_F6));
  for (const [rot, cam] of [["/enviar", `/os/${Am.id}/enviar`], ["/orcamento/1", `/os/${Am.id}/orcamento/1`]]) {
    const r = await pagina(cam, ckMec);
    checar(`mecanico: ${rot} cai no nao encontrado, sem dado`, naoAcha(r, Am) && !r.html.includes("R$"), `status ${r.status}${r.local ? ` -> ${r.local}` : ""}`);
  }
  const minhas = await pagina("/minhas-os", ckMec);
  const vzMin = achar(minhas.html, ["R$", String(TOTAL_F6), reais(TOTAL_F6), "Cliente aprovou", "Cliente recusou", "Link vencido", "Respondidos"]);
  checar("mecanico: /minhas-os sem valor nem etiqueta do link", minhas.status === 200 && minhas.html.includes(Am.placa) && vzMin.length === 0, vzMin.join(", ") || `status ${minhas.status}`);
  const pgMecLista = await pagina("/os?status=respondidos", ckMec);
  checar("mecanico: /os?status=respondidos manda para /minhas-os", pgMecLista.html.includes("/minhas-os") || Boolean(pgMecLista.local?.includes("/minhas-os")), `status ${pgMecLista.status}`);
  const pgAnonOs = await pagina(`/os/${Ap.id}`, null);
  checar("sem login: /os/[id] vai para o login, sem dado", (pgAnonOs.status === 307 || pgAnonOs.status === 308) && pgAnonOs.local?.includes("/login"), `${pgAnonOs.status} ${pgAnonOs.local}`);

  await testesFase6Navegador({ ckDono, osComLink, vwOs, provasDe: c.provasDe, linksDe: c.linksDe, P });
}

// ------------------------------------------------------------------ Fase 6 no navegador (opcional)
// TESTE_PLAYWRIGHT=caminho/para/playwright/index.mjs: clica no que so existe no navegador.
// Usa so as contas e OS desta rodada. Nao abre wa.me.
async function testesFase6Navegador({ ckDono, osComLink, vwOs, provasDe, linksDe, P }) {
  const caminho = process.env.TESTE_PLAYWRIGHT;
  if (!caminho) {
    console.log("\nPULADO  cliques no navegador: defina TESTE_PLAYWRIGHT (caminho do playwright/index.mjs).");
    return;
  }
  console.log("\n== Fase 6: cliques no navegador (Chromium 390 px) ==");
  const { chromium } = await import(pathToFileURL(caminho).href);
  const nav = await chromium.launch();
  const url = new URL(APP_URL);
  const cookies = ckDono.split("; ").map((par) => {
    const i = par.indexOf("=");
    return { name: par.slice(0, i), value: par.slice(i + 1), domain: url.hostname, path: "/" };
  });
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
  await ctx.addCookies(cookies);
  const pg = await ctx.newPage();
  const esperaStatus = async (id, status) => {
    for (let i = 0; i < 40; i++) {
      if ((await vwOs(id))?.status === status) return true;
      await esperar(250);
    }
    return false;
  };
  const passo = async (nome, f) => {
    try {
      await f();
    } catch (e) {
      checar(nome, false, `erro: ${String(e.message).split("\n")[0]}`);
    }
  };
  try {
    // Link ativo: a confirmacao de cancelar, a de trocar o modo e a folha avisam.
    const Lk = await osComLink();
    await passo("navegador: cancelar OS com link ativo", async () => {
      await pg.goto(`${APP_URL}/os/${Lk.id}`, { waitUntil: "networkidle" });
      await pg.getByRole("button", { name: "Cancelar OS", exact: true }).click();
      const dlg = pg.getByRole("alertdialog");
      await dlg.waitFor();
      checar("navegador: cancelar OS com link ativo ganha a linha do link", await dlg.getByText("O link enviado ao cliente para de valer.").isVisible());
      await dlg.getByRole("button", { name: "Voltar sem cancelar" }).click();
    });
    await passo("navegador: trocar modo com link ativo", async () => {
      await pg.getByRole("button", { name: "Trocar para serviço direto" }).click();
      const aviso = pg.getByText("O link enviado ao cliente para de valer.");
      await aviso.waitFor();
      checar("navegador: trocar para direto com link ativo ganha a linha do link", await aviso.isVisible());
      await pg.reload({ waitUntil: "networkidle" });
    });
    // Aprovacao a mao com link ativo + "Desfazer" do aviso de 6 s: volta para aguardando.
    await passo("navegador: aprovar a mao com link ativo", async () => {
      await pg.getByRole("button", { name: /Registrar resposta/ }).first().click();
      await pg.getByText("Há um link ativo. Ao registrar a resposta aqui, ele para de valer.").waitFor();
      checar("navegador: folha da resposta avisa do link ativo", true);
      await pg.locator("label", { hasText: /^\s*Aprovou\s*$/ }).click();
      await pg.locator("label", { hasText: /^\s*Telefone\s*$/ }).click();
      await pg.getByRole("button", { name: "Marcar como aprovado" }).click();
      checar("navegador: marcar a mao aprova a OS", await esperaStatus(Lk.id, "aprovada"));
      await pg.getByRole("button", { name: "Desfazer", exact: true }).click();
      checar("navegador: 'Desfazer' de 6 s volta para Aguardando orcamento (nunca Orcamento enviado)", await esperaStatus(Lk.id, "aguardando_orcamento"), (await vwOs(Lk.id))?.status);
      const prova = (await provasDe(Lk.id))[0];
      checar("navegador: a mao desfeita continua guardada; link revogado", Boolean(prova?.desfeita_em) && Boolean((await linksDe(Lk.id))[0].revogado_em));
    });
    // Aprovacao no link + "Desfazer aprovacao" do cartao da prova.
    const Dp = await osComLink();
    await responderLink(Dp.token, true, "Cliente Navegador");
    await passo("navegador: desfazer aprovacao no cartao", async () => {
      await pg.goto(`${APP_URL}/os/${Dp.id}`, { waitUntil: "networkidle" });
      await pg.getByText("Aprovado pelo cliente no link").waitFor();
      await pg.getByRole("button", { name: "Desfazer aprovação" }).click();
      const dlg = pg.getByRole("alertdialog");
      await dlg.getByText(/o link não volta a valer/).waitFor();
      await dlg.getByRole("button", { name: "Desfazer aprovação" }).click();
      checar("navegador: 'Desfazer aprovação' volta para Aguardando orcamento", await esperaStatus(Dp.id, "aguardando_orcamento"), (await vwOs(Dp.id))?.status);
      await pg.getByRole("button", { name: /Ver respostas e versões/ }).click();
      await pg.getByText(/Desfeita por/).waitFor();
      checar("navegador: 'Ver respostas e versões' mostra a resposta desfeita", true);
      const hist = pg.getByRole("region", { name: "Histórico" });
      await hist.getByText(/desfez a aprovação/).waitFor();
      checar("navegador: linha do tempo mostra quem desfez", true);
    });
    // Link x mao: o cliente responde com a folha aberta.
    const Co = await osComLink();
    await passo("navegador: cliente responde com a folha aberta", async () => {
      await pg.goto(`${APP_URL}/os/${Co.id}`, { waitUntil: "networkidle" });
      await pg.getByRole("button", { name: /Registrar resposta/ }).first().click();
      await pg.locator("label", { hasText: /^\s*Recusou\s*$/ }).click();
      await pg.locator("label", { hasText: /^\s*Telefone\s*$/ }).click();
      await responderLink(Co.token, true, "Cliente Rapido");
      await pg.getByRole("button", { name: "Registrar recusa e refazer" }).click();
      await pg.getByText(/O cliente acabou de responder pelo link: aprovou em/).waitFor();
      const provas = await provasDe(Co.id);
      checar("navegador: folha fecha e diz que o cliente aprovou; nada a mais gravado", (await vwOs(Co.id))?.status === "aprovada" && provas.length === 1 && provas[0].canal === "link" && !(await pg.getByRole("button", { name: "Registrar recusa e refazer" }).isVisible()));
    });
    // Recusa pelo link: cancelar ja vem com o motivo marcado.
    const Rc = await osComLink();
    await responderLink(Rc.token, false, null, "Caro demais");
    await passo("navegador: cancelar depois da recusa", async () => {
      await pg.goto(`${APP_URL}/os/${Rc.id}`, { waitUntil: "networkidle" });
      await pg.getByRole("button", { name: "Cancelar OS", exact: true }).click();
      const dlg = pg.getByRole("alertdialog");
      await dlg.waitFor();
      checar("navegador: depois da recusa, cancelar ja vem com 'Orçamento recusado'", await dlg.getByRole("radio", { name: "Orçamento recusado" }).isChecked());
      checar("navegador: sem link ativo, sem a linha do link", !(await dlg.getByText("O link enviado ao cliente para de valer.").isVisible()));
    });
    // Chip e cartao levam ao filtro.
    await passo("navegador: filtro de respondidos", async () => {
      await pg.goto(`${APP_URL}/os`, { waitUntil: "networkidle" });
      const chip = pg.getByRole("link", { name: /^Respondidos \(\d+\)$/ });
      const caixa = await chip.boundingBox();
      checar("navegador: chip 'Respondidos' dentro da tela em 390 px, 48 px de altura", Boolean(caixa) && caixa.x + caixa.width <= 390 && caixa.height >= 48, JSON.stringify(caixa));
      await chip.click();
      await pg.waitForURL(/status=respondidos/);
      await pg.getByRole("link", { name: /cliente recusou pelo link/ }).first().waitFor();
      checar("navegador: filtro abre e o cartao anuncia a resposta", true);
      await pg.goto(`${APP_URL}/inicio`, { waitUntil: "networkidle" });
      await pg.getByRole("link", { name: /clientes responderam/ }).click();
      await pg.waitForURL(/status=respondidos/);
      checar("navegador: cartao do /inicio leva ao filtro", true);
    });
    // Pagina publica: o que o navegador carrega de verdade, e GET sem efeito com JavaScript ligado.
    await passo("navegador: pagina publica", async () => {
      const pubCtx = await nav.newContext({ viewport: { width: 360, height: 740 }, locale: "pt-BR" });
      const pub = await pubCtx.newPage();
      const hosts = new Set();
      pub.on("request", (r) => hosts.add(new URL(r.url()).host));
      await pub.goto(`${APP_URL}/orcamento/${P.token}`, { waitUntil: "networkidle" });
      checar("navegador: pagina publica so carrega do proprio app, sem terceiros", hosts.size === 1 && hosts.has(url.host), [...hosts].join(", "));
      const provasAntes = await provasDe(P.id);
      checar("navegador: abrir com JavaScript nao responde nada", provasAntes.length === 0 && (await vwOs(P.id))?.status === "orcamento_enviado");
      const sw = await pub.evaluate(async () => (await navigator.serviceWorker?.getRegistrations?.())?.length ?? 0);
      checar("navegador: pagina publica nao registra service worker", sw === 0, String(sw));
      await pubCtx.close();
    });
  } finally {
    await nav.close();
  }
}

/** So a Fase 6 (TESTE_SO_FASE6=1): cria o minimo de contas, para nao gastar uma rodada inteira. */
async function testesSoFase6() {
  console.log("\n== Preparo so da Fase 6 ==");
  const donoA = await criarConta("dono.f6");
  const ofA = await donoA.sb.rpc("criar_oficina", { p_nome_oficina: `Oficina Teste A ${RODADA}`, p_nome_dono: "Dono Teste A", p_versao_termos: TERMOS, p_telefone: "(11) 98888-7777" });
  const convM = await donoA.sb.rpc("criar_convite", { p_papel: "mecanico" }).single();
  const convA = await donoA.sb.rpc("criar_convite", { p_papel: "atendente" }).single();
  const mec = await criarConta("mecanico.f6");
  const at = await criarConta("atendente.f6");
  await mec.sb.rpc("aceitar_convite", { p_token: convM.data?.token, p_nome: "Mecânico Teste", p_versao_termos: TERMOS });
  await at.sb.rpc("aceitar_convite", { p_token: convA.data?.token, p_nome: "Atendente Teste", p_versao_termos: TERMOS });
  const donoB = await criarConta("dono.f6.b");
  const ofB = await donoB.sb.rpc("criar_oficina", { p_nome_oficina: `Oficina Teste B ${RODADA}`, p_nome_dono: "Dono Teste B", p_versao_termos: TERMOS });
  checar("preparo: 2 oficinas e 4 contas da rodada", typeof ofA.data === "string" && typeof ofB.data === "string", `${msg(ofA)}/${msg(ofB)}`);
  await testesFase6({ donoA, mec, at, donoB, ofA: ofA.data, ofB: ofB.data });
  console.log(`\ninfo    contas criadas nesta rodada: *.${RODADA}@${DOMINIO} (ficam no staging)`);
}

// ------------------------------------------------------------------ main
const autoconfirm = await testesAnon();
if (!DOMINIO) {
  console.log("\nPULADO  fluxo com login: defina TESTE_EMAIL_DOMINIO=www.example.org (o Supabase recusa .test e example.com).");
} else if (!autoconfirm) {
  console.log("\nPULADO  fluxo com login: a confirmacao de e-mail esta LIGADA no staging. Desligue em Auth > Providers > Email > Confirm email.");
} else {
  try {
    if (process.env.TESTE_SO_FASE6) await testesSoFase6();
    else await testesCompletos();
  } catch (e) {
    falhou++;
    console.log(`FALHOU  erro inesperado: ${e.message}`);
  }
}
console.log(`\nResultado: ${passou} passaram, ${falhou} falharam.`);
process.exit(falhou ? 1 : 0);
