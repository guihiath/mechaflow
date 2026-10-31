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

/**
 * Barra do MECANICO (DESIGN §11.2): ate 3 botoes de largura igual, icone em cima (26px) e
 * rotulo embaixo (15px/700), 56px de altura dentro da barra de 64px + safe area.
 * Ordem fixa: status · item · foto (a foto sempre a direita). Com 1 botao so, ele ocupa a
 * barra toda (icone a esquerda do texto, como o botao comum).
 * Desktop: card "Próximo passo" com os botoes lado a lado.
 */
export function BarraAcoesMecanico({ botoes, proximoPasso, acima }: { botoes: ReactNode[]; proximoPasso?: string; acima?: ReactNode }) {
  const lista = botoes.filter(Boolean);
  if (!lista.length) return null;
  return (
    <section
      aria-label="Ações da OS"
      data-barra-mecanico
      className="fixed inset-x-0 bottom-0 z-50 flex flex-col gap-1 border-t-2 border-borda-sutil bg-superficie px-3 pt-1 pb-[calc(0.25rem+env(safe-area-inset-bottom))] shadow-barra lg:static lg:z-auto lg:gap-3 lg:rounded-lg lg:border lg:p-4 lg:shadow-none"
    >
      {acima && <div className="pt-1 lg:pt-0">{acima}</div>}
      {proximoPasso && (
        <div className="hidden lg:block">
          <h2 className="text-xl">Próximo passo</h2>
          <p className="text-base text-texto-suave">{proximoPasso}</p>
        </div>
      )}
      <div className="grid h-14 auto-cols-[minmax(0,1fr)] grid-flow-col gap-2">{lista}</div>
    </section>
  );
}

/** Classes do botao da barra do mecanico: `empilhado` = icone em cima e rotulo embaixo. */
export function classesBotaoBarra(variante: "primario" | "secundario", empilhado: boolean) {
  const base = empilhado
    ? "flex h-14 w-full flex-col items-center justify-center gap-0.5 rounded-md px-1 text-[0.9375rem] leading-tight font-bold"
    : "flex h-14 w-full items-center justify-center gap-2 rounded-md px-4 text-lg font-bold";
  const cor =
    variante === "primario"
      ? "border-b-[3px] border-grafite bg-primaria text-primaria-texto active:translate-y-px active:bg-primaria-forte"
      : "border-2 border-borda bg-superficie text-texto active:bg-superficie-2";
  return `${base} ${cor} transition-colors disabled:cursor-not-allowed disabled:opacity-50`;
}
