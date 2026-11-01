/**
 * Cabeçalho que o proxy põe na requisição com o caminho pedido, para o layout saber com que
 * caminho a barra de navegação foi renderizada no servidor (ver components/layout/usar-caminho.ts).
 * Só serve para marcar o item ativo; não decide acesso.
 */
export const CABECALHO_CAMINHO = "x-mf-caminho";
