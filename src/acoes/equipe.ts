"use server";

import { refresh } from "next/cache";
import { contextoParaAcao } from "@/lib/dal";
import { erroCampos, temErros, texto, type EstadoAcao } from "@/lib/acao";
import { traduzirErro } from "@/lib/erros";
import { createClient } from "@/lib/supabase/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { montarLinkSenha, podeGerarLinkSenha, VALIDADE_LINK_SENHA_MS } from "@/lib/link-senha";
import { urlPublicaApp } from "@/lib/url-publica";
import type { Database } from "@/lib/supabase/database.types";

type Papel = Database["public"]["Enums"]["papel_usuario"];
const SEM_PERMISSAO: EstadoAcao = { erro: "Você não tem permissão para isso." };
const UUID = /^[0-9a-f-]{36}$/i;

/** Dono gera link de convite. O token so existe nesta resposta (no banco fica o hash). */
export async function criarConvite(_anterior: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  if (!(await contextoParaAcao(["dono"]))) return SEM_PERMISSAO;

  const papel = texto(dados, "papel") as Papel;
  const nome = texto(dados, "nome_sugerido");
  const horas = Number(texto(dados, "validade") || 72);

  const campos = {
    papel: papel === "mecanico" || papel === "atendente" ? undefined : "Escolha o papel.",
    nome_sugerido: nome.length > 80 ? "Máximo de 80 caracteres." : undefined,
    validade: [24, 72, 168].includes(horas) ? undefined : "Escolha a validade.",
  };
  if (temErros(campos)) return erroCampos(campos);

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("criar_convite", { p_papel: papel, p_nome_sugerido: nome || undefined, p_validade_horas: horas })
    .single();
  if (error || !data) return { erro: traduzirErro(error) };

  refresh();
  return { ok: true, dados: { token: data.token, expira_em: data.expira_em, papel, nome } };
}

export async function revogarConvite(conviteId: string): Promise<EstadoAcao> {
  if (!(await contextoParaAcao(["dono"])) || !UUID.test(conviteId)) return SEM_PERMISSAO;
  const supabase = await createClient();
  const { error } = await supabase.rpc("revogar_convite", { p_convite_id: conviteId });
  if (error) return { erro: traduzirErro(error) };
  refresh();
  return { ok: true };
}

/** Muda papel e/ou ativa/desativa. O banco recusa alterar a si mesmo. */
export async function atualizarMembro(
  perfilId: string,
  mudancas: { papel?: Papel; ativo?: boolean },
): Promise<EstadoAcao> {
  if (!(await contextoParaAcao(["dono"])) || !UUID.test(perfilId)) return SEM_PERMISSAO;
  if (mudancas.papel && !["dono", "atendente", "mecanico"].includes(mudancas.papel)) return { erro: "Papel inválido." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("atualizar_membro", {
    p_perfil_id: perfilId,
    p_papel: mudancas.papel,
    p_ativo: mudancas.ativo,
  });
  if (error) return { erro: traduzirErro(error) };
  refresh();
  return { ok: true };
}

/**
 * F8-P3 (ARQUITETURA 15.12): o dono gera o link para o funcionário criar uma senha nova, sem e-mail.
 * O link só existe nesta resposta e na tela: nunca vai para log, console nem banco.
 */
export async function gerarLinkSenhaMembro(perfilId: string): Promise<EstadoAcao> {
  // Os códigos são os de 15.12 (vão em `mensagem`, para o teste); dois textos são próprios desta
  // tela, porque os gerais falam de convite e de "acesso".
  const TEXTO: Record<string, string> = {
    nao_pode_alterar_a_si_mesmo: "Para a sua própria senha, use “Esqueci minha senha” na tela de entrar.",
    papel_invalido: "Outro dono troca a senha pelo próprio e-mail, em “Esqueci minha senha”.",
  };
  const erro = (codigo: string): EstadoAcao => ({ erro: TEXTO[codigo] ?? traduzirErro({ message: codigo }), mensagem: codigo });

  // 1. Logado, ativo, termos aceitos e dono.
  const ctx = await contextoParaAcao(["dono"]);
  if (!ctx) return erro("acesso_negado");
  // 2. Id válido.
  if (typeof perfilId !== "string" || !UUID.test(perfilId)) return erro("membro_nao_encontrado");
  // 3. Não pode ser o próprio dono.
  if (perfilId === ctx.usuario_id) return erro("nao_pode_alterar_a_si_mesmo");

  // 4. Alvo lido com o cliente do usuário: a RLS só mostra a própria oficina, então o dono de outra
  // oficina recebe a mesma resposta de um id inventado.
  const supabase = await createClient();
  const { data: alvo, error } = await supabase
    .from("perfis")
    .select("id, nome, telefone, papel, ativo")
    .eq("id", perfilId)
    .maybeSingle();
  if (error) return erro("link_senha_indisponivel");
  if (!alvo) return erro("membro_nao_encontrado");
  // 5. Outro dono ou desativado.
  const recusa = podeGerarLinkSenha({ usuario_id: ctx.usuario_id }, alvo);
  if (recusa) return erro(recusa);

  const base = urlPublicaApp();
  if (!base) return { erro: "O endereço do link não está configurado (URL_PUBLICA_APP). Nada foi gerado." };
  const admin = criarClienteAdmin();
  if (!admin) return erro("link_senha_indisponivel");

  // 6. E-mail do Auth (não a cópia de perfis.email).
  const conta = await admin.auth.admin.getUserById(perfilId);
  const email = conta.data.user?.email;
  if (conta.error || !email) return erro(conta.error && limiteDeEnvio(conta.error) ? "aguarde_para_gerar" : "link_senha_indisponivel");

  // 7. Não manda e-mail; usa o hashed_token (nunca o action_link, que a prévia do WhatsApp gasta).
  const gerado = await admin.auth.admin.generateLink({ type: "recovery", email });
  const tokenHash = gerado.data?.properties?.hashed_token;
  // 8.
  if (gerado.error || !tokenHash) return erro(gerado.error && limiteDeEnvio(gerado.error) ? "aguarde_para_gerar" : "link_senha_indisponivel");

  console.info(`link de senha gerado para o perfil ${perfilId} pela oficina ${ctx.oficina_id}`);
  // 9.
  return {
    ok: true,
    dados: {
      link: montarLinkSenha(base, tokenHash),
      validoAte: new Date(Date.now() + VALIDADE_LINK_SENHA_MS).toISOString(),
      nome: alvo.nome,
      telefone: alvo.telefone ?? "",
    },
  };
}

function limiteDeEnvio(e: { status?: number; code?: string; message?: string }) {
  return e.status === 429 || e.code === "over_email_send_rate_limit" || /rate limit/i.test(e.message ?? "");
}
