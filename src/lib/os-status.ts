import {
  CircleCheckBig,
  CircleX,
  Clock,
  Send,
  ThumbsUp,
  Truck,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { formatarDiaHora } from "@/lib/formato";

/**
 * Status, modo e filtros da OS (DESIGN §2.3 e §10.1).
 * Os nomes seguem o enum do banco (`status_os`, `modo_os`). Se o banco ganhar um
 * status novo, o TypeScript aponta aqui tudo o que precisa de rotulo/cor.
 */
export const STATUS_OS = [
  "aguardando_orcamento",
  "orcamento_enviado",
  "aprovada",
  "em_andamento",
  "pronta",
  "entregue",
  "cancelada",
] as const;

export type StatusOS = (typeof STATUS_OS)[number];

export type ModoOS = "com_orcamento" | "direto";

export type TipoItemOS = "servico" | "peca";

export function ehStatusOS(valor: unknown): valor is StatusOS {
  return typeof valor === "string" && (STATUS_OS as readonly string[]).includes(valor);
}

type InfoStatus = {
  rotulo: string;
  icone: LucideIcon;
  /** Classes do BadgeStatus (fundo + texto [+ borda]). */
  badge: string;
  /** Classe de cor da faixa de 6px do CartaoOS. */
  faixa: string;
};

export const INFO_STATUS: Record<StatusOS, InfoStatus> = {
  aguardando_orcamento: {
    rotulo: "Aguardando orçamento",
    icone: Clock,
    badge: "bg-status-aguardando-orcamento text-status-aguardando-orcamento-texto",
    // O #FFE08A some no card branco: a faixa usa o amarelo forte.
    faixa: "bg-primaria-forte",
  },
  orcamento_enviado: {
    rotulo: "Orçamento enviado",
    icone: Send,
    badge: "bg-status-orcamento-enviado text-status-orcamento-enviado-texto",
    faixa: "bg-status-orcamento-enviado",
  },
  aprovada: {
    rotulo: "Aprovada",
    icone: ThumbsUp,
    badge: "bg-status-aprovada text-status-aprovada-texto",
    faixa: "bg-status-aprovada",
  },
  em_andamento: {
    rotulo: "Em andamento",
    icone: Wrench,
    // No tema escuro o fundo grafite some na superficie: borda amarela.
    badge: "bg-status-em-andamento text-status-em-andamento-texto dark:border dark:border-[#F5B800]/60",
    faixa: "bg-status-em-andamento dark:bg-primaria",
  },
  pronta: {
    rotulo: "Pronta",
    icone: CircleCheckBig,
    badge: "bg-status-pronta text-status-pronta-texto",
    faixa: "bg-status-pronta",
  },
  entregue: {
    rotulo: "Entregue",
    icone: Truck,
    badge: "bg-status-entregue text-status-entregue-texto",
    faixa: "bg-status-entregue",
  },
  cancelada: {
    rotulo: "Cancelada",
    icone: CircleX,
    badge: "border-2 border-status-cancelada bg-transparent text-status-cancelada-texto",
    faixa: "bg-status-cancelada",
  },
};

export function rotuloStatus(status: StatusOS): string {
  return INFO_STATUS[status].rotulo;
}

export const ROTULO_MODO_OS: Record<ModoOS, string> = {
  com_orcamento: "Com orçamento",
  direto: "Serviço direto",
};

/**
 * Frase de "proximo passo" no topo do detalhe (dono/atendente, DESIGN §10.1).
 * Entregue e cancelada usam dados da OS.
 */
export function proximoPasso(
  status: StatusOS,
  dados: { entregueEm?: string | null; motivoCancelamento?: string | null } = {},
): string {
  switch (status) {
    case "aguardando_orcamento":
      return "Monte o orçamento e registre a resposta do cliente.";
    case "orcamento_enviado":
      return "Esperando o cliente responder.";
    case "aprovada":
      return "Cliente aprovou. Pode começar o serviço.";
    case "em_andamento":
      return "Serviço em andamento.";
    case "pronta":
      return "Pronta. Feche a OS quando o cliente vier buscar.";
    case "entregue":
      return dados.entregueEm ? `Entregue em ${formatarDiaHora(dados.entregueEm)}.` : "Entregue.";
    case "cancelada":
      return dados.motivoCancelamento ? `Cancelada: ${dados.motivoCancelamento}.` : "Cancelada.";
  }
}

/** Itens so podem ser editados de aguardando_orcamento ate pronta (DESIGN §10.5). */
export function itensEditaveis(status: StatusOS): boolean {
  return status !== "entregue" && status !== "cancelada";
}

export function osEncerrada(status: StatusOS): boolean {
  return status === "entregue" || status === "cancelada";
}

// ---------------------------------------------------------------- filtros da lista

export type FiltroOS = "abertas" | "orcamento" | "aprovadas" | "em_andamento" | "prontas" | "entregues" | "canceladas" | "todas";

/** Ordem dos chips da lista de OS (DESIGN §10.3). `rotuloVazio` vai em "Nenhuma OS {…}." */
export const FILTROS_OS: { valor: FiltroOS; rotulo: string; rotuloVazio: string; status: readonly StatusOS[] }[] = [
  {
    valor: "abertas",
    rotulo: "Abertas",
    rotuloVazio: "aberta",
    status: ["aguardando_orcamento", "orcamento_enviado", "aprovada", "em_andamento", "pronta"],
  },
  { valor: "orcamento", rotulo: "Orçamento", rotuloVazio: "em orçamento", status: ["aguardando_orcamento", "orcamento_enviado"] },
  { valor: "aprovadas", rotulo: "Aprovadas", rotuloVazio: "aprovada", status: ["aprovada"] },
  { valor: "em_andamento", rotulo: "Em andamento", rotuloVazio: "em andamento", status: ["em_andamento"] },
  { valor: "prontas", rotulo: "Prontas", rotuloVazio: "pronta", status: ["pronta"] },
  { valor: "entregues", rotulo: "Entregues", rotuloVazio: "entregue", status: ["entregue"] },
  { valor: "canceladas", rotulo: "Canceladas", rotuloVazio: "cancelada", status: ["cancelada"] },
  { valor: "todas", rotulo: "Todas", rotuloVazio: "", status: STATUS_OS },
];

export const FILTRO_OS_PADRAO: FiltroOS = "abertas";

/** Le o ?status= da URL; valor desconhecido cai no padrao. */
export function lerFiltroOS(valor: string | null | undefined) {
  return FILTROS_OS.find((f) => f.valor === valor) ?? FILTROS_OS[0];
}
