import { formatarData, formatarQuantidade, formatarTelefone, soDigitos } from "@/lib/formato";

/**
 * Orçamento por link (Fase 6): formatos que os componentes recebem e regras puras de tela.
 * Os tipos têm a mesma forma de `OrcamentoPublico` e `RespostaOrcamentoPublica`
 * (ARQUITETURA 13.3 e 13.6), mas ficam aqui de propósito: o componente recebe um objeto
 * montado à mão, nunca a linha do banco, e o que não está nestes tipos não chega à página.
 */
export type DadosItemOrcamento = {
  tipo: "servico" | "peca";
  descricao: string;
  quantidade: number;
  unidade: string;
  /** null só na prévia do balcão (item ainda sem preço). */
  preco_unitario_centavos: number | null;
  subtotal_centavos: number | null;
};

export type DadosDocumentoOrcamento = {
  oficina_nome: string;
  /** Só dígitos; null é caso válido: sem "Ligar" e sem "Avisar a oficina". */
  oficina_telefone: string | null;
  os_numero: number;
  veiculo_placa: string;
  veiculo_marca: string | null;
  veiculo_modelo: string | null;
  cliente_nome: string | null;
  itens: DadosItemOrcamento[];
  subtotal_servicos_centavos: number;
  subtotal_pecas_centavos: number;
  total_centavos: number;
  prazo_estimado: string | null;
  condicoes_pagamento: string | null;
};

export type TipoResposta = "aprovou" | "recusou";

export type DadosRespostaCliente = {
  tipo: TipoResposta;
  nome: string | null;
  respondido_em: string;
};

/** Situações em que a página não mostra nenhum dado (DESIGN §13.5). */
export type SituacaoSemAcesso = "vencido" | "substituido" | "atualizado" | "encerrado" | "nao_encontrado" | "limite";

/** O que a página pública recebe ao abrir (`ver_orcamento`). */
export type LeituraOrcamento =
  | { situacao: SituacaoSemAcesso }
  | {
      situacao: "aberto" | "aprovado" | "recusado";
      expira_em: string;
      documento: DadosDocumentoOrcamento;
      resposta: DadosRespostaCliente | null;
    };

export type ErroRespostaCliente = "resposta_obrigatoria" | "nome_obrigatorio" | "nome_grande_demais" | "motivo_grande_demais";

/**
 * Resultado de `responder`, chamado pelo navegador (`responder_orcamento`).
 * `falha: "servidor"` = o servidor respondeu com erro. Queda de rede: a função lança a exceção.
 */
export type ResultadoRespostaCliente =
  | { situacao: SituacaoSemAcesso }
  | { situacao: "aberto"; erro: ErroRespostaCliente }
  | { situacao: "aprovado" | "recusado"; aplicada: boolean; resposta: DadosRespostaCliente }
  | { falha: "servidor" };

export type PedidoRespostaCliente = { aprovou: boolean; nome: string | null; motivo: string | null };

export const NOME_MIN = 2;
export const NOME_MAX = 80;
export const MOTIVO_MAX = 300;
/** O contador do motivo só aparece a partir daqui (DESIGN §13.3). */
export const MOTIVO_CONTADOR_A_PARTIR = 250;
/** Guarda de IP e navegador, para o aviso (ARQUITETURA 13.11). Provisório até o advogado revisar. */
export const PRAZO_GUARDA_REDE = "12 meses";
/** Atalho "Ir para a resposta" só com mais itens que isto (DESIGN §13.2). */
export const ITENS_PARA_ATALHO = 8;

export const SUGESTOES_MOTIVO_CLIENTE = ["Achei caro", "Vou pensar", "Vou fazer em outro lugar", "Não quero o serviço"] as const;

const horaSP = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

/** ISO (UTC) -> "02/11/2026 às 10:14" (America/Sao_Paulo). */
export function formatarDataEHora(iso: string): string {
  return `${formatarData(iso)} às ${horaSP.format(new Date(iso))}`;
}

/** "2 un." / "1 h": quantidade e unidade da linha do item. */
export function formatarQuantidadeUnidade(quantidade: number, unidade: string): string {
  return `${formatarQuantidade(quantidade)} ${unidade === "un" ? "un." : unidade}`;
}

/**
 * Número para o `wa.me` (ARQUITETURA 13.12, item 6): 10 ou 11 dígitos ganham o 55;
 * 12 ou 13 começando com 55 ficam como estão; o resto é inválido (null).
 */
export function numeroWhatsAppBrasil(telefone: string | null | undefined): string | null {
  const d = soDigitos(telefone);
  if (d.length === 10 || d.length === 11) return `55${d}`;
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return d;
  return null;
}

/** Telefone da oficina na tela, sem o 55 (o banco aceita de 10 a 13 dígitos). */
export function formatarTelefoneOficina(telefone: string | null | undefined): string {
  const numero = numeroWhatsAppBrasil(telefone);
  return numero ? formatarTelefone(numero.slice(2)) : "";
}

/** `tel:` da oficina, ou null quando não há número utilizável. */
export function linkLigarOficina(telefone: string | null | undefined): string | null {
  const numero = numeroWhatsAppBrasil(telefone);
  return numero ? `tel:+${numero}` : null;
}

/** "Avisar a oficina" (DESIGN §13.14): sem valor e sem o link. */
export function linkAvisarOficina(documento: DadosDocumentoOrcamento, resposta: DadosRespostaCliente): string | null {
  const numero = numeroWhatsAppBrasil(documento.oficina_telefone);
  if (!numero) return null;
  const os = `OS #${documento.os_numero}`;
  const texto =
    resposta.tipo === "aprovou"
      ? `Olá, ${documento.oficina_nome}!${resposta.nome ? ` Aqui é ${resposta.nome}.` : ""} Aprovei o orçamento da ${os}.`
      : `Olá, ${documento.oficina_nome}! Recusei o orçamento da ${os}.`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

const diaSP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });

