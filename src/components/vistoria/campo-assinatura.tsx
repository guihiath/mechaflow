"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Check, CircleAlert, Eraser, RotateCw, X } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { AvisoDesfazer } from "@/components/ui/aviso-desfazer";
import {
  assinaturaPequenaDemais,
  assinaturaVazia,
  calcularEncaixe,
  desenharPedaco,
  espessuraPorVelocidade,
  exportarAssinatura,
  pontoAfastado,
  prepararCanvas,
  redesenhar,
  telaParaPapel,
  temTraco,
  type AssinaturaExportada,
  type DadosAssinatura,
  type Encaixe,
  type TracoAssinatura,
} from "@/lib/assinatura";

const CHAVE_HISTORICO = "mfAssinatura";
const semAssinatura = () => () => {};

export type ResultadoAssinatura = AssinaturaExportada & { dados: DadosAssinatura };

/**
 * Campo de assinatura em tela cheia (F4-F1; DESIGN §12.9).
 *
 * - `<dialog>` com showModal no `<body>` (portal), camada fixa que segue o `visualViewport`
 *   (tecnica da `Folha`), `overscroll-behavior: none`, e o `body` preso com
 *   `position: fixed; top: -scrollY` enquanto aberto (o `overflow: hidden` sozinho nao segura o
 *   Safari do iPhone); a rolagem volta ao fechar.
 * - Canvas com `touch-action: none`, sem selecao/lupa, `touchstart`/`touchmove` com
 *   `preventDefault()` em ouvinte nao passivo, pointer events com `getCoalescedEvents()`.
 * - 24 px de margem dos dois lados (+ entalhe deitado): longe da borda onde comeca o gesto de
 *   voltar do Safari. Abrir empurra um estado no historico: voltar (gesto ou Android) so FECHA,
 *   sem apagar o traco (o pai guarda `valor`; reabrir mostra a assinatura como estava).
 * - Nitido: canvas interno = tamanho na tela x devicePixelRatio (ate 3).
 * - Girar/redimensionar: redesenha os tracos guardados (lib/assinatura), sem esticar nem apagar.
 * - Papel sempre branco e tinta grafite, nos dois temas; a moldura segue o tema.
 *
 * Controlado: o pai guarda `aberta` e `valor` (tracos). `aoMudar` roda ao fim de cada traco,
 * no Limpar e no Desfazer (nao a cada ponto). `aoUsar` recebe o PNG pronto (fundo branco,
 * ate 512 KB) e os tracos; o pai fecha.
 */
