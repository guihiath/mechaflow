import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LogOut } from "lucide-react";
import { TelaSimples } from "@/components/layout/tela-simples";
import { classesBotao } from "@/components/ui/botao";
import { CaixaErro, FormularioCarregando } from "@/components/ui/estados";
import { CaixaMensagem } from "@/components/ui/formulario";
import { sair } from "@/acoes/sessao";
import { lerContexto } from "@/lib/dal";
import { formatarDataHora, ROTULO_PAPEL } from "@/lib/formato";
import { createClient } from "@/lib/supabase/server";
import { FormConvite } from "./form-convite";

export const metadata: Metadata = { title: "Convite", robots: { index: false } };

/** Pagina publica do convite (funciona sem login). */
export default function ConvitePage({ params }: PageProps<"/convite/[token]">) {
  return (
    <TelaSimples titulo="Convite para a equipe">
      <Suspense fallback={<FormularioCarregando />}>
        <Conteudo params={params} />
      </Suspense>
    </TelaSimples>
  );
}

const SITUACAO: Record<string, string> = {
  expirado: "Este convite expirou. Peça um novo ao dono.",
  usado: "Este convite já foi usado. Peça um novo ao dono.",
  revogado: "Este convite foi cancelado.",
  inexistente: "Link de convite inválido. Confira se copiou o link inteiro.",
};

async function Conteudo({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const [{ data: convite, error }, ctx] = await Promise.all([
    supabase.rpc("ver_convite", { p_token: token }).maybeSingle(),
    lerContexto(),
  ]);

  if (error || !convite) {
    return <CaixaErro titulo="Não foi possível abrir o convite." tentarDeNovo={`/convite/${token}`} />;
  }

  if (convite.situacao !== "valido" || !convite.papel) {
    return (
      <>
        <CaixaMensagem tipo="erro">{SITUACAO[convite.situacao] ?? SITUACAO.inexistente}</CaixaMensagem>
        <Link href="/login" className={classesBotao("secundario")}>
          Ir para o login
        </Link>
      </>
    );
  }

  const papel = ROTULO_PAPEL[convite.papel].toLowerCase();
  const cabecalho = (
    <div className="rounded-lg border border-borda-sutil bg-superficie p-4">
      <p className="text-lg">
        A oficina <strong>{convite.oficina_nome}</strong> te convidou para entrar na equipe como <strong>{papel}</strong>.
      </p>
      <p className="mt-1 text-sm text-texto-suave">Vale até {formatarDataHora(convite.expira_em)}.</p>
    </div>
  );

  // Ja logado e ja numa oficina: nao pode aceitar com esta conta.
  if (ctx?.oficina_id || ctx?.ativo === false) {
    return (
      <>
        {cabecalho}
        <CaixaMensagem tipo="alerta">
          Você está logado numa conta que já pertence a uma oficina ({ctx.email}). Para aceitar este convite, saia e
          crie outra conta com outro e-mail.
        </CaixaMensagem>
        <form action={sair}>
          <button type="submit" className={classesBotao("secundario")}>
            <LogOut size={24} strokeWidth={2.25} aria-hidden />
            Sair da conta
          </button>
        </form>
      </>
    );
  }

  return (
    <>
      {cabecalho}
      <FormConvite token={token} logadoComo={ctx?.email ?? null} />
    </>
  );
}
