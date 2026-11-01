/**
 * Rascunho da vistoria guardado no aparelho (F4-B4; DESIGN §12.0 nº 4 e §12.14):
 * cada mudança vai na hora para o `localStorage` e depois para o banco, em segundo plano.
 * Fechar o app, o Safari recarregar ou a internet cair: ao voltar, o que ainda não subiu
 * (as "partes sujas") volta do aparelho e é enviado; o resto vem do banco.
 *
 * Chave por usuário e por vistoria (outra pessoa no mesmo celular não vê nem envia).
 * Apagado quando o banco confirma a conclusão (ou ao abrir a vistoria já concluída/anulada),
 * ao sair da conta (§12.14: o que já subiu some sem perguntar; o pendente, só se a pessoa
 * confirmar "Sair e apagar") e depois de 30 dias sem mexer. Depois que o PNG da assinatura
 * sobe, os traços (dado pessoal) não ficam mais guardados no aparelho: a tela usa a URL do banco.
 * Rascunho com formato inesperado é apagado (não quebra a tela).
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
  /** Traços da assinatura; `null` no aparelho depois que o PNG subiu (`enviada`). */
  dados: DadosAssinatura | null;
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

/** Rascunho parado há mais que isto é apagado ao ler (dados do cliente não ficam para sempre). */
export const VALIDADE_RASCUNHO_MS = 30 * 24 * 60 * 60 * 1000;

// ------------------------------------------------ validação (sem zod: não está nas dependências)
type Obj = Record<string, unknown>;
const ehObj = (x: unknown): x is Obj => typeof x === "object" && x !== null && !Array.isArray(x);
const ehTexto = (x: unknown): x is string => typeof x === "string";
const ehNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const textoOuNulo = (x: unknown) => x === null || ehTexto(x);
const ehPasso = (x: unknown) => Number.isInteger(x) && (x as number) >= 1 && (x as number) <= 5;
const listaDe = (x: unknown, f: (y: unknown) => boolean) => Array.isArray(x) && x.every(f);

function dadosValidos(x: unknown): x is DadosAssinatura {
  return (
    ehObj(x) &&
    ehNum(x.largura) &&
    ehNum(x.altura) &&
    listaDe(x.tracos, (t) => listaDe(t, (p) => ehObj(p) && ehNum(p.x) && ehNum(p.y) && ehNum(p.l)))
  );
}

function rascunhoValido(x: unknown, vistoriaId: string): x is RascunhoVistoria {
  if (!ehObj(x) || x.versao !== 1 || x.vistoriaId !== vistoriaId) return false;
  if (!ehPasso(x.passo) || !listaDe(x.visitados, ehPasso)) return false;
  if (![x.km, x.horimetro, x.outrosObjetos, x.observacoes, x.nome].every(ehTexto)) return false;
  if (!textoOuNulo(x.combustivel) || !textoOuNulo(x.semAssinaturaMotivo)) return false;
  if (!(x.objetos === null || listaDe(x.objetos, ehTexto))) return false;
  if (typeof x.semAvarias !== "boolean" || !ehNum(x.atualizadoEm) || !listaDe(x.sujas, ehTexto)) return false;
  if (!ehObj(x.itens) || !Object.values(x.itens).every((i) => ehObj(i) && textoOuNulo(i.situacao) && ehTexto(i.observacao))) return false;
  if (!ehObj(x.avarias) || !Object.values(x.avarias).every((a) => ehObj(a) && ehTexto(a.lado) && ehTexto(a.descricao))) return false;
  const f = x.folha;
  if (
    f !== null &&
    !(ehObj(f) && ehTexto(f.avariaId) && typeof f.nova === "boolean" && listaDe(f.fotoIds, ehTexto) && textoOuNulo(f.lado) && ehTexto(f.descricao))
  )
    return false;
  const a = x.assinatura;
  if (
    a !== null &&
    !(ehObj(a) && ehTexto(a.id) && (a.dados === null || dadosValidos(a.dados)) && typeof a.enviada === "boolean" && textoOuNulo(a.nomeEnviado))
  )
    return false;
  return x.tracos === null || dadosValidos(x.tracos);
}

