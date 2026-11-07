import "server-only";
import type { OSHistorico, PapelHistorico } from "@/components/historico/cartao-os-historico";
import { osDoHistorico, parteListaDoHistorico, type ParteListaHistorico } from "@/lib/painel-dados";
import type { HistoricoPlaca } from "@/lib/supabase/database.types";
import type { createClient } from "@/lib/supabase/server";

/** De 10 em 10 (DESIGN §14.6, B9). */
export const POR_PAGINA_HISTORICO = 10;

type Cliente = Awaited<ReturnType<typeof createClient>>;
export type CursorHistorico = { antes_criado_em: string; antes_id: string };
/** O que vai ao navegador por página: só as chaves cortadas por papel. */
export type PaginaHistorico = { os: OSHistorico[]; partes: ParteListaHistorico[]; proximo: CursorHistorico | null };

export const hrefOSHistorico = (id: string) => `/os/${id}`;

/**
 * Uma página de `historico_placa` já cortada por papel (F7-B7; ARQUITETURA §14.6). Serve à página
 * (primeira leitura) e ao "Mostrar mais". O papel vem da sessão no servidor, nunca do navegador; a
 * oficina vem da sessão no banco. O que sai em `pagina` vai para o navegador: só as chaves de
 * `osDoHistorico` e `parteListaDoHistorico`, nunca a linha inteira (o dono recebe custo na leitura,
 * e a tela não mostra custo).
 */
export async function lerPaginaHistorico(
  supabase: Cliente,
  papel: PapelHistorico,
  placa: string,
  cursor: CursorHistorico | null,
): Promise<{ dados: HistoricoPlaca; pagina: PaginaHistorico } | null> {
  const { data, error } = await supabase.rpc("historico_placa", {
    p_placa: placa,
    p_limite: POR_PAGINA_HISTORICO,
    p_antes_criado_em: cursor?.antes_criado_em ?? null,
    p_antes_id: cursor?.antes_id ?? null,
  });
  if (error || !data) return null;
  const dados = data as unknown as HistoricoPlaca;
  return {
    dados,
    pagina: {
      os: dados.os.map((o) => osDoHistorico(o, papel, hrefOSHistorico)),
      partes: dados.os.map((o) => parteListaDoHistorico(o, papel)),
      proximo: dados.proximo ? { antes_criado_em: dados.proximo.antes_criado_em, antes_id: dados.proximo.antes_id } : null,
    },
  };
}
