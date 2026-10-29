import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { TelaSimples } from "@/components/layout/tela-simples";
import { FormularioCarregando } from "@/components/ui/estados";
import { destinoPorContexto } from "@/lib/contexto";
import { lerContexto } from "@/lib/dal";
import { FormAceitarTermos } from "./form-aceitar-termos";

export const metadata: Metadata = { title: "Termos atualizados" };

export default function AceitarTermosPage() {
  return (
    <TelaSimples titulo="Termos atualizados" subtitulo="Para continuar usando o MechaFlow, leia e aceite a nova versão.">
      <Suspense fallback={<FormularioCarregando />}>
        <Conteudo />
      </Suspense>
    </TelaSimples>
  );
}

async function Conteudo() {
  const ctx = await lerContexto();
  const destino = destinoPorContexto(ctx);
  if (destino !== "/aceitar-termos") redirect(destino);
  return <FormAceitarTermos />;
}
