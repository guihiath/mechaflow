"use server";

import { refresh } from "next/cache";
import type { EstadoAcao } from "@/lib/acao";
import { contextoParaAcao } from "@/lib/dal";
import { traduzirErro } from "@/lib/erros";
import { rotuloStatus, ehStatusOS } from "@/lib/os-status";
import { formatarDataEHora } from "@/lib/orcamento";
import { createClient } from "@/lib/supabase/server";
import { urlPublicaApp } from "@/lib/url-publica";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEM_PERMISSAO = "Você não tem permissão para isso.";

export type ResultadoGerarLink = { link: string; expiraEm: string; versao: number } | { erro: string };

/** Mudou algo na OS enquanto a tela estava aberta: relê para a tela mostrar o que vale agora. */
const ERROS_QUE_ATUALIZAM = [
  "orcamento_mudou",
  "orcamento_ja_enviado",
  "orcamento_sem_itens",
  "os_itens_sem_preco",
  "cliente_ja_respondeu",
  "sem_versao_enviada",
  "status_mudou",
  "os_fechada",
  "os_nao_encontrada",
];

type Cliente = Awaited<ReturnType<typeof createClient>>;

/** Erro de uma RPC do balcão, em pt-BR (DESIGN §13.16). Os casos de corrida dizem o que vale agora. */
async function mensagemDeErro(supabase: Cliente, osId: string, error: { message: string; code?: string }, falha: string): Promise<string> {
  const codigo = error.message;
  if (ERROS_QUE_ATUALIZAM.includes(codigo)) refresh();
  if (codigo === "cliente_ja_respondeu") {
    const { data } = await supabase.from("vw_orcamento_situacao").select("resposta_aprovou, respondido_em").eq("os_id", osId).maybeSingle();
    if (data?.respondido_em) {
      return `O cliente acabou de responder: ${data.resposta_aprovou ? "aprovou" : "recusou"} em ${formatarDataEHora(data.respondido_em)}. A tela foi atualizada.`;
    }
  }
  if (codigo === "status_mudou") {
    const { data } = await supabase.from("vw_os").select("status").eq("id", osId).maybeSingle();
    const agora = ehStatusOS(data?.status) ? ` (agora: ${rotuloStatus(data.status)})` : "";
    return `Esta OS mudou enquanto você olhava${agora}. A tela foi atualizada.`;
  }
  const traduzido = traduzirErro(error, "os");
  return traduzido === "Algo deu errado. Tente de novo." ? falha : traduzido;
}

/**
 * "Gerar link" (`enviar_orcamento`, ARQUITETURA 13.7). Repetir com a mesma chave troca o token: na
 * tela, vale sempre o último recebido. O token só existe nesta resposta: não vai para log nem para
 * a URL. O mecânico não passa daqui.
 */
export async function gerarLinkOrcamento(
  osId: string,
  chave: string,
  totalConferidoCentavos: number,
  prazoEstimado: string | null,
  condicoesPagamento: string | null,
): Promise<ResultadoGerarLink> {
  if (!(await contextoParaAcao(["dono", "atendente"]))) return { erro: SEM_PERMISSAO };
  if (!UUID.test(osId) || !UUID.test(chave) || !Number.isSafeInteger(totalConferidoCentavos)) {
    return { erro: "Não foi possível gerar o link. Recarregue a página." };
  }
  const base = urlPublicaApp();
  if (!base) return { erro: "O endereço do link não está configurado (URL_PUBLICA_APP). Nada foi gerado." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("enviar_orcamento", {
    p_os_id: osId,
    p_chave_idempotencia: chave,
    p_total_conferido_centavos: totalConferidoCentavos,
    p_prazo_estimado: prazoEstimado?.trim() || null,
    p_condicoes_pagamento: condicoesPagamento?.trim() || null,
  });
  if (error) return { erro: await mensagemDeErro(supabase, osId, error, "Não foi possível gerar o link. Nada foi perdido: confira a internet e tente de novo.") };
  const linha = data?.[0];
  if (!linha) return { erro: "Não foi possível gerar o link. Tente de novo." };
  refresh();
  return { link: `${base}/orcamento/${linha.token}`, expiraEm: linha.expira_em, versao: linha.versao_numero };
}

/** "Gerar link novo" (`reenviar_orcamento`): mesma versão, validade nova, o link anterior deixa de valer. */
export async function reenviarLinkOrcamento(osId: string, chave: string): Promise<ResultadoGerarLink> {
  if (!(await contextoParaAcao(["dono", "atendente"]))) return { erro: SEM_PERMISSAO };
  if (!UUID.test(osId) || !UUID.test(chave)) return { erro: "Não foi possível reenviar o link. Recarregue a página." };
  const base = urlPublicaApp();
  if (!base) return { erro: "O endereço do link não está configurado (URL_PUBLICA_APP). Nada foi gerado." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reenviar_orcamento", { p_os_id: osId, p_chave_idempotencia: chave });
  if (error) return { erro: await mensagemDeErro(supabase, osId, error, "Não foi possível reenviar o link. Confira a internet e tente de novo.") };
  const linha = data?.[0];
  if (!linha) return { erro: "Não foi possível reenviar o link. Tente de novo." };
  refresh();
  return { link: `${base}/orcamento/${linha.token}`, expiraEm: linha.expira_em, versao: linha.versao_numero };
}

/** "Cancelar link": a OS fica em `orcamento_enviado`, travada, e sai por Reenviar ou Alterar. */
export async function cancelarLinkOrcamento(osId: string): Promise<EstadoAcao> {
  if (!(await contextoParaAcao(["dono", "atendente"]))) return { erro: SEM_PERMISSAO };
  if (!UUID.test(osId)) return { erro: SEM_PERMISSAO };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancelar_link_orcamento", { p_os_id: osId });
  if (error) return { erro: await mensagemDeErro(supabase, osId, error, "Não foi possível cancelar o link. Confira a internet e tente de novo.") };
  refresh();
  return { ok: true };
}

/**
 * "Alterar orçamento": revoga o link, volta para `aguardando_orcamento` e libera os itens. O próximo
 * envio cria uma versão nova. `dados.fechar`: a folha fecha, porque a OS já mudou por baixo dela.
 */
export async function alterarOrcamento(osId: string): Promise<EstadoAcao> {
  if (!(await contextoParaAcao(["dono", "atendente"]))) return { erro: SEM_PERMISSAO };
  if (!UUID.test(osId)) return { erro: SEM_PERMISSAO };
  const supabase = await createClient();
  const { error } = await supabase.rpc("alterar_orcamento", { p_os_id: osId });
  if (error) {
    const erro = await mensagemDeErro(supabase, osId, error, "Não foi possível alterar o orçamento. Confira a internet e tente de novo.");
    return ERROS_QUE_ATUALIZAM.includes(error.message) ? { erro, dados: { fechar: "1" } } : { erro };
  }
  refresh();
  return { ok: true };
}
