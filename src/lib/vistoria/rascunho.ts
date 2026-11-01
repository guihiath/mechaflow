/**
 * Rascunho da vistoria guardado no aparelho (F4-B4; DESIGN §12.0 nº 4 e §12.14):
 * cada mudança vai na hora para o `localStorage` e depois para o banco, em segundo plano.
 * Fechar o app, o Safari recarregar ou a internet cair: ao voltar, o que ainda não subiu
 * (as "partes sujas") volta do aparelho e é enviado; o resto vem do banco.
 *
 * Chave por usuário e por vistoria (outra pessoa no mesmo celular não vê nem envia).
 * Apagado quando o banco confirma a conclusão (ou ao abrir a vistoria já concluída/anulada).
 * Só no navegador: nunca ler isto durante o render do servidor (hidratação).
 */
import type { DadosAssinatura } from "@/lib/assinatura";
import type { LadoAvaria, MotivoSemAssinatura, NivelCombustivel, SituacaoItemVistoria } from "@/lib/formato";
import type { NumeroPasso } from "@/components/vistoria/passos-vistoria";

/** Uma parte = uma chamada ao banco (ARQUITETURA V7: um passo da tela = uma RPC). */
export type Parte =
  | "entrada"
  | "objetos"
  | "observacoes"
  | "nome"
  | "sem_avarias"
  | "resto_ok"
  | `item:${string}`
  | `avaria:${string}`;

export type ItemRascunho = { situacao: SituacaoItemVistoria | null; observacao: string };
export type AvariaRascunho = { lado: LadoAvaria; descricao: string };

/** Folha "Nova avaria" aberta (foto já tirada): volta aberta se o app fechar no meio. */
export type FolhaRascunho = {
  avariaId: string;
  nova: boolean;
  fotoIds: string[];
  lado: LadoAvaria | null;
  descricao: string;
};

export type AssinaturaRascunho = {
  /** Id do navegador (assinar de novo = id novo; nada é sobrescrito no Storage). */
  id: string;
  dados: DadosAssinatura;
  /** O PNG deste id já está no Storage (registrado com `nomeEnviado`). */
  enviada: boolean;
  nomeEnviado: string | null;
};

export type RascunhoVistoria = {
  versao: 1;
  vistoriaId: string;
  passo: NumeroPasso;
  visitados: NumeroPasso[];
  km: string;
  horimetro: string;
  combustivel: NivelCombustivel | null;
  /** null = não informado; [] = "Nenhum objeto". */
  objetos: string[] | null;
  outrosObjetos: string;
  observacoes: string;
  nome: string;
  semAvarias: boolean;
  semAssinaturaMotivo: MotivoSemAssinatura | null;
  itens: Record<string, ItemRascunho>;
  avarias: Record<string, AvariaRascunho>;
  folha: FolhaRascunho | null;
  assinatura: AssinaturaRascunho | null;
  /** Traços na tela cheia antes de "Usar assinatura" (não perde se o app fechar assinando). */
  tracos: DadosAssinatura | null;
  sujas: Parte[];
  atualizadoEm: number;
};

const prefixo = "mf-vistoria:";
const chave = (usuarioId: string, vistoriaId: string) => `${prefixo}${usuarioId}:${vistoriaId}`;

export function lerRascunho(usuarioId: string, vistoriaId: string): RascunhoVistoria | null {
  try {
    const t = window.localStorage.getItem(chave(usuarioId, vistoriaId));
    if (!t) return null;
    const r = JSON.parse(t) as RascunhoVistoria;
    if (r?.versao !== 1 || r.vistoriaId !== vistoriaId) return null;
    return r;
  } catch {
    return null;
  }
}

/** Devolve false se o aparelho não deixou guardar (sem espaço / modo privado antigo). */
export function gravarRascunho(usuarioId: string, r: RascunhoVistoria): boolean {
  try {
    window.localStorage.setItem(chave(usuarioId, r.vistoriaId), JSON.stringify({ ...r, atualizadoEm: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

export function apagarRascunho(usuarioId: string, vistoriaId: string) {
  try {
    window.localStorage.removeItem(chave(usuarioId, vistoriaId));
  } catch {
    /* nada */
  }
}

/** Há algo deste usuário ainda não enviado ao banco (aviso ao sair da conta, §12.14). */
export function temRascunhoPendente(usuarioId: string): boolean {
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k?.startsWith(`${prefixo}${usuarioId}:`)) continue;
      const r = JSON.parse(window.localStorage.getItem(k) ?? "null") as RascunhoVistoria | null;
      if (r?.sujas?.length || (r?.assinatura && !r.assinatura.enviada)) return true;
    }
  } catch {
    /* nada */
  }
  return false;
}
