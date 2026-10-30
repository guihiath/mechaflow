"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, CircleAlert, Pencil, RotateCw, Trash2, X } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { Etiqueta } from "@/components/ui/estados";
import { CATEGORIAS_FOTO, formatarDiaHoraFoto, rotuloCategoriaFoto } from "@/components/os/categorias-foto";
import { fotoNaFila, type DadosMiniaturaFoto } from "@/components/os/grade-fotos";

const CHAVE_HISTORICO = "mfTelaCheia";
const semAssinatura = () => () => {};

export type FotoTelaCheiaDados = DadosMiniaturaFoto & {
  /** URL assinada da foto grande (ou blob: local, se ainda na fila). Baixa so aqui. */
  srcGrande?: string | null;
  /** Mostra "Editar tipo e legenda" (regras no banco; DESIGN §11.0 regra 6). */
  podeEditar?: boolean;
  /** Mostra "Apagar foto" (ou "Remover da fila" se ainda nao enviada). */
  podeApagar?: boolean;
  /** Foto da fila com erro: texto do motivo (DESIGN §11.6, "Erros que Tentar de novo nao resolve"). */
  motivo?: string | null;
};

type Resultado = { erro?: string } | void;

const TEXTO_FILA: Partial<Record<DadosMiniaturaFoto["estado"], string>> = {
  preparando: "Preparando a foto…",
  na_fila: "Na fila. Guardada no celular, esperando a vez de enviar.",
  sem_internet: "Sem internet. A foto está guardada no celular e envia quando a internet voltar.",
  enviando: "Enviando…",
  falhou: "Não foi enviada depois de 3 tentativas.",
  nao_enviavel: "Não dá para enviar esta foto.",
};

/**
 * Foto em tela cheia (DESIGN §11.8). `<dialog>` com showModal, no `<body>` (portal), camada
 * fixa que segue o `visualViewport` (mesma tecnica da `Folha`), fundo #0B0C0E e tokens do
 * tema escuro nos dois temas (foco azul claro). Voltar do Android e Esc fecham.
 *
 * Controlada: o pai guarda `aberta` e `indice`, e faz as acoes (editar abre a `FolhaEditarFoto`,
 * apagar chama a RPC). Depois de apagar, o pai tira a foto da lista; o indice ja aponta para a
 * proxima (ou a anterior, se era a ultima) e a lista vazia fecha a tela.
 */
