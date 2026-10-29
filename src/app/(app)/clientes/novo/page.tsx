import type { Metadata } from "next";
import { Suspense } from "react";
import { Cabecalho } from "@/components/layout/cabecalho";
import { CaixaMensagem } from "@/components/ui/formulario";
import { FormularioCarregando, Pagina } from "@/components/ui/estados";
import { voltarDoCliente } from "@/lib/contexto";
import { exigirContexto } from "@/lib/dal";
import { param } from "@/lib/formato";
import { FormCliente } from "../form-cliente";

export const metadata: Metadata = { title: "Novo cliente" };

export default function NovoClientePage({ searchParams }: PageProps<"/clientes/novo">) {
  return (
    <>
      <Cabecalho titulo="Novo cliente" voltar="/clientes" />
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
  const voltar = voltarDoCliente(param((await searchParams).voltar));
  return (
    <>
      {voltar && <CaixaMensagem tipo="alerta">Depois de salvar, você volta para o cadastro do veículo.</CaixaMensagem>}
      <FormCliente voltar={voltar} />
    </>
  );
}
