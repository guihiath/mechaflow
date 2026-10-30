/**
 * Fila de envio de fotos (DESIGN §11.6 e §11.7), só no navegador.
 *
 * - Um "armazém" único por aba (fora do React): a seção Fotos da OS e a faixa global do
 *   layout leem o mesmo estado por `useSyncExternalStore`. Navegar entre telas do app NÃO
 *   para o envio; fechar o app para, e a fila volta ao abrir de novo (IndexedDB).
 * - Só o usuário logado: `iniciarFila(usuarioId)` carrega só os itens dele.
 * - Envia UMA por vez (internet fraca). 3 tentativas automáticas; depois "falhou" com
 *   "Tentar de novo". Sem internet: "sem_internet", volta sozinha no evento `online`.
 * - Erro que tentar de novo não resolve (limite de 40, OS encerrada, foto inválida):
 *   "nao_enviavel" com o motivo; fica guardado até a pessoa remover.
 * - Foto escolhida mas ainda SEM tipo (folha aberta) fica só na memória (`categoria: null`);
 *   guarda no aparelho quando o tipo é escolhido e o preparo terminou.
 */
import type { CategoriaFoto } from "@/lib/formato";
import { enviarFoto, ErroEnvio, guardarDiagnostico, novoIdFoto, segundosDesdeAquecimento } from "./enviar";
import { apagarGuardado, atualizarGuardado, guardar, listarGuardados, type RegistroGuardado } from "./fila-db";
import { ErroFoto, prepararFoto, type DiagnosticoPreparo } from "./preparar";

export type EstadoItemFila = "preparando" | "na_fila" | "sem_internet" | "enviando" | "falhou" | "nao_enviavel" | "confirmada";

export type ItemFila = {
  id: string;
  usuarioId: string;
  osId: string;
  numeroOS: number | null;
  /** null = a pessoa ainda não escolheu o tipo (folha aberta). */
  categoria: CategoriaFoto | null;
  legenda: string | null;
  estado: EstadoItemFila;
  progresso: number;
  tentativas: number;
  motivo: string | null;
  /** Sessão vencida: "Entre de novo" (a foto continua guardada). */
  precisaEntrar: boolean;
  /** Veio do IndexedDB ao abrir o app (aviso "ficaram guardadas no celular"). */
  retomada: boolean;
  /** Já está no IndexedDB. */
  guardada: boolean;
  criadoEm: number;
  foto?: Blob;
  mini?: Blob;
  largura?: number;
  altura?: number;
  diag?: DiagnosticoPreparo;
  /** blob: da miniatura (grade) e da foto (tela cheia), só na memória. */
  previa?: string;
  previaGrande?: string;
};

export type AvisoGuarda = "sem_indexeddb" | "sem_espaco" | null;

export type EstadoFila = {
  usuarioId: string | null;
  itens: ItemFila[];
  carregada: boolean;
  aviso: AvisoGuarda;
};

let estado: EstadoFila = { usuarioId: null, itens: [], carregada: false, aviso: null };
const ouvintes = new Set<() => void>();
const ouvintesConfirmacao = new Set<(osId: string, id: string) => void>();
const VAZIO: EstadoFila = { usuarioId: null, itens: [], carregada: false, aviso: null };

function emitir(novo: Partial<EstadoFila> = {}) {
  estado = { ...estado, ...novo };
  for (const f of ouvintes) f();
}

export function assinarFila(f: () => void) {
  ouvintes.add(f);
  return () => {
    ouvintes.delete(f);
  };
}
export const lerFila = () => estado;
export const lerFilaServidor = () => VAZIO;

/** Avisa quando uma foto foi confirmada pelo banco (a seção recarrega a lista). */
export function aoConfirmarFoto(f: (osId: string, id: string) => void) {
  ouvintesConfirmacao.add(f);
  return () => {
    ouvintesConfirmacao.delete(f);
  };
}

function atualizar(id: string, patch: Partial<ItemFila>) {
  let mudou = false;
  const itens = estado.itens.map((i) => {
    if (i.id !== id) return i;
    mudou = true;
    return { ...i, ...patch };
  });
  if (mudou) emitir({ itens });
}

