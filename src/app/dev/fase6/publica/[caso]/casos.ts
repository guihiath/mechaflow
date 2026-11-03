/** Casos da página pública simulada. Lista à parte: o servidor usa em `generateStaticParams`. */
export const CASOS = {
  // Estado aberto
  aberto: "Aberto: 3 itens, com telefone, prazo e condições",
  "aberto-1-item": "Aberto: 1 item, sem prazo e condições",
  "aberto-30-itens": "Aberto: 30 itens, textos longos, total de 7 dígitos",
  "aberto-valor-alto": "Aberto: R$ 1.125.450,00",
  "aberto-sem-telefone": "Aberto: oficina sem telefone, veículo só com a placa",
  // O que acontece ao responder (toque em Aprovar ou Recusar e confirme)
  "resposta-lenta": "Resposta: internet lenta (5 s)",
  "resposta-falha-rede": "Resposta: a 1ª tentativa cai na rede, a 2ª grava",
  "resposta-sem-retorno": "Resposta: 20 s sem retorno",
  "resposta-erro-servidor": "Resposta: a 1ª dá erro do servidor, a 2ª grava",
  "resposta-repetida": "Resposta: rede cai, mas já estava gravada (repetição sem aviso)",
  "resposta-outra": "Resposta: já havia outra resposta gravada",
  "resposta-deixou-de-valer": "Resposta: o link venceu com a página aberta",
  // Respondido
  aprovado: "Aprovado",
  "aprovado-sem-telefone": "Aprovado: oficina sem telefone",
  recusado: "Recusado",
  "recusado-sem-telefone": "Recusado: oficina sem telefone",
  // Sem acesso: nenhum dado
  vencido: "Vencido",
  substituido: "Substituído",
  atualizado: "Atualizado",
  encerrado: "Encerrado",
  nao_encontrado: "Não encontrado",
  limite: "Muitas tentativas",
  "erro-abrir": "Erro ao abrir",
  carregando: "Carregando",
} as const;

export type CasoPublico = keyof typeof CASOS;
