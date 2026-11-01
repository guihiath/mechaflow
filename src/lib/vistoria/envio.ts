/**
 * Assinatura e conclusão da vistoria, no navegador (F4-B2; ARQUITETURA 12.3 e 12.4):
 *   registrar_assinatura_vistoria (id do navegador) → subir o PNG no bucket `vistorias`
 *   (sem sobrescrever; 409 = já subiu) → concluir_vistoria (assinatura_nao_enviada = sobe de novo).
 * Assinar de novo = id novo (o banco gera caminho novo; nada é sobrescrito).
 *
 * Diagnóstico (só fora da produção): cada envio da assinatura fica no `localStorage`
 * (`mf-diag-vistoria`) com tamanho, traços/pontos, tempo por etapa e o SHA-256 do PNG,
 * para a página /diagnostico/vistoria conferir se o arquivo chegou inteiro no Storage.
 */
import { EH_PRODUCAO } from "@/lib/brand";
import { traduzirErro } from "@/lib/erros";
import {
  ErroEnvio,
  jaExiste,
  obterToken,
  subirArquivo,
  textoErroStorage,
  tipoErroStorage,
  traduzirErroStorage,
} from "@/lib/fotos/enviar";
import type { EtapaTempo } from "@/lib/fotos/preparar";
import { BUCKET_VISTORIAS } from "@/lib/fotos/regras";
import type { DadosAssinatura } from "@/lib/assinatura";
import type { MotivoSemAssinatura } from "@/lib/formato";
import { createClient } from "@/lib/supabase/client";

export type AssinaturaParaEnviar = {
  vistoriaId: string;
  assinaturaId: string;
  nome: string;
  png: Blob;
  largura: number;
  altura: number;
  dados?: DadosAssinatura | null;
};

export type ResultadoAssinatura = { caminho: string; etapas: EtapaTempo[]; totalMs: number };

const MSG_REDE = "Sem conexão com o servidor. Confira a internet e toque em “Tentar de novo”.";

function rede(etapa: "registrando" | "confirmando", e: unknown): never {
  throw new ErroEnvio(etapa, MSG_REDE, String((e as Error)?.message ?? e), "rede");
}

/** Registra (ou re-registra com o nome atual: mesmo id = mesmo caminho) e sobe o PNG. */
export async function enviarAssinatura(a: AssinaturaParaEnviar): Promise<ResultadoAssinatura> {
  const supabase = createClient();
  const etapas: EtapaTempo[] = [];
  const t0 = performance.now();
  let t = t0;
  const marcar = (etapa: string) => {
    const agora = performance.now();
    etapas.push({ etapa, ms: Math.round(agora - t) });
    t = agora;
  };
  const { token } = await obterToken("sessao");
  marcar("sessão");

  const reg = await supabase
    .rpc("registrar_assinatura_vistoria", {
      p_vistoria_id: a.vistoriaId,
      p_assinatura_id: a.assinaturaId,
      p_nome: a.nome.trim(),
      p_largura: a.largura,
      p_altura: a.altura,
      p_tamanho_bytes: a.png.size,
    })
    .then((r) => r, (e) => rede("registrando", e));
  marcar("registrar");
  if (reg.error || !reg.data) {
    const msg = reg.error?.message ?? "";
    const tipo = /failed to fetch|load failed|network/i.test(msg) ? "rede" : "definitivo";
    throw new ErroEnvio("registrando", traduzirErro(reg.error, "os"), msg || "sem retorno", tipo);
  }
  const caminho = reg.data;

  const r = await subirArquivo(caminho, a.png, token, undefined, { bucket: BUCKET_VISTORIAS, tipo: "image/png" });
  marcar("subir PNG");
  if (r.erro && !jaExiste(r.erro)) {
    throw new ErroEnvio("enviando_foto", traduzirErroStorage(r.erro).replace("a foto", "a assinatura"), textoErroStorage(r.erro), tipoErroStorage(r.erro, r.status));
  }
  return { caminho, etapas, totalMs: Math.round(performance.now() - t0) };
}

