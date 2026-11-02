import { Ban, ClipboardCheck, ClipboardList, ClipboardPen, ClipboardX, FilePlus2, ImageOff, PenOff } from "lucide-react";
import { Etiqueta } from "@/components/ui/estados";
import { EtiquetaInfo } from "@/components/os/etiquetas-fase3";
import { ETIQUETA_SEM_ASSINATURA, type MotivoSemAssinatura, type StatusVistoria } from "@/lib/formato";

/**
 * Etiquetas da vistoria (DESIGN §12.1): `Etiqueta` existente + o tom "info" da Fase 3.
 * Nenhuma cor nova. Sempre icone + texto.
 */

const ICONE = { size: 18, strokeWidth: 2.25, "aria-hidden": true } as const;

/** Estado da vistoria de entrada para a etiqueta (a anulada sem outra feita = "Sem vistoria"). */
export type EstadoEtiquetaVistoria = "sem" | StatusVistoria;

/**
 * "Sem vistoria" / "Vistoria em andamento" / "Vistoria feita" / "Vistoria anulada".
 * `obrigatoria`: o "Sem vistoria" vira alerta (ClipboardX); opcional fica neutro (ClipboardList).
 */
export function EtiquetaVistoria({ estado, obrigatoria = false }: { estado: EstadoEtiquetaVistoria; obrigatoria?: boolean }) {
  switch (estado) {
    case "concluida":
      return (
        <Etiqueta tom="sucesso">
          <ClipboardCheck {...ICONE} />
          Vistoria feita
        </Etiqueta>
      );
    case "rascunho":
      return (
        <EtiquetaInfo>
          <ClipboardPen {...ICONE} />
          Vistoria em andamento
        </EtiquetaInfo>
      );
    case "anulada":
      return (
        <Etiqueta tom="erro">
          <Ban {...ICONE} />
          Vistoria anulada
        </Etiqueta>
      );
    default:
      return obrigatoria ? (
        <Etiqueta tom="alerta">
          <ClipboardX {...ICONE} />
          Sem vistoria
        </Etiqueta>
      ) : (
        <Etiqueta>
          <ClipboardList {...ICONE} />
          Sem vistoria
        </Etiqueta>
      );
  }
}

/**
 * Etiqueta do `CartaoOS` (DESIGN §12.1): "Sem vistoria" so com a vistoria obrigatoria (em
 * oficina opcional ela vira ruido na lista); feita e em andamento sempre. `null` = nada.
 */
export function EtiquetaVistoriaCartao({
  estado,
  obrigatoria,
}: {
  estado: EstadoEtiquetaVistoria | null | undefined;
  obrigatoria: boolean;
}) {
  const e = !estado || estado === "anulada" ? "sem" : estado;
  if (e === "sem" && !obrigatoria) return null;
  // Na lista quase toda OS pode estar assim: contorno, para não gritar em todo cartão (sólido só no detalhe).
  if (e === "sem") {
    return (
      <span className="inline-flex h-8 items-center gap-1.5 rounded-sm border-2 border-alerta bg-superficie px-2.5 text-sm font-bold text-alerta-texto">
        <ClipboardX {...ICONE} />
        Sem vistoria
      </span>
    );
  }
  return <EtiquetaVistoria estado={e} obrigatoria={obrigatoria} />;
}

/** Trecho do aria-label do cartao da OS (", vistoria feita" / ", sem vistoria"). */
export function rotuloVistoriaCartao(estado: EstadoEtiquetaVistoria | null | undefined, obrigatoria: boolean): string {
  const e = !estado || estado === "anulada" ? "sem" : estado;
  if (e === "concluida") return ", vistoria feita";
  if (e === "rascunho") return ", vistoria em andamento";
  return obrigatoria ? ", sem vistoria" : "";
}

/** "Sem assinatura: motorista ausente" / "Sem assinatura: recusou assinar". */
export function EtiquetaSemAssinatura({ motivo }: { motivo: MotivoSemAssinatura }) {
  return (
    <Etiqueta tom="alerta">
      <PenOff {...ICONE} />
      {ETIQUETA_SEM_ASSINATURA[motivo]}
    </Etiqueta>
  );
}

/** "Acrescentado depois da conclusão" (cada complemento). */
export function EtiquetaAcrescentado() {
  return (
    <EtiquetaInfo>
      <FilePlus2 {...ICONE} />
      Acrescentado depois da conclusão
    </EtiquetaInfo>
  );
}

/** "Sem foto" (avaria registrada sem foto). */
export function EtiquetaSemFoto() {
  return (
    <Etiqueta tom="alerta">
      <ImageOff {...ICONE} />
      Sem foto
    </Etiqueta>
  );
}
