import type { ReactNode } from "react";
import { FaixaTeste } from "@/components/layout/cabecalho";
import { CaixaMensagem } from "@/components/ui/formulario";
import { EH_PRODUCAO } from "@/lib/brand";

/**
 * Casca da página pública (DESIGN §13.1): sem menu nem marca do app, largura máxima 560 px,
 * alinhada à esquerda. A marca `data-orcamento-publico` faz o `globals.css` manter a página
 * inteira clara (também o <html>), mesmo com o celular em modo escuro ou `mf-tema` salvo.
 * A faixa e o aviso de teste não trazem dado: valem também nas telas sem acesso.
 */
export function CascaOrcamentoPublico({ children }: { children: ReactNode }) {
  return (
    <div data-orcamento-publico className="flex min-h-dvh flex-col bg-fundo text-texto">
      {!EH_PRODUCAO && <FaixaTeste />}
      <main className="flex w-full max-w-[560px] flex-1 flex-col gap-6 px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[calc(2rem+env(safe-area-inset-bottom))]">
        {!EH_PRODUCAO && <CaixaMensagem tipo="alerta">Ambiente de teste. Este orçamento não vale.</CaixaMensagem>}
        {children}
      </main>
    </div>
  );
}
