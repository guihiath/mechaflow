import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Cabecalho } from "@/components/layout/cabecalho";
import { UltimasOS } from "@/components/os/ultimas-os";
import { BotaoLink } from "@/components/ui/botao";
import { ConfirmarAcao } from "@/components/ui/confirmar-acao";
import { CaixaErro, ChipPlaca, FormularioCarregando, Pagina } from "@/components/ui/estados";
import { CaixaMensagem } from "@/components/ui/formulario";
import { LimparUrl } from "@/components/ui/limpar-url";
import { excluirVeiculo } from "@/acoes/veiculos";
import { exigirContexto } from "@/lib/dal";
import { formatarPlaca, param } from "@/lib/formato";
import { createClient } from "@/lib/supabase/server";
import { FormVeiculo } from "../form-veiculo";

export const metadata: Metadata = { title: "Veículo" };

export default function VeiculoPage({ params, searchParams }: PageProps<"/veiculos/[id]">) {
  return (
    <>
      <Cabecalho titulo="Veículo" voltar="/veiculos" />
      <Pagina>
        <Suspense fallback={<FormularioCarregando />}>
          <Conteudo params={params} searchParams={searchParams} />
        </Suspense>
      </Pagina>
    </>
  );
}

async function Conteudo({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await exigirContexto(["dono", "atendente"]);
  const { id } = await params;
  const salvo = param((await searchParams).salvo) === "1";
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const [{ data: veiculo, error }, { data: clientes }, { data: ordens }] = await Promise.all([
    supabase
      .from("veiculos")
      .select(
        "id, cliente_id, placa, tipo, marca, modelo, ano_fabricacao, ano_modelo, chassi, km_atual, horimetro_atual, observacoes, cliente:clientes(id, nome)",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("clientes").select("id, nome").order("nome").limit(1000),
    supabase
      .from("vw_os")
      .select("id, numero, status, criado_em, sintoma_relatado")
      .eq("veiculo_id", id)
      .order("criado_em", { ascending: false })
      .limit(3),
  ]);

  if (error) return <CaixaErro tentarDeNovo={`/veiculos/${id}`} />;
  if (!veiculo) notFound();

  const { cliente, ...dados } = veiculo;
  const placa = formatarPlaca(veiculo.placa);

  return (
    <>
      {salvo && <CaixaMensagem tipo="sucesso">Veículo cadastrado.</CaixaMensagem>}
      {salvo && <LimparUrl />}
      <div className="flex flex-col gap-2">
        <ChipPlaca placa={placa} grande />
        {cliente && (
          <p className="text-lg">
            Cliente:{" "}
            <Link href={`/clientes/${cliente.id}`} className="font-bold text-info-texto underline">
              {cliente.nome}
            </Link>
          </p>
        )}
      </div>

      <section className="flex flex-col gap-3">
        <UltimasOS os={ordens ?? []} verTodas={`/os?q=${veiculo.placa}`} />
        <BotaoLink href={`/os/nova?placa=${veiculo.placa}`} variante="secundario">
          Abrir OS para este veículo
        </BotaoLink>
      </section>

      <FormVeiculo veiculo={dados} clientes={clientes ?? []} />

      {ctx.papel === "dono" && (
        <section className="flex flex-col gap-3 border-t border-borda-sutil pt-6">
          <ConfirmarAcao
            acao={excluirVeiculo.bind(null, veiculo.id)}
            rotulo="Excluir veículo"
            pergunta={`Excluir o veículo ${placa}? Isso não pode ser desfeito.`}
            rotuloConfirmar={`Excluir ${placa}`}
            rotuloEnviando="Excluindo…"
          />
        </section>
      )}
    </>
  );
}
