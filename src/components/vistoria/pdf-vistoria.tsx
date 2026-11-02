"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Download, Loader, Share2 } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { CaixaMensagem } from "@/components/ui/formulario";

/*
 * PDF da vistoria na tela de leitura (F4-B6, DESIGN §12.17).
 * - "Enviar ao cliente (PDF)": gera no servidor e abre o compartilhar do celular com o ARQUIVO
 *   (`navigator.share({ files })`, para escolher o WhatsApp). Sem suporte a arquivo: vira "Baixar PDF".
 * - O compartilhar precisa sair do toque: se o PDF demorou (ou o navegador recusou por isso),
 *   aparece "PDF pronto." + "Compartilhar PDF" (o segundo toque abre o compartilhar).
 * - "Baixar PDF": sempre disponível como reserva.
 * O arquivo gerado fica na memória por alguns minutos (tocar de novo não gera outro).
 */

const ROTA = (id: string) => `/api/vistorias/${id}/pdf`;
/** Depois disso o botão diz "Internet lenta, ainda gerando". */
const LENTO_MS = 3_000;
/** Toque "velho" demais para o Safari abrir o compartilhar direto: pede o segundo toque. */
const LIMITE_GESTO_MS = 4_000;
const DESISTIR_MS = 60_000;
const VALIDADE_ARQUIVO_MS = 5 * 60_000;

type Erro = "sem_internet" | "sessao" | "nao_encontrada" | "geral";

const TEXTO_ERRO: Record<Erro, string> = {
  sem_internet: "Sem internet. Conecte o celular e tente de novo.",
  sessao: "Sua sessão expirou. Entre de novo para baixar o PDF.",
  nao_encontrada: "Esta vistoria não está disponível para você.",
  geral: "Não foi possível gerar o PDF. Confira a internet e tente de novo.",
};

let suporteCache: boolean | null = null;
/** O navegador compartilha arquivo PDF? (iPhone e Android: sim; computador: quase nunca.) */
function suportaCompartilharPdf(): boolean {
  if (suporteCache === null) {
    try {
      suporteCache =
        typeof navigator !== "undefined" &&
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [new File(["%PDF-"], "teste.pdf", { type: "application/pdf" })] });
    } catch {
      suporteCache = false;
    }
  }
  return suporteCache;
}
const semAssinatura = () => () => {};

function baixarArquivo(arquivo: File) {
  const url = URL.createObjectURL(arquivo);
  const a = document.createElement("a");
  a.href = url;
  a.download = arquivo.name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function nomeDoCabecalho(cabecalho: string | null): string | null {
  const m = cabecalho?.match(/filename="([^"]+)"/);
  return m?.[1] ?? null;
}

export type EstadoPdf = {
  /** "enviar" / "baixar" enquanto gera. */
  gerando: "enviar" | "baixar" | null;
  lento: boolean;
  erro: Erro | null;
  /** PDF pronto esperando o segundo toque para compartilhar. */
  pronto: File | null;
  recado: string | null;
};

/**
 * Estado e ações do PDF. `chave` muda quando a vistoria ganha complemento (o PDF guardado
 * na memória deixa de valer). `nomeReserva` = nome do arquivo se o servidor não mandar.
 */