/** "(faltam 10 dias)" / "(falta 1 dia)" / "(vence hoje)", contando dias do calendário em São Paulo. */
export function textoDiasRestantes(expiraEm: string, agora: string): string {
  const dia = (iso: string) => Date.parse(`${diaSP.format(new Date(iso))}T00:00:00Z`);
  const dias = Math.round((dia(expiraEm) - dia(agora)) / 86_400_000);
  if (dias <= 0) return "(vence hoje)";
  return dias === 1 ? "(falta 1 dia)" : `(faltam ${dias} dias)`;
}

const SITUACOES_SEM_ACESSO: readonly string[] = ["vencido", "substituido", "atualizado", "encerrado", "nao_encontrado", "limite"];

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function textoOuNull(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function respostaDoBanco(v: unknown): DadosRespostaCliente | null {
  if (!ehObjeto(v) || (v.tipo !== "aprovou" && v.tipo !== "recusou") || typeof v.respondido_em !== "string") return null;
  return { tipo: v.tipo, nome: textoOuNull(v.nome), respondido_em: v.respondido_em };
}

/** Lista fechada de ARQUITETURA 13.3, campo a campo: o que o banco mandar além disto não chega à página. */
function documentoDoBanco(v: unknown): DadosDocumentoOrcamento | null {
  if (!ehObjeto(v) || !Array.isArray(v.itens)) return null;
  return {
    oficina_nome: String(v.oficina_nome ?? ""),
    oficina_telefone: textoOuNull(v.oficina_telefone),
    os_numero: Number(v.os_numero),
    veiculo_placa: String(v.veiculo_placa ?? ""),
    veiculo_marca: textoOuNull(v.veiculo_marca),
    veiculo_modelo: textoOuNull(v.veiculo_modelo),
    cliente_nome: textoOuNull(v.cliente_nome),
    itens: v.itens.filter(ehObjeto).map((i) => ({
      tipo: i.tipo === "peca" ? "peca" : "servico",
      descricao: String(i.descricao ?? ""),
      quantidade: Number(i.quantidade),
      unidade: String(i.unidade ?? ""),
      preco_unitario_centavos: i.preco_unitario_centavos == null ? null : Number(i.preco_unitario_centavos),
      subtotal_centavos: i.subtotal_centavos == null ? null : Number(i.subtotal_centavos),
    })),
    subtotal_servicos_centavos: Number(v.subtotal_servicos_centavos),
    subtotal_pecas_centavos: Number(v.subtotal_pecas_centavos),
    total_centavos: Number(v.total_centavos),
    prazo_estimado: textoOuNull(v.prazo_estimado),
    condicoes_pagamento: textoOuNull(v.condicoes_pagamento),
  };
}

/** Resposta de `ver_orcamento` -> objeto da página. null = formato inesperado ("Erro ao abrir"). */
export function leituraDoBanco(dado: unknown): LeituraOrcamento | null {
  if (!ehObjeto(dado) || typeof dado.situacao !== "string") return null;
  if (SITUACOES_SEM_ACESSO.includes(dado.situacao)) return { situacao: dado.situacao as SituacaoSemAcesso };
  if (dado.situacao !== "aberto" && dado.situacao !== "aprovado" && dado.situacao !== "recusado") return null;
  const documento = documentoDoBanco(dado.documento);
  if (!documento || typeof dado.expira_em !== "string") return null;
  return { situacao: dado.situacao, expira_em: dado.expira_em, documento, resposta: respostaDoBanco(dado.resposta) };
}

/** Resposta de `responder_orcamento` -> resultado da tela. Formato inesperado conta como erro do servidor. */
export function resultadoDoBanco(dado: unknown): ResultadoRespostaCliente {
  if (!ehObjeto(dado) || typeof dado.situacao !== "string") return { falha: "servidor" };
  if (SITUACOES_SEM_ACESSO.includes(dado.situacao)) return { situacao: dado.situacao as SituacaoSemAcesso };
  if (dado.situacao === "aberto" && typeof dado.erro === "string") return { situacao: "aberto", erro: dado.erro as ErroRespostaCliente };
  if (dado.situacao === "aprovado" || dado.situacao === "recusado") {
    const resposta = respostaDoBanco(dado.resposta);
    if (resposta) return { situacao: dado.situacao, aplicada: dado.aplicada === true, resposta };
  }
  return { falha: "servidor" };
}

/** Mensagem do WhatsApp (DESIGN §13.14): sem valor e sem itens, com o link em linha própria. */
export function mensagemWhatsAppOrcamento(dados: {
  oficinaNome: string;
  osNumero: number;
  placa: string;
  link: string;
  expiraEm: string;
  versao: number;
}): string {
  const os = `OS #${dados.osNumero} (placa ${dados.placa})`;
  const segunda =
    dados.versao > 1 ? `O orçamento da ${os} foi atualizado. O link anterior não vale mais.` : `O orçamento da ${os} está pronto.`;
  return [
    `Olá! Aqui é da ${dados.oficinaNome}.`,
    segunda,
    "Veja os itens e responda por este link, sem precisar de cadastro:",
    dados.link,
    `Vale até ${formatarData(dados.expiraEm)}.`,
  ].join("\n");
}

/** `wa.me` com a mensagem inteira codificada, incluindo o `#`. Sem número, a pessoa escolhe o contato. */
export function linkWhatsApp(numero: string | null, texto: string): string {
  return `https://wa.me/${numero ?? ""}?text=${encodeURIComponent(texto)}`;
}
