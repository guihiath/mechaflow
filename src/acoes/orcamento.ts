"use server";

import { refresh } from "next/cache";
import { contextoParaAcao } from "@/lib/dal";
import { traduzirErro } from "@/lib/erros";
import { createClient } from "@/lib/supabase/server";
import { urlPublicaApp } from "@/lib/url-publica";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ResultadoGerarLink = { link: string; expiraEm: string; versao: number } | { erro: string };

/** Mudou algo na OS enquanto a tela estava aberta: relê para a tela mostrar o que vale agora. */
const ERROS_QUE_ATUALIZAM = ["orcamento_mudou", "orcamento_ja_enviado", "cliente_ja_respondeu", "status_mudou", "os_fechada", "os_nao_encontrada"];

/**
 * Primeiro toque de "Enviar por WhatsApp": `enviar_orcamento` (ARQUITETURA 13.7). Repetir com a
 * mesma chave troca o token: na tela, vale sempre o último recebido. O token só existe nesta
 * resposta: não vai para log nem para a URL. O mecânico não passa daqui.
 */
export async function gerarLinkOrcamento(osId: string, chave: string, totalConferidoCentavos: number): Promise<ResultadoGerarLink> {
  if (!(await contextoParaAcao(["dono", "atendente"]))) return { erro: "Você não tem permissão para isso." };
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
  });
  if (error) {
    if (ERROS_QUE_ATUALIZAM.includes(error.message)) refresh();
    return { erro: traduzirErro(error, "os") };
  }
  const linha = data?.[0];
  if (!linha) return { erro: "Não foi possível gerar o link. Tente de novo." };
  refresh();
  return { link: `${base}/orcamento/${linha.token}`, expiraEm: linha.expira_em, versao: linha.versao_numero };
}
