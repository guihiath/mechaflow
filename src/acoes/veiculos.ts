"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { contextoParaAcao } from "@/lib/dal";
import { temErros, texto, textoOuNull, type EstadoAcao } from "@/lib/acao";
import { traduzirErro } from "@/lib/erros";
import { normalizarPlaca, REGEX_PLACA } from "@/lib/formato";
import { createClient } from "@/lib/supabase/server";
import { Constants, type Database } from "@/lib/supabase/database.types";

type Tipo = Database["public"]["Enums"]["tipo_veiculo"];
const SEM_PERMISSAO: EstadoAcao = { erro: "Você não tem permissão para isso." };
const UUID = /^[0-9a-f-]{36}$/i;

function inteiro(valor: string, min: number, max: number): number | null | typeof Number.NaN {
  if (!valor) return null;
  const limpo = valor.replace(/\./g, "");
  if (!/^\d+$/.test(limpo)) return Number.NaN;
  const n = Number(limpo);
  return n < min || n > max ? Number.NaN : n;
}

/** Cria (sem id) ou atualiza (com id) um veiculo. Dono e atendente. */
export async function salvarVeiculo(_anterior: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  if (!(await contextoParaAcao(["dono", "atendente"]))) return SEM_PERMISSAO;

  const id = texto(dados, "id");
  const clienteId = texto(dados, "cliente_id");
  const placa = normalizarPlaca(texto(dados, "placa"));
  const tipo = texto(dados, "tipo") as Tipo;
  const marca = textoOuNull(dados, "marca");
  const modelo = textoOuNull(dados, "modelo");
  const anoFab = inteiro(texto(dados, "ano_fabricacao"), 1950, 2100);
  const anoMod = inteiro(texto(dados, "ano_modelo"), 1950, 2100);
  const chassi = normalizarPlaca(texto(dados, "chassi")) || null;
  const km = inteiro(texto(dados, "km_atual"), 0, 2_000_000_000);
  const horimetro = inteiro(texto(dados, "horimetro_atual"), 0, 2_000_000_000);
  const observacoes = textoOuNull(dados, "observacoes");

  const campos = {
    cliente_id: UUID.test(clienteId) ? undefined : "Escolha o cliente dono do veículo.",
    placa: !placa ? "Informe a placa." : REGEX_PLACA.test(placa) ? undefined : "Placa inválida. Ex.: ABC1D23 ou ABC-1234",
    tipo: Constants.public.Enums.tipo_veiculo.includes(tipo) ? undefined : "Escolha o tipo.",
    marca: marca && marca.length > 60 ? "Máximo de 60 caracteres." : undefined,
    modelo: modelo && modelo.length > 80 ? "Máximo de 80 caracteres." : undefined,
    ano_fabricacao: Number.isNaN(anoFab) ? "Ano inválido. Ex.: 2019" : undefined,
    ano_modelo: Number.isNaN(anoMod) ? "Ano inválido. Ex.: 2020" : undefined,
    chassi: chassi && !/^[A-Z0-9]{6,20}$/.test(chassi) ? "Chassi com 6 a 20 letras e números." : undefined,
    km_atual: Number.isNaN(km) ? "Só números. Ex.: 350000" : undefined,
    horimetro_atual: Number.isNaN(horimetro) ? "Só números." : undefined,
    observacoes: observacoes && observacoes.length > 2000 ? "Máximo de 2000 caracteres." : undefined,
  };
  if (temErros(campos)) return { campos, erro: "Confira os campos marcados." };

  const registro = {
    cliente_id: clienteId,
    placa,
    tipo,
    marca,
    modelo,
    ano_fabricacao: anoFab,
    ano_modelo: anoMod,
    chassi,
    km_atual: km,
    horimetro_atual: horimetro,
    observacoes,
  };

  const supabase = await createClient();

  if (!id) {
    const { data, error } = await supabase.from("veiculos").insert(registro).select("id").single();
    if (error) return { erro: traduzirErro(error, "veiculo"), campos: error.code === "23505" ? { placa: "Esta placa já está cadastrada." } : undefined };
    redirect(`/veiculos/${data.id}?salvo=1`);
  }

  const { data, error } = await supabase.from("veiculos").update(registro).eq("id", id).select("id");
  if (error) return { erro: traduzirErro(error, "veiculo"), campos: error.code === "23505" ? { placa: "Esta placa já está cadastrada." } : undefined };
  if (!data?.length) return SEM_PERMISSAO;
  refresh();
  return { ok: true, mensagem: "Veículo salvo." };
}

/** Exclui veiculo (so dono). */
export async function excluirVeiculo(id: string): Promise<EstadoAcao> {
  if (!(await contextoParaAcao(["dono"]))) return SEM_PERMISSAO;
  const supabase = await createClient();
  const { data, error } = await supabase.from("veiculos").delete().eq("id", id).select("id");
  if (error) return { erro: traduzirErro(error, "veiculo") };
  if (!data?.length) return SEM_PERMISSAO;
  redirect("/veiculos");
}