const item = (id: string) => estado.itens.find((i) => i.id === id);

function liberar(i: ItemFila) {
  if (i.previa) URL.revokeObjectURL(i.previa);
  if (i.previaGrande) URL.revokeObjectURL(i.previaGrande);
}

/** Fotos que ainda vão sair do aparelho (contam no aviso ao sair e no limite de 40). */
export function pendente(i: ItemFila) {
  return i.estado !== "confirmada";
}

/** Fotos "andando" (o aviso ao fechar a aba vale para estas e para as sem tipo). */
export function emAndamento(i: ItemFila) {
  return i.categoria === null || i.estado === "preparando" || i.estado === "na_fila" || i.estado === "enviando" || i.estado === "sem_internet";
}

// ------------------------------------------------------------ início e retomada

let ligado = false;

function ligarRede() {
  if (ligado || typeof window === "undefined") return;
  ligado = true;
  window.addEventListener("online", () => {
    const itens = estado.itens.map((i) => (i.estado === "sem_internet" ? { ...i, estado: "na_fila" as const } : i));
    emitir({ itens });
    trabalhar();
  });
  window.addEventListener("offline", () => {
    const itens = estado.itens.map((i) => (i.estado === "na_fila" ? { ...i, estado: "sem_internet" as const } : i));
    emitir({ itens });
  });
}

/**
 * Liga a fila para o usuário logado e retoma o que ficou guardado no aparelho.
 * Chamado pelo layout do app (qualquer tela) e pela seção Fotos.
 */
export async function iniciarFila(usuarioId: string) {
  if (typeof window === "undefined") return;
  ligarRede();
  if (estado.usuarioId === usuarioId) return;
  // Trocou de usuário no mesmo celular: a fila do outro some da memória (continua guardada).
  for (const i of estado.itens) if (i.usuarioId !== usuarioId) liberar(i);
  emitir({ usuarioId, itens: estado.itens.filter((i) => i.usuarioId === usuarioId), carregada: false });

  const guardados = await listarGuardados(usuarioId);
  if (estado.usuarioId !== usuarioId) return;
  if (guardados === null) {
    emitir({ carregada: true, aviso: "sem_indexeddb" });
    return;
  }
  const ja = new Set(estado.itens.map((i) => i.id));
  const novos: ItemFila[] = guardados
    .filter((g) => !ja.has(g.id))
    .map((g) => {
      const foto = new Blob([g.foto], { type: "image/jpeg" });
      const mini = new Blob([g.mini], { type: "image/jpeg" });
      return {
        id: g.id,
        usuarioId: g.usuarioId,
        osId: g.osId,
        numeroOS: g.numeroOS,
        categoria: g.categoria,
        legenda: g.legenda,
        estado: g.estado === "nao_enviavel" ? "nao_enviavel" : navigator.onLine ? "na_fila" : "sem_internet",
        progresso: 0,
        tentativas: 0,
        motivo: g.motivo,
        precisaEntrar: false,
        retomada: true,
        guardada: true,
        criadoEm: g.criadoEm,
        foto,
        mini,
        largura: g.largura,
        altura: g.altura,
        previa: URL.createObjectURL(mini),
        previaGrande: URL.createObjectURL(foto),
      };
    });
  emitir({ itens: [...estado.itens, ...novos], carregada: true });
  trabalhar();
}

// ------------------------------------------------------------ entrada de fotos

/**
 * Começa a preparar as fotos escolhidas (uma por vez, para não estourar a memória do
 * iPhone) e devolve os ids. Elas ficam sem tipo até `definirTipo`.
 */