/** concluir_vistoria. Devolve o hash ou o código de erro do banco (para a lista do que falta). */
export async function concluirVistoria(
  vistoriaId: string,
  semAssinaturaMotivo: MotivoSemAssinatura | null = null,
): Promise<{ hash: string } | { codigo: string; mensagem: string }> {
  const supabase = createClient();
  const r = await supabase.rpc("concluir_vistoria", { p_vistoria_id: vistoriaId, ...(semAssinaturaMotivo ? { p_sem_assinatura_motivo: semAssinaturaMotivo } : {}) }).then(
    (x) => x,
    (e) => ({ data: null, error: { message: String((e as Error)?.message ?? e), code: "" } }),
  );
  if (r.error || !r.data) {
    const codigo = (r.error?.message ?? "").trim();
    const rede = /failed to fetch|load failed|network/i.test(codigo);
    return { codigo, mensagem: rede ? MSG_REDE : traduzirErro(r.error, "os") };
  }
  return { hash: r.data };
}

// ------------------------------------------------------------ diagnóstico (só fora da produção)

export const CHAVE_DIAG_VISTORIA = "mf-diag-vistoria";

export type RegistroDiagVistoria = {
  quando: string;
  navegador: string;
  instalado: boolean;
  tela: string;
  resultado: "enviada" | "erro" | "so_teste";
  erro?: string;
  vistoriaId: string | null;
  caminho?: string;
  bytes: number;
  largura: number;
  altura: number;
  /** Papel (área de assinar) em px CSS. */
  papel: string;
  tracos: number;
  pontos: number;
  /** Pontos por traço (para ver se algum traço chegou cortado). */
  pontosPorTraco: number[];
  sha256: string | null;
  etapas?: EtapaTempo[];
  totalMs?: number;
};

export async function sha256(blob: Blob): Promise<string | null> {
  try {
    if (!crypto?.subtle) return null;
    const h = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
    return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

export function contarTracos(d: DadosAssinatura | null | undefined) {
  const tracos = (d?.tracos ?? []).filter((t) => t.length > 0);
  return {
    tracos: tracos.length,
    pontos: tracos.reduce((n, t) => n + t.length, 0),
    pontosPorTraco: tracos.map((t) => t.length),
    papel: d ? `${Math.round(d.largura)}×${Math.round(d.altura)}` : "—",
  };
}

export async function guardarDiagVistoria(
  r: Omit<RegistroDiagVistoria, "quando" | "navegador" | "instalado" | "tela" | "sha256" | "tracos" | "pontos" | "pontosPorTraco" | "papel" | "bytes"> & {
    png: Blob;
    dados?: DadosAssinatura | null;
  },
) {
  if (EH_PRODUCAO || typeof localStorage === "undefined") return;
  const { png, dados, ...resto } = r;
  const nav = navigator as Navigator & { standalone?: boolean };
  const reg: RegistroDiagVistoria = {
    ...resto,
    ...contarTracos(dados),
    bytes: png.size,
    sha256: await sha256(png),
    quando: new Date().toISOString(),
    navegador: nav.userAgent,
    instalado: Boolean(nav.standalone) || window.matchMedia("(display-mode: standalone)").matches,
    tela: `${screen.width}×${screen.height} @${window.devicePixelRatio}x`,
  };
  try {
    const lista = lerDiagVistoria();
    lista.unshift(reg);
    localStorage.setItem(CHAVE_DIAG_VISTORIA, JSON.stringify(lista.slice(0, 10)));
    window.dispatchEvent(new Event(CHAVE_DIAG_VISTORIA));
  } catch {
    // localStorage cheio ou bloqueado: o diagnóstico é só ajuda.
  }
}

export function lerDiagVistoria(): RegistroDiagVistoria[] {
  try {
    const t = localStorage.getItem(CHAVE_DIAG_VISTORIA);
    const v = t ? JSON.parse(t) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
