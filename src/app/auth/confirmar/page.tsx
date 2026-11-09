import type { Metadata } from "next";
import { Suspense } from "react";
import { TelaSimples } from "@/components/layout/tela-simples";
import { BotaoLink } from "@/components/ui/botao";
import { FormularioCarregando } from "@/components/ui/estados";
import { CaixaMensagem } from "@/components/ui/formulario";
import { caminhoSeguro } from "@/lib/contexto";
import { confirmarLink } from "./acoes";
import { BotaoContinuar } from "./botao-continuar";

// Cabeçalhos (no-store, noindex, no-referrer) em next.config.ts, como na página do orçamento.
export const metadata: Metadata = { title: "Continuar", robots: { index: false, follow: false }, referrer: "no-referrer" };

type Busca = Promise<Record<string, string | string[] | undefined>>;

/**
 * Página do link do e-mail ("Esqueci minha senha") e do link que o dono gera na Equipe (ARQUITETURA
 * 15.5 e 15.12). Ao carregar NÃO chama o Supabase: o token só é trocado pela sessão no "Continuar".
 */
export default function ConfirmarPage({ searchParams }: { searchParams: Busca }) {
  return (
    <TelaSimples titulo="Criar senha nova">
      <Suspense fallback={<FormularioCarregando />}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </TelaSimples>
  );
}

const um = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

async function Conteudo({ searchParams }: { searchParams: Busca }) {
  const busca = await searchParams;
  const tokenHash = um(busca.token_hash);
  const tipo = um(busca.type);
  const next = caminhoSeguro(um(busca.next)) ?? "";

  if (busca.erro || !tokenHash || !tipo) {
    return (
      <>
        <CaixaMensagem tipo="erro">Este link venceu ou já foi usado. Peça outro.</CaixaMensagem>
        <p className="text-base text-texto-suave">
          Funcionário: peça ao dono da oficina um link novo. Dono: use “Esqueci minha senha”.
        </p>
        <BotaoLink href="/esqueci-senha" variante="secundario">
          Esqueci minha senha
        </BotaoLink>
        <BotaoLink href="/login" variante="secundario">
          Entrar
        </BotaoLink>
      </>
    );
  }

  const recuperacao = tipo === "recovery";
  return (
    <form action={confirmarLink} className="flex flex-col gap-5">
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="type" value={tipo} />
      <input type="hidden" name="next" value={next} />
      <p className="text-lg">
        {recuperacao
          ? "Toque em continuar para criar a sua senha nova. O link vale por 1 hora e funciona uma vez só."
          : "Toque em continuar para confirmar."}
      </p>
      <BotaoContinuar rotulo={recuperacao ? "Continuar para criar a senha nova" : "Continuar"} />
    </form>
  );
}
