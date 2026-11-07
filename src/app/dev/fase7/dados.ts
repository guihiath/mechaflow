/**
 * Dados fictícios da vitrine da Fase 7 (F7-F1). Nada de Supabase.
 * Dinheiro em centavos inteiros; datas em ISO (UTC). "Hoje" fixo em 04/11/2026 (São Paulo),
 * para a vitrine não mudar de um dia para o outro nem divergir entre servidor e navegador.
 */
import type { DadosDevedor } from "@/components/painel/cartao-devedor";
import type { DadosLinhaOSNumero } from "@/components/painel/linha-os-numero";
import type { ProducaoMecanico } from "@/components/painel/lista-mecanicos";
import type { ServicoRanking } from "@/components/painel/lista-servicos";
import type { DetalheOSHistorico, OSHistorico, PapelHistorico } from "@/components/historico/cartao-os-historico";
import type { EventoOS } from "@/components/os/linha-tempo";
import type { StatusOS } from "@/lib/os-status";
import type { Mes } from "@/lib/painel";
import { detalheDoHistorico, osDoHistorico, type LinhaContaAReceber, type UrlsAssinadas } from "@/lib/painel-dados";
import type { HistoricoOS, HistoricoPlaca, HistoricoPlacaOS } from "@/lib/supabase/database.types";

export const HOJE = "2026-11-04";
export const MES_ATUAL: Mes = "2026-11";
export const PRIMEIRO_MES: Mes = "2025-08";
export const NUMEROS_DE = "Números de 04/11 às 10:32.";

// ---------------------------------------------------------------- linhas atrás de um número

export const LINHAS_NUMERO: DadosLinhaOSNumero[] = [
  {
    id: "n1",
    href: "#lista",
    numero: 1042,
    placa: "ABC1D23",
    cliente: "Transportes Silva",
    centavos: 345000,
    entregueEm: "2026-10-28T19:10:00Z",
    pagoEm: "2026-11-05T13:00:00Z",
    formaPagamento: "pix",
  },
  {
    id: "n2",
    href: "#lista",
    numero: 1043,
    placa: "KLM3456",
    cliente: "Cooperativa de Transportadores Autônomos do Vale do Rio Pardo Ltda.",
    centavos: 123456789,
    entregueEm: "2026-10-30T15:00:00Z",
    pagoEm: null,
    formaPagamento: "faturado",
    descricao: "Reparo no chicote do sensor de rotação, com emenda e isolamento",
  },
  {
    id: "n3",
    href: "#lista",
    numero: 988,
    placa: "QWE4R56",
    cliente: "Frota Oliveira",
    centavos: 98000,
    entregueEm: "2025-12-18T15:00:00Z",
    pagoEm: "2026-10-02T15:00:00Z",
    formaPagamento: "faturado",
  },
];

// ---------------------------------------------------------------- a receber

function osDevedor(id: string, numero: number, placa: string, entregueEm: string, totalCentavos: number, forma: DadosDevedor["os"][number]["formaPagamento"]) {
  return { id, href: "#a-receber", numero, placa, entregueEm, totalCentavos, formaPagamento: forma };
}

export const DEVEDOR_UMA_OS: DadosDevedor = {
  clienteId: "c1",
  nome: "Transportes Silva",
  telefone: "11988887777",
  totalCentavos: 250000,
  os: [osDevedor("d1", 1031, "ABC1D23", "2026-09-23T18:00:00Z", 250000, "boleto")],
};

const OITO = [
  ["d11", 1001, "FRT1A11", "2026-08-02T14:00:00Z", 1250000],
  ["d12", 1008, "FRT1A12", "2026-08-15T14:00:00Z", 87050],
  ["d13", 1015, "FRT1A13", "2026-09-01T14:00:00Z", 420000],
  ["d14", 1022, "FRT1A14", "2026-09-19T14:00:00Z", 15990],
  ["d15", 1030, "FRT1A15", "2026-10-03T14:00:00Z", 330000],
  ["d16", 1036, "FRT1A16", "2026-10-21T14:00:00Z", 64000],
  ["d17", 1040, "FRT1A17", "2026-11-03T14:00:00Z", 199900],
  ["d18", 1044, "FRT1A18", "2026-11-04T12:00:00Z", 0],
] as const;

