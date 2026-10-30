/**
 * Envio de 1 foto (ARQUITETURA F3.6): sessão → registrar_foto → subir miniatura e foto
 * (sem sobrescrever) → confirmar_foto. O id é gerado no navegador e é a chave de
 * idempotência: "tentar de novo" com o mesmo id não duplica a foto.
 * Roda só no navegador (cliente Supabase com a sessão do usuário).
 *
 * Tempo medido por etapa (diagnóstico, F3-B5): "sessão" (obter/renovar o token do
 * Supabase) fica separado de "registrar" (só a chamada da RPC), para achar a demora do
 * 1º envio no iPhone. `aquecerConexao()` obtém a sessão e abre a conexão com o Supabase
 * antes (ao abrir a OS e ao escolher a foto), enquanto a pessoa escolhe o tipo.
 */
import { EH_PRODUCAO } from "@/lib/brand";
import { traduzirErro } from "@/lib/erros";
import type { CategoriaFoto } from "@/lib/formato";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";
import type { DiagnosticoPreparo, EtapaTempo, FotoPreparada } from "./preparar";

import { BUCKET_FOTOS } from "./regras";

export type EtapaEnvio = "sessao" | "registrando" | "enviando_miniatura" | "enviando_foto" | "confirmando";

/**
 * Tipo do erro, para a fila decidir o que fazer:
 * - rede: sem conexão / caiu no meio (espera a internet e tenta de novo, sem gastar tentativa se offline)
 * - temporario: erro do servidor que pode passar (tenta de novo até 3 vezes)
 * - sessao: sem login válido ("Entre de novo"; a foto fica guardada)
 * - definitivo: tentar de novo não resolve (limite de 40, OS encerrada, sem permissão, foto inválida)
 */
export type TipoErroEnvio = "rede" | "temporario" | "sessao" | "definitivo";

