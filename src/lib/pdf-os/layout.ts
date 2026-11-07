import { formatarCentavos, formatarDocumento, formatarNumero, formatarNumeroOS, formatarPlaca, formatarQuantidade, formatarTelefone } from "../formato";
import { ROTULO_FORMA_PAGAMENTO, textoUnidade } from "../os";
import {
  BORDA,
  criarDocumento,
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
import type { DadosPdfOS } from "../supabase/database.types";

/*
 * PDF "Ordem de serviço" (OS aberta) e "Resumo final" (OS entregue), F7-B3, DESIGN §14.10.
 * Um documento, dois títulos, conforme `tipo_documento` de `dados_pdf_os` (ARQUITETURA 14.7).
 *
 * Puro (sem Supabase nem fs): recebe a lista fechada da RPC e os bytes das fontes. Dinheiro chega
 * em centavos inteiros e só é formatado aqui, com a mesma função da tela (`formatarCentavos`).
 * Nunca entra: custo, margem, CPF da oficina, telefone ou documento do cliente, mecânico, fotos,
 * sintoma, código de falha, observações, quem registrou o pagamento, ids. A RPC já não manda
 * nada disso; este arquivo também não tem onde pôr.
 */

export type OpcoesPdfOS = {
  /** Rótulo do status para "Situação: …" na Ordem de serviço (DESIGN §10.1). */
  situacao: string;
};

// ------------------------------------------------------------------ colunas (180 mm úteis)

const COL_DESC = 86 * MM; // F7-B11 (I5): 94/20/32/34 deixava Unitário e Subtotal colados com valor de 7 dígitos
const COL_QTD = 20 * MM;
const COL_UNIT = 36 * MM;
const COL_SUB = 38 * MM;
const X_QTD_FIM = MARGEM + COL_DESC + COL_QTD;
const X_UNIT_FIM = X_QTD_FIM + COL_UNIT;
const X_SUB_FIM = X_UNIT_FIM + COL_SUB; // = MARGEM + LARGURA
const RESPIRO = 10; // entre colunas

const TAM_ITEM = 10;
const ENTRE_ITEM = 13;
const ALTURA_COLUNAS = 18;
const ALTURA_SUBTOTAL = 22;

const FUSO_PADRAO = "America/Sao_Paulo";

/** "29/10/2026" no fuso da oficina (reserva: São Paulo). */
function dataNoFuso(iso: string | null | undefined, fuso: string): string {
  if (!iso) return "—";
  const opcoes: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric" };
  try {
    return new Intl.DateTimeFormat("pt-BR", { ...opcoes, timeZone: fuso || FUSO_PADRAO }).format(new Date(iso));
  } catch {
    return new Intl.DateTimeFormat("pt-BR", { ...opcoes, timeZone: FUSO_PADRAO }).format(new Date(iso));
  }
}

/** "1 item sem preço" / "2 itens sem preço". */
function itensSemPrecoTexto(n: number) {
  return n === 1 ? "1 item sem preço" : `${n} itens sem preço`;
}

/** "ordem-de-servico-OS1043-ABC1D23.pdf" / "resumo-final-OS1043-ABC1D23.pdf" (DESIGN §14.10). */
export function nomeArquivoPdfOS(tipo: DadosPdfOS["tipo_documento"], numero: number, placaNormalizada: string): string {
  const prefixo = tipo === "resumo_final" ? "resumo-final" : "ordem-de-servico";
  return `${prefixo}-OS${numero}-${placaNormalizada || "sem-placa"}.pdf`;
}

type ItemOS = DadosPdfOS["itens"][number];

/**
 * Monta o PDF. `agora` vai no rodapé ("Gerado pelo MechaFlow em …"); a rota passa o `gerado_em`
 * do banco.
 */
export async function gerarPdfOS(d: DadosPdfOS, opcoes: OpcoesPdfOS, fontesBytes: FontesPdf, agora = new Date()): Promise<Uint8Array> {
  const resumo = d.tipo_documento === "resumo_final";
  const tituloTexto = resumo ? "Resumo final" : "Ordem de serviço";
  const osTexto = formatarNumeroOS(d.os_numero);
  const placa = formatarPlaca(d.veiculo_placa) || "—";
  const fuso = d.fuso || FUSO_PADRAO;

  const { pdf, fontes } = await criarDocumento({ titulo: `${tituloTexto} · ${osTexto} · ${placa}`, autor: d.oficina_nome, agora }, fontesBytes);
  const { normal, negrito, mono } = fontes;

  const e = new Escritor(pdf, fontes, [{ texto: `${tituloTexto} · ${osTexto} · ` }, { texto: placa, mono: true }]);
  e.novaPagina(true);

  // ---------------- cabeçalho: oficina (só CNPJ, nunca CPF) + título + número
  const detalhes: string[] = [];
  if (d.oficina_cnpj) detalhes.push(`CNPJ ${formatarDocumento(d.oficina_cnpj)}`);
  const tel = formatarTelefone(d.oficina_telefone);
  if (tel) detalhes.push(tel);
  desenharCabecalho(e, {
    titulo: resumo ? ["RESUMO", "FINAL"] : ["ORDEM DE", "SERVIÇO"],
    numero: osTexto,
    oficina: d.oficina_nome,
    detalhes,
  });
  // "Não é documento fiscal" no topo (1 de 3; DESIGN §14.10).
  e.paragrafo("Não é documento fiscal.", { fonte: negrito, tamanho: 11, entrelinha: 15 });
  e.y -= 4;

  // ---------------- placa + veículo, cliente, KM, datas
  const veiculo = [[d.veiculo_marca, d.veiculo_modelo].filter(Boolean).join(" "), d.veiculo_ano ? String(d.veiculo_ano) : ""]
    .filter(Boolean)
    .join(" · ");
  desenharPlaca(e, placa, veiculo || null);
  if (d.cliente_nome?.trim()) e.paragrafo(`Cliente: ${d.cliente_nome.trim()}`, { tamanho: 11 });
  if (d.km != null) {
    e.garantir(16);
    e.y -= 15;
    e.escrever("KM ", MARGEM, e.y + 4, negrito, 11);
    e.escrever(formatarNumero(d.km), MARGEM + e.largura("KM ", negrito, 11), e.y + 4, mono, 11);
  }
  const datas = [`Aberta em ${dataNoFuso(d.criado_em, fuso)}`];
  if (resumo) datas.push(`Entregue em ${dataNoFuso(d.entregue_em, fuso)}`);
  else datas.push(`Situação: ${opcoes.situacao}`);
  e.paragrafo(datas.join(" · "), { tamanho: 11 });
  e.y -= 8;
  e.linha(e.y, 1, GRAFITE);
  e.y -= 4;

  // ---------------- itens (serviços e peças)
  const servicos = d.itens.filter((i) => i.tipo === "servico");
  const pecas = d.itens.filter((i) => i.tipo !== "servico");
  const secoes = [
    { titulo: "Serviços", itens: servicos, rotuloSubtotal: "Subtotal de serviços", subtotal: d.subtotal_servicos_centavos },
    { titulo: "Peças", itens: pecas, rotuloSubtotal: "Subtotal de peças", subtotal: d.subtotal_pecas_centavos },
  ].filter((s) => s.itens.length > 0);

  const notasTotal: string[] = [];
  if (!resumo && d.itens_sem_preco > 0) notasTotal.push(`Total até agora, sem ${itensSemPrecoTexto(d.itens_sem_preco)}.`);
  if (!resumo) notasTotal.push("Os valores podem mudar até a entrega.");
  const alturaTotal = 14 + 24 + notasTotal.length * 14 + 18;

  const direita = (texto: string, xFim: number, y: number, fonte: Fonte, tam: number, cor = GRAFITE) =>
    e.escrever(texto, xFim - e.largura(texto, fonte, tam), y, fonte, tam, cor);
  /** Alinhado à direita dentro da coluna, com respiro da coluna ao lado: valor grande diminui a letra. */
  const naColuna = (texto: string, xFim: number, largura: number, fonte: Fonte, tam: number) => {
    let t = tam;
    while (t > 7 && e.largura(texto, fonte, t) > largura - RESPIRO) t -= 0.5;
    direita(texto, xFim, y0, fonte, t);
  };
  let y0 = 0;

  const cabecalhoColunas = () => {
    e.y -= ALTURA_COLUNAS;
    const y = e.y + 5;
    e.escrever("Descrição", MARGEM, y, negrito, 9, SUAVE);
    direita("Qtd.", X_QTD_FIM, y, negrito, 9, SUAVE);
    direita("Unitário", X_UNIT_FIM, y, negrito, 9, SUAVE);
    direita("Subtotal", X_SUB_FIM, y, negrito, 9, SUAVE);
    e.linha(e.y, 0.75, BORDA);
  };

  const montar = (i: ItemOS) => {
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

  /** Página nova no meio da tabela: título "(continuação)" e títulos das colunas de novo. */
  const continuar = (titulo: string) => {
    e.novaPagina();
    e.escrever(`${titulo.toUpperCase()} (continuação)`, MARGEM, e.y - 11, negrito, 11);
    e.y -= 18;
    cabecalhoColunas();
  };

  if (!secoes.length) {
    e.secao("Serviços e peças", 20);
    e.paragrafo("Nenhum serviço ou peça lançado.", { cor: SUAVE });
  }

  secoes.forEach((s, n) => {
    const ultimaSecao = n === secoes.length - 1;
    const montados = s.itens.map(montar);
    // O título leva junto os títulos das colunas e a 1ª linha (não fica sozinho no pé); com uma
    // linha só, também o subtotal e, na última seção, o total.
    const juntoPrimeira = montados.length === 1 ? ALTURA_SUBTOTAL + (ultimaSecao ? alturaTotal : 0) : 0;
    e.secao(s.titulo, Math.min(ALTURA_COLUNAS + montados[0].altura + juntoPrimeira, e.alturaPaginaNova - 32));
    cabecalhoColunas();
    const disponivelNova = e.alturaPaginaNova - 18 - ALTURA_COLUNAS;
    montados.forEach((m, k) => {
      const ultimo = k === montados.length - 1;
      // A última linha da última seção vai junto com o subtotal e o bloco do total.
      const junto = ultimo ? ALTURA_SUBTOTAL + (ultimaSecao ? alturaTotal : 0) : 0;
      if (e.y - (m.altura + junto) < FUNDO && m.altura + junto <= disponivelNova) continuar(s.titulo);
      else if (e.y - m.altura < FUNDO) continuar(s.titulo);
      desenharItem(m);
    });
    // Subtotal da seção
    if (e.y - ALTURA_SUBTOTAL < FUNDO) continuar(s.titulo);
    e.y -= ALTURA_SUBTOTAL;
    const ys = e.y + 7;
    direita(s.rotuloSubtotal, X_UNIT_FIM, ys, negrito, 10);
    direita(formatarCentavos(s.subtotal), X_SUB_FIM, ys, mono, 10);
  });

  // ---------------- total (borda superior 2pt, mono 14) + frase fiscal (2 de 3)
  e.y -= 14;
  e.garantir(alturaTotal - 14);
  e.linha(e.y, 2, GRAFITE);
  e.y -= 24;
  e.escrever(resumo ? "TOTAL" : "TOTAL ATÉ AGORA", MARGEM, e.y + 6, negrito, 13);
  direita(formatarCentavos(d.total_centavos), X_SUB_FIM, e.y + 6, mono, 14);
  for (const nota of notasTotal) e.paragrafo(nota, { tamanho: 10, cor: SUAVE, entrelinha: 14 });
  e.paragrafo("Não é documento fiscal.", { fonte: negrito, tamanho: 11, entrelinha: 18 });

  // ---------------- causa e solução (só se preenchidas)
  const causa = d.causa_encontrada?.trim();
  const solucao = d.solucao_aplicada?.trim();
  /** Linha divisória antes de um bloco; se o título não cabe, pula de página sem desenhar a linha. */
  const divisoria = () => {
    e.y -= 6;
    if (e.y - (14 + 16 + 30) < FUNDO) e.novaPagina();
    else e.linha(e.y, 0.75, BORDA);
  };
  if (causa || solucao) divisoria();
  if (causa) {
    e.secao("Causa encontrada", 16);
    e.paragrafo(causa, { tamanho: 10.5, entrelinha: 14 });
  }
  if (solucao) {
    e.secao("Solução aplicada", 16);
    e.paragrafo(solucao, { tamanho: 10.5, entrelinha: 14 });
  }

  // ---------------- pagamento (só no Resumo final)
  if (resumo) {
    divisoria();
    e.secao("Pagamento", 16);
    const forma = d.forma_pagamento ? ROTULO_FORMA_PAGAMENTO[d.forma_pagamento] : null;
    const situacao = d.situacao_pagamento === "pago" ? `Pago em ${dataNoFuso(d.pago_em, fuso)}` : "A receber";
    e.paragrafo([forma, situacao].filter(Boolean).join(" · "), { fonte: negrito, tamanho: 11.5, entrelinha: 16 });
  }

  // ---------------- rodapé em toda página (frase fiscal 3 de 3)
  desenharRodape(e, agora, ["Não é documento fiscal"]);

  return pdf.save({ useObjectStreams: true });
}
