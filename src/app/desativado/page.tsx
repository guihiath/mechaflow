import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LogOut } from "lucide-react";
import { TelaSimples } from "@/components/layout/tela-simples";
import { classesBotao } from "@/components/ui/botao";
import { FormularioCarregando } from "@/components/ui/estados";
import { sair } from "@/acoes/sessao";
import { destinoPorContexto } from "@/lib/contexto";
import { lerContexto } from "@/lib/dal";

export const metadata: Metadata = { title: "Acesso desativado" };

export default function DesativadoPage() {
  return (
    <TelaSimples titulo="Acesso desativado">
      <Suspense fallback={<FormularioCarregando />}>
        <Conteudo />
      </Suspense>
    </TelaSimples>
  );
}

async function Conteudo() {
  const ctx = await lerContexto();
  const destino = destinoPorContexto(ctx);
  if (destino !== "/desativado") redirect(destino);

  return (
    <>
      <p className="text-lg">Seu acesso foi desativado. Fale com o dono da oficina.</p>
      <form action={sair}>
        <button type="submit" className={classesBotao("secundario")}>
          <LogOut size={24} strokeWidth={2.25} aria-hidden />
          Sair da conta
        </button>
      </form>
    </>
  );
}
