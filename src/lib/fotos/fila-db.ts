/**
 * Guarda da fila de fotos no aparelho (IndexedDB, decisão do CEO 16.6-7; DESIGN §11.7).
 * Guarda a foto JÁ comprimida e a miniatura (como ArrayBuffer: o Safari antigo tinha
 * defeitos com Blob no IndexedDB), com OS, tipo, legenda, id e o id do usuário.
 * Sem IndexedDB (aba privada antiga, bloqueado): tudo falha em silêncio e a fila fica
 * só na memória (quem chama mostra o aviso).
 */
import type { CategoriaFoto } from "@/lib/formato";

const BANCO = "mechaflow-fotos";
const LOJA = "fila";

export type RegistroGuardado = {
  id: string;
  usuarioId: string;
  osId: string;
  numeroOS: number | null;
  categoria: CategoriaFoto;
  legenda: string | null;
  largura: number;
  altura: number;
  foto: ArrayBuffer;
  mini: ArrayBuffer;
  criadoEm: number;
  /** "nao_enviavel" fica guardado com o motivo; o resto volta para a fila ao reabrir. */
  estado: "na_fila" | "nao_enviavel";
  motivo: string | null;
};

let abrindo: Promise<IDBDatabase | null> | null = null;

export function abrirBanco(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  abrindo ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(BANCO, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(LOJA)) db.createObjectStore(LOJA, { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return abrindo;
}

function transacao<T>(modo: IDBTransactionMode, fazer: (loja: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return abrirBanco().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        if (!db) return reject(new Error("sem_indexeddb"));
        let resultado: T | undefined;
        try {
          const tx = db.transaction(LOJA, modo);
          const req = fazer(tx.objectStore(LOJA));
          if (req) req.onsuccess = () => (resultado = req.result);
          tx.oncomplete = () => resolve(resultado);
          tx.onerror = () => reject(tx.error ?? new Error("erro_indexeddb"));
          tx.onabort = () => reject(tx.error ?? new Error("erro_indexeddb"));
        } catch (e) {
          reject(e);
        }
      }),
  );
}

/** Lança erro com `name === "QuotaExceededError"` se o celular está sem espaço. */
export async function guardar(r: RegistroGuardado): Promise<void> {
  await transacao("readwrite", (l) => l.put(r));
}

export async function apagarGuardado(id: string): Promise<void> {
  await transacao("readwrite", (l) => l.delete(id)).catch(() => undefined);
}

export async function atualizarGuardado(id: string, patch: Partial<Pick<RegistroGuardado, "estado" | "motivo" | "categoria" | "legenda">>) {
  const atual = await transacao<RegistroGuardado>("readonly", (l) => l.get(id) as IDBRequest<RegistroGuardado>).catch(() => undefined);
  if (!atual) return;
  await guardar({ ...atual, ...patch }).catch(() => undefined);
}

/** Itens guardados deste usuário (a fila de outra pessoa no mesmo celular não aparece). */
export async function listarGuardados(usuarioId: string): Promise<RegistroGuardado[] | null> {
  try {
    const todos = (await transacao<RegistroGuardado[]>("readonly", (l) => l.getAll() as IDBRequest<RegistroGuardado[]>)) ?? [];
    return todos.filter((r) => r.usuarioId === usuarioId).sort((a, b) => b.criadoEm - a.criadoEm);
  } catch {
    return null;
  }
}

/** Quantos itens guardados este usuário tem (aviso ao sair da conta). */
export async function contarGuardados(usuarioId: string): Promise<number> {
  return (await listarGuardados(usuarioId))?.length ?? 0;
}
