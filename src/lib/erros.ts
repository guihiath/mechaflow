/**
 * Traduz erros do Supabase (codigos das RPCs e do Postgres) para pt-BR.
 * Lista de codigos: docs/ARQUITETURA.md, secao 7.5.
 */
const MENSAGENS: Record<string, string> = {
  nao_autenticado: "Faça login para continuar.",
  acesso_negado: "Você não tem permissão para isso.",
  usuario_ja_tem_oficina: "Esta conta já pertence a uma oficina.",
  termos_desatualizados: "Os termos foram atualizados. Recarregue a página.",
  nome_obrigatorio: "Informe o nome.",
  nome_oficina_obrigatorio: "Informe o nome da oficina.",
  convite_invalido: "Link de convite inválido.",
  convite_usado: "Este convite já foi usado. Peça um novo ao dono.",
  convite_expirado: "Este convite expirou. Peça um novo ao dono.",
  convite_revogado: "Este convite foi cancelado.",
  convite_nao_encontrado: "Convite não encontrado ou já usado.",
  limite_convites: "Muitos convites abertos. Cancele alguns antes.",
  papel_invalido: "Dados do convite inválidos.",
  validade_invalida: "Dados do convite inválidos.",
  nao_pode_alterar_a_si_mesmo: "Você não pode alterar o seu próprio acesso.",
  membro_nao_encontrado: "Funcionário não encontrado.",
  sem_oficina: "Sua conta não está ligada a uma oficina.",
  // Fase 2 — OS (docs/ARQUITETURA.md, Fase 2, §F2.8)
  os_nao_encontrada: "OS não encontrada. Ela não existe ou não está com você.",
  status_mudou: "Esta OS mudou enquanto você olhava. A tela foi atualizada.",
  transicao_invalida: "Essa mudança de status não é permitida agora.",
  os_fechada: "Esta OS já foi encerrada e não pode mais ser alterada.",
  os_nao_entregue: "O pagamento só pode ser registrado depois da entrega.",
  os_nao_esta_em_andamento: "Só dá para lançar itens com a OS em andamento.",
  chave_obrigatoria: "Algo deu errado ao enviar. Recarregue a página e tente de novo.",
  autorizacao_obrigatoria: "Informe quem autorizou o serviço.",
  telefone_invalido: "Telefone inválido. Use DDD + número.",
  km_invalido: "KM inválido. Use só números. Ex.: 418950",
  placa_invalida: "Placa inválida. Ex.: ABC1D23 ou ABC1234.",
  placa_ja_cadastrada: "Esta placa acabou de ser cadastrada. Atualizamos os dados do veículo.",
  veiculo_nao_encontrado: "Veículo não encontrado.",
  cliente_nao_encontrado: "Cliente não encontrado.",
  cliente_obrigatorio: "Escolha o cliente ou toque em “Cliente novo”.",
  mecanico_invalido: "Essa pessoa não está ativa na equipe.",
  motivo_obrigatorio: "Escreva o motivo.",
  orcamento_sem_itens: "Adicione pelo menos um serviço ou peça ao orçamento.",
  os_itens_sem_preco: "Há itens sem preço. Defina o preço antes de continuar.",
  resposta_obrigatoria: "Diga se o cliente aprovou ou recusou.",
  canal_invalido: "Escolha como o cliente respondeu.",
  causa_obrigatoria: "Escreva a causa encontrada.",
  solucao_obrigatoria: "Escreva a solução aplicada.",
  forma_pagamento_obrigatoria: "Escolha a forma de pagamento.",
  pagamento_obrigatorio: "Diga se foi pago agora ou se fica a receber.",
  data_pagamento_invalida: "Data de pagamento inválida.",
  troca_modo_nao_permitida: "Não dá para trocar o modo depois que o serviço começou.",
  item_invalido: "Item inválido.",
  quantidade_invalida: "Quantidade inválida. Use números. Ex.: 2 ou 2,5",
  valor_invalido: "Preço inválido. Ex.: 150,00",
  descricao_obrigatoria: "Informe a descrição do item.",
  unidade_invalida: "Unidade inválida.",
  catalogo_item_nao_encontrado: "Item do catálogo não encontrado.",
  peca_do_catalogo_obrigatoria: "Escolha a peça no catálogo (ou cadastre uma nova).",
};

/** Mensagens do Supabase Auth (signUp / signIn), que vêm em inglês. */
const MENSAGENS_AUTH: [RegExp, string][] = [
  [/invalid login credentials/i, "E-mail ou senha incorretos."],
  [/email not confirmed/i, "Confirme seu e-mail antes de entrar (veja sua caixa de entrada)."],
  [/user already registered|already been registered/i, "Este e-mail já tem conta. Use “Entrar”."],
  [/password should be at least|password.*(short|weak)/i, "A senha precisa ter pelo menos 8 caracteres."],
  [/email address .* is invalid|invalid email|unable to validate email/i, "E-mail inválido. Confira o que foi digitado."],
  [/rate limit|too many requests|security purposes/i, "Muitas tentativas seguidas. Espere um minuto e tente de novo."],
  [/signups not allowed|signup.*disabled/i, "Cadastro desligado no momento. Fale com o suporte."],
  [/failed to fetch|fetch failed|network|load failed/i, "Sem conexão com o servidor. Confira a internet e tente de novo."],
];

export type ErroSupabase = { message?: string; code?: string } | null | undefined;

export type ContextoErro = "cliente" | "veiculo" | "catalogo" | "os" | "geral";

export function traduzirErro(erro: ErroSupabase, contexto: ContextoErro = "geral"): string {
  if (!erro) return "Algo deu errado. Tente de novo.";
  const msg = (erro.message ?? "").trim();

  if (MENSAGENS[msg]) return MENSAGENS[msg];

  switch (erro.code) {
    case "23505":
      if (contexto === "veiculo") return "Esta placa já está cadastrada.";
      if (contexto === "cliente") return "Já existe cliente com este CPF/CNPJ.";
      if (contexto === "catalogo") return "Já existe um item com este nome.";
      return "Este registro já existe.";
    case "23514":
      return "Algum campo está em formato inválido (ex.: placa).";
    case "23503":
      // Fase 2: OS segura cliente, veiculo e item do catalogo (on delete restrict, ARQUITETURA F2.8/F14).
      if (contexto === "cliente") return "Este cliente tem veículos ou OS registrados. Ele não pode ser excluído.";
      if (contexto === "veiculo") return "Este veículo já tem OS registradas. Ele não pode ser excluído.";
      if (contexto === "catalogo") return "Este item já foi usado em OS. Desative em vez de apagar.";
      return "Registro ligado a outro que não existe ou está em uso.";
    case "42501":
      return "Você não tem permissão para isso.";
    case "28000":
      return "Faça login para continuar.";
    case "PGRST116":
      return "Registro não encontrado.";
  }

  for (const [re, texto] of MENSAGENS_AUTH) if (re.test(msg)) return texto;

  return "Algo deu errado. Tente de novo.";
}
