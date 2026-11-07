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
 * Evento `vistoria` do historico (ARQUITETURA 12.1 V18; DESIGN §12.20): o banco grava texto do
 * sistema ("Vistoria de entrada concluída[ sem assinatura (motorista ausente)]", "Acrescentou à
 * vistoria de entrada", "Vistoria de entrada anulada[: motivo]"). Aqui vira a frase da tela com
 * o nome de quem fez. O motivo da anulacao so vai para dono/atendente (o banco ja nao manda ao
 * mecanico; a tela tambem corta). Texto desconhecido: nada (nao mostra observacao crua).
 */
function textoVistoria(obs: string, por: string | null, mecanico: boolean): string | null {
  const nome = por?.trim() || null;
  const t = obs.trim();
  const concluida = /^Vistoria de (?:entrada|saída) concluída( sem assinatura \((motorista ausente|motorista recusou)\))?$/.exec(t);
  if (concluida) {
    const sem = concluida[2] === "motorista ausente" ? " (sem assinatura: motorista ausente)" : concluida[2] ? " (sem assinatura: recusou assinar)" : "";
    return `Vistoria concluída${nome ? ` por ${nome}` : ""}${sem}`;
  }
  if (/^Acrescentou à vistoria de (?:entrada|saída)$/.test(t)) {
    return nome ? `${nome} acrescentou à vistoria` : "Acrescentado à vistoria";
  }
  const anulada = /^Vistoria de (?:entrada|saída) anulada(?:: ([\s\S]+))?$/.exec(t);
  if (anulada) {
    const motivo = !mecanico && anulada[1]?.trim() ? `: ${anulada[1].trim()}` : "";
    return `${nome ? `${nome} anulou a vistoria` : "Vistoria anulada"}${motivo}`;
  }
  return null;
}

/**
 * Evento `orcamento_link` (ARQUITETURA 13.7; DESIGN §13.13): o banco grava texto do sistema, aqui
 * vira a frase com o nome de quem fez. Texto desconhecido: nada (nao mostra observacao crua).
 */
function textoEventoLink(obs: string, por: string | null): string | null {
  const nome = por?.trim() || null;
  const t = obs.trim();
  const gerado = /^Link gerado \(versão (\d+)\)$/.exec(t);
  if (gerado) return nome ? `${nome} gerou o link (versão ${gerado[1]})` : `Link gerado (versão ${gerado[1]})`;
  if (/^Link novo gerado \(versão \d+\)$/.test(t)) return nome ? `${nome} gerou um link novo` : "Link novo gerado";
  if (t === "Link cancelado") return nome ? `${nome} cancelou o link` : t;
  if (t === "Orçamento alterado: link anterior cancelado") return nome ? `${nome} alterou o orçamento: link anterior cancelado` : t;
  return null;
}

/**
 * Converte o historico do banco em eventos da LinhaTempo (mais recente primeiro).
 * O texto e montado aqui: a observacao crua do banco nao vai para o navegador.
 * Mecanico: eventos de pagamento, de preco e do link ficam de fora (DESIGN §10.0 regra 4 e §13.15) e o
 * texto livre do balcao (motivo de recusa / cancelamento) vira texto fixo: pode conter valor (I5).
 * Dono e atendente: a frase distingue a resposta do cliente no link da marcada por alguem da
 * oficina, e ja traz o nome de quem fez (por isso `por` vai vazio nesses eventos).
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
        if (para && !mecanico && h.de_status === "aprovada") {
          const quem = h.por_nome?.trim();
          eventos.push({ ...base, por: null, tipo: "status", status: para, observacao: quem ? `${quem} desfez a aprovação` : "Aprovação desfeita" });
        } else if (para)
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
        // Pelo link o mecanico recebe observacao vazia: "Cliente aprovou.", sem canal nem nome.
        const canal = CANAL_TEXTO[obs.replace(/^por /, "")] ?? "";
        if (mecanico) {
          eventos.push({ ...base, tipo: "status", status: "aprovada", observacao: `Cliente aprovou ${canal}`.trim() + "." });
          break;
        }
        const noLink = /^por link\. Nome informado: ([\s\S]+)$/.exec(obs);
        const quem = h.por_nome?.trim();
        const observacao = noLink
          ? `Cliente aprovou pelo link · Nome informado: ${noLink[1]}`
          : quem
            ? `${quem} marcou: cliente aprovou ${canal}`.trim()
            : `Cliente aprovou ${canal}`.trim() + ".";
        eventos.push({ ...base, por: null, tipo: "status", status: "aprovada", observacao });
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
        const quem = h.por_nome?.trim();
        const texto = (m?.[1] !== "link" && quem ? `${quem} marcou: cliente recusou ${canal}${motivo}` : `Cliente recusou ${canal}${motivo}`).replace(/\s+:/, ":").trim();
        if (para === "cancelada") eventos.push({ ...base, por: null, tipo: "status", status: "cancelada", observacao: texto });
        else eventos.push({ ...base, por: null, tipo: "texto", texto });
        break;
      }
      case "orcamento_link": {
        if (mecanico) break;
        const texto = textoEventoLink(obs, h.por_nome);
        if (texto) eventos.push({ ...base, por: null, tipo: "texto", texto });
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
      case "vistoria": {
        const texto = textoVistoria(obs, h.por_nome, mecanico);
        if (texto) eventos.push({ ...base, tipo: "texto", texto });
        break;
      }
      case "preco": {
        // F7-B8 (ARQUITETURA 14.8; decisao 3 do CEO em 14.15): "Ana definiu preços", sem valor,
        // sem item e sem contagem. O banco ja nao manda ao mecanico (RLS de os_historico); a tela
        // tambem corta. Vale so daqui para a frente: OS antiga nao tem o evento nem aviso.
        if (mecanico) break;
        const quem = h.por_nome?.trim();
        eventos.push({ ...base, por: null, tipo: "texto", texto: quem ? `${quem} definiu preços` : "Preços definidos" });
        break;
      }
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
