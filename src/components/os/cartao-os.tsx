import { BadgeStatus, EtiquetaPagamento, SemMecanico } from "@/components/os/badge-status";
import { Cartao, ChipPlaca } from "@/components/ui/estados";
import { formatarPlaca, formatarReaisInteiros, formatarTempoDesde } from "@/lib/formato";
import { INFO_STATUS, type StatusOS } from "@/lib/os-status";

export type DadosCartaoOS = {
  /** Destino do toque (ex.: `/os/<id>`). */
  href: string;
  numero: number;
  placa: string;
  /** "Volvo FH 540" (opcional). */
  veiculo?: string | null;
  cliente?: string | null;
  sintoma?: string | null;
  status: StatusOS;
  /** Ultima mudanca de status (ISO, UTC). */
  atualizadoEm?: string | null;
  mecanico?: string | null;
  /** Total em centavos. Ausente/null: nao mostra nada (nunca "R$ 0,00" inventado). */
  totalCentavos?: number | null;
  /** OS entregue e nao paga: etiqueta "A receber" (so dono/atendente). */
  aReceber?: boolean;
};

/**
 * Card de OS da lista (DESIGN §5.4 e §10.3). O card inteiro e um link.
 * `semValores` (mecanico): nenhum R$ e nenhuma etiqueta de pagamento, mesmo que os dados venham.
 * `agora`: relogio unico da lista (o servidor passa o mesmo para todos os cards).
 */
export function CartaoOS({ os, semValores, agora }: { os: DadosCartaoOS; semValores?: boolean; agora?: Date }) {
  const placa = formatarPlaca(os.placa);
  const rotuloStatus = INFO_STATUS[os.status].rotulo;
  const linhaVeiculo = [os.veiculo, os.cliente].filter(Boolean).join(" · ");
  const total = !semValores && typeof os.totalCentavos === "number" ? formatarReaisInteiros(os.totalCentavos) : "";
  const tempo = formatarTempoDesde(os.atualizadoEm, agora);
  const rotulo = [`OS ${os.numero}`, `placa ${placa}`, os.cliente, rotuloStatus].filter(Boolean).join(", ");

  return (
    <Cartao href={os.href} faixa={INFO_STATUS[os.status].faixa} rotulo={rotulo} className="min-h-28">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-3">
          <ChipPlaca placa={placa} />
          <span className="font-mono text-base font-semibold text-texto-suave">OS #{os.numero}</span>
        </div>
        {linhaVeiculo && <p className="truncate text-lg font-bold">{linhaVeiculo}</p>}
        {os.sintoma && <p className="line-clamp-2 text-base text-texto-suave">{os.sintoma}</p>}
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <span className="flex flex-wrap items-center gap-2">
            <BadgeStatus status={os.status} />
            {!semValores && os.aReceber && <EtiquetaPagamento pago={false} />}
          </span>
          {total && <span className="font-mono text-lg font-semibold">{total}</span>}
        </div>
        <p className="flex flex-wrap items-center gap-1 text-xs text-texto-suave">
          {tempo && <span>{tempo}</span>}
          {tempo && <span aria-hidden>·</span>}
          {os.mecanico ? <span>{os.mecanico}</span> : <SemMecanico />}
        </p>
      </div>
    </Cartao>
  );
}
