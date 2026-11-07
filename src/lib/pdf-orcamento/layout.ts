import { formatarCentavos, formatarNumeroOS, formatarPlaca, formatarQuantidade } from "../formato";
import { formatarTelefoneOficina, type DadosDocumentoOrcamento, type DadosItemOrcamento } from "../orcamento";
import { textoUnidade } from "../os";
import {
  BORDA,
  criarDocumento,
  dataHora,
  desenharCabecalho,
  desenharPlaca,
  desenharRodape,
  Escritor,
  FUNDO,
  GRAFITE,
  MARGEM,
  MM,
  SUAVE,
  type FontesPdf,
  type Fonte,
} from "../pdf/base";

/*
 * PDF do orçamento a partir da VERSÃO CONGELADA (F7-B9, DESIGN §14.10 "F7-B9"): o mesmo desenho
 * do PDF da OS (F7-B3), com título "ORÇAMENTO", "Orçamento · versão N" e a data em que a versão
 * foi congelada. O conteúdo vem só de `vw_orcamento_versoes.conteudo` (lista fechada de
 * ARQUITETURA 13.3, lida por `documentoDoBanco`): nada do estado atual da OS entra aqui.
 *
 * Puro (sem Supabase nem fs). Dinheiro chega em centavos inteiros e só é formatado aqui, com a
 * mesma função da tela (`formatarCentavos`). Nunca entra: custo, margem, CPF/CNPJ da oficina
 * (a versão não guarda), telefone ou documento do cliente, mecânico, fotos, sintoma, causa,
 * solução, pagamento, ids. O código de conferência da versão vai no rodapé.
 *
 * "Vale até" fica de fora de propósito: é a validade do LINK (que muda a cada reenvio), não da
 * versão congelada.
 */

export type MetaVersaoPdf = {
  numero: number;
  /** `congelada_em` (ISO, UTC). */
  congeladaEm: string | null;
  /** "ABCD-1234" (`codigo_conferencia` da view). */
  codigoConferencia: string | null;
};

// ------------------------------------------------------------------ colunas (180 mm úteis), as do PDF da OS

const COL_DESC = 94 * MM;
const COL_QTD = 20 * MM;
const COL_UNIT = 32 * MM;
const COL_SUB = 34 * MM;
const X_QTD_FIM = MARGEM + COL_DESC + COL_QTD;
const X_UNIT_FIM = X_QTD_FIM + COL_UNIT;
const X_SUB_FIM = X_UNIT_FIM + COL_SUB;
const RESPIRO = 6;

const TAM_ITEM = 10;
const ENTRE_ITEM = 13;
const ALTURA_COLUNAS = 18;
const ALTURA_SUBTOTAL = 22;

/** "orcamento-v2-OS1043-ABC1D23.pdf". */
export function nomeArquivoPdfOrcamento(versao: number, numeroOS: number, placaNormalizada: string): string {
  return `orcamento-v${versao}-OS${numeroOS}-${placaNormalizada || "sem-placa"}.pdf`;
}

