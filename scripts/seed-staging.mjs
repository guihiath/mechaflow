#!/usr/bin/env node
/**
 * Seed do Supabase STAGING para o teste no patio (Fase 5, F5-B1). So dados ficticios.
 *
 * Cria 1 oficina com dono, atendente e mecanico, cerca de 5 clientes (os dois modos padrao),
 * 8 caminhoes (placas antigas e Mercosul com prefixo TST) e catalogo diesel com preco e custo.
 * Vistoria fica opcional e o checklist e o padrao (os dois vem de criar_oficina). Nao cria OS.
 *
 * Uso:
 *   npm run seed:staging
 *   SEED_SUFIXO=ensaio npm run seed:staging                  # bash
 *   $env:SEED_SUFIXO="ensaio"; npm run seed:staging          # PowerShell
 *
 * Variaveis (do ambiente ou do .env.local; o ambiente tem prioridade):
 *   SEED_EMAIL_BASE  fulano@gmail.com gera fulano+mf-dono@gmail.com, +mf-atendente e +mf-mecanico
 *   SEED_SENHA       senha das 3 contas. Nunca e impressa nem gravada por este script.
 *   SEED_SUFIXO      opcional. Outra oficina limpa, com e-mails e nome proprios
 *                    (ensaio gera fulano+mf-dono-ensaio@gmail.com e "Oficina Diesel Teste (ensaio)").
 *                    Sem a chave secret nao da para apagar nada: "voltar a limpo" e criar outra.
 *
 * Requisito: "Confirm email" DESLIGADO no staging (Auth > Sign In / Providers > Email).
 *
 * Reutilizavel: entra na conta se ela ja existe e pula o que ja ha. Nao altera o que ja existe:
 * so completa preco ou custo que estiver faltando em item do catalogo.
 *
 * Usa so a chave publishable (nunca a secret) e recusa qualquer projeto que nao seja o staging.
 * Tudo passa pelas mesmas RPCs e pela mesma RLS do app.
 */
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const REF_STAGING = "qjzhzyzmifashtvffxdx";

// ------------------------------------------------------------------ saida
// A senha fica aqui so para ser usada no login e removida de qualquer mensagem de erro.
let SENHA = "";
const semSenha = (texto) => (SENHA ? String(texto).replaceAll(SENHA, "[senha oculta]") : String(texto));
const titulo = (texto) => console.log(`\n== ${texto} ==`);
const avisos = [];
const avisar = (texto) => {
  avisos.push(texto);
  console.log(`AVISO   ${semSenha(texto)}`);
};

