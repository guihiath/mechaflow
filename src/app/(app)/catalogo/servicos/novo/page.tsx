import type { Metadata } from "next";
import { Suspense } from "react";
import { Cabecalho } from "@/components/layout/cabecalho";
import { FormularioCarregando, Pagina } from "@/components/ui/estados";
import { exigirContexto } from "@/lib/dal";
import { FormServico } from "../../formularios";

export const metadata: Metadata = { title: "Novo serviço" };

export default function NovoServicoPage() {
  return (
    <>
      <Cabecalho titulo="Novo serviço" voltar="/catalogo" />
      <Pagina>
        <Suspense fallback={<FormularioCarregando />}>
          <Conteudo />
        </Suspense>
      </Pagina>
    </>
  );
}

async function Conteudo() {
  await exigirContexto(["dono"]);
  return <FormServico />;
}
