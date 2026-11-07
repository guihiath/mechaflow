/**
 * Fase 7: converte o que as RPCs devolvem (ARQUITETURA §14.5 e §14.6, tipos em
 * `database.types.ts`) nas props dos componentes de `components/painel` e `components/historico`.
 * Funções puras, sem banco e sem relógio: servem tanto à página (servidor) quanto à vitrine.
 * Dinheiro continua em centavos inteiros; a formatação fica nos componentes.
 */
import type { DetalheOSHistorico, ItemHistorico, OSHistorico, PapelHistorico, VistoriaHistorico } from "@/components/historico/cartao-os-historico";
import type { VistoriaMecanico } from "@/components/historico/vistoria-sem-assinatura";
import type { DadosDevedor } from "@/components/painel/cartao-devedor";
import type { DadosLinhaOSNumero } from "@/components/painel/linha-os-numero";
import type { ProducaoMecanico } from "@/components/painel/lista-mecanicos";
import type { ServicoRanking } from "@/components/painel/lista-servicos";
import type { FotoTelaCheiaDados } from "@/components/os/foto-tela-cheia";
import type { Database, HistoricoOS, HistoricoPlaca, HistoricoPlacaOS, PainelMes } from "@/lib/supabase/database.types";

type Funcoes = Database["public"]["Functions"];
export type LinhaPainelListaOS = Funcoes["painel_lista_os"]["Returns"][number];
export type LinhaContaAReceber = Funcoes["contas_a_receber"]["Returns"][number];

/** Linha de `painel_lista_os` -> `LinhaOSNumero`. `detalhe` (fora do catálogo) vira a descrição. */
export function linhaDoPainel(r: LinhaPainelListaOS, href: string): DadosLinhaOSNumero {
  return {
    id: r.os_id,
    href,
    numero: r.numero,
    placa: r.placa,
    cliente: r.cliente_nome,
    centavos: r.valor_centavos,
    entregueEm: r.entregue_em,
    pagoEm: r.pago_em,
    formaPagamento: r.forma_pagamento,
    descricao: r.detalhe,
  };
}

/**
 * Linhas de `contas_a_receber` (já na ordem da tela) -> um `CartaoDevedor` por cliente.
 * Total e contagem do cliente vêm da leitura (`cliente_total_centavos`, `cliente_qtd_os`), nunca
 * da soma do que está na tela.
 */
export function devedoresDeContas(linhas: readonly LinhaContaAReceber[], hrefOS: (osId: string) => string): DadosDevedor[] {
  const porCliente = new Map<string, DadosDevedor>();
  for (const l of linhas) {
    let d = porCliente.get(l.cliente_id);
    if (!d) {
      d = {
        clienteId: l.cliente_id,
        nome: l.cliente_nome,
        telefone: l.cliente_telefone,
        totalCentavos: l.cliente_total_centavos,
        quantidadeOS: l.cliente_qtd_os,
        os: [],
      };
      porCliente.set(l.cliente_id, d);
    }
    d.os.push({
      id: l.os_id,
      href: hrefOS(l.os_id),
      numero: l.numero,
      placa: l.placa,
      entregueEm: l.entregue_em,
      dias: l.dias,
      totalCentavos: l.total_centavos,
      formaPagamento: l.forma_pagamento,
    });
  }
  return [...porCliente.values()];
}

/** `painel_mes.servicos` -> `ListaServicos` (a linha com `servico_id` nulo é "Fora do catálogo"). */
export function servicosDoPainel(p: PainelMes): ServicoRanking[] {
  return p.servicos.map((s) => ({ id: s.servico_id, nome: s.nome, quantidadeOS: s.qtd_os }));
}

/** `painel_mes.produtividade` -> `ListaMecanicos`. */
export function mecanicosDoPainel(p: PainelMes): ProducaoMecanico[] {
  return p.produtividade.map((m) => ({
    mecanicoId: m.mecanico_id,
    nome: m.nome,
    quantidadeOS: m.qtd_os,
    servicosCentavos: m.servicos_centavos,
  }));
}

/** "Volvo FH 540 · 2019" (sem os vazios). */
export function textoVeiculoHistorico(v: NonNullable<HistoricoPlaca["veiculo"]>): string {
  return [[v.marca, v.modelo].filter(Boolean).join(" "), v.ano_modelo ? String(v.ano_modelo) : null].filter(Boolean).join(" · ");
}

/** "12 OS · 9 vistorias · desde 2024" (resumo do veículo inteiro, não da página). */
export function textoResumoHistorico(r: NonNullable<HistoricoPlaca["resumo"]>): string {
  const partes = [`${r.qtd_os} OS`];
  if (r.qtd_vistorias > 0) partes.push(r.qtd_vistorias === 1 ? "1 vistoria" : `${r.qtd_vistorias} vistorias`);
  if (r.primeira_os_em) partes.push(`desde ${r.primeira_os_em.slice(0, 4)}`);
  return partes.join(" · ");
}

/**
 * OS de `historico_placa` -> `CartaoOSHistorico` fechado. Para o mecânico, só copia as chaves da
 * lista fechada (o banco já não manda as outras; aqui é a segunda trava).
 * - `qtd_vistorias > 0` vira "Vistoria feita": a lista não diz se alguma foi anulada; isso só
 *   aparece ao abrir (`historico_os`).
 * - `abre_detalhe` decide o "Abrir OS" do mecânico.
 */
