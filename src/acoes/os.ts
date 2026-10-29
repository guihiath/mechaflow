"use server";

import { refresh } from "next/cache";
import { contextoParaAcao } from "@/lib/dal";
import { erroCampos, temErros, texto, textoOuNull, type EstadoAcao } from "@/lib/acao";
import { traduzirErro, type ErroSupabase } from "@/lib/erros";
import { normalizarPlaca, REGEX_PLACA, reaisParaCentavos, soDigitos, textoParaQuantidade } from "@/lib/formato";
import { ehCanalManual, ehFormaPagamento, hojeEmSaoPaulo, UNIDADES_ITEM, type UnidadeItem } from "@/lib/os";
import { ehStatusOS, rotuloStatus, type StatusOS } from "@/lib/os-status";
import { createClient } from "@/lib/supabase/server";
import { Constants, type Database } from "@/lib/supabase/database.types";

/**
 * Server Actions da OS (Fase 2). Regras no banco (RPCs do ARQUITETURA F2.5); aqui:
 * conferir o papel, validar o formulario com os textos do DESIGN §10 e traduzir erros.
 * Nada daqui devolve valor em dinheiro para o mecanico.
 */
const TEXTO_SEM_PERMISSAO = "Você não tem permissão para isso.";
const SEM_PERMISSAO: EstadoAcao = { erro: TEXTO_SEM_PERMISSAO };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GENERICO = "Algo deu errado. Tente de novo.";

type Cliente = Awaited<ReturnType<typeof createClient>>;
type ModoCliente = Database["public"]["Enums"]["modo_atendimento_cliente"];
type TipoVeiculo = Database["public"]["Enums"]["tipo_veiculo"];

function falha(verbo: string) {
  return `Não foi possível ${verbo}. Confira a internet e tente de novo.`;
}

/**
 * Traduz o erro de uma RPC da OS. "status_mudou" diz o status atual e atualiza a tela
 * (DESIGN §10.5); erro desconhecido/rede vira "Não foi possível {verbo}…".
 */
async function erroDaOS(supabase: Cliente, osId: string, error: ErroSupabase, verbo: string): Promise<EstadoAcao> {
  const msg = error?.message ?? "";
  if (msg === "status_mudou") {
    const { data } = await supabase.from("vw_os").select("status").eq("id", osId).maybeSingle();
    refresh();
    const agora = ehStatusOS(data?.status) ? ` (agora: ${rotuloStatus(data.status)})` : "";
    return { erro: `Esta OS mudou enquanto você olhava${agora}. A tela foi atualizada.` };
  }
  if (msg === "os_fechada" || msg === "os_nao_encontrada") refresh();
  const traduzido = traduzirErro(error, "os");
  return { erro: traduzido === GENERICO ? falha(verbo) : traduzido };
}

/** "418.950" -> 418950. Vazio -> null. Invalido -> NaN. */
function inteiro(valor: string, max = 2_000_000_000): number | null {
  if (!valor) return null;
  const limpo = valor.replace(/[.\s]/g, "");
  if (!/^\d+$/.test(limpo)) return Number.NaN;
  const n = Number(limpo);
  return n > max ? Number.NaN : n;
}

function ehModoCliente(v: string): v is ModoCliente {
  return (Constants.public.Enums.modo_atendimento_cliente as readonly string[]).includes(v);
}
function ehTipoVeiculo(v: string): v is TipoVeiculo {
  return (Constants.public.Enums.tipo_veiculo as readonly string[]).includes(v);
}

// =========================================================== placa (abrir OS)

export type DadosPlaca = {
  veiculoId: string;
  placa: string;
  veiculo: string | null;
  tipo: TipoVeiculo;
  temHorimetro: boolean;
  clienteId: string;
  clienteNome: string;
  clienteTelefone: string | null;
  clienteModoPadrao: ModoCliente | null;
  ultimoKm: number | null;
  ultimoKmEm: string | null;
  ultimaOs: { id: string; numero: number; em: string; resumo: string | null } | null;
  osAberta: { id: string; numero: number; status: StatusOS } | null;
};

/**
 * Autopreenchimento pela placa (ARQUITETURA F2.7). `dados: null` = placa nova.
 * So dono e atendente (a tela de abrir OS e deles).
 */
