import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizarPlaca } from "@/lib/formato";
import { ehStatusOS, rotuloStatus } from "@/lib/os-status";
import type { Database, DadosPdfOS } from "@/lib/supabase/database.types";
import { nomeArquivoPdfOS } from "./layout";

/*
 * Dados do PDF da OS e do resumo final (F7-B3), pela RPC `dados_pdf_os` (ARQUITETURA 14.7) com o
 * cliente do usuário: SECURITY INVOKER, RLS por baixo, papel conferido no banco. Nunca service_role.
 * Tabela de erros (mesma da vistoria, com o B5): mecânico / desativado (42501) e OS de outra
 * oficina ou inventada = 404; cancelada = 409.
 */

type Cliente = SupabaseClient<Database>;

export type ResultadoDadosPdfOS =
  | { ok: true; dados: DadosPdfOS; situacao: string; nomeArquivo: string; dadosMs: number }
  | { ok: false; status: 404 | 409 | 500; erro: string };

export async function carregarDadosPdfOS(supabase: Cliente, osId: string): Promise<ResultadoDadosPdfOS> {
  const t0 = performance.now();
  const { data, error } = await supabase.rpc("dados_pdf_os", { p_os_id: osId });
  if (error) {
    const msg = error.message ?? "";
    if (error.code === "42501" || msg.includes("acesso_negado") || msg.includes("os_nao_encontrada")) {
      return { ok: false, status: 404, erro: "OS não encontrada." };
    }
    if (msg.includes("os_cancelada_sem_pdf")) return { ok: false, status: 409, erro: "OS cancelada não gera PDF para o cliente." };
    return { ok: false, status: 500, erro: "Não foi possível ler a OS." };
  }
  const d = data as unknown as DadosPdfOS | null;
  if (!d || typeof d !== "object" || !Array.isArray(d.itens)) return { ok: false, status: 404, erro: "OS não encontrada." };

  const situacao = ehStatusOS(d.status) ? rotuloStatus(d.status) : String(d.status ?? "");
  const nomeArquivo = nomeArquivoPdfOS(d.tipo_documento, d.os_numero, normalizarPlaca(d.veiculo_placa));
  return { ok: true, dados: d, situacao, nomeArquivo, dadosMs: performance.now() - t0 };
}