export function FotoTelaCheia({
  aberta,
  aoFechar,
  fotos,
  indice,
  aoMudarIndice,
  aoEditar,
  aoApagar,
  aoTentarDeNovo,
  aoRemoverDaFila,
  aoRecarregar,
}: {
  aberta: boolean;
  aoFechar: () => void;
  fotos: FotoTelaCheiaDados[];
  indice: number;
  aoMudarIndice: (indice: number) => void;
  aoEditar?: (foto: FotoTelaCheiaDados) => void;
  aoApagar?: (foto: FotoTelaCheiaDados) => Promise<Resultado>;
  aoTentarDeNovo?: (foto: FotoTelaCheiaDados) => void;
  aoRemoverDaFila?: (foto: FotoTelaCheiaDados) => Promise<Resultado> | Resultado;
  /** Pede URL nova (a assinada venceu) antes de tentar abrir de novo. */
  aoRecarregar?: (foto: FotoTelaCheiaDados) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const noNavegador = useSyncExternalStore(
    semAssinatura,
    () => true,
    () => false,
  );
  const botaoFechar = useRef<HTMLButtonElement>(null);
  const caixaConfirmar = useRef<HTMLDivElement>(null);
  const chave = useId();
  const idTitulo = useId();
  const idConfirmar = useId();
  const aoFecharRef = useRef(aoFechar);
  const voltarPendente = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fechandoPorNos = useRef(false);

  const total = fotos.length;
  const idx = Math.min(Math.max(indice, 0), Math.max(total - 1, 0));
  const foto = total > 0 ? fotos[idx] : undefined;
  const naFila = foto ? fotoNaFila(foto.estado) : false;

  // Estado ligado a foto atual (trocar de foto zera sozinho, sem efeito).
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [apagando, setApagando] = useState(false);
  const [erroAcao, setErroAcao] = useState<{ id: string; texto: string } | null>(null);
  const [aviso, setAviso] = useState("");
  const [carregada, setCarregada] = useState<string | null>(null);
  const [falhou, setFalhou] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);

  const srcGrande = foto?.srcGrande ?? foto?.src ?? null;
  const chaveImagem = `${foto?.id ?? ""}|${srcGrande ?? ""}|${tentativa}`;
  const imagemPronta = carregada === chaveImagem;
  const imagemFalhou = falhou === chaveImagem;
  const confirmandoEsta = !!foto && confirmando === foto.id;

  useEffect(() => {
    aoFecharRef.current = aoFechar;
  }, [aoFechar]);

  useEffect(() => {
    if (confirmandoEsta) caixaConfirmar.current?.focus();
  }, [confirmandoEsta]);

  // Lista ficou vazia (apagou a ultima): fecha. Indice fora da lista: corrige no pai.
  useEffect(() => {
    if (!aberta) return;
    if (total === 0) aoFecharRef.current();
    else if (indice !== idx) aoMudarIndice(idx);
  }, [aberta, total, indice, idx, aoMudarIndice]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(""), 3000);
    return () => clearTimeout(t);
  }, [aviso]);

  useEffect(() => {
    const dialogo = ref.current;
    if (!aberta || !dialogo) return;

    const origem = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    fechandoPorNos.current = false;

    const inertes: HTMLElement[] = [];
    if (!dialogo.open) {
      let modal = false;
      try {
        if (typeof dialogo.showModal === "function") {
          dialogo.showModal();
          modal = dialogo.open;
        }
      } catch {
        modal = false;
      }
      if (!modal) {
        dialogo.setAttribute("open", "");
        for (const el of Array.from(document.body.children)) {
          if (el !== dialogo && el instanceof HTMLElement && !el.inert) {
            el.inert = true;
            inertes.push(el);
          }
        }
      }
    }
    botaoFechar.current?.focus();
    const overflowAntes = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";

    const vv = window.visualViewport;
    const ajustar = () => {
      // Com pinça (zoom nativo), não persegue a área visível: senão a camada encolhe junto e desfaz o zoom.
      if (!vv || vv.scale > 1.01) return;
      dialogo.style.top = `${vv.offsetTop}px`;
      dialogo.style.height = `${vv.height}px`;
    };
    ajustar();
    vv?.addEventListener("resize", ajustar);
    vv?.addEventListener("scroll", ajustar);

    if (voltarPendente.current) {
      clearTimeout(voltarPendente.current);
      voltarPendente.current = null;
    }
    if (window.history.state?.[CHAVE_HISTORICO] !== chave) {
      window.history.pushState({ ...window.history.state, [CHAVE_HISTORICO]: chave }, "");
    }
    const aoVoltar = () => {
      // Folha aberta por cima (editar) voltou para o nosso estado: continua aberta.
      if (window.history.state?.[CHAVE_HISTORICO] === chave) return;
      aoFecharRef.current();
    };
    window.addEventListener("popstate", aoVoltar);

    return () => {
      window.removeEventListener("popstate", aoVoltar);
      vv?.removeEventListener("resize", ajustar);
      vv?.removeEventListener("scroll", ajustar);
      fechandoPorNos.current = true;
      if (dialogo.open) {
        if (typeof dialogo.close === "function") dialogo.close();
        else dialogo.removeAttribute("open");
      }
      for (const el of inertes) el.inert = false;
      document.documentElement.style.overflow = overflowAntes;
      if (origem?.isConnected) origem.focus({ preventScroll: true });
      voltarPendente.current = setTimeout(() => {
        voltarPendente.current = null;
        if (window.history.state?.[CHAVE_HISTORICO] === chave) window.history.back();
      }, 0);
    };
  }, [aberta, chave, noNavegador]);

  function ir(novo: number) {
    if (novo < 0 || novo >= total || novo === idx) return;
    setConfirmando(null);
    aoMudarIndice(novo);
  }

  async function confirmarRemocao() {
    if (!foto || apagando) return;
    const atual = foto;
    const acao = naFila ? aoRemoverDaFila : aoApagar;
    if (!acao) return;
    setErroAcao(null);
    setApagando(true);
    try {
      const r = await acao(atual);
      if (r && r.erro) setErroAcao({ id: atual.id, texto: r.erro });
      else {
        setConfirmando(null);
        setAviso(naFila ? "Foto removida da fila." : "Foto apagada.");
      }
    } catch {
      setErroAcao({
        id: atual.id,
        texto: naFila
          ? "Não foi possível remover a foto. Tente de novo."
          : "Não foi possível apagar a foto. Confira a internet e tente de novo.",
      });
    } finally {
      setApagando(false);
    }
  }

  // Portal so depois de hidratar (o servidor nao tem `document`; evita diferenca na hidratacao).
  if (!noNavegador) return null;

  const tipo = foto ? rotuloCategoriaFoto(foto.categoria) : "";
  const IconeTipo = foto ? (CATEGORIAS_FOTO.find((c) => c.valor === foto.categoria)?.icone ?? null) : null;
  const legenda = foto?.legenda?.trim();
  const quando = formatarDiaHoraFoto(foto?.enviadoEm);
  const podeRemover = !!foto?.podeApagar && (naFila ? !!aoRemoverDaFila : !!aoApagar);
  const erroDestaFoto = erroAcao && foto && erroAcao.id === foto.id ? erroAcao.texto : null;
  const botaoNav =
    "inline-flex min-h-toque flex-1 items-center justify-center gap-1 rounded-md border-2 border-borda bg-superficie px-3 text-base font-bold text-texto active:bg-superficie-2 disabled:cursor-not-allowed disabled:opacity-40";

  return createPortal(
    <dialog
      ref={ref}
      data-tema="escuro"
      aria-labelledby={idTitulo}
      onCancel={(e) => {
        e.preventDefault();
        if (confirmandoEsta) setConfirmando(null);
        else aoFechar();
      }}
      onClose={() => {
        if (!fechandoPorNos.current && !ref.current?.open) aoFechar();
      }}
      onKeyDown={(e) => {
        if (confirmandoEsta || e.target instanceof HTMLInputElement) return;
        if (e.key === "ArrowLeft") ir(idx - 1);
        if (e.key === "ArrowRight") ir(idx + 1);
      }}
      className="fixed inset-x-0 top-0 m-0 h-full max-h-none w-full max-w-none flex-col overflow-hidden border-0 bg-[#0B0C0E] p-0 text-texto backdrop:bg-[#0B0C0E] open:flex"
    >
      {aberta && foto && (
        <>
          <h2 id={idTitulo} className="sr-only">
            Foto {idx + 1} de {total}: {tipo}
          </h2>

          {/* Topo: Fechar + "3 de 12" */}
          <div className="flex h-14 shrink-0 items-center justify-between gap-2 bg-[#14161A] pt-[env(safe-area-inset-top)] pr-4 pl-1">
            <button
              ref={botaoFechar}
              type="button"
              onClick={aoFechar}
              className="inline-flex min-h-toque items-center gap-1.5 rounded-md px-3 text-base font-bold text-[#EDEBE6] active:bg-superficie-2"
            >
              <X size={22} strokeWidth={2.25} aria-hidden />
              Fechar
            </button>
            <p className="text-xs font-bold text-[#B4B0A8]" aria-hidden>
              {idx + 1} de {total}
            </p>
          </div>

          {/* Meio: foto inteira; miniatura ampliada por baixo enquanto a grande carrega */}
          <div className="relative min-h-0 flex-1 touch-pinch-zoom overflow-hidden">
            {foto.src && !imagemPronta && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={foto.src} alt="" aria-hidden className="absolute inset-0 h-full w-full object-contain opacity-60" />
            )}
            {srcGrande && !imagemFalhou && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={chaveImagem}
                src={srcGrande}
                alt={`${tipo}${legenda ? `, ${legenda}` : ""}`}
                draggable={false}
                onLoad={() => setCarregada(chaveImagem)}
                onError={() => setFalhou(chaveImagem)}
                className={`absolute inset-0 h-full w-full object-contain transition-opacity ${imagemPronta ? "opacity-100" : "opacity-0"}`}
              />
            )}
            {!imagemPronta && !imagemFalhou && srcGrande && (
              <p className="absolute inset-x-0 bottom-3 text-center text-base font-bold text-[#EDEBE6]" role="status">
                Carregando foto…
              </p>
            )}
            {(imagemFalhou || !srcGrande) && (
              <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
                <CircleAlert size={32} strokeWidth={2.25} aria-hidden className="text-erro-texto" />
                <p className="text-base font-bold text-[#EDEBE6]">
                  Não foi possível abrir a foto. Confira a internet e tente de novo.
                </p>
                <Botao
                  variante="secundario"
                  className="w-auto"
                  onClick={() => {
                    aoRecarregar?.(foto);
                    setTentativa((n) => n + 1);
                  }}
                >
                  <RotateCw size={20} strokeWidth={2.25} aria-hidden />
                  Tentar de novo
                </Botao>
              </div>
            )}
          </div>

          {/* Embaixo: tipo, legenda, quem enviou, navegacao, editar, apagar */}
          <div className="flex max-h-[55%] shrink-0 flex-col gap-3 overflow-y-auto bg-[#14161A] px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] text-[#EDEBE6]">
            <div className="flex flex-col items-start gap-1.5">
              <Etiqueta>
                {IconeTipo && <IconeTipo size={18} strokeWidth={2.25} aria-hidden />}
                {tipo}
              </Etiqueta>
              <p className={`text-base ${legenda ? "" : "text-texto-suave"}`}>{legenda || "Sem legenda"}</p>
              {!naFila && (foto.enviadoPor || quando) && (
                <p className="text-xs text-texto-suave">
                  {foto.enviadoPor ? `Enviada por ${foto.enviadoPor}` : "Enviada"}
                  {quando ? ` · ${quando}` : ""}
                </p>
              )}
            </div>

            {naFila && (
              <div className="flex flex-col gap-1 rounded-md border-l-4 border-alerta bg-superficie p-3">
                <p className="text-base font-bold">{TEXTO_FILA[foto.estado]}</p>
                {foto.motivo && <p className="text-base text-texto-suave">{foto.motivo}</p>}
              </div>
            )}

            {/* Regiao viva fixa: o leitor anuncia "Foto apagada." quando o texto aparece. */}
            <p role="status" className={aviso ? "text-base font-bold text-sucesso-texto" : "sr-only"}>
              {aviso}
            </p>

            {confirmandoEsta ? (
              <div
                ref={caixaConfirmar}
                tabIndex={-1}
                role="alertdialog"
                aria-labelledby={idConfirmar}
                className="flex flex-col gap-3 rounded-lg border-2 border-erro bg-superficie p-4 outline-none focus-visible:outline-[3px] focus-visible:outline-foco"
              >
                <div id={idConfirmar}>
                  <p className="text-lg font-bold">{naFila ? "Remover esta foto?" : "Apagar esta foto de vez?"}</p>
                  <p className="text-base text-texto-suave">
                    {naFila ? "Ela ainda não foi enviada." : "Ela some para todos e não dá para recuperar."}
                  </p>
                </div>
                {erroDestaFoto && (
                  <p role="alert" className="flex items-start gap-1.5 text-base font-bold text-erro-texto">
                    <CircleAlert size={20} strokeWidth={2.25} aria-hidden className="mt-0.5 shrink-0" />
                    {erroDestaFoto}
                  </p>
                )}
                <Botao variante="secundario" onClick={() => setConfirmando(null)} disabled={apagando}>
                  Voltar
                </Botao>
                <Botao variante="perigo" onClick={confirmarRemocao} disabled={apagando} aria-busy={apagando}>
                  {apagando
                    ? naFila
                      ? "Removendo…"
                      : "Apagando…"
                    : naFila
                      ? "Remover da fila"
                      : "Apagar foto"}
                </Botao>
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <button type="button" className={botaoNav} disabled={idx === 0} onClick={() => ir(idx - 1)}>
                    <ChevronLeft size={22} strokeWidth={2.25} aria-hidden />
                    Anterior
                  </button>
                  <button type="button" className={botaoNav} disabled={idx >= total - 1} onClick={() => ir(idx + 1)}>
                    Próxima
                    <ChevronRight size={22} strokeWidth={2.25} aria-hidden />
                  </button>
                </div>

                {naFila && foto.estado === "falhou" && aoTentarDeNovo && (
                  <Botao onClick={() => aoTentarDeNovo(foto)}>
                    <RotateCw size={20} strokeWidth={2.25} aria-hidden />
                    Tentar de novo
                  </Botao>
                )}

                {foto.podeEditar && aoEditar && (
                  <Botao variante="secundario" onClick={() => aoEditar(foto)}>
                    <Pencil size={20} strokeWidth={2.25} aria-hidden />
                    Editar tipo e legenda
                  </Botao>
                )}

                {podeRemover && (
                  <Botao variante="perigo" className="mt-3" onClick={() => setConfirmando(foto.id)}>
                    <Trash2 size={20} strokeWidth={2.25} aria-hidden />
                    {naFila ? "Remover da fila" : "Apagar foto"}
                  </Botao>
                )}
                {erroDestaFoto && (
                  <p role="alert" className="flex items-start gap-1.5 text-base font-bold text-erro-texto">
                    <CircleAlert size={20} strokeWidth={2.25} aria-hidden className="mt-0.5 shrink-0" />
                    {erroDestaFoto}
                  </p>
                )}
              </>
            )}
          </div>
        </>
      )}
    </dialog>,
    document.body,
  );
}
