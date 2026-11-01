import type { Papel } from "@/lib/contexto";
import { osEncerrada, type StatusOS } from "@/lib/os-status";

/** Limite provisório por OS (ARQUITETURA F3.1-P7; o por plano é Fase 8). */
export const LIMITE_FOTOS_OS = 40;

/** Validade da URL assinada das fotos: 15 min (ARQUITETURA F3.1-P5). */
export const VALIDADE_URL_FOTO_S = 900;

/**
 * Quem envia foto (ARQUITETURA F3.4; o banco confere de novo): dono e atendente
 * em qualquer OS da oficina, inclusive entregue/cancelada; mecânico só na OS dele
 * e com a OS aberta (com `ve_todas_os` ele vê a de outro, mas não envia).
 */
export function podeEnviarFoto(papel: Papel, status: StatusOS, osEhDele: boolean): boolean {
  if (papel === "dono" || papel === "atendente") return true;
  return osEhDele && !osEncerrada(status);
}

/** Bucket privado das fotos da OS (ARQUITETURA F3.1-P3). */
export const BUCKET_FOTOS = "os-fotos";

/** Bucket privado da vistoria: fotos JPEG + assinatura PNG (ARQUITETURA 12.3). */
export const BUCKET_VISTORIAS = "vistorias";

/**
 * Foto da vistoria na fila (ARQUITETURA 12.3): mesma fila da Fase 3, mas registra com
 * `registrar_foto_vistoria`/`confirmar_foto_vistoria` e sobe no bucket `vistorias`.
 * `avariaId` obrigatório quando `tipo = "avaria"` (a avaria já precisa existir no banco).
 */
export type DestinoVistoria = {
  vistoriaId: string;
  avariaId: string | null;
  tipo: "avaria" | "painel" | "outro";
};
