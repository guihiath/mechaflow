"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Botao } from "@/components/ui/botao";
import { Cartao } from "@/components/ui/estados";
import { CaixaMensagem } from "@/components/ui/formulario";
import { CampoAssinatura, type ResultadoAssinatura } from "@/components/vistoria/campo-assinatura";
import { PreviaAssinatura } from "@/components/vistoria/previa-assinatura";
import type { DadosAssinatura } from "@/lib/assinatura";
import { formatarBytes, formatarDiaHora, LIMITE_BYTES_ASSINATURA } from "@/lib/formato";
import { BUCKET_VISTORIAS } from "@/lib/fotos/regras";
import { createClient } from "@/lib/supabase/client";
import { CHAVE_DIAG_VISTORIA, contarTracos, guardarDiagVistoria, sha256, type RegistroDiagVistoria } from "@/lib/vistoria/envio";

function assinar(aviso: () => void) {
  window.addEventListener("storage", aviso);
  window.addEventListener(CHAVE_DIAG_VISTORIA, aviso);
  return () => {
    window.removeEventListener("storage", aviso);
    window.removeEventListener(CHAVE_DIAG_VISTORIA, aviso);
  };
}
const lerTexto = () => {
  try {
    return localStorage.getItem(CHAVE_DIAG_VISTORIA) ?? "[]";
  } catch {
    return "[]";
  }
};
const nada = () => null;
const semAssinatura = () => () => {};

function lerAparelho() {
  const nav = navigator as Navigator & { standalone?: boolean };
  return JSON.stringify({
    userAgent: nav.userAgent,
    instalado: Boolean(nav.standalone) || window.matchMedia("(display-mode: standalone)").matches,
    tela: `${screen.width}×${screen.height} @${window.devicePixelRatio}x`,
    janela: `${window.innerWidth}×${window.innerHeight}`,
    pointer: typeof PointerEvent !== "undefined",
    coalesced: typeof PointerEvent !== "undefined" && "getCoalescedEvents" in PointerEvent.prototype,
    subtle: Boolean(crypto?.subtle),
  });
}
let cache: string | null = null;
const lerAparelhoCache = () => (cache ??= lerAparelho());

function Linha({ r, v, mono }: { r: string; v: string | number | null | undefined; mono?: boolean }) {
  return (
    <div className="flex flex-col">
      <dt className="text-sm font-bold text-texto-suave">{r}</dt>
      <dd className={`${mono ? "font-mono text-sm break-all" : "text-base"}`}>{v ?? "—"}</dd>
    </div>
  );
}

type Conferencia = { ok: boolean; bytes: number; sha: string | null; url: string | null; erro?: string };

