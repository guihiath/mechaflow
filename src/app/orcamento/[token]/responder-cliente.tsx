"use client";

import { useRef } from "react";
import { PaginaOrcamentoPublico } from "@/components/orcamento/pagina-orcamento-publico";
import { resultadoDoBanco, type LeituraOrcamento, type PedidoRespostaCliente, type ResultadoRespostaCliente } from "@/lib/orcamento";
import { criarClienteSemSessao } from "@/lib/supabase/sem-sessao";

/**
 * A resposta sai do NAVEGADOR, direto para o Supabase, com cliente sem sessão (ARQUITETURA 13.4):
 * por Server Action o IP gravado seria o da Vercel. POST, então o token não vai em URL.
 * Queda de rede: lança, e a tela oferece "Tentar de novo". Erro do servidor: `{ falha: "servidor" }`.
 */
export function RespostaPeloNavegador({ token, leitura }: { token: string; leitura: LeituraOrcamento }) {
  const cliente = useRef<ReturnType<typeof criarClienteSemSessao> | null>(null);

  async function responder(pedido: PedidoRespostaCliente): Promise<ResultadoRespostaCliente> {
    cliente.current ??= criarClienteSemSessao();
    const { data, error, status } = await cliente.current.rpc("responder_orcamento", {
      p_token: token,
      p_aprovou: pedido.aprovou,
      p_nome: pedido.nome,
      p_motivo: pedido.motivo,
    });
    if (error) {
      // O supabase-js não lança em queda de rede: devolve status 0.
      if (status === 0) throw new Error("rede");
      return { falha: "servidor" };
    }
    return resultadoDoBanco(data);
  }

  // Recusa fica para o F6-B3 (PLANO 19.2): ao chegar nele, é só tirar o `permitirRecusa={false}`.
  return <PaginaOrcamentoPublico leitura={leitura} responder={responder} permitirRecusa={false} />;
}