export async function consultarPlaca(placaDigitada: string): Promise<{ dados: DadosPlaca | null } | { erro: string }> {
  if (!(await contextoParaAcao(["dono", "atendente"]))) return { erro: TEXTO_SEM_PERMISSAO };
  const placa = normalizarPlaca(placaDigitada);
  if (!REGEX_PLACA.test(placa)) return { erro: "Placa inválida. Ex.: ABC1D23 ou ABC-1234" };

  const supabase = await createClient();
  const [{ data, error }, { data: veiculo }] = await Promise.all([
    supabase.rpc("dados_da_placa", { p_placa: placa }).maybeSingle(),
    supabase.from("veiculos").select("horimetro_atual").eq("placa", placa).maybeSingle(),
  ]);
  if (error) return { erro: "Não foi possível buscar a placa." };
  if (!data) return { dados: null };

  const veiculoTexto = [[data.veiculo_marca, data.veiculo_modelo].filter(Boolean).join(" "), data.veiculo_ano_modelo]
    .filter(Boolean)
    .join(" · ");

  return {
    dados: {
      veiculoId: data.veiculo_id,
      placa: data.placa,
      veiculo: veiculoTexto || null,
      tipo: data.veiculo_tipo,
      temHorimetro: veiculo?.horimetro_atual != null,
      clienteId: data.cliente_id,
      clienteNome: data.cliente_nome ?? "",
      clienteTelefone: data.cliente_telefone,
      clienteModoPadrao: data.cliente_modo_padrao,
      ultimoKm: data.ultimo_km,
      ultimoKmEm: data.ultimo_km_em,
      ultimaOs:
        data.ultima_os_id && data.ultima_os_numero && data.ultima_os_entregue_em
          ? { id: data.ultima_os_id, numero: data.ultima_os_numero, em: data.ultima_os_entregue_em, resumo: data.ultimo_servico }
          : null,
      osAberta:
        data.os_aberta_id && data.os_aberta_numero && ehStatusOS(data.os_aberta_status)
          ? { id: data.os_aberta_id, numero: data.os_aberta_numero, status: data.os_aberta_status }
          : null,
    },
  };
}

/**
 * Abre a OS (RPC atomica e idempotente). Devolve `dados.os_id` e `dados.numero`;
 * o navegador limpa o rascunho e vai para o detalhe.
 * `dados.recarregarPlaca = "1"`: outra pessoa cadastrou a placa no meio (refazer a busca).
 */