export const DEVEDOR_OITO_OS: DadosDevedor = {
  clienteId: "c2",
  nome: "Frota Oliveira",
  telefone: "4733334444",
  totalCentavos: OITO.reduce((s, o) => s + o[4], 0),
  os: OITO.map(([id, n, p, e, v]) => osDevedor(id, n, p, e, v, "faturado")),
};

export const DEVEDOR_NOME_LONGO: DadosDevedor = {
  clienteId: "c3",
  nome: "Cooperativa de Transportadores Autônomos do Vale do Rio Pardo Ltda.",
  telefone: null,
  totalCentavos: 123456789,
  os: [osDevedor("d21", 1043, "KLM3456", "2026-10-30T15:00:00Z", 123456789, "pix")],
};

// ---------------------------------------------------------------- serviços e mecânicos

const NOMES_SERVICO = [
  "Troca de óleo",
  "Diagnóstico eletrônico",
  "Regulagem de válvulas",
  "Revisão de freios",
  "Alinhamento",
  "Balanceamento",
  "Troca de embreagem",
  "Limpeza de bicos injetores",
  "Revisão do sistema de arrefecimento com troca de mangueiras e aditivo",
  "Troca de correia",
  "Reparo de câmbio",
  "Troca de filtro de ar",
  "Troca de filtro de combustível",
  "Revisão elétrica",
  "Troca de amortecedores",
  "Solda no chassi",
  "Reparo de turbina",
  "Teste de estrada",
];
const CONTAGENS = [8, 6, 4, 3, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];

/** "Fora do catálogo" chega na mesma lista, com `servico_id` nulo (ARQUITETURA §14.5). */
const fora = (n: number): ServicoRanking => ({ id: null, nome: "Fora do catálogo", quantidadeOS: n });
// Em ordem embaralhada de propósito: o componente ordena e põe "Fora do catálogo" no fim.
export const SERVICOS_18: ServicoRanking[] = [fora(5), ...NOMES_SERVICO.map((nome, i) => ({ id: `s${i}`, nome, quantidadeOS: CONTAGENS[i] })).reverse()];
export const SERVICOS_5: ServicoRanking[] = [...NOMES_SERVICO.slice(0, 5).map((nome, i) => ({ id: `s${i}`, nome, quantidadeOS: CONTAGENS[i] })), fora(9)];
export const SERVICOS_1: ServicoRanking[] = [{ id: "s8", nome: NOMES_SERVICO[8], quantidadeOS: 1 }];

export const MECANICOS: ProducaoMecanico[] = [
  { mecanicoId: null, nome: null, quantidadeOS: 3, servicosCentavos: 120000 },
  { mecanicoId: "m2", nome: "Marcos", quantidadeOS: 8, servicosCentavos: 980000 },
  { mecanicoId: "m1", nome: "João", quantidadeOS: 12, servicosCentavos: 1845000 },
  { mecanicoId: "m3", nome: "Francisco de Assis Albuquerque Nogueira", quantidadeOS: 2, servicosCentavos: 123456789 },
  { mecanicoId: "m4", nome: "Pedro (sem OS no mês)", quantidadeOS: 0, servicosCentavos: 0 },
];


// ---------------------------------------------------------------- a receber, no formato do contrato

