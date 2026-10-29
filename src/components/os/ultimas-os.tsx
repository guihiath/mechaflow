import Link from "next/link";
import { BadgeStatus } from "@/components/os/badge-status";
import { formatarDiaMes } from "@/lib/formato";
import { ehStatusOS } from "@/lib/os-status";

type OsResumo = {
  id: string | null;
  numero: number | null;
  status: string | null;
  criado_em: string | null;
  sintoma_relatado: string | null;
};

/**
 * Ultimas OS de uma placa/veiculo (DESIGN §10.2, atalhos): numero, data, status e
 * sintoma em 1 linha. Sem valores (serve tambem para o mecanico).
 */
export function UltimasOS({ os, verTodas, titulo = "Ordens de serviço" }: { os: OsResumo[]; verTodas?: string; titulo?: string }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-2xl">{titulo}</h2>
      {os.length === 0 ? (
        <p className="text-base text-texto-suave">Nenhuma OS ainda para este veículo.</p>
      ) : (
        <ul className="divide-y-2 divide-borda-sutil overflow-hidden rounded-lg border border-borda-sutil bg-superficie">
          {os.map((o) => (
            <li key={o.id}>
              <Link href={`/os/${o.id}`} className="flex min-h-16 flex-col gap-1 px-4 py-3 active:bg-superficie-2">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-semibold">OS #{o.numero}</span>
                  <span className="text-sm text-texto-suave">{formatarDiaMes(o.criado_em)}</span>
                  {ehStatusOS(o.status) && <BadgeStatus status={o.status} />}
                </span>
                {o.sintoma_relatado && <span className="truncate text-base text-texto-suave">{o.sintoma_relatado}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {verTodas && os.length > 0 && (
        <Link href={verTodas} className="inline-flex min-h-toque items-center self-start text-base font-bold text-info-texto underline underline-offset-4">
          Ver todas as OS desta placa
        </Link>
      )}
    </section>
  );
}