export function CampoAssinatura({
  aberta,
  aoFechar,
  valor,
  aoMudar,
  aoUsar,
  nome,
}: {
  aberta: boolean;
  aoFechar: () => void;
  valor: DadosAssinatura | null;
  aoMudar: (dados: DadosAssinatura) => void;
  aoUsar: (resultado: ResultadoAssinatura) => void | Promise<void>;
  /** Nome digitado de quem assina ("Assinatura de Carlos"). */
  nome?: string;
}) {
  const noNavegador = useSyncExternalStore(
    semAssinatura,
    () => true,
    () => false,
  );
  const dialogoRef = useRef<HTMLDialogElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const botaoFechar = useRef<HTMLButtonElement>(null);
  const caixaConfirmar = useRef<HTMLDivElement>(null);
  const chave = useId();
  const idTitulo = useId();
  const idConfirmar = useId();

  // Estado do desenho fora do React (nada re-renderiza a cada ponto).
  const dados = useRef<DadosAssinatura>(valor ?? assinaturaVazia());
  const encaixe = useRef<Encaixe>({ escala: 1, dx: 0, dy: 0 });
  const dpr = useRef(1);
  const tamanho = useRef({ w: 0, h: 0 });
  const tracoAberto = useRef<TracoAssinatura | null>(null);
  const ponteiro = useRef<number | null>(null);
  const retangulo = useRef<DOMRect | null>(null);
  const ultimoTempo = useRef(0);

  const [assinado, setAssinado] = useState(() => temTraco(valor));
  const [pequena, setPequena] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [desfazer, setDesfazer] = useState<{ anterior: DadosAssinatura; n: number } | null>(null);
  const [exportando, setExportando] = useState(false);
  const [erro, setErro] = useState("");

  const aoFecharRef = useRef(aoFechar);
  const aoMudarRef = useRef(aoMudar);
  useEffect(() => {
    aoFecharRef.current = aoFechar;
    aoMudarRef.current = aoMudar;
  }, [aoFechar, aoMudar]);

  const confirmandoRef = useRef(confirmando);
  useEffect(() => {
    confirmandoRef.current = confirmando;
    if (confirmando) caixaConfirmar.current?.focus();
  }, [confirmando]);

  /** Mede a area, ajusta o canvas a densidade da tela e redesenha tudo. */
  const medirEDesenhar = useCallback(() => {
    const area = areaRef.current;
    const canvas = canvasRef.current;
    if (!area || !canvas) return;
    const w = area.clientWidth;
    const h = area.clientHeight;
    if (w <= 0 || h <= 0) return;
    const densidade = Math.min(Math.max(window.devicePixelRatio || 1, 1), 3);
    tamanho.current = { w, h };
    dpr.current = densidade;
    const largura = Math.round(w * densidade);
    const altura = Math.round(h * densidade);
    if (canvas.width !== largura) canvas.width = largura;
    if (canvas.height !== altura) canvas.height = altura;
    // Sem traco: o papel vira a area atual (assinar deitado usa a area deitada inteira).
    if (!temTraco(dados.current)) dados.current = assinaturaVazia(w, h);
    encaixe.current = calcularEncaixe(dados.current, w, h);
    const ctx = canvas.getContext("2d");
    if (ctx) redesenhar(ctx, dados.current, encaixe.current, densidade, tracoAberto.current);
  }, []);

  // Abrir: pega o valor do pai (reabrir mostra como estava).
  const [abertaAntes, setAbertaAntes] = useState(false);
  if (aberta !== abertaAntes) {
    setAbertaAntes(aberta);
    if (aberta) {
      setAssinado(temTraco(valor));
      setPequena(false);
      setConfirmando(false);
      setErro("");
      setDesfazer(null);
    }
  }
  useEffect(() => {
    if (aberta) dados.current = valor ? { ...valor, tracos: valor.tracos.map((t) => [...t]) } : assinaturaVazia();
    // So na abertura; durante o desenho o valor vem daqui de dentro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberta]);

  // Dialog, trava da pagina, area visivel e historico.
  useEffect(() => {
    const dialogo = dialogoRef.current;
    if (!aberta || !dialogo) return;
    const origem = document.activeElement instanceof HTMLElement ? document.activeElement : null;

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

    // Estado no historico ANTES de travar a pagina: o navegador grava a rolagem da entrada atual
    // no pushState, e com o body preso ela seria 0 (voltar devolveria a pagina para o topo).
    window.history.pushState({ ...window.history.state, [CHAVE_HISTORICO]: chave }, "");

    // Trava a pagina de tras (Safari do iPhone ignora o overflow do <html> sozinho).
    const rolagem = window.scrollY;
    const corpo = document.body.style;
    const antes = {
      position: corpo.position,
      top: corpo.top,
      left: corpo.left,
      right: corpo.right,
      width: corpo.width,
      overflow: document.documentElement.style.overflow,
    };
    corpo.position = "fixed";
    corpo.top = `-${rolagem}px`;
    corpo.left = "0";
    corpo.right = "0";
    corpo.width = "100%";
    document.documentElement.style.overflow = "hidden";

    const vv = window.visualViewport;
    const ajustar = () => {
      if (!vv) return;
      dialogo.style.top = `${vv.offsetTop}px`;
      dialogo.style.height = `${vv.height}px`;
    };
    ajustar();
    vv?.addEventListener("resize", ajustar);
    vv?.addEventListener("scroll", ajustar);
    // Arrastar fora do canvas (topo, barra) tambem nao rola nada.
    const travar = (e: TouchEvent) => {
      if (e.touches.length > 1 || !(e.target instanceof Element) || !e.target.closest("button")) e.preventDefault();
    };
    dialogo.addEventListener("touchmove", travar, { passive: false });

    const aoVoltar = () => {
      if (window.history.state?.[CHAVE_HISTORICO] === chave) return;
      // Gesto de voltar / voltar do Android: so fecha. Os tracos ficam com o pai.
      aoMudarRef.current(dados.current);
      aoFecharRef.current();
    };
    window.addEventListener("popstate", aoVoltar);

    return () => {
      window.removeEventListener("popstate", aoVoltar);
      vv?.removeEventListener("resize", ajustar);
      vv?.removeEventListener("scroll", ajustar);
      dialogo.removeEventListener("touchmove", travar);
      if (dialogo.open) {
        if (typeof dialogo.close === "function") dialogo.close();
        else dialogo.removeAttribute("open");
      }
      for (const el of inertes) el.inert = false;
      corpo.position = antes.position;
      corpo.top = antes.top;
      corpo.left = antes.left;
      corpo.right = antes.right;
      corpo.width = antes.width;
      document.documentElement.style.overflow = antes.overflow;
      window.scrollTo(0, rolagem);
      // Fechou pelo voltar: o navegador ainda restaura a rolagem da entrada depois do popstate.
      requestAnimationFrame(() => {
        if (Math.abs(window.scrollY - rolagem) > 1) window.scrollTo(0, rolagem);
      });
      if (origem?.isConnected) origem.focus({ preventScroll: true });
      setTimeout(() => {
        if (window.history.state?.[CHAVE_HISTORICO] === chave) window.history.back();
      }, 0);
    };
  }, [aberta, chave, noNavegador]);

  // Canvas: tamanho, girar, desenhar.
  useEffect(() => {
    const area = areaRef.current;
    const canvas = canvasRef.current;
    if (!aberta || !area || !canvas) return;

    medirEDesenhar();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => medirEDesenhar()) : null;
    ro?.observe(area);
    // iOS antigo: o ResizeObserver chega antes do layout novo depois de girar.
    const aoGirar = () => setTimeout(medirEDesenhar, 250);
    window.addEventListener("orientationchange", aoGirar);
    window.addEventListener("resize", medirEDesenhar);

    const ctxDe = () => canvas.getContext("2d");

    const posicao = (e: PointerEvent) => {
      const r = retangulo.current ?? canvas.getBoundingClientRect();
      return telaParaPapel(dados.current, encaixe.current, e.clientX - r.left, e.clientY - r.top);
    };

    const acrescentar = (e: PointerEvent) => {
      const traco = tracoAberto.current;
      if (!traco) return;
      const { x, y } = posicao(e);
      const anterior = traco[traco.length - 1];
      if (!pontoAfastado(dados.current, anterior, x, y)) return;
      const dt = Math.max(e.timeStamp - ultimoTempo.current, 1);
      ultimoTempo.current = e.timeStamp;
      const dist = Math.hypot((x - anterior.x) * dados.current.largura, (y - anterior.y) * dados.current.altura);
      traco.push({ x, y, l: espessuraPorVelocidade(dist / dt, anterior.l) });
      // Ponto novo fecha o pedaco anterior (curva pelo ponto medio).
      if (traco.length >= 3) {
        const ctx = ctxDe();
        if (ctx) {
          prepararCanvas(ctx, encaixe.current, dpr.current);
          desenharPedaco(ctx, dados.current, traco, traco.length - 2);
        }
      }
    };

    const aoDescer = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (ponteiro.current !== null) return; // segundo dedo: ignora
      e.preventDefault();
      ponteiro.current = e.pointerId;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {}
      retangulo.current = canvas.getBoundingClientRect();
      ultimoTempo.current = e.timeStamp;
      const { x, y } = posicao(e);
      const traco: TracoAssinatura = [{ x, y, l: espessuraPorVelocidade(0) }];
      dados.current.tracos.push(traco);
      tracoAberto.current = traco;
      const ctx = ctxDe();
      if (ctx) {
        prepararCanvas(ctx, encaixe.current, dpr.current);
        desenharPedaco(ctx, dados.current, traco, 0);
      }
    };

    const aoMover = (e: PointerEvent) => {
      if (e.pointerId !== ponteiro.current) return;
      e.preventDefault();
      const lista = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [];
      if (lista.length) for (const c of lista) acrescentar(c);
      else acrescentar(e);
    };

    const aoSubir = (e: PointerEvent) => {
      if (e.pointerId !== ponteiro.current) return;
      const traco = tracoAberto.current;
      ponteiro.current = null;
      tracoAberto.current = null;
      retangulo.current = null;
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {}
      if (!traco) return;
      if (traco.length >= 2) {
        const ctx = ctxDe();
        if (ctx) {
          prepararCanvas(ctx, encaixe.current, dpr.current);
          desenharPedaco(ctx, dados.current, traco, traco.length - 1);
        }
      }
      setAssinado(true);
      setPequena(false);
      setErro("");
      aoMudarRef.current({ ...dados.current, tracos: dados.current.tracos.map((t) => [...t]) });
    };

    // Toque: sem rolar, sem lupa, sem gesto do navegador. Nao passivo de proposito.
    const bloquear = (e: TouchEvent) => e.preventDefault();
    const semMenu = (e: Event) => e.preventDefault();

    canvas.addEventListener("pointerdown", aoDescer);
    canvas.addEventListener("pointermove", aoMover);
    canvas.addEventListener("pointerup", aoSubir);
    canvas.addEventListener("pointercancel", aoSubir);
    canvas.addEventListener("touchstart", bloquear, { passive: false });
    canvas.addEventListener("touchmove", bloquear, { passive: false });
    canvas.addEventListener("contextmenu", semMenu);
    return () => {
      ro?.disconnect();
      window.removeEventListener("orientationchange", aoGirar);
      window.removeEventListener("resize", medirEDesenhar);
      canvas.removeEventListener("pointerdown", aoDescer);
      canvas.removeEventListener("pointermove", aoMover);
      canvas.removeEventListener("pointerup", aoSubir);
      canvas.removeEventListener("pointercancel", aoSubir);
      canvas.removeEventListener("touchstart", bloquear);
      canvas.removeEventListener("touchmove", bloquear);
      canvas.removeEventListener("contextmenu", semMenu);
      ponteiro.current = null;
      tracoAberto.current = null;
    };
  }, [aberta, noNavegador, medirEDesenhar]);

  function limpar() {
    if (!temTraco(dados.current)) return;
    const anterior = dados.current;
    dados.current = assinaturaVazia(tamanho.current.w, tamanho.current.h);
    medirEDesenhar();
    setAssinado(false);
    setPequena(false);
    setErro("");
    setDesfazer((d) => ({ anterior, n: (d?.n ?? 0) + 1 }));
    aoMudar(dados.current);
  }

  function desfazerLimpar() {
    if (!desfazer) return;
    dados.current = desfazer.anterior;
    medirEDesenhar();
    setAssinado(temTraco(desfazer.anterior));
    setDesfazer(null);
    aoMudar(desfazer.anterior);
  }

  async function usar() {
    if (exportando) return;
    const atual = dados.current;
    if (!temTraco(atual)) return;
    if (assinaturaPequenaDemais(atual)) {
      setPequena(true);
      setConfirmando(false);
      return;
    }
    setErro("");
    setExportando(true);
    try {
      const copia = { ...atual, tracos: atual.tracos.map((t) => [...t]) };
      const r = await exportarAssinatura(copia);
      await aoUsar({ ...r, dados: copia });
    } catch {
      setConfirmando(false);
      setErro("Não foi possível guardar a assinatura. Tente de novo.");
    } finally {
      setExportando(false);
    }
  }

  function pedirFechar() {
    if (confirmando) {
      setConfirmando(false);
      return;
    }
    if (temTraco(dados.current)) setConfirmando(true);
    else aoFechar();
  }

  function apagarEFechar() {
    dados.current = assinaturaVazia();
    aoMudar(dados.current);
    setAssinado(false);
    aoFechar();
  }

  if (!noNavegador) return null;

  const rotuloArea = assinado ? "Assinatura desenhada" : "Área de assinatura. Desenhe com o dedo.";
  const nomeLimpo = nome?.trim();
  const margemLados = "pl-[calc(1.5rem+env(safe-area-inset-left))] pr-[calc(1.5rem+env(safe-area-inset-right))]";

  return createPortal(
    <dialog
      ref={dialogoRef}
      aria-labelledby={idTitulo}
      data-campo-assinatura
      onCancel={(e) => {
        e.preventDefault();
        pedirFechar();
      }}
      onClose={() => {
        if (aberta && !dialogoRef.current?.open) aoFechar();
      }}
      className="fixed inset-x-0 top-0 m-0 h-full max-h-none w-full max-w-none flex-col overflow-hidden overscroll-none border-0 bg-superficie-2 p-0 text-texto backdrop:bg-[#14161A]/60 open:flex lg:items-center lg:justify-center lg:bg-[#14161A]/50 lg:p-6"
    >
      {aberta && (
        <div className="flex h-full w-full flex-col overflow-hidden bg-superficie-2 lg:h-[min(640px,100%)] lg:max-w-[560px] lg:rounded-xl lg:shadow-folha">
          {/* Topo grafite: 56 px (48 px deitado) abaixo do entalhe. */}
          <div className="shrink-0 bg-grafite pt-[env(safe-area-inset-top)] text-[#EDEBE6]">
            <div className="flex h-14 items-center gap-2 pr-[calc(1rem+env(safe-area-inset-right))] pl-[calc(0.25rem+env(safe-area-inset-left))] deitado:h-12">
              <button
                ref={botaoFechar}
                type="button"
                onClick={pedirFechar}
                className="inline-flex min-h-toque shrink-0 items-center gap-1.5 rounded-md px-3 text-base font-bold text-[#EDEBE6] active:bg-[#262A31]"
              >
                <X size={22} strokeWidth={2.25} aria-hidden />
                Fechar
              </button>
              <h2 id={idTitulo} className="min-w-0 flex-1 text-center text-xl text-[#EDEBE6]">
                Assinatura
              </h2>
              {/* Contrapeso do "Fechar" para o titulo ficar no centro. */}
              <span aria-hidden className="w-[88px] shrink-0" />
            </div>
          </div>

          {/* Meio: papel branco com 24 px de margem dos lados. */}
          <div className={`flex min-h-0 flex-1 flex-col gap-2 pt-3 pb-3 ${margemLados} deitado:pt-2 deitado:pb-2`}>
            <p className="flex items-center gap-1.5 text-sm text-texto-suave deitado:hidden lg:hidden">
              <RotateCw size={18} strokeWidth={2.25} aria-hidden className="shrink-0" />
              Gire o celular para ter mais espaço.
            </p>
            <div
              ref={areaRef}
              className="relative min-h-[220px] flex-1 touch-none overflow-hidden rounded-lg border-2 border-borda-sutil bg-white select-none [-webkit-touch-callout:none] [-webkit-user-select:none] deitado:min-h-0"
            >
              <canvas
                ref={canvasRef}
                role="img"
                aria-label={rotuloArea}
                data-teste="canvas-assinatura"
                className="absolute inset-0 h-full w-full cursor-crosshair touch-none select-none"
                style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none", background: "transparent" }}
              />
              {/* Linha de base a 75 % da altura por cima do canvas (o papel branco e pintado nele); so desenho, nao pega toque nem sai no PNG. */}
              <div aria-hidden className="pointer-events-none absolute inset-x-4 top-[75%] flex items-end gap-2">
                <X size={20} strokeWidth={2.5} className="-mb-2.5 shrink-0 text-[#6B6F76]" />
                <span className="h-0.5 flex-1 bg-[#B9B4AA]" />
              </div>
            </div>
            <p className="text-sm font-bold text-texto">
              {nomeLimpo ? `Assinatura de ${nomeLimpo}` : "Assine dentro do quadro"}
            </p>
          </div>

          {/* Barra: Limpar (40 %) · Usar assinatura (60 %), ou a pergunta ao fechar. */}
          {confirmando ? (
            <div
              ref={caixaConfirmar}
              tabIndex={-1}
              role="alertdialog"
              aria-labelledby={idConfirmar}
              className={`flex shrink-0 flex-col gap-2 border-t-4 border-alerta bg-superficie pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] outline-none ${margemLados} deitado:flex-row deitado:flex-wrap deitado:items-center`}
            >
              <p id={idConfirmar} className="text-lg font-bold deitado:w-full">
                Guardar esta assinatura?
              </p>
              <Botao onClick={usar} disabled={exportando} aria-busy={exportando} className="deitado:flex-1">
                <Check size={22} strokeWidth={2.5} aria-hidden />
                {exportando ? "Guardando…" : "Usar assinatura"}
              </Botao>
              <Botao variante="secundario" onClick={() => setConfirmando(false)} className="deitado:flex-1">
                Continuar assinando
              </Botao>
              <button
                type="button"
                onClick={apagarEFechar}
                className="inline-flex min-h-toque items-center justify-center text-base font-bold text-erro-texto underline underline-offset-4 deitado:flex-1"
              >
                Apagar e fechar
              </button>
            </div>
          ) : (
            <div className="shrink-0 border-t-2 border-borda-sutil bg-superficie pt-1 pb-[calc(0.25rem+env(safe-area-inset-bottom))]">
              {(pequena || erro) && (
                <p
                  role="alert"
                  className={`flex items-start gap-1.5 pt-1 pb-1 text-base font-bold text-erro-texto ${margemLados}`}
                >
                  <CircleAlert size={20} strokeWidth={2.25} aria-hidden className="mt-0.5 shrink-0" />
                  {erro || "Assinatura muito pequena. Assine de novo, ocupando o quadro."}
                </p>
              )}
              <div
                className={`flex h-14 items-stretch gap-2 pr-[calc(1rem+env(safe-area-inset-right))] pl-[calc(1rem+env(safe-area-inset-left))]`}
              >
                <div className="flex w-2/5 shrink-0">
                  <Botao variante="secundario" onClick={limpar} disabled={!assinado || exportando}>
                    <Eraser size={20} strokeWidth={2.25} aria-hidden />
                    Limpar
                  </Botao>
                </div>
                <div className="flex min-w-0 flex-1">
                  <Botao onClick={usar} disabled={!assinado || exportando} aria-busy={exportando}>
                    <Check size={22} strokeWidth={2.5} aria-hidden />
                    {exportando ? "Guardando…" : "Usar assinatura"}
                  </Botao>
                </div>
              </div>
            </div>
          )}

          {desfazer && (
            <AvisoDesfazer
              key={desfazer.n}
              mensagem="Assinatura apagada."
              aoDesfazer={desfazerLimpar}
              aoSumir={() => setDesfazer(null)}
            />
          )}
        </div>
      )}
    </dialog>,
    document.body,
  );
}