/** Linhas como `contas_a_receber` devolve (ARQUITETURA §14.5), para conferir `devedoresDeContas`. */
export const CONTAS_A_RECEBER: LinhaContaAReceber[] = [
  { os_id: "k1", numero: 1012, cliente_id: "cc1", cliente_nome: "Rodoviário Pampa", cliente_telefone: "51999990000", placa: "PMP2B34", entregue_em: "2026-08-20T17:00:00Z", dias: 76, forma_pagamento: "boleto", total_centavos: 410000, cliente_total_centavos: 530000, cliente_qtd_os: 2 },
  { os_id: "k2", numero: 1039, cliente_id: "cc1", cliente_nome: "Rodoviário Pampa", cliente_telefone: "51999990000", placa: "PMP2B35", entregue_em: "2026-11-03T21:30:00Z", dias: 1, forma_pagamento: "faturado", total_centavos: 120000, cliente_total_centavos: 530000, cliente_qtd_os: 2 },
  { os_id: "k3", numero: 1044, cliente_id: "cc2", cliente_nome: "José Aparecido", cliente_telefone: null, placa: "JAP9C87", entregue_em: "2026-11-04T12:00:00Z", dias: 0, forma_pagamento: null, total_centavos: 45000, cliente_total_centavos: 45000, cliente_qtd_os: 1 },
];

// ---------------------------------------------------------------- histórico, no formato do contrato