export class ErroEnvio extends Error {
  etapa: EtapaEnvio;
  detalhe: string;
  tipo: TipoErroEnvio;
  constructor(etapa: EtapaEnvio, mensagem: string, detalhe: string, tipo: TipoErroEnvio = "temporario") {
    super(mensagem);
    this.name = "ErroEnvio";
    this.etapa = etapa;
    this.detalhe = detalhe;
    this.tipo = tipo;
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
  return (
    String(e?.statusCode) === "409" || e?.status === 409 || /already exists|duplicate/i.test(`${e?.message ?? ""} ${e?.error ?? ""}`)
  );
}

const MSG_REDE = "Sem conexão com o servidor. Confira a internet e toque em “Tentar de novo”.";
const MSG_SESSAO = "Entre de novo para enviar as fotos guardadas.";

/** Erros da API do Storage (ARQUITETURA F3.9) → pt-BR. */
export function traduzirErroStorage(e: ErroStorage): string {
  const t = textoErroStorage(e);
  if (/413|payload too large|maximum allowed size|too large/i.test(t)) return "Esta foto ficou grande demais para enviar. Tire de novo, um pouco mais de longe.";
  if (/mime type|invalid_mime|not supported/i.test(t)) return "Este arquivo não é uma foto. Escolha uma foto da galeria.";
  if (/jwt|token|invalid.*signature|401/i.test(t)) return MSG_SESSAO;
  if (/403|row-level security|unauthorized|not allowed/i.test(t)) return "Você não pode enviar foto nesta OS.";
  if (/failed to fetch|load failed|network|timeout|aborted/i.test(t)) return MSG_REDE;
  return "Não deu para enviar a foto. Toque em “Tentar de novo”.";
}

function tipoErroStorage(e: ErroStorage, httpStatus: number): TipoErroEnvio {
  const t = textoErroStorage(e);
  if (httpStatus === 0 || /failed to fetch|load failed|network|timeout|aborted/i.test(t)) return "rede";
  if (/jwt|token|invalid.*signature/i.test(t) || httpStatus === 401) return "sessao";
  if (/413|payload too large|too large|mime type|invalid_mime|not supported|row-level security|403/i.test(t)) return "definitivo";
  return "temporario";
}

/** Códigos das RPCs de foto que "tentar de novo" não resolve. */
const DEFINITIVOS_RPC = new Set([
  "limite_fotos",
  "os_fechada",
  "acesso_negado",
  "os_nao_encontrada",
  "foto_invalida",
  "foto_grande_demais",
  "sem_oficina",
]);

function erroRpc(etapa: EtapaEnvio, e: { message?: string; code?: string } | null): ErroEnvio {
  const msg = (e?.message ?? "").trim();
  if (/failed to fetch|load failed|network|fetch failed/i.test(msg)) return new ErroEnvio(etapa, MSG_REDE, msg, "rede");
  if (msg === "nao_autenticado" || /jwt|token/i.test(msg) || e?.code === "PGRST301" || e?.code === "28000")
    return new ErroEnvio(etapa, MSG_SESSAO, msg, "sessao");
  if (DEFINITIVOS_RPC.has(msg)) {
    const texto =
      msg === "limite_fotos"
        ? "Esta OS já tem 40 fotos. Apague alguma para enviar esta."
        : msg === "os_fechada" || msg === "acesso_negado" || msg === "os_nao_encontrada"
          ? "Não deu para enviar: esta OS foi encerrada ou passou para outra pessoa. Fale com o dono."
          : traduzirErro(e, "os");
    return new ErroEnvio(etapa, texto, msg, "definitivo");
  }
  return new ErroEnvio(etapa, traduzirErro(e, "os"), msg || "sem retorno", "temporario");
}

// ------------------------------------------------------------ sessão e aquecimento

export type MedidaSessao = {
  ms: number;
  /** Houve pedido ao /auth/v1 (renovação do token ou leitura do usuário) durante a espera. */
  chamouAuth: boolean;
  /** Segundos até o token vencer (depois de obter). */
  restanteS: number | null;
};

function pedidosAuthDesde(inicio: number): number {
  try {
    return performance
      .getEntriesByType("resource")
      .filter((e) => e.startTime >= inicio && /\/auth\/v1\/(token|user)/.test(e.name)).length;
  } catch {
    return 0;
  }
}

async function obterToken(etapa: EtapaEnvio = "sessao"): Promise<{ token: string; medida: MedidaSessao }> {
  const supabase = createClient();
  const t0 = performance.now();
  let r;
  try {
    r = await supabase.auth.getSession();
  } catch (e) {
    throw new ErroEnvio(etapa, MSG_REDE, String((e as Error)?.message ?? e), "rede");
  }
  const ms = Math.round(performance.now() - t0);
  const s = r.data.session;
  if (!s?.access_token) throw new ErroEnvio(etapa, MSG_SESSAO, r.error?.message ?? "sem sessão", "sessao");
  return {
    token: s.access_token,
    medida: { ms, chamouAuth: pedidosAuthDesde(t0) > 0, restanteS: s.expires_at ? Math.round(s.expires_at - Date.now() / 1000) : null },
  };
}

export type MedidaAquecimento = { sessao: MedidaSessao; primeiraMs: number; segundaMs: number };

let aquecidoEm = 0;

/**
 * Obtém (e renova, se precisar) a sessão e abre a conexão com o Supabase, para o 1º envio
 * não pagar DNS + TLS + token. Barato (um HEAD sem linhas); no máximo a cada 60 s.
 * `medir` faz 2 pedidos seguidos (frio × quente) para a página de diagnóstico.
 */
export async function aquecerConexao(opcoes: { medir?: boolean } = {}): Promise<MedidaAquecimento | null> {
  if (typeof window === "undefined") return null;
  if (!opcoes.medir && Date.now() - aquecidoEm < 60_000) return null;
  aquecidoEm = Date.now();
  try {
    const { medida } = await obterToken();
    const supabase = createClient();
    const pedir = async () => {
      const t = performance.now();
      await supabase.from("vw_os_fotos").select("id", { head: true }).limit(1);
      return Math.round(performance.now() - t);
    };
    const primeiraMs = await pedir();
    const segundaMs = opcoes.medir ? await pedir() : 0;
    return { sessao: medida, primeiraMs, segundaMs };
  } catch {
    aquecidoEm = 0;
    return null;
  }
}

// ------------------------------------------------------------ upload com progresso

function caminhoUrl(caminho: string) {
  return caminho.split("/").map(encodeURIComponent).join("/");
}

/**
 * Sobe um arquivo no bucket por XHR (o fetch não informa o progresso do envio).
 * Mesmo pedido que o `storage.upload` faz (POST, sem sobrescrever). Resolve com o status HTTP.
 */
function subirArquivo(
  caminho: string,
  arquivo: Blob,
  token: string,
  aoProgresso?: (fracao: number) => void,
): Promise<{ status: number; erro: ErroStorage }> {
  const { url, publishableKey } = getSupabaseEnv();
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${url}/storage/v1/object/${BUCKET_FOTOS}/${caminhoUrl(caminho)}`);
    xhr.setRequestHeader("authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", publishableKey);
    xhr.setRequestHeader("content-type", "image/jpeg");
    xhr.setRequestHeader("cache-control", "max-age=3600");
    xhr.setRequestHeader("x-upsert", "false");
    xhr.timeout = 120_000;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) aoProgresso?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve({ status: xhr.status, erro: null });
      let corpo: ErroStorage = null;
      try {
        corpo = JSON.parse(xhr.responseText);
      } catch {
        corpo = { message: xhr.responseText?.slice(0, 200) };
      }
      resolve({ status: xhr.status, erro: { ...corpo, status: xhr.status } });
    };
    xhr.onerror = () => resolve({ status: 0, erro: { message: "network error" } });
    xhr.ontimeout = () => resolve({ status: 0, erro: { message: "timeout" } });
    xhr.onabort = () => resolve({ status: 0, erro: { message: "aborted" } });
    xhr.send(arquivo);
  });
}

// ------------------------------------------------------------ envio

export type ResultadoEnvio = {
  id: string;
  caminho: string;
  caminhoMiniatura: string;
  etapas: EtapaTempo[];
  totalMs: number;
  /** Detalhe da sessão (só diagnóstico). */
  sessao?: MedidaSessao;
  /** Resource Timing do pedido do registrar (o Supabase não manda Timing-Allow-Origin: só a duração). */
  registrarRede?: { duracaoMs: number; conexaoMs: number | null };
};

function medirRegistrar(inicio: number): ResultadoEnvio["registrarRede"] {
  try {
    const e = performance
      .getEntriesByType("resource")
      .filter((x) => x.startTime >= inicio && x.name.includes("/rpc/registrar_foto"))
      .pop() as PerformanceResourceTiming | undefined;
    if (!e) return undefined;
    const conexao = e.connectEnd > 0 && e.connectStart > 0 ? Math.round(e.connectEnd - e.domainLookupStart) : null;
    return { duracaoMs: Math.round(e.duration), conexaoMs: conexao };
  } catch {
    return undefined;
  }
}

export async function enviarFoto({
  id,
  osId,
  preparada,
  categoria = "outro",
  legenda,
  aoMudarEtapa,
  aoProgresso,
}: {
  id: string;
  osId: string;
  preparada: Pick<FotoPreparada, "foto" | "mini" | "largura" | "altura">;
  categoria?: CategoriaFoto;
  legenda?: string | null;
  aoMudarEtapa?: (etapa: EtapaEnvio) => void;
  /** 0 a 100 do envio desta foto. */
  aoProgresso?: (pct: number) => void;
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

  // 0) sessão (pode renovar o token: 1 pedido a mais ao /auth/v1)
  aoMudarEtapa?.("sessao");
  const { token, medida } = await obterToken("sessao");
  marcar("sessão");
  aoProgresso?.(3);

  // 1) registrar (idempotente: mesmo id devolve o mesmo registro)
  aoMudarEtapa?.("registrando");
  const inicioRegistrar = performance.now();
  const reg = await supabase
    .rpc("registrar_foto", {
      p_id: id,
      p_os_id: osId,
      p_largura: preparada.largura,
      p_altura: preparada.altura,
      p_tamanho_bytes: preparada.foto.size,
      p_tamanho_miniatura_bytes: preparada.mini.size,
      p_categoria: categoria,
      ...(legenda ? { p_legenda: legenda } : {}),
    })
    .single()
    .then(
      (r) => r,
      (e) => {
        throw new ErroEnvio("registrando", MSG_REDE, String((e as Error)?.message ?? e), "rede");
      },
    );
  marcar("registrar");
  const registrarRede = medirRegistrar(inicioRegistrar);
  if (reg.error || !reg.data) throw erroRpc("registrando", reg.error);
  const { caminho, caminho_miniatura: caminhoMiniatura, enviada } = reg.data;
  aoProgresso?.(8);

  const totalBytes = preparada.mini.size + preparada.foto.size;
  const subir = async (etapa: EtapaEnvio, caminhoArquivo: string, arquivo: Blob, antes: number) => {
    aoMudarEtapa?.(etapa);
    const r = await subirArquivo(caminhoArquivo, arquivo, token, (f) =>
      aoProgresso?.(8 + ((antes + f * arquivo.size) / totalBytes) * 87),
    );
    if (r.erro && !jaExiste(r.erro)) {
      throw new ErroEnvio(etapa, traduzirErroStorage(r.erro), textoErroStorage(r.erro), tipoErroStorage(r.erro, r.status));
    }
  };

  if (!enviada) {
    // 2) subir: miniatura primeiro (pequena; a grade já tem o que mostrar)
    await subir("enviando_miniatura", caminhoMiniatura, preparada.mini, 0);
    marcar("subir miniatura");
    await subir("enviando_foto", caminho, preparada.foto, preparada.mini.size);
    marcar("subir foto");

    // 3) confirmar (foto_nao_enviada = falta arquivo: sobe de novo uma vez)
    aoMudarEtapa?.("confirmando");
    let conf = await supabase.rpc("confirmar_foto", { p_id: id });
    if (conf.error?.message === "foto_nao_enviada") {
      await subir("enviando_miniatura", caminhoMiniatura, preparada.mini, 0);
      await subir("enviando_foto", caminho, preparada.foto, preparada.mini.size);
      aoMudarEtapa?.("confirmando");
      conf = await supabase.rpc("confirmar_foto", { p_id: id });
    }
    marcar("confirmar");
    if (conf.error) throw erroRpc("confirmando", conf.error);
  }
  aoProgresso?.(100);

  return { id, caminho, caminhoMiniatura, etapas, totalMs: Math.round(performance.now() - t0), sessao: medida, registrarRede };
}

// ------------------------------------------------------------ diagnóstico (só fora da produção)

export const CHAVE_DIAGNOSTICO = "mf-diag-fotos";

export type RegistroDiagnostico = {
  quando: string;
  osId: string | null;
  fotoId: string | null;
  resultado: "enviada" | "erro" | "so_preparo" | "conexao";
  erro?: string;
  etapaErro?: string;
  preparo?: DiagnosticoPreparo;
  envio?: {
    etapas: EtapaTempo[];
    totalMs: number;
    caminho: string;
    caminhoMiniatura: string;
    sessao?: MedidaSessao;
    registrarRede?: ResultadoEnvio["registrarRede"];
    /** Quanto tempo antes do envio a conexão tinha sido aquecida (null = não aquecida). */
    aquecidaHaS?: number | null;
  };
  conexao?: MedidaAquecimento;
  navegador: string;
};

/** Segundos desde o último aquecimento (null = nunca nesta página). */
export function segundosDesdeAquecimento(): number | null {
  return aquecidoEm ? Math.round((Date.now() - aquecidoEm) / 1000) : null;
}

export function guardarDiagnostico(r: Omit<RegistroDiagnostico, "quando" | "navegador">) {
  if (EH_PRODUCAO || typeof localStorage === "undefined") return;
  try {
    const lista = lerDiagnosticos();
    lista.unshift({ ...r, quando: new Date().toISOString(), navegador: navigator.userAgent });
    localStorage.setItem(CHAVE_DIAGNOSTICO, JSON.stringify(lista.slice(0, 10)));
    window.dispatchEvent(new Event(CHAVE_DIAGNOSTICO));
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
