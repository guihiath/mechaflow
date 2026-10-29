import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LogOut } from "lucide-react";
import { TelaSimples } from "@/components/layout/tela-simples";
import { FormOficina } from "@/components/auth/form-oficina";
import { classesBotao } from "@/components/ui/botao";
import { FormularioCarregando } from "@/components/ui/estados";
import { sair } from "@/acoes/sessao";
import { destinoPorContexto } from "@/lib/contexto";
import { lerContexto } from "@/lib/dal";
import { ColarConvite } from "./colar-convite";

export const metadata: Metadata = { title: "Boas-vindas" };

/** Conta criada, mas sem oficina: criar oficina (dono) ou usar link de convite (funcionario). */
export default function BemVindoPage() {
  return (
    <TelaSimples titulo="Boas-vindas" subtitulo="Sua conta ainda não está ligada a nenhuma oficina.">
      <Suspense fallback={<FormularioCarregando />}>
        <Conteudo />
      </Suspense>
    </TelaSimples>
  );
}

async function Conteudo() {
  const ctx = await lerContexto();
  const destino = destinoPorContexto(ctx);
  if (destino !== "/bem-vindo") redirect(destino);

  return (
    <>
      <section className="flex flex-col gap-4">
        <h2 className="text-2xl">Sou funcionário</h2>
        <p className="text-base text-texto-suave">Cole aqui o link de convite que o dono mandou no WhatsApp.</p>
        <ColarConvite />
      </section>

      <hr className="border-borda-sutil" />

      <section className="flex flex-col gap-4">
        <h2 className="text-2xl">Sou dono: criar minha oficina</h2>
        <FormOficina logado />
      </section>

      <form action={sair}>
        <button type="submit" className={classesBotao("secundario")}>
          <LogOut size={24} strokeWidth={2.25} aria-hidden />
          Sair da conta
        </button>
      </form>
    </>
  );
}
