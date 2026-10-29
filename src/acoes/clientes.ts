"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { voltarDoCliente } from "@/lib/contexto";
import { contextoParaAcao } from "@/lib/dal";
import { erroCampos, temErros, texto, textoOuNull, type EstadoAcao } from "@/lib/acao";
import { traduzirErro } from "@/lib/erros";
import { soDigitos } from "@/lib/formato";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type Modo = Database["public"]["Enums"]["modo_atendimento_cliente"];
const MODOS: Modo[] = ["exige_orcamento", "servico_direto"];

const SEM_PERMISSAO: EstadoAcao = { erro: "Você não tem permissão para isso." };

/** Cria (sem id) ou atualiza (com id) um cliente. Dono e atendente. */
export async function salvarCliente(_anterior: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  if (!(await contextoParaAcao(["dono", "atendente"]))) return SEM_PERMISSAO;

  const id = texto(dados, "id");
  const nome = texto(dados, "nome");
  const telefone = soDigitos(texto(dados, "telefone"));
  const documento = soDigitos(texto(dados, "documento"));
  const email = texto(dados, "email").toLowerCase();
  const modo = texto(dados, "modo_padrao") as Modo;
  const observacoes = textoOuNull(dados, "observacoes");

  const campos = {
    nome: nome.length < 2 ? "Informe o nome do cliente." : nome.length > 120 ? "Nome muito longo." : undefined,
    telefone:
      telefone && (telefone.length < 10 || telefone.length > 11) ? "Telefone com DDD. Ex.: (11) 98888-7777" : undefined,
    documento:
      documento && documento.length !== 11 && documento.length !== 14
        ? "CPF tem 11 números e CNPJ tem 14."
        : undefined,
    email: email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? "E-mail inválido." : undefined,
    modo_padrao: MODOS.includes(modo) ? undefined : "Escolha o padrão do cliente.",
    observacoes: observacoes && observacoes.length > 2000 ? "Máximo de 2000 caracteres." : undefined,
  };
  if (temErros(campos)) return erroCampos(campos);

  const registro = {
    nome,
    telefone: telefone || null,
    documento: documento || null,
    email: email || null,
    modo_padrao: modo,
    observacoes,
  };

  const supabase = await createClient();

  if (!id) {
    const { data, error } = await supabase.from("clientes").insert(registro).select("id").single();
    if (error) return { erro: traduzirErro(error, "cliente") };
    const voltar = voltarDoCliente(texto(dados, "voltar"));
    if (voltar) redirect(`${voltar}${voltar.includes("?") ? "&" : "?"}cliente=${data.id}`);
    redirect(`/clientes/${data.id}?salvo=1`);
  }

  const { data, error } = await supabase.from("clientes").update(registro).eq("id", id).select("id");
  if (error) return { erro: traduzirErro(error, "cliente") };
  if (!data?.length) return SEM_PERMISSAO;
  refresh();
  return { ok: true, mensagem: "Cliente salvo." };
}

/** Exclui cliente (so dono; o banco recusa se houver veiculos ligados). */
export async function excluirCliente(id: string): Promise<EstadoAcao> {
  if (!(await contextoParaAcao(["dono"]))) return SEM_PERMISSAO;
  const supabase = await createClient();
  const { data, error } = await supabase.from("clientes").delete().eq("id", id).select("id");
  if (error) return { erro: traduzirErro(error, "cliente") };
  if (!data?.length) return SEM_PERMISSAO;
  redirect("/clientes");
}
