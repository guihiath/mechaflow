import { Check, Clock, FileText, TriangleAlert, UserX, Zap } from "lucide-react";
import { Etiqueta } from "@/components/ui/estados";
import { INFO_STATUS, ROTULO_MODO_OS, type ModoOS, type StatusOS } from "@/lib/os-status";

/**
 * Badge de status da OS (DESIGN §5.5 e §10.1): icone + texto + cor, nunca so cor.
 * Nao e botao. "normal" 32px / 15px; "grande" 40px / 18px (topo do detalhe).
 */
export function BadgeStatus({ status, tamanho = "normal" }: { status: StatusOS; tamanho?: "normal" | "grande" }) {
  const { rotulo, icone: Icone, badge } = INFO_STATUS[status];
  const medida = tamanho === "grande" ? "h-10 px-3 text-lg" : "h-8 px-2.5 text-sm";
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-sm font-bold whitespace-nowrap ${medida} ${badge}`}>
      <Icone size={tamanho === "grande" ? 22 : 18} strokeWidth={2.25} aria-hidden className="shrink-0" />
      {rotulo}
    </span>
  );
}

/** Etiqueta do modo: "Com orçamento" / "Serviço direto" (nao e status). */
export function EtiquetaModo({ modo }: { modo: ModoOS }) {
  const Icone = modo === "direto" ? Zap : FileText;
  return (
    <Etiqueta>
      <Icone size={18} strokeWidth={2.25} aria-hidden />
      {ROTULO_MODO_OS[modo]}
    </Etiqueta>
  );
}

/** Pagamento (so dono/atendente, OS entregue): "Pago" / "A receber". */
export function EtiquetaPagamento({ pago }: { pago: boolean }) {
  return pago ? (
    <Etiqueta tom="sucesso">
      <Check size={18} strokeWidth={2.5} aria-hidden />
      Pago
    </Etiqueta>
  ) : (
    <Etiqueta tom="alerta">
      <Clock size={18} strokeWidth={2.25} aria-hidden />A receber
    </Etiqueta>
  );
}

/** Item sem preco (so dono/atendente). */
export function EtiquetaSemPreco() {
  return (
    <Etiqueta tom="alerta">
      <TriangleAlert size={18} strokeWidth={2.25} aria-hidden />
      Sem preço
    </Etiqueta>
  );
}

/** Texto "Sem mecânico" (lista e detalhe). */
export function SemMecanico() {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-bold text-alerta-texto">
      <UserX size={16} strokeWidth={2.25} aria-hidden className="shrink-0" />
      Sem mecânico
    </span>
  );
}