export function adicionarArquivos(arquivos: File[], dados: { osId: string; numeroOS: number | null }): string[] {
  const usuarioId = estado.usuarioId;
  if (!usuarioId || !arquivos.length) return [];
  const agora = Date.now();
  const novos: ItemFila[] = arquivos.map((_, n) => ({
    id: novoIdFoto(),
    usuarioId,
    osId: dados.osId,
    numeroOS: dados.numeroOS,
    categoria: null,
    legenda: null,
    estado: "preparando",
    progresso: 0,
    tentativas: 0,
    motivo: null,
    precisaEntrar: false,
    retomada: false,
    guardada: false,
    // A 1ª escolhida aparece primeiro na grade (mais nova = maior) e também sai primeiro (ordem da lista).
    criadoEm: agora - n,
  }));
  emitir({ itens: [...estado.itens, ...novos] });
  void prepararEmSequencia(novos.map((i, n) => [i.id, arquivos[n]] as const));
  return novos.map((i) => i.id);
}

let filaPreparo: Promise<void> = Promise.resolve();

function prepararEmSequencia(lista: (readonly [string, File])[]) {
  filaPreparo = filaPreparo.then(async () => {
    for (const [id, arquivo] of lista) {
      if (!item(id)) continue; // descartada antes de preparar
      try {
        const p = await prepararFoto(arquivo);
        if (!item(id)) continue;
        atualizar(id, {
          foto: p.foto,
          mini: p.mini,
          largura: p.largura,
          altura: p.altura,
          diag: p.diag,
          previa: URL.createObjectURL(p.mini),
          previaGrande: URL.createObjectURL(p.foto),
          estado: navigator.onLine ? "na_fila" : "sem_internet",
        });
        await guardarSePronta(id);
      } catch (e) {
        const motivo =
          e instanceof ErroFoto
            ? e.codigo === "grande_demais"
              ? "Esta foto ficou grande demais para enviar. Tire de novo, um pouco mais de longe."
              : e.codigo === "vazio"
                ? "Este arquivo não é uma foto. Escolha uma foto da galeria."
                : "Não foi possível abrir esta foto. Tire de novo ou escolha outra da galeria."
            : "Não foi possível abrir esta foto. Tire de novo ou escolha outra da galeria.";
        guardarDiagnostico({ osId: item(id)?.osId ?? null, fotoId: id, resultado: "erro", etapaErro: "preparo", erro: `${motivo} (${String((e as Error)?.cause ?? e)})` });
        atualizar(id, { estado: "nao_enviavel", motivo });
      }
    }
    trabalhar();
  });
  return filaPreparo;
}

async function guardarSePronta(id: string) {
  const i = item(id);
  if (!i || i.guardada || !i.categoria || !i.foto || !i.mini || i.estado === "nao_enviavel") return;
  try {
    const [foto, mini] = await Promise.all([i.foto.arrayBuffer(), i.mini.arrayBuffer()]);
    const r: RegistroGuardado = {
      id: i.id,
      usuarioId: i.usuarioId,
      osId: i.osId,
      numeroOS: i.numeroOS,
      categoria: i.categoria,
      legenda: i.legenda,
      largura: i.largura ?? 0,
      altura: i.altura ?? 0,
      foto,
      mini,
      criadoEm: i.criadoEm,
      estado: "na_fila",
      motivo: null,
    };
    await guardar(r);
    if (item(id)) atualizar(id, { guardada: true });
    else void apagarGuardado(id); // enviada/descartada enquanto guardava
  } catch (e) {
    const nome = (e as { name?: string })?.name;
    if (nome === "QuotaExceededError") emitir({ aviso: "sem_espaco" });
    else if (!estado.aviso) emitir({ aviso: "sem_indexeddb" });
  }
}

/** A pessoa escolheu o tipo (e a legenda) na folha: entra na fila de envio. */
export async function definirTipo(ids: string[], categoria: CategoriaFoto, legenda: string | null) {
  const leg = legenda?.trim() || null;
  const itens = estado.itens.map((i) => (ids.includes(i.id) ? { ...i, categoria, legenda: leg } : i));
  emitir({ itens });
  await Promise.all(ids.map(guardarSePronta));
  trabalhar();
}

/** Descarta (antes de enviar) ou remove da fila. */
export function descartar(ids: string[]) {
  const sai = estado.itens.filter((i) => ids.includes(i.id));
  for (const i of sai) {
    liberar(i);
    void apagarGuardado(i.id);
  }
  emitir({ itens: estado.itens.filter((i) => !ids.includes(i.id)) });
}

