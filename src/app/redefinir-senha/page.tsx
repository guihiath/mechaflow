import type { Metadata } from "next";
import { Suspense } from "react";
import { TelaSimples } from "@/components/layout/tela-simples";
import { BotaoLink } from "@/components/ui/botao";
import { FormularioCarregando } from "@/components/ui/estados";
import { CaixaMensagem } from "@/components/ui/formulario";
import { createClient } from "@/lib/supabase/server";
import { FormRedefinirSenha } from "./form-redefinir-senha";

export const metadata: Metadata = { title: "Criar senha nova", robots: { index: false } };

/**
 * Chega aqui pelo link do e-mail (via /auth/callback, que troca o codigo pela sessao de recuperacao).
 * Sem sessao = link vencido ou aberto em outro aparelho.
 */
export default function RedefinirSenhaPage() {
  return (
    <TelaSimples titulo="Criar senha nova">
      <Suspense fallback={<FormularioCarregando />}>
        <Conteudo />
      </Suspense>
    </TelaSimples>
  );
}

async function Conteudo() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) {
    return (
      <>
        <CaixaMensagem tipo="erro">
          Este link venceu ou foi aberto em outro aparelho. Peça um link novo e abra no mesmo celular.
        </CaixaMensagem>
        <BotaoLink href="/esqueci-senha">Pedir link novo</BotaoLink>
      </>
    );
  }
  return <FormRedefinirSenha email={typeof data.claims.email === "string" ? data.claims.email : null} />;
}