export function usePdfVistoria({ vistoriaId, chave, nomeReserva }: { vistoriaId: string; chave: string; nomeReserva: string }) {
  const podeCompartilhar = useSyncExternalStore(semAssinatura, suportaCompartilharPdf, () => true);
  const [estado, setEstado] = useState<EstadoPdf>({ gerando: null, lento: false, erro: null, pronto: null, recado: null });
  const guardado = useRef<{ chave: string; arquivo: File; em: number } | null>(null);
  const ultimaAcao = useRef<"enviar" | "baixar">("enviar");
  const vivo = useRef(true);
  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
    };
  }, []);

  const obter = useCallback(
    async (acao: "enviar" | "baixar"): Promise<File | null> => {
      const g = guardado.current;
      if (g && g.chave === `${vistoriaId}:${chave}` && Date.now() - g.em < VALIDADE_ARQUIVO_MS) return g.arquivo;
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        setEstado((s) => ({ ...s, erro: "sem_internet", gerando: null, lento: false, pronto: null, recado: null }));
        return null;
      }
      setEstado({ gerando: acao, lento: false, erro: null, pronto: null, recado: null });
      const lento = setTimeout(() => vivo.current && setEstado((s) => (s.gerando ? { ...s, lento: true } : s)), LENTO_MS);
      const parar = new AbortController();
      const desistir = setTimeout(() => parar.abort(), DESISTIR_MS);
      try {
        const r = await fetch(ROTA(vistoriaId), { cache: "no-store", credentials: "same-origin", signal: parar.signal });
        if (!r.ok) {
          const erro: Erro = r.status === 401 ? "sessao" : r.status === 403 || r.status === 404 ? "nao_encontrada" : "geral";
          if (vivo.current) setEstado((s) => ({ ...s, gerando: null, lento: false, erro }));
          return null;
        }
        const blob = await r.blob();
        if (blob.type && !blob.type.includes("pdf")) throw new Error("resposta não é PDF");
        const nome = nomeDoCabecalho(r.headers.get("Content-Disposition")) ?? nomeReserva;
        const arquivo = new File([blob], nome, { type: "application/pdf" });
        guardado.current = { chave: `${vistoriaId}:${chave}`, arquivo, em: Date.now() };
        if (vivo.current) setEstado((s) => ({ ...s, gerando: null, lento: false }));
        return arquivo;
      } catch {
        const offline = typeof navigator !== "undefined" && navigator.onLine === false;
        if (vivo.current) setEstado((s) => ({ ...s, gerando: null, lento: false, erro: offline ? "sem_internet" : "geral" }));
        return null;
      } finally {
        clearTimeout(lento);
        clearTimeout(desistir);
      }
    },
    [vistoriaId, chave, nomeReserva],
  );

  const compartilhar = useCallback(async (arquivo: File) => {
    try {
      await navigator.share({ files: [arquivo], title: arquivo.name.replace(/\.pdf$/, "") });
      if (vivo.current) setEstado((s) => ({ ...s, pronto: null, erro: null }));
    } catch (e) {
      const nome = e instanceof DOMException ? e.name : "";
      if (!vivo.current) return;
      if (nome === "AbortError") {
        // A pessoa fechou o compartilhar: nada a fazer.
        setEstado((s) => ({ ...s, pronto: null }));
      } else if (nome === "NotAllowedError") {
        // O toque "venceu" enquanto gerava: pede o segundo toque.
        setEstado((s) => ({ ...s, pronto: arquivo }));
      } else {
        // Navegador recusou o arquivo: baixa como reserva.
        baixarArquivo(arquivo);
        setEstado((s) => ({ ...s, pronto: null, recado: `PDF baixado: ${arquivo.name}` }));
      }
    }
  }, []);

  const baixar = useCallback(async () => {
    ultimaAcao.current = "baixar";
    const arquivo = await obter("baixar");
    if (!arquivo || !vivo.current) return;
    baixarArquivo(arquivo);
    setEstado((s) => ({ ...s, pronto: null, recado: `PDF baixado: ${arquivo.name}` }));
  }, [obter]);

  const enviar = useCallback(async () => {
    if (!suportaCompartilharPdf()) return baixar();
    ultimaAcao.current = "enviar";
    const inicio = Date.now();
    const arquivo = await obter("enviar");
    if (!arquivo || !vivo.current) return;
    if (Date.now() - inicio > LIMITE_GESTO_MS) {
      setEstado((s) => ({ ...s, pronto: arquivo }));
      return;
    }
    await compartilhar(arquivo);
  }, [baixar, obter, compartilhar]);

  const tentarDeNovo = useCallback(() => (ultimaAcao.current === "baixar" ? baixar() : enviar()), [baixar, enviar]);

  return { estado, podeCompartilhar, enviar, baixar, compartilhar, tentarDeNovo };
}

type Pdf = ReturnType<typeof usePdfVistoria>;

function Girando() {
  return <Loader size={24} strokeWidth={2.25} aria-hidden className="animate-spin motion-reduce:animate-none" />;
}

/** Primário da barra: "Enviar ao cliente (PDF)" (ou "Baixar PDF" sem compartilhar de arquivo). */
export function BotaoEnviarPdf({ pdf }: { pdf: Pdf }) {
  const { estado, podeCompartilhar } = pdf;
  const gerando = estado.gerando !== null;
  const meu = estado.gerando === (podeCompartilhar ? "enviar" : "baixar");
  return (
    <Botao onClick={() => void pdf.enviar()} disabled={gerando} aria-busy={meu || undefined} data-teste="enviar-pdf">
      {meu ? <Girando /> : podeCompartilhar ? <Share2 size={24} strokeWidth={2.25} aria-hidden /> : <Download size={24} strokeWidth={2.25} aria-hidden />}
      {meu ? (estado.lento ? "Internet lenta, ainda gerando" : "Gerando PDF…") : podeCompartilhar ? "Enviar ao cliente (PDF)" : "Baixar PDF"}
    </Botao>
  );
}

/** Secundário da página: "Baixar PDF", sempre disponível. */
export function BotaoBaixarPdf({ pdf }: { pdf: Pdf }) {
  const { estado } = pdf;
  const meu = estado.gerando === "baixar";
  return (
    <Botao variante="secundario" onClick={() => void pdf.baixar()} disabled={estado.gerando !== null} aria-busy={meu || undefined} data-teste="baixar-pdf">
      {meu ? <Girando /> : <Download size={24} strokeWidth={2.25} aria-hidden />}
      {meu ? (estado.lento ? "Internet lenta, ainda gerando" : "Gerando PDF…") : "Baixar PDF"}
    </Botao>
  );
}

/** Recados do PDF: erro com "Tentar de novo", "PDF pronto." com "Compartilhar PDF", "PDF baixado". */
export function MensagensPdf({ pdf }: { pdf: Pdf }) {
  const { estado } = pdf;
  if (estado.erro) {
    return (
      <div className="flex flex-col gap-2" data-teste="erro-pdf">
        <CaixaMensagem tipo="erro">{TEXTO_ERRO[estado.erro]}</CaixaMensagem>
        {estado.erro !== "nao_encontrada" && estado.erro !== "sessao" && (
          <Botao variante="secundario" onClick={() => void pdf.tentarDeNovo()}>
            Tentar de novo
          </Botao>
        )}
      </div>
    );
  }
  if (estado.pronto) {
    const arquivo = estado.pronto;
    return (
      <div className="flex flex-col gap-2" data-teste="pdf-pronto">
        <CaixaMensagem tipo="sucesso">PDF pronto.</CaixaMensagem>
        <Botao onClick={() => void pdf.compartilhar(arquivo)}>
          <Share2 size={24} strokeWidth={2.25} aria-hidden />
          Compartilhar PDF
        </Botao>
      </div>
    );
  }
  if (estado.recado) return <CaixaMensagem tipo="sucesso">{estado.recado}</CaixaMensagem>;
  return null;
}