export async function abrirOS(_anterior: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  if (!(await contextoParaAcao(["dono", "atendente"]))) return SEM_PERMISSAO;

  const chave = texto(dados, "chave");
  const veiculoId = texto(dados, "veiculo_id");
  const placa = normalizarPlaca(texto(dados, "placa"));
  const clienteId = texto(dados, "cliente_id");
  const clienteNovo = texto(dados, "cliente_novo") === "1";
  const clienteNome = texto(dados, "cliente_nome");
  const clienteTelefone = soDigitos(texto(dados, "cliente_telefone"));
  const clienteModo = texto(dados, "cliente_modo_padrao");
  const veiculoTipo = texto(dados, "veiculo_tipo");
  const marca = textoOuNull(dados, "veiculo_marca");
  const modelo = textoOuNull(dados, "veiculo_modelo");
  const modo = texto(dados, "modo");
  const km = inteiro(texto(dados, "km"));
  const horimetro = inteiro(texto(dados, "horimetro"));
  const sintoma = texto(dados, "sintoma");
  const codigoFalha = textoOuNull(dados, "codigo_falha");
  const mecanicoId = texto(dados, "mecanico_id");
  const autorizadoNome = texto(dados, "autorizado_nome");
  const autorizadoTelefone = soDigitos(texto(dados, "autorizado_telefone"));

  if (!UUID.test(chave)) return { erro: "Algo deu errado ao enviar. Recarregue a página e tente de novo." };
  const placaNova = !veiculoId;
  if (placaNova && !REGEX_PLACA.test(placa)) return { erro: "Digite a placa para continuar." };

  const campos = {
    km: km === null ? "Informe o KM atual." : Number.isNaN(km) ? "KM inválido. Use só números. Ex.: 418950" : undefined,
    horimetro: horimetro !== null && Number.isNaN(horimetro) ? "Horímetro inválido. Use só números." : undefined,
    sintoma: !sintoma
      ? "Escreva o que o cliente relatou. Pode ser curto."
      : sintoma.length > 2000
        ? "Máximo de 2000 caracteres."
        : undefined,
    codigo_falha: codigoFalha && codigoFalha.length > 200 ? "Máximo de 200 caracteres." : undefined,
    cliente_id:
      placaNova && !clienteNovo && !UUID.test(clienteId) ? "Escolha o cliente ou toque em “Cliente novo”." : undefined,
    cliente_nome: placaNova && clienteNovo && clienteNome.length < 2 ? "Informe o nome do cliente." : undefined,
    cliente_telefone:
      placaNova && clienteNovo && clienteTelefone && !/^\d{10,11}$/.test(clienteTelefone)
        ? "Telefone inválido. Use DDD + número."
        : undefined,
    modo: modo === "com_orcamento" || modo === "direto" ? undefined : "Escolha como vai ser o serviço.",
    autorizado_nome: modo === "direto" && autorizadoNome.length < 2 ? "Informe quem autorizou o serviço." : undefined,
    autorizado_telefone:
      modo === "direto" && autorizadoTelefone && !/^\d{10,11}$/.test(autorizadoTelefone)
        ? "Telefone inválido. Use DDD + número."
        : undefined,
    mecanico_id: mecanicoId && !UUID.test(mecanicoId) ? "Escolha quem vai fazer." : undefined,
  };
  if (temErros(campos)) return erroCampos(campos);

  const supabase = await createClient();
  const args: Database["public"]["Functions"]["abrir_os"]["Args"] = {
    p_chave_idempotencia: chave,
    p_modo: modo as "com_orcamento" | "direto",
    p_km: km as number,
    p_sintoma_relatado: sintoma,
  };
  if (horimetro !== null) args.p_horimetro = horimetro;
  if (codigoFalha) args.p_codigo_falha = codigoFalha;
  if (mecanicoId) args.p_mecanico_id = mecanicoId;
  if (modo === "direto") {
    args.p_autorizado_por_nome = autorizadoNome;
    if (autorizadoTelefone) args.p_autorizado_por_telefone = autorizadoTelefone;
  }
  if (veiculoId) {
    if (!UUID.test(veiculoId)) return { erro: "Veículo não encontrado." };
    args.p_veiculo_id = veiculoId;
  } else {
    args.p_placa = placa;
    if (clienteNovo) {
      args.p_cliente_nome = clienteNome;
      if (clienteTelefone) args.p_cliente_telefone = clienteTelefone;
      if (ehModoCliente(clienteModo)) args.p_cliente_modo_padrao = clienteModo;
    } else {
      args.p_cliente_id = clienteId;
    }
    if (ehTipoVeiculo(veiculoTipo)) args.p_veiculo_tipo = veiculoTipo;
    if (marca) args.p_veiculo_marca = marca.slice(0, 60);
    if (modelo) args.p_veiculo_modelo = modelo.slice(0, 80);
  }

  const { data, error } = await supabase.rpc("abrir_os", args).single();
  if (error) {
    if (error.message === "placa_ja_cadastrada") {
      return {
        erro: `${placa} acabou de ser cadastrada. Atualizamos os dados do veículo.`,
        dados: { recarregarPlaca: "1" },
      };
    }
    const traduzido = traduzirErro(error, "os");
    return {
      erro:
        traduzido === GENERICO
          ? "Não foi possível abrir a OS. Nada foi perdido: confira a internet e toque de novo."
          : traduzido,
    };
  }
  return { ok: true, dados: { os_id: data.os_id, numero: String(data.numero) } };
}

// =========================================================== catalogo na folha

export type ItemCatalogoOS = {
  id: string;
  tipo: "servico" | "peca";
  nome: string;
  codigo: string | null;
  unidade: UnidadeItem;
  precoCentavos: number | null;
  /** So para o dono. */
  custoCentavos?: number | null;
};

export type CatalogoOS = { itens: ItemCatalogoOS[]; maisUsados: { servico: string[]; peca: string[] } };