/** Monta o PDF. `agora` vai só no rodapé ("Gerado pelo MechaFlow em …"). */
export async function gerarPdfOrcamento(
  d: DadosDocumentoOrcamento,
  v: MetaVersaoPdf,
  fontesBytes: FontesPdf,
  agora = new Date(),
): Promise<Uint8Array> {
  const osTexto = formatarNumeroOS(d.os_numero);
  const placa = formatarPlaca(d.veiculo_placa) || "—";
  const versaoTexto = `Orçamento · versão ${v.numero}`;

  const { pdf, fontes } = await criarDocumento({ titulo: `${versaoTexto} · ${osTexto} · ${placa}`, autor: d.oficina_nome, agora }, fontesBytes);
  const { normal, negrito, mono } = fontes;

  const e = new Escritor(pdf, fontes, [{ texto: `${versaoTexto} · ${osTexto} · ` }, { texto: placa, mono: true }]);
  e.novaPagina(true);

  // ---------------- cabeçalho: oficina (nome e telefone da versão) + título + número
  const tel = formatarTelefoneOficina(d.oficina_telefone);
  desenharCabecalho(e, { titulo: ["ORÇAMENTO"], numero: osTexto, oficina: d.oficina_nome, detalhes: tel ? [tel] : [] });
  e.paragrafo("Não é documento fiscal.", { fonte: negrito, tamanho: 11, entrelinha: 15 });
  e.y -= 4;

  // ---------------- placa + veículo, cliente, versão e data
  const veiculo = [d.veiculo_marca, d.veiculo_modelo].filter(Boolean).join(" ");
  desenharPlaca(e, placa, veiculo || null);
  if (d.cliente_nome?.trim()) e.paragrafo(`Cliente: ${d.cliente_nome.trim()}`, { tamanho: 11 });
  e.paragrafo(v.congeladaEm ? `${versaoTexto} · ${dataHora(v.congeladaEm)}` : versaoTexto, { fonte: negrito, tamanho: 11 });
  e.y -= 8;
  e.linha(e.y, 1, GRAFITE);
  e.y -= 4;

  // ---------------- itens (serviços e peças)
  const secoes = [
    { titulo: "Serviços", itens: d.itens.filter((i) => i.tipo === "servico"), rotuloSubtotal: "Subtotal de serviços", subtotal: d.subtotal_servicos_centavos },
    { titulo: "Peças", itens: d.itens.filter((i) => i.tipo !== "servico"), rotuloSubtotal: "Subtotal de peças", subtotal: d.subtotal_pecas_centavos },
  ].filter((s) => s.itens.length > 0);

  const alturaTotal = 14 + 24 + 18;

  const direita = (texto: string, xFim: number, y: number, fonte: Fonte, tam: number, cor = GRAFITE) =>
    e.escrever(texto, xFim - e.largura(texto, fonte, tam), y, fonte, tam, cor);
  let y0 = 0;
  const naColuna = (texto: string, xFim: number, largura: number, fonte: Fonte, tam: number) => {
    let t = tam;
    while (t > 7 && e.largura(texto, fonte, t) > largura - RESPIRO) t -= 0.5;
    direita(texto, xFim, y0, fonte, t);
  };

  const cabecalhoColunas = () => {
    e.y -= ALTURA_COLUNAS;
    const y = e.y + 5;
    e.escrever("Descrição", MARGEM, y, negrito, 9, SUAVE);
    direita("Qtd.", X_QTD_FIM, y, negrito, 9, SUAVE);
    direita("Unitário", X_UNIT_FIM, y, negrito, 9, SUAVE);
    direita("Subtotal", X_SUB_FIM, y, negrito, 9, SUAVE);
    e.linha(e.y, 0.75, BORDA);
  };

  const montar = (i: DadosItemOrcamento) => {
    const linhas = e.quebrar(i.descricao || "—", normal, TAM_ITEM, COL_DESC - RESPIRO);
    return { i, linhas, altura: linhas.length * ENTRE_ITEM + 8 };
  };

  const desenharItem = (m: ReturnType<typeof montar>) => {
    const topo = e.y;
    const yBase = topo - 4 - TAM_ITEM;
    m.linhas.forEach((l, k) => e.escrever(l, MARGEM, yBase - k * ENTRE_ITEM, normal, TAM_ITEM));
    const qtd = `${formatarQuantidade(Number(m.i.quantidade))} ${textoUnidade(m.i.unidade)}`.trim();
    y0 = yBase;
    naColuna(qtd, X_QTD_FIM, COL_QTD, normal, TAM_ITEM);
    // A versão congelada sempre tem preço (o banco recusa congelar sem); "A definir" só por segurança.
    if (m.i.preco_unitario_centavos == null || m.i.subtotal_centavos == null) {
      naColuna("A definir", X_UNIT_FIM, COL_UNIT, negrito, TAM_ITEM);
      naColuna("A definir", X_SUB_FIM, COL_SUB, negrito, TAM_ITEM);
    } else {
      naColuna(formatarCentavos(m.i.preco_unitario_centavos), X_UNIT_FIM, COL_UNIT, mono, TAM_ITEM);
      naColuna(formatarCentavos(m.i.subtotal_centavos), X_SUB_FIM, COL_SUB, mono, TAM_ITEM);
    }
    e.y = topo - m.altura;
    e.linha(e.y, 0.5, BORDA);
  };

  const continuar = (titulo: string) => {
    e.novaPagina();
    e.escrever(`${titulo.toUpperCase()} (continuação)`, MARGEM, e.y - 11, negrito, 11);
    e.y -= 18;
    cabecalhoColunas();
  };

  if (!secoes.length) {
    e.secao("Serviços e peças", 20);
    e.paragrafo("Nenhum serviço ou peça nesta versão.", { cor: SUAVE });
  }

  secoes.forEach((s, n) => {
    const ultimaSecao = n === secoes.length - 1;
    const montados = s.itens.map(montar);
    const juntoPrimeira = montados.length === 1 ? ALTURA_SUBTOTAL + (ultimaSecao ? alturaTotal : 0) : 0;
    e.secao(s.titulo, Math.min(ALTURA_COLUNAS + montados[0].altura + juntoPrimeira, e.alturaPaginaNova - 32));
    cabecalhoColunas();
    const disponivelNova = e.alturaPaginaNova - 18 - ALTURA_COLUNAS;
    montados.forEach((m, k) => {
      const ultimo = k === montados.length - 1;
      const junto = ultimo ? ALTURA_SUBTOTAL + (ultimaSecao ? alturaTotal : 0) : 0;
      if (e.y - (m.altura + junto) < FUNDO && m.altura + junto <= disponivelNova) continuar(s.titulo);
      else if (e.y - m.altura < FUNDO) continuar(s.titulo);
      desenharItem(m);
    });
    if (e.y - ALTURA_SUBTOTAL < FUNDO) continuar(s.titulo);
    e.y -= ALTURA_SUBTOTAL;
    const ys = e.y + 7;
    direita(s.rotuloSubtotal, X_UNIT_FIM, ys, negrito, 10);
    direita(formatarCentavos(s.subtotal), X_SUB_FIM, ys, mono, 10);
  });

  // ---------------- total + frase fiscal (2 de 3)
  e.y -= 14;
  e.garantir(alturaTotal - 14);
  e.linha(e.y, 2, GRAFITE);
  e.y -= 24;
  e.escrever("TOTAL", MARGEM, e.y + 6, negrito, 13);
  direita(formatarCentavos(d.total_centavos), X_SUB_FIM, e.y + 6, mono, 14);
  e.paragrafo("Não é documento fiscal.", { fonte: negrito, tamanho: 11, entrelinha: 18 });

  // ---------------- prazo e condições (só se a versão tiver)
  const prazo = d.prazo_estimado?.trim();
  const condicoes = d.condicoes_pagamento?.trim();
  if (prazo || condicoes) {
    e.y -= 6;
    if (e.y - (14 + 16 + 30) < FUNDO) e.novaPagina();
    else e.linha(e.y, 0.75, BORDA);
  }
  if (prazo) {
    e.secao("Prazo estimado", 16);
    e.paragrafo(prazo, { tamanho: 10.5, entrelinha: 14 });
  }
  if (condicoes) {
    e.secao("Condições de pagamento", 16);
    e.paragrafo(condicoes, { tamanho: 10.5, entrelinha: 14 });
  }

  // ---------------- rodapé em toda página (frase fiscal 3 de 3 + código da versão)
  const extras = ["Não é documento fiscal"];
  if (v.codigoConferencia) extras.push(`Conferência ${v.codigoConferencia}`);
  desenharRodape(e, agora, extras);

  return pdf.save({ useObjectStreams: true });
}
