import { Suspense } from "react";
import { Navegacao, NavegacaoEsqueleto } from "@/components/layout/navegacao";
import { lerContexto } from "@/lib/dal";

/**
 * Casca do app logado: menu lateral (desktop) ou barra inferior (celular).
 * O papel e lido dentro do Suspense para nao travar a pagina (Cache Components).
 * Cada pagina confere o acesso de novo com exigirContexto().
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-full flex-1 flex-col lg:pl-60">
      <Suspense fallback={<NavegacaoEsqueleto />}>
        <NavegacaoDoUsuario />
      </Suspense>
      <div className="flex flex-1 flex-col pb-[calc(4rem+env(safe-area-inset-bottom)+1rem)] lg:pb-0">{children}</div>
    </div>
  );
}

async function NavegacaoDoUsuario() {
  const ctx = await lerContexto();
  if (!ctx?.papel || ctx.ativo !== true) return <NavegacaoEsqueleto />;
  return <Navegacao papel={ctx.papel} oficina={ctx.oficina_nome} />;
}
