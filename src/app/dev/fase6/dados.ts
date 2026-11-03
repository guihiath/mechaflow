import type { DadosDocumentoOrcamento, DadosItemOrcamento } from "@/lib/orcamento";

/** Dados fictícios da vitrine da Fase 6. Nada vem do banco. Nenhum link de WhatsApp é aberto nos testes. */

export const EXPIRA_EM = "2026-11-13T02:59:59.000Z"; // 12/11/2026, 23:59:59 em São Paulo
export const AGORA = "2026-11-03T12:00:00.000Z";
export const RESPONDIDO_EM = "2026-11-03T13:14:00.000Z"; // 10:14 em São Paulo

const servico = (descricao: string, quantidade: number, unidade: string, preco: number): DadosItemOrcamento => ({
  tipo: "servico",
  descricao,
  quantidade,
  unidade,
  preco_unitario_centavos: preco,
  subtotal_centavos: Math.round(quantidade * preco),
});

const peca = (descricao: string, quantidade: number, unidade: string, preco: number): DadosItemOrcamento => ({
  ...servico(descricao, quantidade, unidade, preco),
  tipo: "peca",
});

function montar(itens: DadosItemOrcamento[], extras: Partial<DadosDocumentoOrcamento> = {}): DadosDocumentoOrcamento {
  const soma = (tipo: DadosItemOrcamento["tipo"]) =>
    itens.filter((i) => i.tipo === tipo).reduce((total, i) => total + (i.subtotal_centavos ?? 0), 0);
  const subtotal_servicos_centavos = soma("servico");
  const subtotal_pecas_centavos = soma("peca");
  return {
    oficina_nome: "Diesel Forte",
    oficina_telefone: "1133334444",
    os_numero: 1042,
    veiculo_placa: "ABC1D23",
    veiculo_marca: "Volvo",
    veiculo_modelo: "FH 540",
    cliente_nome: "Transportes Silva",
    itens,
    subtotal_servicos_centavos,
    subtotal_pecas_centavos,
    total_centavos: subtotal_servicos_centavos + subtotal_pecas_centavos,
    prazo_estimado: "2 dias úteis depois da aprovação",
    condicoes_pagamento: "Pix ou boleto para 30 dias",
    ...extras,
  };
}

const ITENS_PADRAO = [
  servico("Diagnóstico eletrônico", 1, "un", 25_000),
  servico("Troca do sensor", 1, "h", 95_000),
  peca("Sensor de pressão do combustível", 5, "un", 45_000),
];

export const DOC_PADRAO = montar(ITENS_PADRAO);

export const DOC_UM_ITEM = montar([servico("Diagnóstico eletrônico", 1, "un", 25_000)], {
  prazo_estimado: null,
  condicoes_pagamento: null,
});

export const DOC_SEM_TELEFONE = montar(ITENS_PADRAO, {
  oficina_telefone: null,
  prazo_estimado: null,
  condicoes_pagamento: null,
  veiculo_marca: null,
  veiculo_modelo: null,
});

const DESCRICAO_LONGA =
  "Retífica completa do cabeçote com troca de guias, sedes e válvulas de admissão e escape, teste de estanqueidade, plaina da face e regulagem final conforme a especificação do fabricante do motor, serviço com garantia";

/** 30 itens, descrição de 200 caracteres, nome de oficina longo e total de 7 dígitos. */
export const DOC_30_ITENS = montar(
  [
    servico(DESCRICAO_LONGA.slice(0, 200), 1, "un", 28_450_000),
    ...Array.from({ length: 11 }, (_, i) => servico(`Serviço de manutenção número ${i + 2}`, 1 + (i % 3), "h", 18_000 + i * 1_500)),
    peca("Kit de turbina completo com coletor e juntas", 10, "kit", 5_250_000),
    ...Array.from({ length: 17 }, (_, i) => peca(`Peça de reposição número ${i + 2}`, 2.5 + i, "un", 12_300 + i * 900)),
  ],
  {
    oficina_nome: "Oficina Diesel Forte Caminhões e Ônibus de São Bernardo do Campo Ltda.",
    cliente_nome: "Transportadora Irmãos Silva e Companhia de Logística Rodoviária Ltda.",
  },
);

/** Prévia com item ainda sem preço (a RPC de prévia devolve valores null). */
export const DOC_ITEM_SEM_PRECO = montar([
  ...ITENS_PADRAO,
  { tipo: "peca", descricao: "Junta do coletor (lançada pelo mecânico)", quantidade: 2, unidade: "un", preco_unitario_centavos: null, subtotal_centavos: null },
]);

/** Vitrine do valor mais alto que o DESIGN §13.17 manda conferir: R$ 1.125.450,00. */
export const DOC_VALOR_ALTO = montar([servico("Motor parcial completo", 1, "un", 112_545_000)]);
