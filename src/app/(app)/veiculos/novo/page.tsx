import type { Metadata } from "next";
import { Suspense } from "react";
import { Cabecalho } from "@/components/layout/cabecalho";
import { CaixaErro, EstadoVazio, FormularioCarregando, Pagina } from "@/components/ui/estados";
import { exigirContexto } from "@/lib/dal";
import { param } from "@/lib/formato";
import { createClient } from "@/lib/supabase/server";
import { FormVeiculo } from "../form-veiculo";

export const metadata: Metadata = { title: "Novo veículo" };

export default function NovoVeiculoPage({ searchParams }: PageProps<"/veiculos/novo">) {
  return (
    <>
      <Cabecalho titulo="Novo veículo" voltar="/veiculos" />
      <Pagina>
        <Suspense fallback={<FormularioCarregando />}>
          <Conteudo searchParams={searchParams} />
        </Suspense>
      </Pagina>
    </>
  );
}

async function Conteudo({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigirContexto(["dono", "atendente"]);
  const clienteInicial = param((await searchParams).cliente) || null;
  const supabase = await createClient();
  const { data: clientes, error } = await supabase.from("clientes").select("id, nome").order("nome").limit(1000);

  if (error) return <CaixaErro tentarDeNovo="/veiculos/novo" />;
  if (!clientes.length) {
    return (
      <EstadoVazio
        titulo="Cadastre o cliente primeiro."
        texto="Todo veículo pertence a um cliente da oficina."
        acao={{ href: "/clientes/novo", rotulo: "Cadastrar cliente" }}
      />
    );
  }
  return <FormVeiculo clientes={clientes} clienteInicial={clienteInicial} />;
}
