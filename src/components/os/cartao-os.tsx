import type { ReactNode } from "react";
import { Camera } from "lucide-react";
import { fotos as textoFotos } from "@/components/os/categorias-foto";
import { BadgeStatus, EtiquetaPagamento, SemMecanico } from "@/components/os/badge-status";
import { EtiquetaAcimaDoAprovado, EtiquetaSemPrecoContagem } from "@/components/os/etiquetas-fase3";
import { Cartao, ChipPlaca } from "@/components/ui/estados";
import { EtiquetaVistoriaCartao, rotuloVistoriaCartao } from "@/components/vistoria/etiquetas-vistoria";
import { formatarPlaca, formatarReaisInteiros, formatarTempoDesde, type StatusVistoria } from "@/lib/formato";
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
  /** Itens sem preco (so dono/atendente): etiqueta "2 sem preço". */
  itensSemPreco?: number;
  /** Total atual acima do aprovado pelo cliente (so dono/atendente). */
  acimaDoAprovado?: boolean;
  /** Mecanico (DESIGN §11.10): linha "5 fotos · 3 itens" no fim do cartao. */
  contagem?: { fotos: number; itens: number };
  /**
   * Vistoria de entrada (DESIGN §12.1, F4-B5): `estado` vem de `vw_os.vistoria_entrada_status`
   * (null = sem vistoria). "Sem vistoria" só aparece com a vistoria obrigatória e a OS aberta.
   */
  vistoria?: { estado: StatusVistoria | null; obrigatoria: boolean };
};

/**
 * Card de OS da lista (DESIGN §5.4 e §10.3). O card inteiro e um link.
 * `semValores` (mecanico): nenhum R$ e nenhuma etiqueta de pagamento, mesmo que os dados venham.
 * `agora`: relogio unico da lista (o servidor passa o mesmo para todos os cards).
 */
export function CartaoOS({
  os,
  semValores,
  agora,
  etiquetaExtra,
}: {
  os: DadosCartaoOS;
  semValores?: boolean;
  agora?: Date;
  /** Etiqueta a mais na linha do badge (ex.: "2 fotos não enviadas", componente do navegador). */
  etiquetaExtra?: ReactNode;
}) {
  const placa = formatarPlaca(os.placa);
  const rotuloStatus = INFO_STATUS[os.status].rotulo;
  const linhaVeiculo = [os.veiculo, os.cliente].filter(Boolean).join(" · ");
  const total = !semValores && typeof os.totalCentavos === "number" ? formatarReaisInteiros(os.totalCentavos) : "";
  const tempo = formatarTempoDesde(os.atualizadoEm, agora);
  const semPreco = !semValores ? (os.itensSemPreco ?? 0) : 0;
  const linhaContagem = os.contagem
    ? `${os.contagem.fotos > 0 ? textoFotos(os.contagem.fotos) : "Sem fotos"} · ${
        os.contagem.itens === 0 ? "Sem itens" : os.contagem.itens === 1 ? "1 item" : `${os.contagem.itens} itens`
      }`
    : null;
  // "Sem vistoria" em OS encerrada não ajuda ninguém (DESIGN §12.1: só OS abertas).
  const aberta = os.status !== "entregue" && os.status !== "cancelada";
  const vistoriaObrigatoria = Boolean(os.vistoria?.obrigatoria) && aberta;
  const rotulo = [
    `OS ${os.numero}`,
    `placa ${placa}`,
    os.cliente,
    rotuloStatus,
    semPreco > 0 ? (semPreco === 1 ? "1 item sem preço" : `${semPreco} itens sem preço`) : null,
    linhaContagem,
  ]
    .filter(Boolean)
    .join(", ")
    .concat(os.vistoria ? rotuloVistoriaCartao(os.vistoria.estado, vistoriaObrigatoria) : "");

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
            <EtiquetaSemPrecoContagem quantidade={semPreco} />
            {!semValores && os.acimaDoAprovado && <EtiquetaAcimaDoAprovado />}
            {!semValores && os.aReceber && <EtiquetaPagamento pago={false} />}
            {os.vistoria && <EtiquetaVistoriaCartao estado={os.vistoria.estado} obrigatoria={vistoriaObrigatoria} />}
            {etiquetaExtra}
          </span>
          {total && <span className="font-mono text-lg font-semibold">{total}</span>}
        </div>
        <p className="flex flex-wrap items-center gap-1 text-xs text-texto-suave">
          {tempo && <span>{tempo}</span>}
          {tempo && <span aria-hidden>·</span>}
          {os.mecanico ? <span>{os.mecanico}</span> : <SemMecanico />}
        </p>
        {linhaContagem && (
          <p className="flex items-center gap-1.5 text-sm text-texto-suave" data-teste="contagem-cartao">
            <Camera size={16} strokeWidth={2.25} aria-hidden />
            {linhaContagem}
          </p>
        )}
      </div>
    </Cartao>
  );
}
