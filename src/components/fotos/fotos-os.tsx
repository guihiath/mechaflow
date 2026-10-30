"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { Camera, ImageOff, Images, RotateCcw } from "lucide-react";
import { Botao, classesBotao } from "@/components/ui/botao";
import { CaixaMensagem } from "@/components/ui/formulario";
import { EH_PRODUCAO } from "@/lib/brand";
import { formatarDiaHora, ROTULO_CATEGORIA_FOTO, type CategoriaFoto } from "@/lib/formato";
import { enviarFoto, ErroEnvio, guardarDiagnostico, novoIdFoto, type EtapaEnvio } from "@/lib/fotos/enviar";
import { ErroFoto, prepararFoto, type FotoPreparada } from "@/lib/fotos/preparar";
import { LIMITE_FOTOS_OS } from "@/lib/fotos/regras";

export type FotoDaGrade = {
  id: string;
  categoria: CategoriaFoto;
  legenda: string | null;
  /** URL assinada da miniatura (15 min); null = não deu para assinar. */
  url: string | null;
  criadoPorNome: string | null;
  enviadaEm: string | null;
};

type Fase = "preparando" | EtapaEnvio | "erro";

type Envio = {
  id: string;
  fase: Fase;
  mensagem?: string;
  preparada?: FotoPreparada;
  previa?: string;
};

type Recente = { id: string; previa: string };

const PROGRESSO: Record<Exclude<Fase, "erro">, number> = {
  preparando: 10,
  registrando: 25,
  enviando_miniatura: 40,
  enviando_foto: 60,
  confirmando: 90,
};

const TEXTO_FASE: Record<Exclude<Fase, "erro">, string> = {
  preparando: "Preparando a foto…",
  registrando: "Registrando…",
  enviando_miniatura: "Enviando…",
  enviando_foto: "Enviando…",
  confirmando: "Conferindo…",
};

/**
 * Seção "Fotos" do detalhe da OS — versão mínima da Fase 3 (F3-B2):
 * 1 foto por vez, tipo "Outro", sem fila guardada no aparelho e sem apagar.
 * Fluxo: prepara no celular → registrar_foto → sobe miniatura e foto → confirmar_foto.
 */
