import type { Metadata } from "next";
import { Suspense } from "react";
import { Cabecalho } from "@/components/layout/cabecalho";
import { FormularioCarregando, Pagina } from "@/components/ui/estados";
import { exigirContexto } from "@/lib/dal";
import { FormPeca } from "../../formularios";

export const metadata: Metadata = { title: "Nova peça" };

export default function NovaPecaPage() {
  return (
    <>
      <Cabecalho titulo="Nova peça" voltar="/catalogo?aba=pecas" />
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
  return <FormPeca />;
}
