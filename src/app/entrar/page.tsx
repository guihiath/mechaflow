import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { TelaSimples } from "@/components/layout/tela-simples";
import { FormularioCarregando } from "@/components/ui/estados";
import { destinoPorContexto } from "@/lib/contexto";
import { lerContexto } from "@/lib/dal";

export const metadata: Metadata = { title: "Entrando" };

/** Distribuidor: manda o usuario logado para a tela certa (ARQUITETURA 7.3). */
export default function EntrarPage() {
  return (
    <TelaSimples titulo="Entrando…">
      <Suspense fallback={<FormularioCarregando />}>
        <Redirecionar />
      </Suspense>
    </TelaSimples>
  );
}

async function Redirecionar(): Promise<null> {
  redirect(destinoPorContexto(await lerContexto()));
}
