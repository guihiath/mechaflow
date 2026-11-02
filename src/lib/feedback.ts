import { formatarDataHora, ROTULO_PAPEL } from "@/lib/formato";

/**
 * "Enviar feedback" (F5-F1), só fora de produção. Nada aqui usa a rede: o texto sai pelo
 * compartilhar do aparelho, o rascunho fica no localStorage e os dados vêm do navegador.
 *
 * O que vai junto é uma lista fechada (ver `montarTextoFeedback`): nunca e-mail, token, ids
 * ou dado de cliente. Por isso a tela é o caminho mascarado, sem parâmetros de busca.
 */

const CHAVE_RASCUNHO = "mf-feedback:rascunho";

export type PapelFeedback = keyof typeof ROTULO_PAPEL;

// Quem sabe o papel é o layout (servidor), e o cabeçalho é desenhado por página, às vezes pelo
// cliente. O layout registra aqui; quem envia só lê na hora de montar o texto.
let papelAtual: PapelFeedback | null = null;

export function definirPapelFeedback(papel: PapelFeedback | null) {
  papelAtual = papel;
}

/** "/clientes/3f9a…" vira "/clientes/[id]": trecho com número ou muito longo é identificador. */
export function mascararCaminho(caminho: string): string {
  return caminho
    .split("/")
    .map((trecho) => (/\d/.test(trecho) || trecho.length > 24 ? "[id]" : trecho))
    .join("/");
}

function comoFoiAberto(): string {
  const instalado =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (instalado) return "app instalado";
  const ua = navigator.userAgent;
  return /Safari/.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|EdgiOS|OPiOS|Android/.test(ua) ? "Safari" : "navegador";
}

/** Texto final: o que a pessoa escreveu + os dados automáticos, lidos neste instante. */
export function montarTextoFeedback(texto: string): string {
  return [
    texto.trim(),
    "",
    "--- MechaFlow (teste) ---",
    `Tela: ${mascararCaminho(window.location.pathname)}`,
    `Papel: ${papelAtual ? ROTULO_PAPEL[papelAtual] : "não identificado"}`,
    `Versão: ${process.env.NEXT_PUBLIC_VERSAO_APP || "local"}`,
    `Data e hora: ${formatarDataHora(new Date().toISOString())} (São Paulo)`,
    `Internet: ${navigator.onLine ? "com internet" : "sem internet"}`,
    `Aberto em: ${comoFoiAberto()}`,
  ].join("\n");
}

// localStorage pode falhar (modo privado, cota): o rascunho é conveniência, nunca erro na tela.
export function lerRascunhoFeedback(): string {
  try {
    return localStorage.getItem(CHAVE_RASCUNHO) ?? "";
  } catch {
    return "";
  }
}

export function guardarRascunhoFeedback(texto: string) {
  try {
    if (texto.trim()) localStorage.setItem(CHAVE_RASCUNHO, texto);
    else localStorage.removeItem(CHAVE_RASCUNHO);
  } catch {
    // segue sem rascunho
  }
}

export function apagarRascunhoFeedback() {
  guardarRascunhoFeedback("");
}
