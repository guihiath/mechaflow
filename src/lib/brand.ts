/**
 * Constantes de marca usadas fora do CSS (manifest, metadata, icones).
 * Fonte de verdade: ../docs/DESIGN.md (secoes 2 e 7).
 */
export const APP_NAME = "MechaFlow";
export const APP_TAGLINE = "Ordens de serviço para oficina diesel";
/** Grafite: theme-color e tela de abertura do PWA, iguais nos dois temas. */
export const THEME_COLOR = "#14161A";
export const BACKGROUND_COLOR = "#14161A";

/**
 * Ambiente: "producao" so na Vercel Production. Qualquer outro valor (ou vazio)
 * mostra a faixa "TESTE" no cabecalho (DESIGN 5.7).
 */
export const EH_PRODUCAO = process.env.NEXT_PUBLIC_AMBIENTE === "producao";
