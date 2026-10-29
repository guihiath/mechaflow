import type { Metadata } from "next";
import { Suspense } from "react";
import { LogOut } from "lucide-react";
import { Cabecalho } from "@/components/layout/cabecalho";
import { classesBotao } from "@/components/ui/botao";
import { Cartao, FormularioCarregando, Pagina } from "@/components/ui/estados";
import { sair } from "@/acoes/sessao";
import { exigirContexto } from "@/lib/dal";
import { ROTULO_PAPEL } from "@/lib/formato";

export const metadata: Metadata = { title: "Conta" };

export default function ContaPage() {
  return (
    <>
      <Cabecalho titulo="Conta" />
      <Pagina>
        <Suspense fallback={<FormularioCarregando />}>
          <Dados />
        </Suspense>
      </Pagina>
    </>
  );
}

async function Dados() {
  const ctx = await exigirContexto();
  return (
    <>
      <Cartao>
        <dl className="flex flex-col gap-3">
          <Linha rotulo="Nome" valor={ctx.perfil_nome} />
          <Linha rotulo="E-mail (usuário)" valor={ctx.email} />
          <Linha rotulo="Papel" valor={ROTULO_PAPEL[ctx.papel]} />
          <Linha rotulo="Oficina" valor={ctx.oficina_nome} />
        </dl>
      </Cartao>
      <p className="text-base text-texto-suave">
        Esqueceu a senha ou precisa trocar o e-mail? Fale com o dono da oficina.
      </p>
      <form action={sair}>
        <button type="submit" className={classesBotao("secundario")}>
          <LogOut size={24} strokeWidth={2.25} aria-hidden />
          Sair da conta
        </button>
      </form>
    </>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div>
      <dt className="text-sm font-bold text-texto-suave">{rotulo}</dt>
      <dd className="break-words text-lg">{valor ?? "—"}</dd>
    </div>
  );
}
