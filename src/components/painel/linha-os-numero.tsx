import Link from "next/link";
import { EtiquetaPagamento } from "@/components/os/badge-status";
import { Check } from "lucide-react";
import { ChipPlaca, Etiqueta } from "@/components/ui/estados";
import { ValorQuebravel } from "@/components/ui/valor-quebravel";
import { formatarCentavos, formatarPlaca } from "@/lib/formato";
import { ROTULO_FORMA_PAGAMENTO, type FormaPagamento } from "@/lib/os";
import { formatarDataCurta } from "@/lib/painel";
import type { RecortePainel } from "@/lib/supabase/database.types";

export type DadosLinhaOSNumero = {
  id: string;
  href: string;
  numero: number;
  placa: string;
  cliente?: string | null;
  /** Valor da linha: total da OS, ou só serviços (`emServicos`). Ausente: linha sem valor (ranking). */
  centavos?: number | null;
  /** ISO (UTC). */
  entregueEm?: string | null;
  pagoEm?: string | null;
  formaPagamento?: FormaPagamento | null;
  /** Texto digitado do serviço fora do catálogo (`ver=fora_catalogo`). */
  descricao?: string | null;
};

/**
 * Linha compacta das listas atrás de um número (DESIGN §14.3, `LinhaOSNumero`): mínimo 72 px,
 * inteira tocável. `ver` decide o que a linha diz:
 * - "entregues": "Entregue em 28/10" + etiqueta "Pago" (com a data) ou "A receber";
 * - "recebido": "Pago em 05/11 · Pix" + "Entregue em 28/10";
 * - "servico" / "fora_catalogo": sem valor, "Entregue em 28/10" (+ descrição digitada);
 * - "mecanico": valor dos serviços com "em serviços" abaixo.
 */
export function LinhaOSNumero({
  os,
  ver: recorte,
  hoje,
}: {
  os: DadosLinhaOSNumero;
  /** O `p_recorte` de `painel_lista_os`. "sem_mecanico" se comporta como "mecanico". */
  ver: RecortePainel;
  /** "AAAA-MM-DD" em São Paulo, para "28/10" × "28/10/2025". */
  hoje: string;
}) {
  const ver = recorte === "sem_mecanico" ? "mecanico" : recorte;
  const placa = formatarPlaca(os.placa);
  const entregue = os.entregueEm ? `Entregue em ${formatarDataCurta(os.entregueEm, hoje)}` : null;
  const pago = os.pagoEm ? `Pago em ${formatarDataCurta(os.pagoEm, hoje)}` : null;
  const forma = os.formaPagamento ? ROTULO_FORMA_PAGAMENTO[os.formaPagamento] : null;
  const comValor = (ver === "entregues" || ver === "recebido" || ver === "mecanico") && typeof os.centavos === "number";
  const rotulo = [
    `OS ${os.numero}`,
    `placa ${placa}`,
    os.cliente,
    comValor ? `${formatarCentavos(os.centavos)}${ver === "mecanico" ? " em serviços" : ""}` : null,
    ver === "recebido" ? [pago, forma].filter(Boolean).join(", ") : entregue,
    ver === "entregues" ? (pago ?? "A receber") : ver === "recebido" ? entregue : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <Link
      href={os.href}
      aria-label={rotulo}
      className="flex min-h-[72px] flex-col gap-1 rounded-lg border border-borda-sutil bg-superficie p-4 transition-colors active:bg-superficie-2"
    >
      <span className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-mono text-base font-semibold">OS #{os.numero}</span>
        {comValor && (
          <span className="ml-auto text-right font-mono text-base font-semibold">
            <ValorQuebravel centavos={os.centavos} />
            {ver === "mecanico" && <span className="block text-xs font-medium text-texto-suave">em serviços</span>}
          </span>
        )}
      </span>
      <span className="flex flex-wrap items-center gap-2">
        <ChipPlaca placa={placa} />
        {os.cliente && <span className="min-w-0 text-base break-words">{os.cliente}</span>}
      </span>
      {ver === "fora_catalogo" && os.descricao && <span className="text-base break-words">{os.descricao}</span>}
      {ver === "recebido" ? (
        <span className="flex flex-col text-sm text-texto-suave">
          {pago && <span>{[pago, forma].filter(Boolean).join(" · ")}</span>}
          {entregue && <span>{entregue}</span>}
        </span>
      ) : (
        <span className="flex flex-wrap items-center justify-between gap-2 text-sm text-texto-suave">
          {entregue && <span>{entregue}</span>}
          {ver === "entregues" &&
            (pago ? (
              <Etiqueta tom="sucesso">
                <Check size={18} strokeWidth={2.5} aria-hidden />
                {pago}
              </Etiqueta>
            ) : (
              <EtiquetaPagamento pago={false} />
            ))}
        </span>
      )}
    </Link>
  );
}

/** 3 skeletons de linha (DESIGN §14.3, com o título já na tela). */
export function LinhasOSCarregando({ linhas = 3 }: { linhas?: number }) {
  return (
    <div aria-busy="true" className="flex flex-col gap-2">
      {Array.from({ length: linhas }, (_, i) => (
        <div key={i} aria-hidden className="flex min-h-[72px] animate-pulse flex-col gap-2 rounded-lg border border-borda-sutil bg-superficie p-4">
          <div className="h-5 w-24 rounded-sm bg-superficie-2" />
          <div className="h-4 w-2/3 rounded-sm bg-superficie-2" />
        </div>
      ))}
      <span className="sr-only">Carregando…</span>
    </div>
  );
}
