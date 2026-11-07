import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizarPlaca } from "@/lib/formato";
import { documentoDoBanco, type DadosDocumentoOrcamento } from "@/lib/orcamento";
import type { Database } from "@/lib/supabase/database.types";
import { nomeArquivoPdfOrcamento, type MetaVersaoPdf } from "./layout";

/*
 * Dados do PDF do orçamento (F7-B9): a versão congelada de `vw_orcamento_versoes` (INVOKER, RLS:
 * o mecânico recebe 0 linhas) e o status da OS em `vw_os`, com o cliente do usuário. Nunca
 * service_role. Só leitura: nada muda no banco, e o `conteudo` não é tocado (o hash de
 * `conferir_orcamento` continua valendo).
 * Colunas escolhidas: sem `congelada_por_nome`, sem `hash_conteudo` inteiro, sem custo.
 * Tabela: outra oficina, OS ou versão inventada = 404; OS cancelada = 409 (como o PDF da OS).
 */

type Cliente = SupabaseClient<Database>;

export type ResultadoDadosPdfOrcamento =
  | { ok: true; documento: DadosDocumentoOrcamento; versao: MetaVersaoPdf; nomeArquivo: string; dadosMs: number }
  | { ok: false; status: 404 | 409 | 500; erro: string };

export async function carregarDadosPdfOrcamento(supabase: Cliente, osId: string, numero: number): Promise<ResultadoDadosPdfOrcamento> {
  const t0 = performance.now();
  const [vR, osR] = await Promise.all([
    supabase.from("vw_orcamento_versoes").select("id, numero, conteudo, congelada_em, codigo_conferencia").eq("os_id", osId).eq("numero", numero).maybeSingle(),
    supabase.from("vw_os").select("status").eq("id", osId).maybeSingle(),
  ]);
  if (vR.error || osR.error) {
    const code = vR.error?.code ?? osR.error?.code;
    if (code === "42501") return { ok: false, status: 404, erro: "Orçamento não encontrado." };
    return { ok: false, status: 500, erro: "Não foi possível ler o orçamento." };
  }
  if (!vR.data?.id || !osR.data) return { ok: false, status: 404, erro: "Orçamento não encontrado." };
  if (osR.data.status === "cancelada") return { ok: false, status: 409, erro: "OS cancelada não gera PDF para o cliente." };
  const documento = documentoDoBanco(vR.data.conteudo);
  if (!documento) return { ok: false, status: 404, erro: "Orçamento não encontrado." };

  const versao: MetaVersaoPdf = {
    numero: vR.data.numero ?? numero,
    congeladaEm: vR.data.congelada_em,
    codigoConferencia: vR.data.codigo_conferencia,
  };
  const nomeArquivo = nomeArquivoPdfOrcamento(versao.numero, documento.os_numero, normalizarPlaca(documento.veiculo_placa));
  return { ok: true, documento, versao, nomeArquivo, dadosMs: performance.now() - t0 };
}