function imagem(cor: string, texto: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="${cor}"/><circle cx="200" cy="140" r="70" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="18"/><text x="200" y="270" font-family="sans-serif" font-size="28" font-weight="700" fill="#fff" text-anchor="middle">${texto}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** Faz o papel do app que assina as URLs por 15 min (aqui, imagens desenhadas na hora). */
export const URLS: UrlsAssinadas = new Map(
  (
    [
      ["oficina/h0/f1.jpg", "#5B6B7A", "1"],
      ["oficina/h0/f2.jpg", "#7A5B3F", "2"],
      ["oficina/h0/f3.jpg", "#3F6B5B", "3"],
    ] as const
  ).flatMap(([caminho, cor, n]) => [
    [caminho, { miniatura: imagem(cor, n), grande: imagem(cor, n) }] as const,
    [caminho.replace(".jpg", "-mini.jpg"), { miniatura: imagem(cor, n) }] as const,
  ]),
);

export const EVENTOS: EventoOS[] = [
  { id: "e1", tipo: "texto", texto: "Pagamento registrado", em: "2026-11-05T13:00:00Z", por: "Ana" },
  { id: "e2", tipo: "status", status: "entregue", em: "2026-11-02T18:00:00Z", por: "Ana" },
  { id: "e3", tipo: "status", status: "pronta", em: "2026-11-01T20:00:00Z", por: "João" },
  { id: "e4", tipo: "texto", texto: "Ana definiu o preço de: Anel de vedação", em: "2026-10-30T12:00:00Z", por: "Ana" },
  { id: "e5", tipo: "status", status: "em_andamento", em: "2026-10-29T14:00:00Z", por: "João" },
  { id: "e6", tipo: "status", status: "aprovada", em: "2026-10-29T13:00:00Z", por: "Ana" },
  { id: "e7", tipo: "status", status: "aguardando_orcamento", em: "2026-10-29T11:40:00Z", por: "Ana" },
];

const SINTOMAS = [
  "Luz de injeção acesa, perdendo força na subida e soltando fumaça preta quando carregado, principalmente depois de rodar mais de duas horas",
  "Barulho na roda dianteira",
  "Revisão dos 400 mil",
  "Freio puxando para a direita",
  "Vazamento de óleo no cárter",
];

const STATUS: StatusOS[] = ["entregue", "em_andamento", "entregue", "cancelada", "entregue"];

/** 34 OS da placa, da mais nova para a mais antiga (2026 a 2024), com todas as chaves do dono. */
const OS_PLACA: HistoricoPlacaOS[] = Array.from({ length: 34 }, (_, i) => {
  const status = STATUS[i % STATUS.length];
  const criado = new Date(Date.UTC(2026, 9, 29, 11, 40) - i * 26 * 86_400_000);
  const entregue = status === "entregue" ? new Date(criado.getTime() + 4 * 86_400_000).toISOString() : null;
  return {
    id: `h${i}`,
    numero: 1042 - i * 7,
    status,
    criado_em: criado.toISOString(),
    entregue_em: entregue,
    cancelado_em: status === "cancelada" ? criado.toISOString() : null,
    km: 418950 - i * 9300,
    horimetro: null,
    sintoma_relatado: SINTOMAS[i % SINTOMAS.length],
    codigo_falha: i === 0 ? "SPN 157 FMI 18" : null,
    causa_encontrada: status === "cancelada" ? null : "Sensor de pressão com defeito",
    solucao_aplicada: status === "entregue" ? "Troca do sensor e teste em estrada" : null,
    abre_detalhe: i === 1,
    qtd_itens: 4,
    qtd_fotos: i === 0 ? 3 : 0,
    qtd_vistorias: i % 3 === 1 ? 0 : i === 2 ? 2 : 1,
    mecanico_nome: i % 2 ? "Marcos" : "João",
    motivo_cancelamento: status === "cancelada" ? "Cliente desistiu: levou para a concessionária" : null,
    cliente_nome: i % 4 === 3 ? "Frota Oliveira" : "Transportes Silva",
    observacoes: i === 0 ? "Cliente pediu para guardar as peças trocadas." : null,
    total_centavos: i === 4 ? 123456789 : 345000,
    forma_pagamento: status === "entregue" ? (i === 0 ? "faturado" : "pix") : null,
    pago_em: status === "entregue" && i !== 0 ? new Date(criado.getTime() + 7 * 86_400_000).toISOString() : null,
    custo_total_centavos: 210000,
  };
});

/** Chaves que o mecânico recebe (ARQUITETURA §14.6). O resto NÃO existe na resposta dele. */
const CHAVES_MECANICO = [
  "id",
  "numero",
  "status",
  "criado_em",
  "entregue_em",
  "cancelado_em",
  "km",
  "horimetro",
  "sintoma_relatado",
  "codigo_falha",
  "causa_encontrada",
  "solucao_aplicada",
  "abre_detalhe",
  "qtd_itens",
  "qtd_fotos",
  "qtd_vistorias",
] as const satisfies readonly (keyof HistoricoPlacaOS)[];

/** Faz o papel do banco: devolve a OS só com as chaves de cada papel. */
function lerComo(o: HistoricoPlacaOS, papel: PapelHistorico): HistoricoPlacaOS {
  if (papel === "dono") return o;
  if (papel === "atendente") {
    const copia = { ...o };
    delete copia.custo_total_centavos;
    return copia;
  }
  return Object.fromEntries(CHAVES_MECANICO.map((k) => [k, o[k]])) as HistoricoPlacaOS;
}

export const HISTORICO_RESUMO = { qtd_os: OS_PLACA.length, qtd_vistorias: 22, primeira_os_em: OS_PLACA[OS_PLACA.length - 1].criado_em };
export const HISTORICO_VEICULO = {
  id: "v1",
  placa: "ABC1D23",
  tipo: "caminhao",
  marca: "Volvo",
  modelo: "FH 540",
  ano_modelo: 2019,
  km_atual: 418950,
  horimetro_atual: null,
} satisfies NonNullable<HistoricoPlaca["veiculo"]>;

export function historicoComo(papel: PapelHistorico): OSHistorico[] {
  return OS_PLACA.map((o) => osDoHistorico(lerComo(o, papel), papel, () => "#historico"));
}

type VistoriaContrato = HistoricoOS["vistorias"][number];

/** Vistoria como `historico_os` devolveria ao balcão; para o mecânico, só as chaves dele. */
function vistoria(o: HistoricoPlacaOS, extra: Partial<VistoriaContrato>, papel: PapelHistorico): VistoriaContrato {
  const comum: VistoriaContrato = {
    id: `${o.id}-v1`,
    tipo: "entrada",
    status: "concluida",
    concluida_em: o.criado_em,
    anulada_em: null,
    km: o.km,
    horimetro: null,
    combustivel: "tres_quartos",
    objetos: ["Estepe", "Macaco", "Rádio PX"],
    sem_avarias: false,
    observacoes: "Cabine com cheiro forte de diesel.",
    itens: [
      { descricao: "Faróis", situacao: "ok", observacao: null },
      { descricao: "Pneus", situacao: "com_problema", observacao: "Dianteiro esquerdo careca" },
      { descricao: "Retrovisores", situacao: "ok", observacao: null },
      { descricao: "Tacógrafo", situacao: "nao_se_aplica", observacao: null },
    ],
    avarias: [{ id: "a1", lado: "lateral_esquerda", descricao: "Amassado no para-lama, já existente" }],
    fotos: [],
    complementos: [{ id: "c1", texto: "Motorista avisou depois que o tacógrafo foi trocado.", criado_em: "2026-10-29T15:10:00Z" }],
    ...extra,
  };
  if (papel === "mecanico") return comum;
  return {
    ...comum,
    complementos: comum.complementos.map((c) => ({ ...c, criado_por_nome: "Pedro Mecanico" })),
    concluida_por_nome: "Ana",
    assinado_por_nome: "Carlos",
    sem_assinatura_motivo: null,
    assinatura_caminho: "oficina/v/assinatura.png",
    anulada_por_nome: comum.status === "anulada" ? "Ana" : null,
    motivo_anulacao: comum.status === "anulada" ? "Feita na OS errada: era o caminhão da OS #6" : null,
  };
}

/** Como `historico_os` devolveria para o papel (sem preço para o mecânico). */
function historicoOS(o: HistoricoPlacaOS, papel: PapelHistorico): HistoricoOS {
  const i = Number(o.id.slice(1));
  const mecanico = papel === "mecanico";
  const preco = (unit: number, sub: number, custo: number) =>
    mecanico ? {} : { preco_unitario_centavos: unit, subtotal_centavos: sub, ...(papel === "dono" ? { custo_unitario_centavos: custo } : {}) };
  return {
    os_id: o.id,
    itens: [
      { id: `${o.id}-s1`, tipo: "servico", descricao: "Troca do sensor", quantidade: 1, unidade: "h", ...preco(95000, 95000, 0) },
      { id: `${o.id}-s2`, tipo: "servico", descricao: "Teste em estrada", quantidade: 1.5, unidade: "h", ...preco(16667, 25000, 0) },
      {
        id: `${o.id}-p1`,
        tipo: "peca",
        descricao: "Sensor de pressão do rail common rail original do fabricante, com chicote e conector novos",
        quantidade: 1,
        unidade: "un",
        ...preco(200000, 200000, 150000),
      },
      { id: `${o.id}-p2`, tipo: "peca", descricao: "Anel de vedação", quantidade: 4, unidade: "un", ...preco(6250, 25000, 3000) },
    ],
    fotos:
      i === 0
        ? ([1, 2, 3] as const).map((n) => ({
            id: `f${n}`,
            categoria: (["diagnostico", "peca_defeituosa", "peca_trocada"] as const)[n - 1],
            legenda: n === 1 ? "Sensor com conector oxidado" : null,
            largura: 400,
            altura: 300,
            caminho: `oficina/h0/f${n}.jpg`,
            caminho_miniatura: `oficina/h0/f${n}-mini.jpg`,
            criado_em: o.criado_em,
          }))
        : [],
    vistorias:
      o.qtd_vistorias === 0
        ? []
        : i === 2
          ? [vistoria(o, {}, papel), vistoria(o, { id: `${o.id}-v0`, status: "anulada", anulada_em: o.criado_em }, papel)]
          : [vistoria(o, {}, papel)],
  };
}

export function detalheComo(id: string, papel: PapelHistorico): DetalheOSHistorico {
  const o = OS_PLACA.find((x) => x.id === id) ?? OS_PLACA[0];
  const lida = lerComo(o, papel);
  const d = detalheDoHistorico(lida, historicoOS(lida, papel), papel, URLS, { leitura: () => "#historico", pdf: () => "#historico" });
  // Linha do tempo: vem de outra leitura (não de `historico_os`), só para dono e atendente.
  return papel === "mecanico" ? d : { ...d, eventos: EVENTOS };
}