export function FotosOS({
  osId,
  podeEnviar,
  fotos,
  erroLista,
  ehMecanico,
}: {
  osId: string;
  podeEnviar: boolean;
  fotos: FotoDaGrade[];
  erroLista?: boolean;
  ehMecanico?: boolean;
}) {
  const router = useRouter();
  const idCamera = useId();
  const idGaleria = useId();
  const [envio, setEnvio] = useState<Envio | null>(null);
  const [recentes, setRecentes] = useState<Recente[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const urls = useRef<string[]>([]);

  const ocupado = Boolean(envio && envio.fase !== "erro");
  const idsServidor = new Set(fotos.map((f) => f.id));
  const pendentesNaTela = recentes.filter((r) => !idsServidor.has(r.id));
  const total = fotos.length + pendentesNaTela.length;
  const cheio = total >= LIMITE_FOTOS_OS;

  // Libera as prévias locais ao sair da tela.
  useEffect(() => {
    const lista = urls.current;
    return () => lista.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  // Aviso ao sair com envio em andamento (não há envio em segundo plano nesta fase).
  useEffect(() => {
    if (!ocupado) return;
    const aoSair = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", aoSair);
    return () => window.removeEventListener("beforeunload", aoSair);
  }, [ocupado]);

  async function mandar(atual: Envio & { preparada: FotoPreparada }) {
    try {
      const r = await enviarFoto({
        id: atual.id,
        osId,
        preparada: atual.preparada,
        aoMudarEtapa: (fase) => setEnvio((e) => (e && e.id === atual.id ? { ...e, fase } : e)),
      });
      guardarDiagnostico({ osId, fotoId: atual.id, resultado: "enviada", preparo: atual.preparada.diag, envio: r });
      if (atual.previa) setRecentes((l) => [{ id: atual.id, previa: atual.previa! }, ...l]);
      setEnvio(null);
      setAviso("Foto enviada.");
      router.refresh();
    } catch (e) {
      const mensagem = e instanceof Error && e.message ? e.message : "Não deu para enviar a foto. Toque em “Tentar de novo”.";
      guardarDiagnostico({
        osId,
        fotoId: atual.id,
        resultado: "erro",
        erro: e instanceof ErroEnvio ? `${e.message} (${e.detalhe})` : String(e),
        etapaErro: e instanceof ErroEnvio ? e.etapa : undefined,
        preparo: atual.preparada.diag,
      });
      setEnvio({ ...atual, fase: "erro", mensagem });
    }
  }

  async function aoEscolher(ev: ChangeEvent<HTMLInputElement>) {
    const arquivo = ev.target.files?.[0];
    ev.target.value = ""; // deixa escolher o mesmo arquivo de novo
    if (!arquivo || ocupado) return;
    setAviso(null);
    const id = novoIdFoto();
    setEnvio({ id, fase: "preparando" });
    let preparada: FotoPreparada;
    try {
      preparada = await prepararFoto(arquivo);
    } catch (e) {
      const mensagem = e instanceof ErroFoto ? e.message : "Não deu para preparar a foto. Tente de novo.";
      guardarDiagnostico({ osId, fotoId: null, resultado: "erro", etapaErro: "preparo", erro: `${mensagem} (${String((e as Error)?.cause ?? e)})` });
      setEnvio({ id, fase: "erro", mensagem });
      return;
    }
    const previa = URL.createObjectURL(preparada.mini);
    urls.current.push(previa);
    const atual = { id, fase: "registrando" as const, preparada, previa };
    setEnvio(atual);
    await mandar(atual);
  }

  const desabilitado = ocupado || cheio;

  return (
    <section aria-labelledby="titulo-fotos" className="flex flex-col gap-3">
      <h2 id="titulo-fotos" className="text-2xl">
        {total >= 30 ? `Fotos (${total} de ${LIMITE_FOTOS_OS})` : `Fotos (${total})`}
      </h2>

      {podeEnviar && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <label
              htmlFor={idCamera}
              aria-disabled={desabilitado}
              className={classesBotao(
                "secundario",
                `flex-1 pointer-fine:hidden has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-foco ${desabilitado ? "pointer-events-none opacity-50" : "cursor-pointer"}`,
              )}
            >
              <Camera size={24} strokeWidth={2.25} aria-hidden />
              Tirar foto
              <input
                id={idCamera}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                disabled={desabilitado}
                onChange={aoEscolher}
                data-teste="foto-camera"
              />
            </label>
            <label
              htmlFor={idGaleria}
              aria-disabled={desabilitado}
              className={classesBotao(
                "secundario",
                `flex-1 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-foco ${desabilitado ? "pointer-events-none opacity-50" : "cursor-pointer"}`,
              )}
            >
              <Images size={24} strokeWidth={2.25} aria-hidden />
              <span className="pointer-fine:hidden">Da galeria</span>
              <span className="hidden pointer-fine:inline">Escolher foto</span>
              <input
                id={idGaleria}
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={desabilitado}
                onChange={aoEscolher}
                data-teste="foto-galeria"
              />
            </label>
          </div>
          {cheio && (
            <p className="text-base text-texto-suave">
              Esta OS chegou ao limite de {LIMITE_FOTOS_OS} fotos. Apague alguma para enviar outra.
            </p>
          )}
          {!cheio && total >= 30 && (
            <p className="text-base text-texto-suave">Cabem mais {LIMITE_FOTOS_OS - total} fotos nesta OS.</p>
          )}
        </div>
      )}

      {envio && envio.fase !== "erro" && (
        <div className="flex flex-col gap-2 rounded-md bg-superficie p-3" role="status" aria-live="polite">
          <div className="flex items-center gap-3">
            {envio.previa && (
              // eslint-disable-next-line @next/next/no-img-element -- prévia local (blob:)
              <img src={envio.previa} alt="" className="size-12 shrink-0 rounded-sm object-cover" />
            )}
            <p className="text-base font-bold">{TEXTO_FASE[envio.fase]}</p>
          </div>
          <div
            role="progressbar"
            aria-label="Envio da foto"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={PROGRESSO[envio.fase]}
            className="h-2 overflow-hidden rounded-full bg-superficie-2"
          >
            <div className="h-full bg-primaria transition-[width] motion-reduce:transition-none" style={{ width: `${PROGRESSO[envio.fase]}%` }} />
          </div>
        </div>
      )}

      {envio?.fase === "erro" && (
        <div className="flex flex-col gap-2">
          <CaixaMensagem tipo="erro">{envio.mensagem}</CaixaMensagem>
          {envio.preparada && (
            <div className="flex gap-2">
              <Botao variante="secundario" className="flex-1" onClick={() => mandar({ ...envio, preparada: envio.preparada!, fase: "registrando" })}>
                <RotateCcw size={22} strokeWidth={2.25} aria-hidden />
                Tentar de novo
              </Botao>
              <Botao variante="secundario" className="flex-1" onClick={() => setEnvio(null)}>
                Descartar
              </Botao>
            </div>
          )}
        </div>
      )}

      {aviso && !envio && <CaixaMensagem tipo="sucesso">{aviso}</CaixaMensagem>}

      {erroLista && (
        <div className="flex flex-col gap-2">
          <CaixaMensagem tipo="erro">Não foi possível carregar as fotos.</CaixaMensagem>
          <Botao variante="secundario" onClick={() => router.refresh()}>
            Tentar de novo
          </Botao>
        </div>
      )}

      {total > 0 ? (
        <ul className="grid grid-cols-3 gap-2 lg:grid-cols-[repeat(auto-fill,minmax(140px,1fr))]" aria-label="Fotos da OS">
          {pendentesNaTela.map((r) => (
            <li key={r.id} className="relative aspect-square overflow-hidden rounded-md bg-superficie-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- prévia local (blob:) */}
              <img src={r.previa} alt="Outro, sem legenda, acabou de ser enviada" className="size-full object-cover" />
              <FaixaTipo texto="Enviada" />
            </li>
          ))}
          {fotos.map((f) => (
            <MiniaturaFoto key={`${f.id}-${f.url ?? ""}`} foto={f} aoRecarregar={() => router.refresh()} />
          ))}
        </ul>
      ) : (
        !erroLista && (
          <div className="flex flex-col items-start gap-1">
            <Camera size={32} strokeWidth={2} aria-hidden className="text-texto-suave" />
            <p className="text-lg font-bold">{ehMecanico ? "Nenhuma foto ainda." : "Nenhuma foto nesta OS."}</p>
            {ehMecanico && podeEnviar && (
              <p className="text-base text-texto-suave">
                Tire foto da peça com defeito e da peça trocada. Ajuda a explicar o serviço ao cliente.
              </p>
            )}
          </div>
        )
      )}

      {!EH_PRODUCAO && (
        <Link
          href="/diagnostico/fotos"
          className="inline-flex min-h-toque items-center self-start text-sm font-bold text-info-texto underline underline-offset-4"
        >
          Diagnóstico das fotos (só no ambiente de teste)
        </Link>
      )}
    </section>
  );
}

function FaixaTipo({ texto }: { texto: string }) {
  return (
    <span className="absolute inset-x-0 bottom-0 flex h-7 items-center truncate bg-[#14161A]/80 px-2 text-sm font-bold text-white">
      {texto}
    </span>
  );
}

function MiniaturaFoto({ foto, aoRecarregar }: { foto: FotoDaGrade; aoRecarregar: () => void }) {
  const [falhou, setFalhou] = useState(false);
  const tipo = ROTULO_CATEGORIA_FOTO[foto.categoria] ?? "Outro";
  const alt = `${tipo}, ${foto.legenda || "sem legenda"}${foto.criadoPorNome ? `, enviada por ${foto.criadoPorNome}` : ""}${
    foto.enviadaEm ? ` em ${formatarDiaHora(foto.enviadaEm)}` : ""
  }`;
  return (
    <li className="relative aspect-square overflow-hidden rounded-md bg-superficie-2">
      {foto.url && !falhou ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL assinada do Storage (expira em 15 min)
        <img src={foto.url} alt={alt} className="size-full object-cover" loading="lazy" onError={() => setFalhou(true)} />
      ) : (
        <button
          type="button"
          onClick={aoRecarregar}
          className="flex size-full flex-col items-center justify-center gap-1 p-1 text-center text-sm font-bold text-texto-suave"
          aria-label={`${alt}. Não carregou; toque para carregar`}
        >
          <ImageOff size={24} strokeWidth={2} aria-hidden />
          Toque para carregar
        </button>
      )}
      <FaixaTipo texto={tipo} />
    </li>
  );
}