export function osDoHistorico(o: HistoricoPlacaOS, papel: PapelHistorico, hrefOS: (osId: string) => string): OSHistorico {
  const base: OSHistorico = {
    id: o.id,
    numero: o.numero,
    status: o.status,
    abertaEm: o.criado_em,
    km: o.km,
    sintoma: o.sintoma_relatado,
    contagem: { itens: o.qtd_itens, fotos: o.qtd_fotos },
    vistoria: o.qtd_vistorias > 0 ? "concluida" : null,
    hrefOS: papel !== "mecanico" || o.abre_detalhe ? hrefOS(o.id) : null,
  };
  if (papel === "mecanico") return base;
  return {
    ...base,
    cliente: o.cliente_nome ?? null,
    totalCentavos: o.total_centavos ?? null,
    pago: o.status === "entregue" ? Boolean(o.pago_em) : null,
    motivoCancelamento: o.motivo_cancelamento ?? null,
  };
}

/** URLs já assinadas (por 15 min, só ao abrir), indexadas pelo `caminho` do Storage. */
export type UrlsAssinadas = ReadonlyMap<string, { miniatura?: string | null; grande?: string | null }>;

function item(i: HistoricoOS["itens"][number], comPreco: boolean): ItemHistorico {
  const base: ItemHistorico = { id: i.id, descricao: i.descricao, quantidade: i.quantidade, unidade: i.unidade };
  return comPreco ? { ...base, unitarioCentavos: i.preco_unitario_centavos ?? null, subtotalCentavos: i.subtotal_centavos ?? null } : base;
}

function vistoriaMecanico(v: HistoricoOS["vistorias"][number]): VistoriaMecanico {
  // Cópia chave a chave: nada de espalhar o objeto (lista fechada, DESIGN §14.7).
  return {
    id: v.id,
    tipo: v.tipo,
    status: v.status,
    concluida_em: v.concluida_em,
    anulada_em: v.anulada_em,
    km: v.km,
    horimetro: v.horimetro,
    combustivel: v.combustivel,
    objetos: v.objetos,
    sem_avarias: v.sem_avarias,
    observacoes: v.observacoes,
    itens: v.itens,
    avarias: v.avarias,
    complementos: v.complementos.map((c) => ({ id: c.id, texto: c.texto, criado_em: c.criado_em })),
  };
}

/**
 * `historico_os` + a OS da lista -> `DetalheOSHistorico` (o que aparece ao expandir).
 * Causa, solução, código de falha, entrega, mecânico, observações, total e pagamento vêm da OS da
 * lista (`historico_placa`); itens, fotos e vistorias, de `historico_os`. O total é o da leitura;
 * a divisão serviços/peças soma os subtotais dos itens (centavos inteiros).
 * `eventos` (LinhaTempo) não vem de nenhuma das duas leituras: quem quiser passa à parte.
 */
export function detalheDoHistorico(
  o: HistoricoPlacaOS,
  h: HistoricoOS,
  papel: PapelHistorico,
  urls: UrlsAssinadas,
  links?: { leitura?: (vistoriaId: string) => string; pdf?: (vistoriaId: string) => string },
): DetalheOSHistorico {
  const mecanico = papel === "mecanico";
  const servicos = h.itens.filter((i) => i.tipo === "servico");
  const pecas = h.itens.filter((i) => i.tipo !== "servico");
  const fotos: FotoTelaCheiaDados[] = h.fotos.map((f) => ({
    id: f.id,
    categoria: f.categoria,
    legenda: f.legenda,
    estado: "enviada",
    src: urls.get(f.caminho_miniatura)?.miniatura ?? urls.get(f.caminho)?.miniatura ?? null,
    srcGrande: urls.get(f.caminho)?.grande ?? null,
  }));
  const vistorias: VistoriaHistorico[] = h.vistorias.map((v) => {
    const em = (v.status === "anulada" ? v.anulada_em : v.concluida_em) ?? v.concluida_em ?? v.anulada_em ?? o.criado_em;
    if (mecanico) return { id: v.id, tipo: v.tipo, status: v.status, em, leitura: v.status === "concluida" ? vistoriaMecanico(v) : null };
    return {
      id: v.id,
      tipo: v.tipo,
      status: v.status,
      em,
      por: v.status === "anulada" ? (v.anulada_por_nome ?? null) : (v.concluida_por_nome ?? null),
      motivo: v.motivo_anulacao ?? null,
      hrefLeitura: v.status === "concluida" ? (links?.leitura?.(v.id) ?? null) : null,
      hrefPdf: v.status === "concluida" ? (links?.pdf?.(v.id) ?? null) : null,
    };
  });

  const base: DetalheOSHistorico = {
    entregueEm: o.entregue_em,
    causa: o.causa_encontrada,
    solucao: o.solucao_aplicada,
    codigoFalha: o.codigo_falha,
    servicos: servicos.map((i) => item(i, !mecanico)),
    pecas: pecas.map((i) => item(i, !mecanico)),
    vistorias,
    fotos,
  };
  if (mecanico) return base;

  const soma = (lista: typeof h.itens) => lista.reduce((s, i) => s + (i.subtotal_centavos ?? 0), 0);
  return {
    ...base,
    mecanico: o.mecanico_nome ?? null,
    totais:
      typeof o.total_centavos === "number"
        ? { servicosCentavos: soma(servicos), pecasCentavos: soma(pecas), totalCentavos: o.total_centavos }
        : null,
    pagamento: o.status === "entregue" ? { pagoEm: o.pago_em ?? null, forma: o.forma_pagamento ?? null } : null,
    observacoes: o.observacoes ?? null,
  };
}