// ------------------------------------------------------------------ configuracao (sem rede)
function lerEnvLocal() {
  const caminho = new URL("../.env.local", import.meta.url);
  if (!existsSync(caminho)) return {};
  return Object.fromEntries(
    readFileSync(caminho, "utf8")
      .replace(/^﻿/, "")
      .split(/\r?\n/)
      .filter((l) => l && !l.trimStart().startsWith("#") && l.includes("="))
      .map((l) => [
        l.slice(0, l.indexOf("=")).trim(),
        l.slice(l.indexOf("=") + 1).trim().replace(/^(["'])(.*)\1$/, "$2"),
      ]),
  );
}

/** A chave publishable e publica por natureza; a secret passaria por cima da RLS. */
function chaveEhSecreta(chave) {
  if (chave.startsWith("sb_secret_")) return true;
  const corpo = chave.split(".")[1];
  if (!corpo) return false;
  try {
    return JSON.parse(Buffer.from(corpo, "base64url").toString("utf8")).role === "service_role";
  } catch {
    return false;
  }
}

function lerConfiguracao() {
  const arquivo = lerEnvLocal();
  const ler = (nome) => process.env[nome]?.trim() || arquivo[nome] || "";

  const url = ler("NEXT_PUBLIC_SUPABASE_URL");
  const chave = ler("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const base = ler("SEED_EMAIL_BASE");
  const senha = ler("SEED_SENHA");
  const sufixo = ler("SEED_SUFIXO").toLowerCase();

  const faltam = [
    ["NEXT_PUBLIC_SUPABASE_URL", url],
    ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", chave],
    ["SEED_EMAIL_BASE", base],
    ["SEED_SENHA", senha],
  ].filter(([, valor]) => !valor).map(([nome]) => nome);
  if (faltam.length > 0) {
    throw new Error(
      `Faltam variáveis: ${faltam.join(", ")}.\n` +
        "Coloque no .env.local (ele fica fora do git) ou no ambiente e rode de novo. Modelo em .env.example.\n" +
        "Nada foi criado.",
    );
  }
  SENHA = senha;

  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL não é um endereço válido. Nada foi criado.");
  }
  if (host !== `${REF_STAGING}.supabase.co`) {
    throw new Error(`Este seed só roda no projeto STAGING (${REF_STAGING}). O endereço configurado é outro: ${host}. Nada foi criado.`);
  }
  if (chaveEhSecreta(chave)) {
    throw new Error("A chave configurada é secret/service_role. Este seed só usa a chave publishable. Nada foi criado.");
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(base)) {
    throw new Error("SEED_EMAIL_BASE precisa ser um e-mail, como fulano@gmail.com. Nada foi criado.");
  }
  if (sufixo && !/^[a-z0-9-]{1,20}$/.test(sufixo)) {
    throw new Error("SEED_SUFIXO aceita só letras sem acento, números e hífen, até 20 caracteres. Nada foi criado.");
  }

  const fim = sufixo ? `-${sufixo}` : "";
  const email = (papel) => base.replace("@", `+mf-${papel}${fim}@`);
  return {
    url,
    chave,
    nomeOficina: sufixo ? `Oficina Diesel Teste (${sufixo})` : "Oficina Diesel Teste",
    contas: {
      dono: { papel: "dono", email: email("dono"), nome: "Dono Teste" },
      atendente: { papel: "atendente", email: email("atendente"), nome: "Atendente Teste" },
      mecanico: { papel: "mecanico", email: email("mecanico"), nome: "Mecânico Teste" },
    },
  };
}

// ------------------------------------------------------------------ dados ficticios
const OBS = "Cadastro fictício do seed de teste.";

const CLIENTES = [
  { nome: "Transportes Teste Alfa Ltda", telefone: "11900000001", modo_padrao: "exige_orcamento" },
  { nome: "Frota Teste Beta", telefone: "11900000002", modo_padrao: "exige_orcamento" },
  { nome: "Logística Teste Gama", telefone: "11900000003", modo_padrao: "servico_direto" },
  { nome: "Cargas Teste Delta", telefone: "11900000004", modo_padrao: "servico_direto" },
  { nome: "Caminhoneiro Teste Autônomo", telefone: "11900000005", modo_padrao: "exige_orcamento" },
];

// Antigas: TST1xxx. Mercosul: TST2Axx. As placas livres do roteiro ficam em outra faixa (TST9...).
const CAMINHOES = [
  { placa: "TST1001", cliente: "Transportes Teste Alfa Ltda", marca: "Volvo", modelo: "FH 540", ano_fabricacao: 2019, ano_modelo: 2020, km_atual: 412350 },
  { placa: "TST1002", cliente: "Transportes Teste Alfa Ltda", marca: "Scania", modelo: "R 450", ano_fabricacao: 2018, ano_modelo: 2018, km_atual: 538900 },
  { placa: "TST1003", cliente: "Frota Teste Beta", marca: "Mercedes-Benz", modelo: "Atego 2430", ano_fabricacao: 2017, ano_modelo: 2017, km_atual: 365120 },
  { placa: "TST1004", cliente: "Caminhoneiro Teste Autônomo", marca: "Ford", modelo: "Cargo 2429", ano_fabricacao: 2015, ano_modelo: 2016, km_atual: 689400 },
  { placa: "TST2A01", cliente: "Transportes Teste Alfa Ltda", marca: "DAF", modelo: "XF 530", ano_fabricacao: 2022, ano_modelo: 2023, km_atual: 148700 },
  { placa: "TST2B02", cliente: "Logística Teste Gama", marca: "Volkswagen", modelo: "Constellation 24.280", ano_fabricacao: 2021, ano_modelo: 2021, km_atual: 201560 },
  { placa: "TST2C03", cliente: "Logística Teste Gama", marca: "Iveco", modelo: "S-Way 540", ano_fabricacao: 2023, ano_modelo: 2023, km_atual: 86300 },
  { placa: "TST2D04", cliente: "Cargas Teste Delta", marca: "Mercedes-Benz", modelo: "Actros 2651", ano_fabricacao: 2020, ano_modelo: 2021, km_atual: 297800 },
];

// Valores em centavos.
const SERVICOS = [
  { nome: "Troca de óleo do motor", descricao: "Drenagem, troca do óleo e dos filtros de óleo.", preco: 45000 },
  { nome: "Troca de filtros de combustível", descricao: "Filtro primário, separador de água e sangria.", preco: 22000 },
  { nome: "Diagnóstico eletrônico", descricao: "Leitura de falhas com scanner e teste de sensores.", preco: 25000 },
  { nome: "Regulagem de freios", descricao: "Regulagem das catracas e conferência das lonas.", preco: 28000 },
  { nome: "Troca de lonas de freio (por eixo)", descricao: "Troca das lonas e revisão dos tambores.", preco: 68000 },
  { nome: "Troca de embreagem", descricao: "Remoção da caixa, troca do kit e regulagem.", preco: 180000 },
  { nome: "Limpeza de bicos injetores", descricao: "Remoção, teste em bancada e limpeza.", preco: 95000 },
  { nome: "Revisão do sistema de Arla 32", descricao: "Teste do dosador, do sensor e limpeza do tanque.", preco: 38000 },
  { nome: "Revisão da suspensão", descricao: "Conferência de molas, bolsas de ar e amortecedores.", preco: 42000 },
  { nome: "Reparo no sistema de ar", descricao: "Localização de vazamento e troca de conexões.", preco: 32000 },
];

const PECAS = [
  { nome: "Filtro de óleo lubrificante", codigo: "TST-P01", unidade: "un", preco: 18990, custo: 11200 },
  { nome: "Filtro de combustível", codigo: "TST-P02", unidade: "un", preco: 14500, custo: 8300 },
  { nome: "Filtro separador de água", codigo: "TST-P03", unidade: "un", preco: 22900, custo: 13800 },
  { nome: "Filtro de ar do motor", codigo: "TST-P04", unidade: "un", preco: 32000, custo: 19500 },
  { nome: "Óleo de motor 15W40", codigo: "TST-P05", unidade: "l", preco: 2890, custo: 1750 },
  { nome: "Arla 32", codigo: "TST-P06", unidade: "l", preco: 450, custo: 280 },
  { nome: "Lona de freio traseira", codigo: "TST-P07", unidade: "jogo", preco: 41000, custo: 26500 },
  { nome: "Tambor de freio", codigo: "TST-P08", unidade: "un", preco: 89000, custo: 58000 },
  { nome: "Kit de embreagem", codigo: "TST-P09", unidade: "kit", preco: 465000, custo: 312000 },
  { nome: "Bico injetor", codigo: "TST-P10", unidade: "un", preco: 158000, custo: 104000 },
  { nome: "Sensor de NOx", codigo: "TST-P11", unidade: "un", preco: 245000, custo: 167000 },
  { nome: "Correia do motor", codigo: "TST-P12", unidade: "un", preco: 27500, custo: 16200 },
  { nome: "Bolsa de ar da suspensão", codigo: "TST-P13", unidade: "un", preco: 78000, custo: 49500 },
  { nome: "Amortecedor dianteiro", codigo: "TST-P14", unidade: "par", preco: 112000, custo: 72000 },
  { nome: "Lâmpada de farol H7 24V", codigo: "TST-P15", unidade: "un", preco: 3500, custo: 1900 },
].map((p) => ({ ...p, fornecedor: "Fornecedor Teste" }));

// ------------------------------------------------------------------ apoio
const contagem = new Map();
function registrar(categoria, situacao) {
  const linha = contagem.get(categoria) ?? { criados: 0, pulados: 0, completados: 0 };
  linha[situacao]++;
  contagem.set(categoria, linha);
}

function exigir(resposta, contexto) {
  if (resposta.error) throw new Error(`${contexto}: ${resposta.error.message ?? resposta.error.code}`);
  return resposta.data;
}

const chaveNome = (nome) => nome.trim().toLowerCase();
const jaExiste = (erro) => erro?.code === "23505";

function criarNovoCliente(config) {
  return () => createClient(config.url, config.chave, { auth: { persistSession: false, autoRefreshToken: false } });
}

let configAuth = null;
async function lerConfigAuth(config) {
  if (configAuth) return configAuth;
  const r = await fetch(`${config.url}/auth/v1/settings`, { headers: { apikey: config.chave } });
  if (!r.ok) throw new Error(`Não consegui ler a configuração de login do staging (status ${r.status}).`);
  configAuth = await r.json();
  return configAuth;
}

// ------------------------------------------------------------------ contas
/** Entra se a conta existe; se nao, cria. Nunca troca senha de conta existente. */
async function entrarOuCriar(config, novoCliente, conta) {
  const sb = novoCliente();
  const login = await sb.auth.signInWithPassword({ email: conta.email, password: SENHA });
  if (!login.error && login.data.session) return { sb, criada: false, id: login.data.session.user.id };

  const erro = login.error;
  if (erro?.code === "email_not_confirmed") {
    throw new Error(`A conta ${conta.email} existe, mas o e-mail não foi confirmado. Confira "Confirm email" no staging.`);
  }
  if (erro?.code !== "invalid_credentials" && !/invalid login credentials/i.test(erro?.message ?? "")) {
    throw new Error(`Não consegui entrar em ${conta.email}: ${erro?.message ?? "login sem sessão"}`);
  }

  // Nao entrou: a conta nao existe, ou existe com outra senha. So o cadastro diferencia.
  const auth = await lerConfigAuth(config);
  if (auth.disable_signup) throw new Error("O cadastro de contas está fechado no staging. Nada foi criado para esta conta.");
  if (!auth.mailer_autoconfirm) {
    throw new Error(
      `A conta ${conta.email} não entrou e "Confirm email" está LIGADO no staging. ` +
        "Desligue em Auth > Sign In / Providers > Email e rode de novo (assim nenhum e-mail é enviado).",
    );
  }

  const cadastro = await sb.auth.signUp({ email: conta.email, password: SENHA });
  if (cadastro.error?.code === "user_already_exists" || /already registered/i.test(cadastro.error?.message ?? "")) {
    throw new Error(`A conta ${conta.email} já existe com outra senha. Use a mesma SEED_SENHA da primeira vez, ou outro SEED_SUFIXO.`);
  }
  if (cadastro.error?.code === "weak_password") throw new Error("SEED_SENHA foi recusada por ser fraca. Escolha outra e rode de novo.");
  if (cadastro.error) throw new Error(`Não consegui criar ${conta.email}: ${cadastro.error.message}`);
  if (!cadastro.data.session) throw new Error(`Cadastro de ${conta.email} sem sessão. Confira "Confirm email" no staging.`);
  return { sb, criada: true, id: cadastro.data.session.user.id };
}

const lerContexto = async (sb, rotulo) => exigir(await sb.rpc("meu_contexto").single(), `meu_contexto (${rotulo})`);

/** Quando a versao dos termos muda, a conta existente aceita a nova. */
async function garantirTermos(sb, contexto, rotulo) {
  if (contexto.termos_aceitos) return registrar("termos aceitos", "pulados");
  exigir(await sb.rpc("aceitar_termos", { p_versao_termos: contexto.versao_termos_vigente }), `aceitar_termos (${rotulo})`);
  registrar("termos aceitos", "criados");
}

async function prepararDono(config, novoCliente) {
  const conta = config.contas.dono;
  const dono = await entrarOuCriar(config, novoCliente, conta);
  registrar("contas", dono.criada ? "criados" : "pulados");
  console.log(`${dono.criada ? "criada " : "existe "}  dono       ${conta.email}`);

  const contexto = await lerContexto(dono.sb, "dono");
  if (!contexto.oficina_id) {
    const oficinaId = exigir(
      await dono.sb.rpc("criar_oficina", {
        p_nome_oficina: config.nomeOficina,
        p_nome_dono: conta.nome,
        p_versao_termos: contexto.versao_termos_vigente,
        p_telefone: "11900000000",
      }),
      "criar_oficina",
    );
    registrar("oficina", "criados");
    registrar("termos aceitos", "criados");
    console.log(`criada   oficina    ${config.nomeOficina}`);
    return { ...dono, oficinaId, oficinaNome: config.nomeOficina };
  }

  if (contexto.papel !== "dono") {
    throw new Error(`A conta ${conta.email} já é ${contexto.papel} de "${contexto.oficina_nome}", não dono. Use outro SEED_SUFIXO.`);
  }
  if (!contexto.ativo) throw new Error(`A conta ${conta.email} está desativada.`);
  registrar("oficina", "pulados");
  console.log(`existe   oficina    ${contexto.oficina_nome}`);
  await garantirTermos(dono.sb, contexto, "dono");
  return { ...dono, oficinaId: contexto.oficina_id, oficinaNome: contexto.oficina_nome };
}

async function prepararFuncionario(config, novoCliente, dono, conta) {
  const rotulo = conta.papel.padEnd(10);
  const membro = await entrarOuCriar(config, novoCliente, conta);
  registrar("contas", membro.criada ? "criados" : "pulados");
  console.log(`${membro.criada ? "criada " : "existe "}  ${rotulo} ${conta.email}`);

  const contexto = await lerContexto(membro.sb, conta.papel);
  if (contexto.oficina_id) {
    if (contexto.oficina_id !== dono.oficinaId) {
      throw new Error(`A conta ${conta.email} já está em outra oficina ("${contexto.oficina_nome}"). Use outro SEED_SUFIXO.`);
    }
    if (contexto.papel !== conta.papel) avisar(`${conta.email} está como ${contexto.papel}, não ${conta.papel}. Não foi alterado.`);
    if (!contexto.ativo) avisar(`${conta.email} está desativada. Reative em Equipe.`);
    registrar("convites aceitos", "pulados");
    if (contexto.ativo) await garantirTermos(membro.sb, contexto, conta.papel);
    return;
  }

  // Sem oficina: convite so na hora de aceitar, para nao deixar link aberto. O token nao aparece na saida.
  const convite = exigir(
    await dono.sb.rpc("criar_convite", { p_papel: conta.papel, p_nome_sugerido: conta.nome, p_validade_horas: 1 }).single(),
    `criar_convite (${conta.papel})`,
  );
  const aceite = await membro.sb.rpc("aceitar_convite", {
    p_token: convite.token,
    p_nome: conta.nome,
    p_versao_termos: contexto.versao_termos_vigente,
  });
  if (aceite.error) {
    await dono.sb.rpc("revogar_convite", { p_convite_id: convite.convite_id });
    throw new Error(`aceitar_convite (${conta.papel}): ${aceite.error.message}`);
  }
  registrar("convites aceitos", "criados");
  registrar("termos aceitos", "criados");
}

// ------------------------------------------------------------------ cadastros
async function semearClientes(sb) {
  const existentes = exigir(await sb.from("clientes").select("id, nome"), "ler clientes");
  const ids = new Map(existentes.map((c) => [chaveNome(c.nome), c.id]));
  for (const cliente of CLIENTES) {
    if (ids.has(chaveNome(cliente.nome))) {
      registrar("clientes", "pulados");
      continue;
    }
    const novo = await sb.from("clientes").insert({ ...cliente, observacoes: OBS }).select("id").single();
    ids.set(chaveNome(cliente.nome), exigir(novo, `criar cliente ${cliente.nome}`).id);
    registrar("clientes", "criados");
  }
  return ids;
}

async function semearCaminhoes(sb, idsClientes) {
  const existentes = exigir(await sb.from("veiculos").select("placa"), "ler veículos");
  const placas = new Set(existentes.map((v) => v.placa));
  for (const { cliente, ...caminhao } of CAMINHOES) {
    if (placas.has(caminhao.placa)) {
      registrar("caminhões", "pulados");
      continue;
    }
    const novo = await sb.from("veiculos").insert({
      ...caminhao,
      cliente_id: idsClientes.get(chaveNome(cliente)),
      tipo: "caminhao",
      observacoes: OBS,
    });
    if (jaExiste(novo.error)) {
      registrar("caminhões", "pulados");
    } else {
      exigir(novo, `criar caminhão ${caminhao.placa}`);
      registrar("caminhões", "criados");
    }
    placas.add(caminhao.placa);
  }
  return placas;
}

async function semearServicos(sb) {
  const existentes = exigir(await sb.from("vw_catalogo_servicos").select("id, nome, preco_padrao_centavos"), "ler serviços");
  const porNome = new Map(existentes.map((s) => [chaveNome(s.nome), s]));
  for (const { preco, ...servico } of SERVICOS) {
    let atual = porNome.get(chaveNome(servico.nome));
    if (atual) {
      registrar("serviços", "pulados");
    } else {
      atual = exigir(await sb.from("catalogo_servicos").insert(servico).select("id").single(), `criar serviço ${servico.nome}`);
      atual.preco_padrao_centavos = null;
      registrar("serviços", "criados");
    }
    if (atual.preco_padrao_centavos === null) {
      exigir(await sb.from("catalogo_servicos_precos").insert({ servico_id: atual.id, preco_padrao_centavos: preco }), `preço de ${servico.nome}`);
      registrar("preços e custos", porNome.has(chaveNome(servico.nome)) ? "completados" : "criados");
    } else {
      registrar("preços e custos", "pulados");
    }
  }
}

async function semearPecas(sb) {
  const existentes = exigir(await sb.from("vw_catalogo_pecas").select("id, nome, preco_venda_centavos, custo_centavos"), "ler peças");
  const porNome = new Map();
  for (const p of existentes) if (!porNome.has(chaveNome(p.nome))) porNome.set(chaveNome(p.nome), p);

  for (const { preco, custo, ...peca } of PECAS) {
    const anterior = porNome.get(chaveNome(peca.nome));
    let atual = anterior;
    if (anterior) {
      registrar("peças", "pulados");
    } else {
      atual = exigir(await sb.from("catalogo_pecas").insert(peca).select("id").single(), `criar peça ${peca.nome}`);
      atual.preco_venda_centavos = null;
      atual.custo_centavos = null;
      registrar("peças", "criados");
    }
    const situacao = anterior ? "completados" : "criados";
    if (atual.preco_venda_centavos === null) {
      exigir(await sb.from("catalogo_pecas_precos").insert({ peca_id: atual.id, preco_venda_centavos: preco }), `preço de ${peca.nome}`);
      registrar("preços e custos", situacao);
    } else {
      registrar("preços e custos", "pulados");
    }
    if (atual.custo_centavos === null) {
      exigir(await sb.from("catalogo_pecas_custos").insert({ peca_id: atual.id, custo_centavos: custo }), `custo de ${peca.nome}`);
      registrar("preços e custos", situacao);
    } else {
      registrar("preços e custos", "pulados");
    }
  }
}

/** Uma antiga e uma Mercosul que ainda nao estao cadastradas nesta oficina. */
function placasLivres(placas) {
  const final = (n) => String(n).padStart(2, "0");
  const primeiraLivre = (prefixo) => {
    for (let n = 1; n <= 99; n++) {
      const placa = `${prefixo}${final(n)}`;
      if (!placas.has(placa)) return placa;
    }
    return null;
  };
  return [primeiraLivre("TST90"), primeiraLivre("TST9A")].filter(Boolean);
}

// ------------------------------------------------------------------ principal
async function principal() {
  const config = lerConfiguracao();
  const novoCliente = criarNovoCliente(config);
  console.log(`Seed do staging: ${config.nomeOficina}`);

  titulo("Contas e oficina");
  const dono = await prepararDono(config, novoCliente);
  await prepararFuncionario(config, novoCliente, dono, config.contas.atendente);
  await prepararFuncionario(config, novoCliente, dono, config.contas.mecanico);

  const idsClientes = await semearClientes(dono.sb);
  await semearCaminhoes(dono.sb, idsClientes);
  await semearServicos(dono.sb);
  await semearPecas(dono.sb);

  // O que esta no banco agora, visto pela RLS do dono.
  const oficina = exigir(await dono.sb.from("oficinas").select("vistoria_obrigatoria").eq("id", dono.oficinaId).single(), "ler oficina");
  const itensChecklist = exigir(await dono.sb.from("checklist_modelo_itens").select("id").eq("ativo", true), "ler checklist");
  const veiculos = exigir(await dono.sb.from("veiculos").select("placa").order("placa"), "ler veículos");
  const placas = veiculos.map((v) => v.placa);
  if (oficina.vistoria_obrigatoria) avisar("A vistoria desta oficina está obrigatória (alguém mudou na tela). Não foi alterado.");
  if (itensChecklist.length === 0) avisar("Esta oficina está sem itens no checklist da vistoria.");

  titulo("O que foi feito");
  console.log(`${"".padEnd(18)}criados  já existiam  completados`);
  for (const [categoria, linha] of contagem) {
    console.log(`${categoria.padEnd(18)}${String(linha.criados).padStart(7)}  ${String(linha.pulados).padStart(11)}  ${String(linha.completados).padStart(11)}`);
  }

  titulo("Para o roteiro");
  console.log(`Oficina: ${dono.oficinaNome}`);
  console.log(`Vistoria: ${oficina.vistoria_obrigatoria ? "obrigatória" : "opcional"}; checklist com ${itensChecklist.length} itens`);
  console.log(`Dono:      ${config.contas.dono.email}`);
  console.log(`Atendente: ${config.contas.atendente.email}`);
  console.log(`Mecânico:  ${config.contas.mecanico.email}`);
  console.log("Senha: a de SEED_SENHA, nas 3 contas (não aparece aqui).");
  console.log(`Placas cadastradas (${placas.length}): ${placas.join(", ")}`);
  console.log(`Placas livres para o roteiro: ${placasLivres(new Set(placas)).join(", ")}`);
  console.log(`\n${avisos.length > 0 ? `Terminou com ${avisos.length} aviso(s).` : "Terminou sem erro."}`);
}

principal().catch((erro) => {
  console.error(`\nERRO: ${semSenha(erro?.message ?? erro)}`);
  if (contagem.size > 0) console.error("Parou no meio. O que já foi criado fica: rode de novo, que ele continua de onde parou.");
  process.exitCode = 1;
});
