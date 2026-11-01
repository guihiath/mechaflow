import { Suspense } from "react";
import { headers } from "next/headers";
import { Navegacao, NavegacaoEsqueleto } from "@/components/layout/navegacao";
import { FilaFotosGlobal } from "@/components/fotos/fila-fotos-global";
import { lerContexto } from "@/lib/dal";
import { CABECALHO_CAMINHO } from "@/lib/caminho";

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
      <div className="area-conteudo flex flex-1 flex-col pb-[calc(4rem+env(safe-area-inset-bottom)+1rem)] lg:pb-0">{children}</div>
    </div>
  );
}

async function NavegacaoDoUsuario() {
  const [ctx, cab] = await Promise.all([lerContexto(), headers()]);
  if (!ctx?.papel || ctx.ativo !== true) return <NavegacaoEsqueleto />;
  // Caminho com que este pedaço foi renderizado: a hidratação usa o mesmo (F4-P1, #418).
  const caminho = cab.get(CABECALHO_CAMINHO);
  return (
    <>
      <Navegacao papel={ctx.papel} oficina={ctx.oficina_nome} caminhoServidor={caminho} />
      {ctx.usuario_id && <FilaFotosGlobal usuarioId={ctx.usuario_id} caminhoServidor={caminho} />}
    </>
  );
}
