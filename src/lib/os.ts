/**
 * Regras e textos da OS usados no servidor e no navegador (sem acesso ao banco).
 * Status, modo e filtros: `os-status.ts`. Formatos: `formato.ts`.
 */
import type { EventoOS } from "@/components/os/linha-tempo";
import type { Database } from "@/lib/supabase/database.types";
import { ehStatusOS, rotuloStatus, type StatusOS } from "@/lib/os-status";
import type { Papel } from "@/lib/contexto";

export type FormaPagamento = Database["public"]["Enums"]["forma_pagamento"];
export type CanalResposta = Database["public"]["Enums"]["canal_resposta"];

/** Ordem do DESIGN §10.8 (grade de 2 colunas). */
export const FORMAS_PAGAMENTO: { valor: FormaPagamento; rotulo: string }[] = [
  { valor: "pix", rotulo: "Pix" },
  { valor: "dinheiro", rotulo: "Dinheiro" },
  { valor: "cartao_debito", rotulo: "Cartão de débito" },
  { valor: "cartao_credito", rotulo: "Cartão de crédito" },
  { valor: "boleto", rotulo: "Boleto" },
  { valor: "faturado", rotulo: "Faturado" },
];

export const ROTULO_FORMA_PAGAMENTO = Object.fromEntries(FORMAS_PAGAMENTO.map((f) => [f.valor, f.rotulo])) as Record<
  FormaPagamento,
  string
>;

export function ehFormaPagamento(v: unknown): v is FormaPagamento {
  return FORMAS_PAGAMENTO.some((f) => f.valor === v);
}

/** Canais da resposta manual (o "link" e da Fase 6). */
export const CANAIS_RESPOSTA: { valor: Exclude<CanalResposta, "link">; rotulo: string }[] = [
  { valor: "telefone", rotulo: "Telefone" },
  { valor: "whatsapp", rotulo: "WhatsApp" },
  { valor: "presencial", rotulo: "Pessoalmente" },
];

/** "Aprovado pelo cliente por WhatsApp" / "por telefone" / "pessoalmente". */
export const CANAL_NA_FRASE: Record<CanalResposta, string> = {
  telefone: "por telefone",
  whatsapp: "por WhatsApp",
  presencial: "pessoalmente",
  link: "pelo link",
};

export function ehCanalManual(v: unknown): v is Exclude<CanalResposta, "link"> {
  return CANAIS_RESPOSTA.some((c) => c.valor === v);
}

/** Unidades do item da OS (mesmo CHECK do banco). */
export const UNIDADES_ITEM = ["un", "par", "jogo", "kit", "l", "kg", "m", "h"] as const;
export type UnidadeItem = (typeof UNIDADES_ITEM)[number];

/** Texto curto ao lado da quantidade: "2 un.", "2,5 litros". */
export const TEXTO_UNIDADE_ITEM: Record<UnidadeItem, string> = {
  un: "un.",
  par: "par",
  jogo: "jogo",
  kit: "kit",
  l: "litros",
  kg: "kg",
  m: "m",
  h: "h",
};

export function textoUnidade(u: string | null | undefined): string {
  return TEXTO_UNIDADE_ITEM[(u ?? "un") as UnidadeItem] ?? u ?? "un.";
}

/** un/par/jogo/kit: inteiro, minimo 1. Litro, quilo, metro, hora: aceita 0,5. */
export function unidadeFracionada(u: string | null | undefined): boolean {
  return u === "l" || u === "kg" || u === "m" || u === "h";
}

// ---------------------------------------------------------------- historico

/** Motivos fixos do cancelamento (o ultimo, "Outro motivo", abre texto livre). */
export const MOTIVOS_CANCELAMENTO = ["Cliente desistiu", "Orçamento recusado", "Aberta por engano", "Outro motivo"] as const;

/** Motivos que o mecanico pode ver: so os fixos (texto livre pode ter valor, I5). */
const MOTIVOS_FIXOS: readonly string[] = MOTIVOS_CANCELAMENTO.slice(0, -1);

type LinhaHistorico = {
  id: string | null;
  evento: string | null;
  de_status: StatusOS | null;
  para_status: StatusOS | null;
  observacao: string | null;
  por_nome: string | null;
  em: string | null;
};

