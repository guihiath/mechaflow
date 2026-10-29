"use server";

import { refresh } from "next/cache";
import { contextoParaAcao } from "@/lib/dal";
import { erroCampos, temErros, texto, type EstadoAcao } from "@/lib/acao";
import { traduzirErro } from "@/lib/erros";
import { createClient } from "@/lib/supabase/server";
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
