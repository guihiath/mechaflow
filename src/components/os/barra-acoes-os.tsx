import type { ReactNode } from "react";

/**
 * Barra de acoes do detalhe da OS (DESIGN §5.6 e §10.5).
 * Celular: fixa no rodape (64px + safe area), por cima da barra de navegacao
 * (z-50 > z-40 da navegacao); secundario a esquerda (<= 40%), primario a direita (>= 60%).
 * So primario: ocupa tudo. Desktop (>= 1024px): vira o card "Próximo passo", nao fixo,
 * com a frase `proximoPasso` e os botoes empilhados (primario embaixo).
 *
 * Os botoes vem prontos do pai (`Botao`, `BotaoEnviar`, botao que abre `Folha`...).
 * No celular os botoes de 56px (`h-toque-principal`) descem para 48px dentro da barra.
 * O espaco no fim da pagina vem do layout do app (mesma altura da barra de navegacao).
 */
export function BarraAcoesOS({
  primario,
  secundario,
  proximoPasso,
  acima,
}: {
  primario?: ReactNode;
  secundario?: ReactNode;
  /** Frase do card no desktop (ex.: "Serviço em andamento."). */
  proximoPasso?: string;
  /** Algo logo acima da barra (ex.: CaixaMensagem de erro da acao). */
  acima?: ReactNode;
}) {
  if (!primario && !secundario) return null;
  return (
    <>
      <section
        aria-label="Ações da OS"
        className="fixed inset-x-0 bottom-0 z-50 flex flex-col gap-2 border-t-2 border-borda-sutil bg-superficie px-4 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-barra lg:static lg:z-auto lg:rounded-lg lg:border lg:p-4 lg:shadow-none"
      >
        {acima}
        {proximoPasso && (
          <div className="hidden lg:block">
            <h2 className="text-xl">Próximo passo</h2>
            <p className="text-base text-texto-suave">{proximoPasso}</p>
          </div>
        )}
        <div className="flex min-h-12 items-stretch gap-2 max-lg:[&_.h-toque-principal]:h-toque lg:flex-col lg:gap-3">
          {secundario && <div className="flex w-2/5 shrink-0 *:w-full lg:w-full">{secundario}</div>}
          {primario && <div className="flex min-w-0 flex-1 *:w-full">{primario}</div>}
        </div>
      </section>
    </>
  );
}
