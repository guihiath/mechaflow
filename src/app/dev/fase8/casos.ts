/** Casos das páginas em tela inteira da vitrine (lista à parte: o servidor usa em `generateStaticParams`). */

/** Número fictício, só para a vitrine montar o link do WhatsApp. */
export const NUMERO_FICTICIO = "5500000000000";

export const CASOS_INICIAL = {
  "com-whatsapp": "Com a variável do WhatsApp, com faixa TESTE",
  "sem-whatsapp": "Sem a variável do WhatsApp (os 2 links somem)",
  producao: "Como em produção: sem faixa e sem selo TESTE",
} as const;

export const CASOS_LEGAL = {
  termos: "Termos de uso (texto atual repartido, staging: 5 seções)",
  "termos-producao": "Termos de uso como em produção (sem a seção de teste)",
  privacidade: "Política de privacidade (estrutura do mapa LGPD)",
  "sem-whatsapp": "Privacidade sem a variável do WhatsApp",
  "tabela-email": "Tabela de 3 colunas e 5 linhas + e-mail longo no texto",
  curto: "Documento com 3 seções (sem índice)",
} as const;

export type CasoInicial = keyof typeof CASOS_INICIAL;
export type CasoLegal = keyof typeof CASOS_LEGAL;
