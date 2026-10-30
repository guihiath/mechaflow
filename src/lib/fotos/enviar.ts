/**
 * Envio de 1 foto (ARQUITETURA F3.6): registrar_foto → subir miniatura e foto
 * (upsert: false) → confirmar_foto. O id é gerado no navegador e é a chave de
 * idempotência: "tentar de novo" com o mesmo id não duplica a foto.
 * Roda só no navegador (cliente Supabase com a sessão do usuário).
 */
import { EH_PRODUCAO } from "@/lib/brand";
import { traduzirErro } from "@/lib/erros";
import type { CategoriaFoto } from "@/lib/formato";
import { createClient } from "@/lib/supabase/client";
import type { DiagnosticoPreparo, EtapaTempo, FotoPreparada } from "./preparar";

import { BUCKET_FOTOS } from "./regras";

export type EtapaEnvio = "registrando" | "enviando_miniatura" | "enviando_foto" | "confirmando";

export class ErroEnvio extends Error {
  etapa: EtapaEnvio;
  detalhe: string;
  constructor(etapa: EtapaEnvio, mensagem: string, detalhe: string) {
    super(mensagem);
    this.name = "ErroEnvio";
    this.etapa = etapa;
    this.detalhe = detalhe;
  }
}

/** uuid v4; `crypto.randomUUID` só existe em https/localhost. */
export function novoIdFoto(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

type ErroStorage = { message?: string; statusCode?: string | number; status?: number; error?: string } | null;

function textoErroStorage(e: ErroStorage): string {
  if (!e) return "";
  return [e.status, e.statusCode, e.error, e.message].filter((x) => x != null && x !== "").join(" ");
}

/** "Já existe" no Storage = o arquivo já tinha subido num envio anterior: segue. */
function jaExiste(e: ErroStorage): boolean {
  return String(e?.statusCode) === "409" || e?.status === 409 || /already exists|duplicate/i.test(e?.message ?? "");
}

/** Erros da API do Storage (ARQUITETURA F3.9) → pt-BR. */
export function traduzirErroStorage(e: ErroStorage): string {
  const t = textoErroStorage(e);
  if (/413|payload too large|maximum allowed size|too large/i.test(t)) return "A foto ficou grande demais (máximo 5 MB). Tire de novo.";
  if (/mime type|invalid_mime|not supported/i.test(t)) return "Formato de foto não aceito. Tire a foto de novo.";
  if (/403|row-level security|unauthorized|not allowed/i.test(t)) return "Você não pode enviar foto nesta OS.";
  if (/failed to fetch|load failed|network|timeout|aborted/i.test(t)) return "Sem conexão com o servidor. Confira a internet e toque em “Tentar de novo”.";
  return "Não deu para enviar a foto. Toque em “Tentar de novo”.";
}

export type ResultadoEnvio = {
  id: string;
  caminho: string;
  caminhoMiniatura: string;
  etapas: EtapaTempo[];
  totalMs: number;
};

export async function enviarFoto({
  id,
  osId,
  preparada,
  categoria = "outro",
  aoMudarEtapa,
}: {
  id: string;
  osId: string;
  preparada: FotoPreparada;
  categoria?: CategoriaFoto;
  aoMudarEtapa?: (etapa: EtapaEnvio) => void;
}): Promise<ResultadoEnvio> {
  const supabase = createClient();
  const etapas: EtapaTempo[] = [];
  const t0 = performance.now();
  let t = t0;
  const marcar = (etapa: string) => {
    const agora = performance.now();
    etapas.push({ etapa, ms: Math.round(agora - t) });
    t = agora;
  };
  const erroRede = (etapa: EtapaEnvio, e: unknown): never => {
    const msg = String((e as Error)?.message ?? e);
    throw new ErroEnvio(etapa, traduzirErroStorage({ message: msg }), msg);
  };

  // 1) registrar (idempotente: mesmo id devolve o mesmo registro)
  aoMudarEtapa?.("registrando");
  const reg = await supabase
    .rpc("registrar_foto", {
      p_id: id,
      p_os_id: osId,
      p_largura: preparada.largura,
      p_altura: preparada.altura,
      p_tamanho_bytes: preparada.foto.size,
      p_tamanho_miniatura_bytes: preparada.mini.size,
      p_categoria: categoria,
    })
    .single()
    .then(
      (r) => r,
      (e) => erroRede("registrando", e),
    );
  marcar("registrar");
  if (reg.error || !reg.data) {
    throw new ErroEnvio("registrando", traduzirErro(reg.error, "os"), reg.error?.message ?? "sem retorno");
  }
  const { caminho, caminho_miniatura: caminhoMiniatura, enviada } = reg.data;

  const subir = async (etapa: EtapaEnvio, caminhoArquivo: string, arquivo: Blob) => {
    aoMudarEtapa?.(etapa);
    const r = await supabase.storage
      .from(BUCKET_FOTOS)
      .upload(caminhoArquivo, arquivo, { contentType: "image/jpeg", upsert: false, cacheControl: "3600" })
      .then(
        (x) => x,
        (e) => erroRede(etapa, e),
      );
    if (r.error && !jaExiste(r.error as ErroStorage)) {
      throw new ErroEnvio(etapa, traduzirErroStorage(r.error as ErroStorage), textoErroStorage(r.error as ErroStorage));
    }
  };

  if (!enviada) {
    // 2) subir: miniatura primeiro (pequena; a grade já tem o que mostrar)
    await subir("enviando_miniatura", caminhoMiniatura, preparada.mini);
    marcar("subir miniatura");
    await subir("enviando_foto", caminho, preparada.foto);
    marcar("subir foto");

    // 3) confirmar (foto_nao_enviada = falta arquivo: sobe de novo uma vez)
    aoMudarEtapa?.("confirmando");
    let conf = await supabase.rpc("confirmar_foto", { p_id: id });
    if (conf.error?.message === "foto_nao_enviada") {
      await subir("enviando_miniatura", caminhoMiniatura, preparada.mini);
      await subir("enviando_foto", caminho, preparada.foto);
      aoMudarEtapa?.("confirmando");
      conf = await supabase.rpc("confirmar_foto", { p_id: id });
    }
    marcar("confirmar");
    if (conf.error) throw new ErroEnvio("confirmando", traduzirErro(conf.error, "os"), conf.error.message);
  }

  return { id, caminho, caminhoMiniatura, etapas, totalMs: Math.round(performance.now() - t0) };
}

// ------------------------------------------------------------ diagnóstico (só fora da produção)

export const CHAVE_DIAGNOSTICO = "mf-diag-fotos";

export type RegistroDiagnostico = {
  quando: string;
  osId: string | null;
  fotoId: string | null;
  resultado: "enviada" | "erro" | "so_preparo";
  erro?: string;
  etapaErro?: string;
  preparo?: DiagnosticoPreparo;
  envio?: { etapas: EtapaTempo[]; totalMs: number; caminho: string; caminhoMiniatura: string };
  navegador: string;
};

export function guardarDiagnostico(r: Omit<RegistroDiagnostico, "quando" | "navegador">) {
  if (EH_PRODUCAO || typeof localStorage === "undefined") return;
  try {
    const lista = lerDiagnosticos();
    lista.unshift({ ...r, quando: new Date().toISOString(), navegador: navigator.userAgent });
    localStorage.setItem(CHAVE_DIAGNOSTICO, JSON.stringify(lista.slice(0, 10)));
  } catch {
    // localStorage cheio ou bloqueado (Safari privado): o diagnóstico é só ajuda.
  }
}

export function lerDiagnosticos(): RegistroDiagnostico[] {
  try {
    const t = localStorage.getItem(CHAVE_DIAGNOSTICO);
    const v = t ? JSON.parse(t) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