/**
 * Ainda tem algo só no aparelho: parte não enviada ao banco, assinatura cujo PNG não subiu ou
 * a folha "Nova avaria" aberta (foto tirada, lado/descrição ainda não salvos).
 */
function temPendencia(r: RascunhoVistoria): boolean {
  return r.sujas.length > 0 || Boolean(r.assinatura && !r.assinatura.enviada) || r.folha !== null;
}

function remover(k: string) {
  try {
    window.localStorage.removeItem(k);
  } catch {
    /* nada */
  }
}

/**
 * Lê e confere um rascunho pela chave. Inválido (formato inesperado) ou vencido (30 dias):
 * apaga a chave e devolve null.
 */
function lerChave(k: string, vistoriaId: string): RascunhoVistoria | null {
  let t: string | null;
  try {
    t = window.localStorage.getItem(k);
  } catch {
    return null;
  }
  if (!t) return null;
  let r: unknown = null;
  try {
    r = JSON.parse(t);
  } catch {
    /* inválido: cai no apagar abaixo */
  }
  if (!rascunhoValido(r, vistoriaId) || Date.now() - r.atualizadoEm > VALIDADE_RASCUNHO_MS) {
    remover(k);
    return null;
  }
  return r;
}

/** Chaves `mf-vistoria:<usuario>:*` deste usuário, com o id da vistoria de cada uma. */
function chavesDoUsuario(usuarioId: string): { k: string; vistoriaId: string }[] {
  const inicio = `${prefixo}${usuarioId}:`;
  const out: { k: string; vistoriaId: string }[] = [];
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k?.startsWith(inicio)) out.push({ k, vistoriaId: k.slice(inicio.length) });
    }
  } catch {
    /* nada */
  }
  return out;
}

export function lerRascunho(usuarioId: string, vistoriaId: string): RascunhoVistoria | null {
  return lerChave(chave(usuarioId, vistoriaId), vistoriaId);
}

/** O que vai para o aparelho: com o PNG da assinatura já no banco, os traços não ficam guardados. */
function paraGuardar(r: RascunhoVistoria): RascunhoVistoria {
  const a = r.assinatura;
  if (!a?.enviada) return r;
  // `tracos` iguais aos da assinatura enviada saem junto; traços de uma assinatura nova (em andamento) ficam.
  const mesmos = r.tracos === null || r.tracos === a.dados || JSON.stringify(r.tracos) === JSON.stringify(a.dados);
  return { ...r, assinatura: { ...a, dados: null }, tracos: mesmos ? null : r.tracos };
}

/** Devolve false se o aparelho não deixou guardar (sem espaço / modo privado antigo). */
export function gravarRascunho(usuarioId: string, r: RascunhoVistoria): boolean {
  try {
    window.localStorage.setItem(chave(usuarioId, r.vistoriaId), JSON.stringify({ ...paraGuardar(r), atualizadoEm: Date.now() }));
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

/** Varredura ao abrir a vistoria: apaga os rascunhos deste usuário vencidos (30 dias) ou inválidos. */
export function expirarRascunhos(usuarioId: string) {
  for (const { k, vistoriaId } of chavesDoUsuario(usuarioId)) lerChave(k, vistoriaId);
}

/** Quantas vistorias deste usuário têm algo ainda não enviado ao banco (aviso ao sair da conta, §12.14). */
export function contarRascunhosPendentes(usuarioId: string): number {
  let n = 0;
  for (const { k, vistoriaId } of chavesDoUsuario(usuarioId)) {
    const r = lerChave(k, vistoriaId);
    if (r && temPendencia(r)) n++;
  }
  return n;
}

/**
 * Ao sair da conta (§12.14): apaga os rascunhos deste usuário sem nada pendente (já está tudo
 * no banco), sem perguntar. Com `tambemPendentes` ("Sair e apagar"), apaga todos.
 * Vencidos e inválidos também somem (pela leitura).
 */
export function apagarRascunhosAoSair(usuarioId: string, tambemPendentes = false) {
  for (const { k, vistoriaId } of chavesDoUsuario(usuarioId)) {
    const r = lerChave(k, vistoriaId);
    if (r && (tambemPendentes || !temPendencia(r))) remover(k);
  }
}
