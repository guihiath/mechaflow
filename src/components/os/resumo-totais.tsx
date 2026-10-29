import { TriangleAlert } from "lucide-react";
import { formatarCentavos } from "@/lib/formato";

/**
 * Totais da OS (DESIGN §10.5), valores vindos do banco (o app nunca calcula o total oficial).
 * - Sem `totalCentavos` (ex.: mecanico): nao renderiza nada.
 * - `custoPecasCentavos` (so dono): mostra custo e margem abaixo de "Só você vê".
 * - `itensSemPreco` > 0: aviso de que o total ainda nao esta certo.
 */
export function ResumoTotais({
  servicosCentavos,
  pecasCentavos,
  totalCentavos,
  itensSemPreco = 0,
  custoPecasCentavos,
}: {
  servicosCentavos?: number | null;
  pecasCentavos?: number | null;
  totalCentavos?: number | null;
  itensSemPreco?: number;
  custoPecasCentavos?: number | null;
}) {
  if (typeof totalCentavos !== "number") return null;

  const verCusto = typeof custoPecasCentavos === "number";
  const margem = verCusto ? totalCentavos - custoPecasCentavos : 0;
  const pct = verCusto && totalCentavos > 0 ? Math.round((margem / totalCentavos) * 100) : null;

  return (
    <section aria-label="Totais da OS" className="flex flex-col gap-2">
      <dl className="flex flex-col gap-1">
        {typeof servicosCentavos === "number" && (
          <div className="flex items-baseline justify-end gap-4">
            <dt className="text-base text-texto-suave">Serviços</dt>
            <dd className="min-w-32 text-right font-mono text-lg">{formatarCentavos(servicosCentavos)}</dd>
          </div>
        )}
        {typeof pecasCentavos === "number" && (
          <div className="flex items-baseline justify-end gap-4">
            <dt className="text-base text-texto-suave">Peças</dt>
            <dd className="min-w-32 text-right font-mono text-lg">{formatarCentavos(pecasCentavos)}</dd>
          </div>
        )}
        <div className="mt-1 flex items-baseline justify-between gap-4 border-t-2 border-texto pt-2">
          <dt className="font-display text-3xl font-bold">Total</dt>
          <dd className="text-right font-mono text-[1.75rem] leading-9 font-semibold">{formatarCentavos(totalCentavos)}</dd>
        </div>
      </dl>

      {itensSemPreco > 0 && (
        <p role="status" className="flex items-start gap-1.5 text-base font-bold text-alerta-texto">
          <TriangleAlert size={20} strokeWidth={2.25} aria-hidden className="mt-0.5 shrink-0" />
          {itensSemPreco === 1 ? "1 item sem preço." : `${itensSemPreco} itens sem preço.`} O total ainda não está certo.
        </p>
      )}

      {verCusto && (
        <div className="mt-1 flex flex-col gap-1 border-t-2 border-dashed border-borda-sutil pt-2">
          <p className="text-right text-xs font-bold text-texto-suave">Só você vê</p>
          <dl className="flex flex-col gap-1 text-sm text-texto-suave">
            <div className="flex items-baseline justify-end gap-4">
              <dt>Custo das peças</dt>
              <dd className="min-w-32 text-right font-mono">{formatarCentavos(custoPecasCentavos)}</dd>
            </div>
            <div className="flex items-baseline justify-end gap-4">
              <dt>Margem</dt>
              <dd className="min-w-32 text-right font-mono">
                {formatarCentavos(margem)}
                {pct !== null && ` (${pct}%)`}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </section>
  );
}
