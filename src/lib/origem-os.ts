/**
 * Origem do detalhe da OS (DESIGN §14.1, "Voltar do detalhe da OS"): quem veio do painel ou de
 * contas a receber volta para a mesma lista, no mesmo mês. A origem vai na URL por LISTA FECHADA
 * (`de`, `ver`, `mes`, `chave`, `pagina`, cada um conferido), nunca como URL livre: um link
 * forjado no máximo cai em `/os`.
 * Puro (sem banco e sem relógio): serve ao servidor e ao navegador.
 */
import { ehMes, type Mes } from "@/lib/painel";
import type { RecortePainel } from "@/lib/supabase/database.types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Recortes de `/painel/os` (os mesmos de `painel_lista_os`). */
export const RECORTES_PAINEL: readonly RecortePainel[] = ["entregues", "recebido", "servico", "fora_catalogo", "mecanico", "sem_mecanico"];
export const RECORTE_COM_CHAVE: ReadonlySet<RecortePainel> = new Set(["servico", "mecanico"]);

export function ehRecortePainel(v: unknown): v is RecortePainel {
  return typeof v === "string" && (RECORTES_PAINEL as readonly string[]).includes(v);
}

export type ListaPainel = { ver: RecortePainel; mes?: Mes | null; chave?: string | null; pagina?: number | null };

/** Parâmetros de uma lista do painel, já conferidos (mês atual fica sem `mes`). */
function paramsLista(l: ListaPainel): URLSearchParams {
  const q = new URLSearchParams({ ver: l.ver });
  if (RECORTE_COM_CHAVE.has(l.ver) && l.chave && UUID.test(l.chave)) q.set("id", l.chave);
  if (l.mes && ehMes(l.mes)) q.set("mes", l.mes);
  if (l.pagina && Number.isInteger(l.pagina) && l.pagina > 1 && l.pagina <= 100) q.set("pagina", String(l.pagina));
  return q;
}

/** `/painel/os?ver=…&id=…&mes=…&pagina=…` */
export function hrefListaPainel(l: ListaPainel): string {
  return `/painel/os?${paramsLista(l).toString()}`;
}

/** `/os/<id>?de=painel&ver=…` (a mesma lista vai junto, com os nomes `de_*`). */
export function hrefOSDoPainel(osId: string, l: ListaPainel): string {
  const q = new URLSearchParams({ de: "painel" });
  for (const [k, v] of paramsLista(l)) q.set(`de_${k}`, v);
  return `/os/${osId}?${q.toString()}`;
}

export const HREF_OS_DO_A_RECEBER = (osId: string) => `/os/${osId}?de=a-receber`;

type Params = Record<string, string | string[] | undefined>;
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/**
 * Para onde vai o "voltar" do detalhe da OS. `null` = sem origem conhecida (quem chama usa `/os`).
 * `de=painel` sem lista válida volta ao painel.
 */
export function voltarDaOS(sp: Params): string | null {
  const de = um(sp.de);
  if (de === "a-receber") return "/a-receber";
  if (de !== "painel") return null;
  const ver = um(sp.de_ver);
  if (!ehRecortePainel(ver)) return "/painel";
  const chave = um(sp.de_id);
  if (RECORTE_COM_CHAVE.has(ver) && !UUID.test(chave)) return "/painel";
  const mes = um(sp.de_mes);
  const pagina = Number.parseInt(um(sp.de_pagina), 10);
  return hrefListaPainel({ ver, chave, mes: ehMes(mes) ? mes : null, pagina: Number.isFinite(pagina) ? pagina : null });
}
