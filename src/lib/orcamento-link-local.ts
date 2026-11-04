/**
 * O link recém-gerado no aparelho do balcão (DESIGN §13.9). Só em memória e `sessionStorage`,
 * por até 15 minutos, para sobreviver à ida e volta do WhatsApp; nunca no `localStorage` nem na
 * URL. A chave de idempotência fica junto: repetir "Gerar link" manda a mesma (ARQUITETURA 13.7).
 */
export type AcaoLink = "enviar" | "reenviar";

export type LinkLocal = {
  chave: string;
  criadoEm: number;
  /** Qual RPC gerou (ou está tentando gerar): repetir precisa ir para a mesma. */
  acao: AcaoLink;
  link?: string;
  expiraEm?: string;
  versao?: number;
  abriu?: boolean;
};

const PREFIXO = "mf-link:";
const VALIDADE_MS = 15 * 60 * 1000;

const memoria = new Map<string, string>();
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((ouvinte) => ouvinte());

export function assinarLinkLocal(ouvinte: () => void) {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}

function apagarChave(chave: string) {
  memoria.delete(chave);
  try {
    sessionStorage.removeItem(chave);
  } catch {
    // Sem sessionStorage: a memória já foi limpa.
  }
}

export function interpretarLinkLocal(bruto: string | null): LinkLocal | null {
  if (!bruto) return null;
  try {
    const dado = JSON.parse(bruto) as LinkLocal;
    return typeof dado.chave === "string" && typeof dado.criadoEm === "number" && (dado.acao === "enviar" || dado.acao === "reenviar") ? dado : null;
  } catch {
    return null;
  }
}

/** Texto cru guardado: valor estável, serve de retrato para `useSyncExternalStore`. */
export function lerLinkLocalBruto(osId: string): string | null {
  const chave = `${PREFIXO}${osId}`;
  let bruto = memoria.get(chave) ?? null;
  if (bruto === null) {
    try {
      bruto = sessionStorage.getItem(chave);
    } catch {
      return null;
    }
  }
  if (bruto === null) return null;
  const linkLocal = interpretarLinkLocal(bruto);
  if (!linkLocal || Date.now() - linkLocal.criadoEm > VALIDADE_MS) {
    apagarChave(chave);
    return null;
  }
  return bruto;
}

export function gravarLinkLocal(osId: string, dado: LinkLocal) {
  const chave = `${PREFIXO}${osId}`;
  const bruto = JSON.stringify(dado);
  memoria.set(chave, bruto);
  try {
    sessionStorage.setItem(chave, bruto);
  } catch {
    // Sem sessionStorage: vale só a memória.
  }
  avisar();
}

export function apagarLinkLocal(osId: string) {
  apagarChave(`${PREFIXO}${osId}`);
  avisar();
}

/** Ao sair da conta (DESIGN §13.9). */
export function apagarLinksLocais() {
  memoria.clear();
  try {
    for (const chave of Object.keys(sessionStorage)) if (chave.startsWith(PREFIXO)) sessionStorage.removeItem(chave);
  } catch {
    // Sem sessionStorage: a memória já foi limpa.
  }
  avisar();
}

/** Chave nova para o próximo "Gerar link". */
export function novoLinkLocal(acao: AcaoLink): LinkLocal {
  return { chave: crypto.randomUUID(), criadoEm: Date.now(), acao };
}
