import type { Metadata } from "next";
import { Suspense } from "react";
import { Cabecalho } from "@/components/layout/cabecalho";
import { FormularioCarregando, Pagina } from "@/components/ui/estados";
import { exigirContexto } from "@/lib/dal";
import { FormCliente } from "../form-cliente";

export const metadata: Metadata = { title: "Novo cliente" };

export default function NovoClientePage() {
  return (
    <>
      <Cabecalho titulo="Novo cliente" voltar="/clientes" />
      <Pagina>
        <Suspense fallback={<FormularioCarregando />}>
          <Conteudo />
        </Suspense>
      </Pagina>
    </>
  );
}

async function Conteudo() {
  await exigirContexto(["dono", "atendente"]);
  return <FormCliente />;
}