/** "Tentar de novo" (uma foto ou todas as que falharam). */
export function tentarDeNovo(ids?: string[]) {
  const itens = estado.itens.map((i) =>
    (ids ? ids.includes(i.id) : true) && (i.estado === "falhou" || i.estado === "sem_internet" || (i.estado === "nao_enviavel" && i.precisaEntrar))
      ? { ...i, estado: "na_fila" as const, tentativas: 0, motivo: null, precisaEntrar: false }
      : i,
  );
  emitir({ itens });
  trabalhar();
}

// ------------------------------------------------------------ envio (uma por vez)

let rodando = false;
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

function proxima(): ItemFila | undefined {
  return estado.itens.find((i) => i.estado === "na_fila" && i.categoria && i.foto && i.mini && i.usuarioId === estado.usuarioId);
}

export function trabalhar() {
  if (rodando || typeof window === "undefined") return;
  rodando = true;
  void (async () => {
    try {
      for (;;) {
        const i = proxima();
        if (!i) break;
        if (!navigator.onLine) {
          emitir({ itens: estado.itens.map((x) => (x.estado === "na_fila" ? { ...x, estado: "sem_internet" as const } : x)) });
          break;
        }
        await enviarUma(i);
      }
    } finally {
      rodando = false;
    }
  })();
}

async function enviarUma(i: ItemFila) {
  const aquecidaHaS = segundosDesdeAquecimento();
  atualizar(i.id, { estado: "enviando", progresso: 0 });
  let ultimo = 0;
  try {
    const r = await enviarFoto({
      id: i.id,
      osId: i.osId,
      preparada: { foto: i.foto!, mini: i.mini!, largura: i.largura ?? 1, altura: i.altura ?? 1 },
      categoria: i.categoria!,
      legenda: i.legenda,
      aoProgresso: (pct) => {
        if (pct - ultimo >= 2 || pct >= 100) {
          ultimo = pct;
          atualizar(i.id, { progresso: pct });
        }
      },
    });
    guardarDiagnostico({ osId: i.osId, fotoId: i.id, resultado: "enviada", preparo: i.diag, envio: { ...r, aquecidaHaS } });
    await apagarGuardado(i.id);
    atualizar(i.id, { estado: "confirmada", progresso: 100, guardada: false });
    for (const f of ouvintesConfirmacao) f(i.osId, i.id);
    // O "Check" fica 2 s; depois a grade mostra a foto do servidor.
    setTimeout(() => {
      const atual = item(i.id);
      if (atual?.estado === "confirmada") {
        liberar(atual);
        emitir({ itens: estado.itens.filter((x) => x.id !== i.id) });
      }
    }, 2500);
  } catch (e) {
    const erro = e instanceof ErroEnvio ? e : new ErroEnvio("registrando", "Não deu para enviar a foto. Toque em “Tentar de novo”.", String(e));
    guardarDiagnostico({ osId: i.osId, fotoId: i.id, resultado: "erro", erro: `${erro.message} (${erro.detalhe})`, etapaErro: erro.etapa, preparo: i.diag });
    if (!item(i.id)) return; // removida durante o envio
    if (erro.tipo === "rede" && !navigator.onLine) {
      atualizar(i.id, { estado: "sem_internet", progresso: 0 });
      return;
    }
    if (erro.tipo === "sessao") {
      atualizar(i.id, { estado: "falhou", progresso: 0, motivo: erro.message, precisaEntrar: true });
      return;
    }
    if (erro.tipo === "definitivo") {
      atualizar(i.id, { estado: "nao_enviavel", progresso: 0, motivo: erro.message });
      void atualizarGuardado(i.id, { estado: "nao_enviavel", motivo: erro.message });
      return;
    }
    const tentativas = (item(i.id)?.tentativas ?? 0) + 1;
    if (tentativas >= 3) {
      atualizar(i.id, { estado: "falhou", progresso: 0, tentativas, motivo: erro.message });
      return;
    }
    atualizar(i.id, { estado: "na_fila", progresso: 0, tentativas });
    await espera(2000 * tentativas);
  }
}
