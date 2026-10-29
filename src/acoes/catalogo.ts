"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { contextoParaAcao } from "@/lib/dal";
import { erroCampos, temErros, texto, textoOuNull, type EstadoAcao } from "@/lib/acao";
import { traduzirErro } from "@/lib/erros";
import { reaisParaCentavos, UNIDADES_PECA, type UnidadePeca } from "@/lib/formato";
import { createClient } from "@/lib/supabase/server";

/**
 * Catalogo: so o DONO escreve (RLS). Precos e custos ficam em tabelas separadas
 * (ARQUITETURA D6), gravados por upsert depois do item.
 */
const SEM_PERMISSAO: EstadoAcao = { erro: "Você não tem permissão para isso." };
const ERRO_VALOR = "Valor inválido. Ex.: 150,00";

function validarNome(nome: string) {
  if (nome.length < 2) return "Informe o nome.";
  if (nome.length > 120) return "Máximo de 120 caracteres.";
  return undefined;
}

// ------------------------------------------------------------------ servicos

export async function salvarServico(_anterior: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  if (!(await contextoParaAcao(["dono"]))) return SEM_PERMISSAO;

  const id = texto(dados, "id");
  const nome = texto(dados, "nome");
  const descricao = textoOuNull(dados, "descricao");
  const preco = reaisParaCentavos(texto(dados, "preco"));

  const campos = {
    nome: validarNome(nome),
    descricao: descricao && descricao.length > 1000 ? "Máximo de 1000 caracteres." : undefined,
    preco: Number.isNaN(preco) ? ERRO_VALOR : undefined,
  };
  if (temErros(campos)) return erroCampos(campos);

  const supabase = await createClient();
  let servicoId = id;

  if (!servicoId) {
    const { data, error } = await supabase.from("catalogo_servicos").insert({ nome, descricao }).select("id").single();
    if (error) return { erro: traduzirErro(error, "catalogo"), campos: error.code === "23505" ? { nome: "Já existe um serviço com este nome." } : undefined };
    servicoId = data.id;
  } else {
    const { data, error } = await supabase.from("catalogo_servicos").update({ nome, descricao }).eq("id", servicoId).select("id");
    if (error) return { erro: traduzirErro(error, "catalogo"), campos: error.code === "23505" ? { nome: "Já existe um serviço com este nome." } : undefined };
    if (!data?.length) return SEM_PERMISSAO;
  }

  const { error: erroPreco } =
    preco === null
      ? await supabase.from("catalogo_servicos_precos").delete().eq("servico_id", servicoId)
      : await supabase.from("catalogo_servicos_precos").upsert({ servico_id: servicoId, preco_padrao_centavos: preco });

  if (!id) redirect(`/catalogo/servicos/${servicoId}?${erroPreco ? "aviso=preco" : "salvo=1"}`);
  if (erroPreco) return { erro: `Serviço salvo, mas o preço não. ${traduzirErro(erroPreco)}` };
  refresh();
  return { ok: true, mensagem: "Serviço salvo." };
}

// ------------------------------------------------------------------ pecas

export async function salvarPeca(_anterior: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  if (!(await contextoParaAcao(["dono"]))) return SEM_PERMISSAO;

  const id = texto(dados, "id");
  const nome = texto(dados, "nome");
  const codigo = textoOuNull(dados, "codigo");
  const fornecedor = textoOuNull(dados, "fornecedor");
  const unidade = texto(dados, "unidade") as UnidadePeca;
  const preco = reaisParaCentavos(texto(dados, "preco"));
  const custo = reaisParaCentavos(texto(dados, "custo"));

  const campos = {
    nome: validarNome(nome),
    codigo: codigo && codigo.length > 60 ? "Máximo de 60 caracteres." : undefined,
    fornecedor: fornecedor && fornecedor.length > 120 ? "Máximo de 120 caracteres." : undefined,
    unidade: UNIDADES_PECA.includes(unidade) ? undefined : "Escolha a unidade.",
    preco: Number.isNaN(preco) ? ERRO_VALOR : undefined,
    custo: Number.isNaN(custo) ? ERRO_VALOR : undefined,
  };
  if (temErros(campos)) return erroCampos(campos);

  const supabase = await createClient();
  let pecaId = id;
  const item = { nome, codigo, fornecedor, unidade };

  if (!pecaId) {
    // Nasce pendente; o trigger tira o "pendente" quando o preco de venda e gravado.
    const { data, error } = await supabase.from("catalogo_pecas").insert(item).select("id").single();
    if (error) return { erro: traduzirErro(error, "catalogo") };
    pecaId = data.id;
  } else {
    // Sem preco de venda => volta a ficar pendente de precificacao.
    const { data, error } = await supabase
      .from("catalogo_pecas")
      .update(preco === null ? { ...item, pendente_precificacao: true } : item)
      .eq("id", pecaId)
      .select("id");
    if (error) return { erro: traduzirErro(error, "catalogo") };
    if (!data?.length) return SEM_PERMISSAO;
  }

  const [{ error: erroPreco }, { error: erroCusto }] = await Promise.all([
    preco === null
      ? supabase.from("catalogo_pecas_precos").delete().eq("peca_id", pecaId)
      : supabase.from("catalogo_pecas_precos").upsert({ peca_id: pecaId, preco_venda_centavos: preco }),
    custo === null
      ? supabase.from("catalogo_pecas_custos").delete().eq("peca_id", pecaId)
      : supabase.from("catalogo_pecas_custos").upsert({ peca_id: pecaId, custo_centavos: custo }),
  ]);
  const erroValor = erroPreco ?? erroCusto;

  if (!id) redirect(`/catalogo/pecas/${pecaId}?${erroValor ? "aviso=preco" : "salvo=1"}`);
  if (erroValor) return { erro: `Peça salva, mas preço/custo não. ${traduzirErro(erroValor)}` };
  refresh();
  return { ok: true, mensagem: "Peça salva." };
}

// ------------------------------------------------------------------ ativar / desativar

/** "Apagar" do catalogo = desativar (a Fase 2 vai apontar OS para estes itens). */
export async function alterarAtivoCatalogo(
  tipo: "servico" | "peca",
  id: string,
  ativo: boolean,
): Promise<EstadoAcao> {
  if (!(await contextoParaAcao(["dono"]))) return SEM_PERMISSAO;
  const supabase = await createClient();
  const tabela = tipo === "servico" ? "catalogo_servicos" : "catalogo_pecas";
  const { data, error } = await supabase.from(tabela).update({ ativo }).eq("id", id).select("id");
  if (error) return { erro: traduzirErro(error, "catalogo") };
  if (!data?.length) return SEM_PERMISSAO;
  refresh();
  return { ok: true };
}