/** Página de diagnóstico da assinatura (só no ambiente de teste). */
export function DiagnosticoVistoria() {
  const aparelhoTxt = useSyncExternalStore(semAssinatura, lerAparelhoCache, nada);
  const aparelho = useMemo(() => (aparelhoTxt ? JSON.parse(aparelhoTxt) : null), [aparelhoTxt]);
  const txt = useSyncExternalStore(assinar, lerTexto, nada);
  const registros = useMemo<RegistroDiagVistoria[]>(() => {
    try {
      const v = JSON.parse(txt ?? "[]");
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }, [txt]);

  const [aberta, setAberta] = useState(false);
  const [tracos, setTracos] = useState<DadosAssinatura | null>(null);
  const [teste, setTeste] = useState<{ url: string; r: ResultadoAssinatura } | null>(null);
  const [conferidos, setConferidos] = useState<Record<string, Conferencia>>({});
  const [conferindo, setConferindo] = useState<string | null>(null);

  useEffect(() => {
    const u = teste?.url;
    return () => {
      if (u) URL.revokeObjectURL(u);
    };
  }, [teste?.url]);

  /** Baixa o PNG do Storage por URL assinada e compara tamanho e SHA-256 com o que saiu daqui. */
  async function conferir(reg: RegistroDiagVistoria) {
    if (!reg.caminho) return;
    setConferindo(reg.quando);
    const supabase = createClient();
    const { data, error } = await supabase.storage.from(BUCKET_VISTORIAS).createSignedUrl(reg.caminho, 900);
    let c: Conferencia;
    if (error || !data?.signedUrl) c = { ok: false, bytes: 0, sha: null, url: null, erro: error?.message ?? "sem URL" };
    else {
      try {
        const blob = await fetch(data.signedUrl).then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.blob();
        });
        const sha = await sha256(blob);
        c = { ok: blob.size === reg.bytes && (!reg.sha256 || sha === reg.sha256), bytes: blob.size, sha, url: data.signedUrl };
      } catch (e) {
        c = { ok: false, bytes: 0, sha: null, url: data.signedUrl, erro: String((e as Error)?.message ?? e) };
      }
    }
    setConferidos((x) => ({ ...x, [reg.quando]: c }));
    setConferindo(null);
  }

  const contagemTeste = teste ? contarTracos(teste.r.dados) : null;

  return (
    <div className="flex flex-col gap-6" data-teste="diagnostico-vistoria">
      <CaixaMensagem tipo="info">Esta página só existe no ambiente de teste. Tire um print e mande para o time.</CaixaMensagem>

      <section className="flex flex-col gap-3" aria-labelledby="t-aparelho">
        <h2 id="t-aparelho" className="text-2xl">
          Este aparelho
        </h2>
        <Cartao>
          <dl className="flex flex-col gap-2">
            <Linha r="Navegador" v={aparelho?.userAgent} mono />
            <Linha r="Instalado na tela de início" v={aparelho ? (aparelho.instalado ? "sim" : "não") : null} />
            <Linha r="Tela" v={aparelho?.tela} />
            <Linha r="Janela" v={aparelho?.janela} />
            <Linha r="Pointer events / getCoalescedEvents" v={aparelho ? `${aparelho.pointer ? "sim" : "não"} / ${aparelho.coalesced ? "sim" : "não"}` : null} />
            <Linha r="Confere arquivo (SHA-256)" v={aparelho ? (aparelho.subtle ? "sim" : "não") : null} />
          </dl>
        </Cartao>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="t-envios">
        <h2 id="t-envios" className="text-2xl">
          Assinaturas enviadas pela vistoria
        </h2>
        {registros.length === 0 && (
          <p className="text-base text-texto-suave">Nenhuma ainda. Faça uma vistoria pela OS e assine; depois volte aqui.</p>
        )}
        {registros.map((r) => {
          const c = conferidos[r.quando];
          return (
            <Cartao key={r.quando}>
              <dl className="flex flex-col gap-2" data-teste="registro-assinatura">
                <Linha r="Quando" v={`${formatarDiaHora(r.quando)} · ${r.resultado === "enviada" ? "enviada" : r.resultado}`} />
                {r.erro && <Linha r="Erro" v={r.erro} />}
                <Linha r="Tamanho da assinatura" v={`${formatarBytes(r.bytes)} (${r.bytes} bytes; limite ${formatarBytes(LIMITE_BYTES_ASSINATURA)})`} />
                <Linha r="Imagem (PNG)" v={`${r.largura}×${r.altura} px`} />
                <Linha r="Área de assinar" v={`${r.papel} px · tela ${r.tela}${r.instalado ? " · instalado" : ""}`} />
                <Linha r="Traços / pontos" v={`${r.tracos} traços · ${r.pontos} pontos (${r.pontosPorTraco.join(", ")})`} />
                {r.etapas && (
                  <Linha r="Tempo de envio" v={`${r.totalMs} ms (${r.etapas.map((e) => `${e.etapa} ${e.ms}`).join(" · ")})`} />
                )}
                <Linha r="Navegador" v={r.navegador} mono />
                {r.sha256 && <Linha r="SHA-256 enviado" v={r.sha256.slice(0, 16)} mono />}
              </dl>
              {r.caminho && (
                <div className="mt-3 flex flex-col gap-2">
                  <Botao variante="secundario" className="h-toque!" onClick={() => void conferir(r)} disabled={conferindo !== null}>
                    {conferindo === r.quando ? "Conferindo…" : "Conferir no servidor"}
                  </Botao>
                  {c && (
                    <>
                      <p role="status" className={`text-base font-bold ${c.ok ? "text-sucesso-texto" : "text-erro-texto"}`} data-teste="chegou-inteiro">
                        {c.ok
                          ? `Chegou inteiro: ${c.bytes} bytes, mesmo SHA-256.`
                          : `Não confere: ${c.erro ?? `${c.bytes} bytes no servidor (enviados ${r.bytes})`}`}
                      </p>
                      {c.url && (
                        <div className="flex h-32 items-center justify-center rounded-md border border-borda-sutil bg-white p-2">
                          {/* eslint-disable-next-line @next/next/no-img-element -- URL assinada */}
                          <img src={c.url} alt="Assinatura baixada do servidor" className="max-h-full max-w-full object-contain" />
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </Cartao>
          );
        })}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="t-teste">
        <h2 id="t-teste" className="text-2xl">
          Testar a assinatura (não envia)
        </h2>
        <PreviaAssinatura src={teste?.url} aoAssinar={() => setAberta(true)} />
        {teste && contagemTeste && (
          <Cartao>
            <dl className="flex flex-col gap-2">
              <Linha r="Tamanho" v={`${formatarBytes(teste.r.tamanhoBytes)} (${teste.r.tamanhoBytes} bytes)`} />
              <Linha r="Imagem (PNG)" v={`${teste.r.largura}×${teste.r.altura} px`} />
              <Linha r="Área de assinar" v={`${contagemTeste.papel} px`} />
              <Linha r="Traços / pontos" v={`${contagemTeste.tracos} traços · ${contagemTeste.pontos} pontos`} />
            </dl>
          </Cartao>
        )}
      </section>

      <CampoAssinatura
        aberta={aberta}
        aoFechar={() => setAberta(false)}
        valor={tracos}
        aoMudar={setTracos}
        aoUsar={(r) => {
          setTracos(r.dados);
          setTeste({ url: URL.createObjectURL(r.blob), r });
          setAberta(false);
          void guardarDiagVistoria({ resultado: "so_teste", vistoriaId: null, largura: r.largura, altura: r.altura, png: r.blob, dados: r.dados });
        }}
      />
    </div>
  );
}