/** Catalogo ativo + "mais usados" para a folha de adicionar item (dono e atendente). */
export async function carregarCatalogoOS(): Promise<CatalogoOS | { erro: string }> {
  const ctx = await contextoParaAcao(["dono", "atendente"]);
  if (!ctx) return { erro: TEXTO_SEM_PERMISSAO };
  const ehDono = ctx.papel === "dono";
  const supabase = await createClient();

  const [servicos, pecas, usados] = await Promise.all([
    supabase.from("vw_catalogo_servicos").select("id, nome, preco_padrao_centavos").eq("ativo", true).order("nome").limit(1000),
    supabase
      .from("vw_catalogo_pecas")
      .select("id, nome, codigo, unidade, preco_venda_centavos, custo_centavos")
      .eq("ativo", true)
      .order("nome")
      .limit(2000),
    supabase.from("vw_catalogo_mais_usados").select("tipo, catalogo_id, usos").order("usos", { ascending: false }).limit(60),
  ]);
  if (servicos.error || pecas.error) return { erro: "Não foi possível carregar o catálogo." };

  const itens: ItemCatalogoOS[] = [
    ...(servicos.data ?? []).flatMap((s) =>
      s.id && s.nome
        ? [{ id: s.id, tipo: "servico" as const, nome: s.nome, codigo: null, unidade: "un" as const, precoCentavos: s.preco_padrao_centavos }]
        : [],
    ),
    ...(pecas.data ?? []).flatMap((p) =>
      p.id && p.nome
        ? [
            {
              id: p.id,
              tipo: "peca" as const,
              nome: p.nome,
              codigo: p.codigo,
              unidade: (UNIDADES_ITEM as readonly string[]).includes(p.unidade ?? "") ? (p.unidade as UnidadeItem) : "un",
              precoCentavos: p.preco_venda_centavos,
              ...(ehDono ? { custoCentavos: p.custo_centavos } : {}),
            },
          ]
        : [],
    ),
  ];
  const ativos = new Set(itens.map((i) => i.id));
  const maisUsados = { servico: [] as string[], peca: [] as string[] };
  for (const u of usados.data ?? []) {
    if (!u.catalogo_id || !u.tipo || !ativos.has(u.catalogo_id)) continue;
    const lista = maisUsados[u.tipo];
    if (lista.length < 5) lista.push(u.catalogo_id);
  }
  return { itens, maisUsados };
}

// =========================================================== itens

function lerValoresItem(dados: FormData, ehDono: boolean) {
  const descricao = texto(dados, "descricao");
  const quantidade = textoParaQuantidade(texto(dados, "quantidade"));
  const unidade = texto(dados, "unidade") || "un";
  const preco = reaisParaCentavos(texto(dados, "preco"));
  const custo = ehDono ? reaisParaCentavos(texto(dados, "custo")) : null;
  const campos = {
    descricao: !descricao ? "Informe a descrição do item." : descricao.length > 200 ? "Máximo de 200 caracteres." : undefined,
    quantidade:
      quantidade === null || Number.isNaN(quantidade) || quantidade <= 0 || quantidade > 9_999_999
        ? "Quantidade inválida. Use números. Ex.: 2 ou 2,5"
        : undefined,
    preco: Number.isNaN(preco) ? "Preço inválido. Ex.: 150,00" : undefined,
    custo: Number.isNaN(custo) ? "Preço inválido. Ex.: 150,00" : undefined,
    unidade: (UNIDADES_ITEM as readonly string[]).includes(unidade) ? undefined : "Unidade inválida.",
  };
  return { descricao, quantidade: quantidade as number, unidade, preco, custo, campos };
}

