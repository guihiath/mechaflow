/**
 * Regras do editor do checklist da vistoria (F4-B3; DESIGN §12.16, ARQUITETURA 12.1 V2/V3).
 * Sem "server-only": a mesma validação roda no navegador (antes de enviar) e na Server Action.
 */

export type ItemChecklist = { id: string; descricao: string; ordem: number; ativo: boolean };

/** DESIGN §12.16: "Nome do item" até 60 caracteres (o banco aceita 2..80). */
export const MAX_NOME_ITEM = 60;

/** Mesma normalização do trigger `tg_checklist_item_normalizar`: espaços repetidos viram um. */
export function normalizarNomeItem(nome: string): string {
  return nome.replace(/\s+/g, " ").trim();
}

function chaveNome(nome: string): string {
  return normalizarNomeItem(nome).toLocaleLowerCase("pt-BR");
}

/** Erro do campo "Nome do item" ou undefined. `itens` = todos do modelo (ativos e desativados). */
export function validarNomeItem(nome: string, itens: ItemChecklist[], ignorarId?: string): string | undefined {
  const n = normalizarNomeItem(nome);
  if (!n) return "Escreva o nome do item.";
  if (n.length < 2) return "O nome precisa ter pelo menos 2 letras.";
  if (n.length > MAX_NOME_ITEM) return `Use até ${MAX_NOME_ITEM} caracteres.`;
  const igual = itens.find((i) => i.id !== ignorarId && chaveNome(i.descricao) === chaveNome(n));
  if (igual) {
    return igual.ativo
      ? "Já existe um item com esse nome."
      : "Já existe um item com esse nome nos desativados. Use “Reativar” na lista.";
  }
  return undefined;
}

/**
 * Quantas trocas a RPC `mover_item_checklist` precisa para o item passar o próximo ATIVO.
 * A RPC troca com o vizinho imediato pela ordem, inclusive um desativado (que a tela não
 * mostra); por isso a ação repete a troca até passar os desativados do caminho.
 * 0 = já está na ponta (entre os ativos).
 */
export function trocasParaMover(itens: ItemChecklist[], id: string, direcao: "subir" | "descer"): number {
  const i = itens.findIndex((x) => x.id === id);
  if (i < 0 || !itens[i].ativo) return 0;
  const passo = direcao === "subir" ? -1 : 1;
  let trocas = 0;
  for (let j = i + passo; j >= 0 && j < itens.length; j += passo) {
    trocas += 1;
    if (itens[j].ativo) return trocas;
  }
  return 0;
}