const CANAL_TEXTO: Record<string, string> = {
  telefone: "por telefone",
  whatsapp: "por WhatsApp",
  presencial: "pessoalmente",
  link: "pelo link",
};

function semAcento(t: string) {
  return t.replace(/Sem mecanico/g, "Sem mecânico");
}

/**
 * Converte o historico do banco em eventos da LinhaTempo (mais recente primeiro).
 * O texto e montado aqui: a observacao crua do banco nao vai para o navegador.
 * Mecanico: eventos de pagamento ficam de fora (DESIGN §10.0 regra 4) e o texto livre
 * do balcao (motivo de recusa / cancelamento) vira texto fixo: pode conter valor (I5).
 */
export function montarEventos(linhas: LinhaHistorico[], papel: Papel): EventoOS[] {
  const eventos: EventoOS[] = [];
  const mecanico = papel === "mecanico";
  for (const h of linhas) {
    if (!h.id || !h.em || !h.evento) continue;
    const base = { id: h.id, em: h.em, por: h.por_nome };
    const para = ehStatusOS(h.para_status) ? h.para_status : null;
    const obs = h.observacao ?? "";

    switch (h.evento) {
      case "criada":
        if (para) eventos.push({ ...base, tipo: "status", status: para, observacao: "OS aberta." });
        break;
      case "status":
      case "entregue":
        if (para) eventos.push({ ...base, tipo: "status", status: para });
        break;
      case "desfazer":
        if (para)
          eventos.push({
            ...base,
            tipo: "status",
            status: para,
            observacao: ehStatusOS(h.de_status) ? `Voltou de ${rotuloStatus(h.de_status)}.` : "Desfeito.",
          });
        break;
      case "cancelada":
        if (mecanico) {
          const fixo = MOTIVOS_FIXOS.includes(obs.trim()) ? obs.trim() : null;
          eventos.push({ ...base, tipo: "status", status: "cancelada", observacao: fixo ? `Motivo: ${fixo}` : null });
        } else eventos.push({ ...base, tipo: "status", status: "cancelada", observacao: obs ? `Motivo: ${obs}` : null });
        break;
      case "aprovacao": {
        const canal = CANAL_TEXTO[obs.replace(/^por /, "")] ?? "";
        eventos.push({ ...base, tipo: "status", status: "aprovada", observacao: `Cliente aprovou ${canal}`.trim() + "." });
        break;
      }
      case "recusa": {
        if (mecanico) {
          if (para === "cancelada") eventos.push({ ...base, tipo: "status", status: "cancelada", observacao: "Orçamento recusado." });
          else eventos.push({ ...base, tipo: "texto", texto: "Cliente recusou o orçamento." });
          break;
        }
        const m = /^Cliente recusou por (\w+)(?:: ([\s\S]*))?$/.exec(obs);
        const canal = m ? (CANAL_TEXTO[m[1]] ?? "") : "";
        const motivo = m?.[2] ? `: ${m[2]}` : "";
        const texto = `Cliente recusou o orçamento ${canal}${motivo}`.replace(/\s+:/, ":").trim();
        if (para === "cancelada") eventos.push({ ...base, tipo: "status", status: "cancelada", observacao: texto });
        else eventos.push({ ...base, tipo: "texto", texto });
        break;
      }
      case "mecanico":
        eventos.push({ ...base, tipo: "texto", texto: `Mecânico: ${semAcento(obs).replace(" -> ", " → ")}` });
        break;
      case "modo":
        eventos.push({
          ...base,
          tipo: "texto",
          texto: para === "em_andamento" ? "Modo trocado para Serviço direto" : "Modo trocado para Com orçamento",
        });
        break;
      case "pagamento":
        if (papel === "mecanico") break;
        eventos.push({ ...base, tipo: "texto", texto: obs ? "Pagamento voltou para a receber" : "Pagamento registrado" });
        break;
    }
  }
  return eventos.sort((a, b) => (a.em < b.em ? 1 : a.em > b.em ? -1 : 0));
}

/** Data de hoje em America/Sao_Paulo no formato do <input type="date"> (AAAA-MM-DD). */
export function hojeEmSaoPaulo(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
}