/** Adiciona servico/peca (catalogo ou avulso). Idempotente pela chave do navegador. */
export async function adicionarItemOS(_anterior: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const ctx = await contextoParaAcao(["dono", "atendente"]);
  if (!ctx) return SEM_PERMISSAO;
  const ehDono = ctx.papel === "dono";

  const osId = texto(dados, "os_id");
  const chave = texto(dados, "chave");
  const tipo = texto(dados, "tipo");
  const catalogoId = texto(dados, "catalogo_id");
  const v = lerValoresItem(dados, ehDono);
  if (!UUID.test(osId) || !UUID.test(chave) || (tipo !== "servico" && tipo !== "peca") || (catalogoId && !UUID.test(catalogoId))) {
    return { erro: "Algo deu errado ao enviar. Recarregue a página e tente de novo." };
  }
  if (temErros(v.campos)) return erroCampos(v.campos);

  const supabase = await createClient();
  const args: Database["public"]["Functions"]["adicionar_item_os"]["Args"] = {
    p_chave_idempotencia: chave,
    p_os_id: osId,
    p_tipo: tipo,
    p_descricao: v.descricao,
    p_quantidade: v.quantidade,
    p_unidade: v.unidade,
  };
  if (catalogoId) {
    if (tipo === "servico") args.p_servico_id = catalogoId;
    else args.p_peca_id = catalogoId;
  }
  if (v.preco !== null) args.p_preco_unitario_centavos = v.preco;
  if (ehDono && v.custo !== null) args.p_custo_unitario_centavos = v.custo;

  const { data: itemId, error } = await supabase.rpc("adicionar_item_os", args);
  if (error) return erroDaOS(supabase, osId, error, "adicionar o item");

  // Preco apagado de proposito num item do catalogo: a RPC copiou o do catalogo; tira.
  if (catalogoId && v.preco === null && itemId) {
    await supabase.from("os_itens_precos").delete().eq("item_id", itemId);
  }
  if (ehDono && catalogoId && v.custo === null && itemId) {
    await supabase.from("os_itens_custos").delete().eq("item_id", itemId);
  }

  refresh();
  return { ok: true, mensagem: `${v.descricao} adicionado.` };
}

/** Edita descricao, quantidade, preco (e custo, dono). Preco vazio = "Sem preço". */
export async function salvarItemOS(_anterior: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const ctx = await contextoParaAcao(["dono", "atendente"]);
  if (!ctx) return SEM_PERMISSAO;
  const ehDono = ctx.papel === "dono";
  const itemId = texto(dados, "item_id");
  const osId = texto(dados, "os_id");
  const v = lerValoresItem(dados, ehDono);
  if (!UUID.test(itemId) || !UUID.test(osId)) return { erro: "Algo deu errado ao enviar. Recarregue a página e tente de novo." };
  if (temErros(v.campos)) return erroCampos(v.campos);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("os_itens")
    .update({ descricao: v.descricao, quantidade: v.quantidade, unidade: v.unidade })
    .eq("id", itemId)
    .select("id");
  if (error) return erroDaOS(supabase, osId, error, "salvar o item");
  if (!data?.length) return { erro: "Item não encontrado. Ele pode ter sido removido." };

  const { error: erroPreco } =
    v.preco === null
      ? await supabase.from("os_itens_precos").delete().eq("item_id", itemId)
      : await supabase.from("os_itens_precos").upsert({ item_id: itemId, preco_unitario_centavos: v.preco });
  if (erroPreco) return erroDaOS(supabase, osId, erroPreco, "salvar o preço");

  if (ehDono) {
    const { error: erroCusto } =
      v.custo === null
        ? await supabase.from("os_itens_custos").delete().eq("item_id", itemId)
        : await supabase.from("os_itens_custos").upsert({ item_id: itemId, custo_unitario_centavos: v.custo });
    if (erroCusto) return erroDaOS(supabase, osId, erroCusto, "salvar o custo");
  }

  refresh();
  return { ok: true, mensagem: "Item salvo." };
}

export async function removerItemOS(osId: string, itemId: string): Promise<EstadoAcao> {
  if (!(await contextoParaAcao(["dono", "atendente"]))) return SEM_PERMISSAO;
  if (!UUID.test(itemId) || !UUID.test(osId)) return SEM_PERMISSAO;
  const supabase = await createClient();
  const { data, error } = await supabase.from("os_itens").delete().eq("id", itemId).select("id");
  if (error) return erroDaOS(supabase, osId, error, "remover o item");
  if (!data?.length) return { erro: "Item não encontrado. Ele pode ter sido removido." };
  refresh();
  return { ok: true, mensagem: "Item removido." };
}

// =========================================================== status

