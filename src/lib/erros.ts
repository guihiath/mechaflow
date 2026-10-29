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

export type ContextoErro = "cliente" | "veiculo" | "catalogo" | "geral";

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
      return contexto === "cliente"
        ? "Este cliente tem veículos cadastrados. Remova os veículos antes."
        : "Registro ligado a outro que não existe ou está em uso.";
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
