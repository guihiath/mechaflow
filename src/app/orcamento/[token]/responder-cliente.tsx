"use client";

import { PaginaOrcamentoPublico } from "@/components/orcamento/pagina-orcamento-publico";
import { resultadoDoBanco, type LeituraOrcamento, type PedidoRespostaCliente, type ResultadoRespostaCliente } from "@/lib/orcamento";
import { getSupabaseEnv } from "@/lib/supabase/env";

/**
 * A resposta sai do NAVEGADOR, direto para o Supabase, sem sessão (ARQUITETURA 13.4): por Server
 * Action o IP gravado seria o da Vercel. POST, então o token não vai em URL.
 *
 * `fetch` puro em vez do supabase-js: é a única chamada desta página, e o pacote pesaria mais que
 * todo o resto do JavaScript dela, em quem abre com 3G (DESIGN §13.1). Sem Authorization de usuário:
 * o token de login nunca é lido aqui, então a chamada segue `anon` mesmo com o dono no aparelho.
 *
 * Queda de rede: `fetch` lança, e a tela oferece "Tentar de novo". Erro do servidor: `{ falha: "servidor" }`.
 */
async function responderPeloNavegador(token: string, pedido: PedidoRespostaCliente): Promise<ResultadoRespostaCliente> {
  const { url, publishableKey } = getSupabaseEnv();
  const resposta = await fetch(`${url}/rest/v1/rpc/responder_orcamento`, {
    method: "POST",
    headers: { apikey: publishableKey, Authorization: `Bearer ${publishableKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_token: token, p_aprovou: pedido.aprovou, p_nome: pedido.nome, p_motivo: pedido.motivo }),
    cache: "no-store",
    referrerPolicy: "no-referrer",
  });
  if (!resposta.ok) return { falha: "servidor" };
  // Resposta cortada no meio também lança: para o cliente, é igual a não ter chegado.
  return resultadoDoBanco(await resposta.json());
}

export function RespostaPeloNavegador({ token, leitura }: { token: string; leitura: LeituraOrcamento }) {
  return <PaginaOrcamentoPublico leitura={leitura} responder={(pedido) => responderPeloNavegador(token, pedido)} />;
}