const VERBO_STATUS: Partial<Record<StatusOS, string>> = {
  orcamento_enviado: "marcar o orçamento como enviado",
  aguardando_orcamento: "desfazer",
  aprovada: "desfazer",
  em_andamento: "começar o serviço",
  pronta: "marcar como pronta",
};

/**
 * Passos simples da maquina de status (enviar orcamento, comecar, desfazer).
 * O mecanico pode comecar/desfazer na OS dele; o banco confere (F2.3).
 */
export async function mudarStatusOS(osId: string, de: StatusOS, para: StatusOS): Promise<EstadoAcao> {
  if (!(await contextoParaAcao(["dono", "atendente", "mecanico"]))) return SEM_PERMISSAO;
  if (!UUID.test(osId) || !ehStatusOS(de) || !ehStatusOS(para) || para === "cancelada" || para === "entregue") {
    return SEM_PERMISSAO;
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("mudar_status_os", { p_os_id: osId, p_de: de, p_para: para });
  if (error) return erroDaOS(supabase, osId, error, VERBO_STATUS[para] ?? "mudar o status");
  refresh();
  return { ok: true };
}

/** "Começar serviço" escolhendo quem faz (folha "Quem vai fazer?"). */
export async function comecarServicoOS(osId: string, mecanicoId: string | null): Promise<EstadoAcao> {
  if (!(await contextoParaAcao(["dono", "atendente"]))) return SEM_PERMISSAO;
  if (!UUID.test(osId) || (mecanicoId && !UUID.test(mecanicoId))) return SEM_PERMISSAO;
  const supabase = await createClient();
  if (mecanicoId) {
    const { error } = await supabase.rpc("atribuir_mecanico", { p_os_id: osId, p_mecanico_id: mecanicoId });
    if (error) return erroDaOS(supabase, osId, error, "começar o serviço");
  }
  const { error } = await supabase.rpc("mudar_status_os", { p_os_id: osId, p_de: "aprovada", p_para: "em_andamento" });
  if (error) return erroDaOS(supabase, osId, error, "começar o serviço");
  refresh();
  return { ok: true };
}

/** em_andamento -> pronta, com causa/solucao opcionais (todos os papeis). */
export async function marcarProntaOS(_anterior: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  if (!(await contextoParaAcao(["dono", "atendente", "mecanico"]))) return SEM_PERMISSAO;
  const osId = texto(dados, "os_id");
  const causa = texto(dados, "causa");
  const solucao = texto(dados, "solucao");
  if (!UUID.test(osId)) return SEM_PERMISSAO;
  const campos = {
    causa: causa.length > 4000 ? "Máximo de 4000 caracteres." : undefined,
    solucao: solucao.length > 4000 ? "Máximo de 4000 caracteres." : undefined,
  };
  if (temErros(campos)) return erroCampos(campos);

  const supabase = await createClient();
  const args: Database["public"]["Functions"]["marcar_pronta"]["Args"] = { p_os_id: osId };
  if (causa) args.p_causa = causa;
  if (solucao) args.p_solucao = solucao;
  const { error } = await supabase.rpc("marcar_pronta", args);
  if (error) return erroDaOS(supabase, osId, error, "marcar como pronta");
  refresh();
  return { ok: true };
}

/** Resposta manual do cliente ao orcamento (aprovou / recusou). */
export async function registrarRespostaOS(_anterior: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  if (!(await contextoParaAcao(["dono", "atendente"]))) return SEM_PERMISSAO;
  const osId = texto(dados, "os_id");
  const de = texto(dados, "de");
  const resposta = texto(dados, "resposta");
  const canal = texto(dados, "canal");
  const quem = texto(dados, "quem");
  const motivo = texto(dados, "motivo");
  const depois = texto(dados, "depois");
  if (!UUID.test(osId) || !ehStatusOS(de)) return SEM_PERMISSAO;

  const campos = {
    resposta: resposta === "aprovou" || resposta === "recusou" ? undefined : "Diga se o cliente aprovou ou recusou.",
    canal: ehCanalManual(canal) ? undefined : "Escolha como o cliente respondeu.",
    quem: quem.length > 120 ? "Máximo de 120 caracteres." : undefined,
    motivo: motivo.length > 300 ? "Máximo de 300 caracteres." : undefined,
  };
  if (temErros(campos)) return erroCampos(campos);

  const aprovou = resposta === "aprovou";
  const supabase = await createClient();
  const args: Database["public"]["Functions"]["registrar_resposta_orcamento"]["Args"] = {
    p_os_id: osId,
    p_de: de,
    p_aprovou: aprovou,
    p_canal: canal as "telefone" | "whatsapp" | "presencial",
  };
  if (aprovou && quem) args.p_quem_respondeu = quem;
  if (!aprovou) {
    if (motivo) args.p_motivo = motivo;
    args.p_cancelar = depois === "cancelar";
  }
  const { error } = await supabase.rpc("registrar_resposta_orcamento", args);
  if (error) return erroDaOS(supabase, osId, error, "registrar a resposta");
  refresh();
  return { ok: true, mensagem: aprovou ? "aprovou" : depois === "cancelar" ? "cancelou" : "recusou" };
}

/** Cancelar com motivo (dono e atendente). */
export async function cancelarOS(osId: string, de: StatusOS, motivo: string): Promise<EstadoAcao> {
  if (!(await contextoParaAcao(["dono", "atendente"]))) return SEM_PERMISSAO;
  if (!UUID.test(osId) || !ehStatusOS(de)) return SEM_PERMISSAO;
  const m = motivo.trim().slice(0, 500);
  if (m.length < 3) return { erro: "Escreva o motivo." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("mudar_status_os", { p_os_id: osId, p_de: de, p_para: "cancelada", p_motivo: m });
  if (error) {
    const r = await erroDaOS(supabase, osId, error, "cancelar");
    return r?.erro === falha("cancelar") ? { erro: "Não foi possível cancelar. Confira a internet e tente de novo." } : r;
  }
  refresh();
  return { ok: true };
}

// =========================================================== responsaveis e modo

export async function atribuirMecanicoOS(osId: string, mecanicoId: string | null): Promise<EstadoAcao> {
  if (!(await contextoParaAcao(["dono", "atendente"]))) return SEM_PERMISSAO;
  if (!UUID.test(osId) || (mecanicoId && !UUID.test(mecanicoId))) return SEM_PERMISSAO;
  const supabase = await createClient();
  const { error } = await supabase.rpc("atribuir_mecanico", { p_os_id: osId, p_mecanico_id: mecanicoId });
  if (error) return erroDaOS(supabase, osId, error, "trocar o mecânico");
  refresh();
  return { ok: true };
}

/** Trocar o modo antes de o servico comecar (F2.3). Para "direto" exige quem autorizou. */
export async function trocarModoOS(_anterior: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  if (!(await contextoParaAcao(["dono", "atendente"]))) return SEM_PERMISSAO;
  const osId = texto(dados, "os_id");
  const modo = texto(dados, "modo");
  const nome = texto(dados, "autorizado_nome");
  const tel = soDigitos(texto(dados, "autorizado_telefone"));
  if (!UUID.test(osId) || (modo !== "direto" && modo !== "com_orcamento")) return SEM_PERMISSAO;
  const campos = {
    autorizado_nome: modo === "direto" && nome.length < 2 ? "Informe quem autorizou o serviço." : undefined,
    autorizado_telefone: modo === "direto" && tel && !/^\d{10,11}$/.test(tel) ? "Telefone inválido. Use DDD + número." : undefined,
  };
  if (temErros(campos)) return erroCampos(campos);

  const supabase = await createClient();
  const args: Database["public"]["Functions"]["trocar_modo_os"]["Args"] = { p_os_id: osId, p_modo: modo };
  if (modo === "direto") {
    args.p_autorizado_por_nome = nome;
    if (tel) args.p_autorizado_por_telefone = tel;
  }
  const { error } = await supabase.rpc("trocar_modo_os", args);
  if (error) return erroDaOS(supabase, osId, error, "trocar o modo");
  refresh();
  return { ok: true };
}

// =========================================================== fechamento e pagamento

/**
 * Tela "Fechar OS": `acao=salvar` guarda causa/solucao/codigo (continua pronta);
 * `acao=entregar` chama entregar_os (forma de pagamento + pago agora / a receber).
 */
export async function fecharOS(_anterior: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  if (!(await contextoParaAcao(["dono", "atendente"]))) return SEM_PERMISSAO;
  const osId = texto(dados, "os_id");
  const acao = texto(dados, "acao");
  const causa = texto(dados, "causa");
  const solucao = texto(dados, "solucao");
  const codigo = texto(dados, "codigo_falha");
  const forma = texto(dados, "forma_pagamento");
  const pagamento = texto(dados, "pagamento");
  if (!UUID.test(osId)) return SEM_PERMISSAO;
  const supabase = await createClient();

  const tamanhos = {
    causa: causa.length > 4000 ? "Máximo de 4000 caracteres." : undefined,
    solucao: solucao.length > 4000 ? "Máximo de 4000 caracteres." : undefined,
    codigo_falha: codigo.length > 200 ? "Máximo de 200 caracteres." : undefined,
  };

  if (acao === "salvar") {
    if (temErros(tamanhos)) return erroCampos(tamanhos);
    const { data, error } = await supabase
      .from("ordens_servico")
      .update({ causa_encontrada: causa || null, solucao_aplicada: solucao || null, codigo_falha: codigo || null })
      .eq("id", osId)
      .select("id");
    if (error) return erroDaOS(supabase, osId, error, "salvar");
    if (!data?.length) return SEM_PERMISSAO;
    refresh();
    return { ok: true, mensagem: "Fechamento salvo. A OS continua pronta." };
  }

  const campos = {
    ...tamanhos,
    causa: causa.length < 3 ? "Escreva a causa encontrada." : tamanhos.causa,
    solucao: solucao.length < 3 ? "Escreva a solução aplicada." : tamanhos.solucao,
    forma_pagamento: ehFormaPagamento(forma) ? undefined : "Escolha a forma de pagamento.",
    pagamento: pagamento === "pago" || pagamento === "receber" ? undefined : "Diga se foi pago agora ou se fica a receber.",
  };
  if (temErros(campos)) return erroCampos(campos);

  const args: Database["public"]["Functions"]["entregar_os"]["Args"] = {
    p_os_id: osId,
    p_causa: causa,
    p_solucao: solucao,
    p_forma_pagamento: forma as Database["public"]["Enums"]["forma_pagamento"],
    p_pago: pagamento === "pago",
  };
  if (codigo) args.p_codigo_falha = codigo;
  const { error } = await supabase.rpc("entregar_os", args);
  if (error) {
    const r = await erroDaOS(supabase, osId, error, "fechar a OS");
    return r?.erro === falha("fechar a OS")
      ? { erro: "Não foi possível fechar a OS. Nada foi perdido: confira a internet e tente de novo." }
      : r;
  }
  refresh();
  return { ok: true };
}

/** OS entregue "a receber" -> paga. Data do <input type="date"> (hoje = agora). */
export async function registrarPagamentoOS(_anterior: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  if (!(await contextoParaAcao(["dono", "atendente"]))) return SEM_PERMISSAO;
  const osId = texto(dados, "os_id");
  const forma = texto(dados, "forma_pagamento");
  const data = texto(dados, "recebido_em");
  if (!UUID.test(osId)) return SEM_PERMISSAO;
  const hoje = hojeEmSaoPaulo();
  const campos = {
    forma_pagamento: ehFormaPagamento(forma) ? undefined : "Escolha a forma de pagamento.",
    recebido_em: !/^\d{4}-\d{2}-\d{2}$/.test(data) || data > hoje ? "Data de pagamento inválida." : undefined,
  };
  if (temErros(campos)) return erroCampos(campos);

  const supabase = await createClient();
  const args: Database["public"]["Functions"]["registrar_pagamento"]["Args"] = {
    p_os_id: osId,
    p_forma_pagamento: forma as Database["public"]["Enums"]["forma_pagamento"],
  };
  // Dia anterior: meio-dia de Sao Paulo (nao vira o dia anterior em UTC).
  if (data !== hoje) args.p_pago_em = `${data}T12:00:00-03:00`;
  const { error } = await supabase.rpc("registrar_pagamento", args);
  if (error) return erroDaOS(supabase, osId, error, "registrar o pagamento");
  refresh();
  return { ok: true, mensagem: "Pagamento registrado." };
}
