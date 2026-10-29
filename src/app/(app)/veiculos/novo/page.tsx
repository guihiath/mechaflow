import type { Metadata } from "next";
import { Suspense } from "react";
import { Cabecalho } from "@/components/layout/cabecalho";
import { CaixaErro, EstadoVazio, FormularioCarregando, Pagina } from "@/components/ui/estados";
import { exigirContexto } from "@/lib/dal";
import { normalizarPlaca, param } from "@/lib/formato";
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
  const sp = await searchParams;
  const clienteInicial = param(sp.cliente) || null;
  const placa = normalizarPlaca(param(sp.placa)).slice(0, 7);
  // Cadastrar cliente no meio do caminho: volta para este veiculo (mantendo a placa).
  const voltar = `/veiculos/novo${placa ? `?placa=${placa}` : ""}`;
  const hrefNovoCliente = `/clientes/novo?voltar=${encodeURIComponent(voltar)}`;

  const supabase = await createClient();
  const { data: clientes, error } = await supabase.from("clientes").select("id, nome").order("nome").limit(1000);

  if (error) return <CaixaErro tentarDeNovo={voltar} />;
  if (!clientes.length) {
    return (
      <EstadoVazio
        titulo="Cadastre o cliente primeiro."
        texto="Todo veículo pertence a um cliente da oficina. Depois de salvar, você volta para cá."
        acao={{ href: hrefNovoCliente, rotulo: "Cadastrar cliente" }}
      />
    );
  }
  return (
    <FormVeiculo clientes={clientes} clienteInicial={clienteInicial} placaInicial={placa || null} hrefNovoCliente={hrefNovoCliente} />
  );
}
