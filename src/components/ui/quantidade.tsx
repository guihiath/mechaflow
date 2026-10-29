"use client";

import { useId, useState } from "react";
import { CircleAlert, Minus, Plus } from "lucide-react";
import { useErroCampo } from "@/components/ui/formulario";
import { formatarQuantidade, textoParaQuantidade } from "@/lib/formato";

/**
 * Quantidade com [−] campo [+] (DESIGN §10.6). Botoes de 56x56, campo mono 24px,
 * aceita decimal com virgula (litro e quilo: "2,5"). Envia no formulario, em `name`,
 * o numero com ponto ("2.5"); vazio/invalido vai vazio e a Server Action recusa.
 */
export function Quantidade({
  rotulo = "Quantidade",
  name = "quantidade",
  valorInicial = 1,
  minimo = 1,
  passo = 1,
  decimal = true,
  unidade,
  erro: erroProp,
  aoMudar,
}: {
  rotulo?: string;
  name?: string;
  valorInicial?: number;
  /** 1 para un/par/jogo/kit; pode ser menor (ex.: 0,5) para litro/quilo/metro. */
  minimo?: number;
  passo?: number;
  /** false: so numeros inteiros (teclado numerico). */
  decimal?: boolean;
  /** Texto ao lado do campo: "litros", "un." */
  unidade?: string;
  erro?: string;
  /** Avisa o pai a cada mudanca (ex.: subtotal ao vivo). null = vazio ou invalido. */
  aoMudar?: (quantidade: number | null) => void;
}) {
  const id = useId();
  const erroForm = useErroCampo(name);
  const [texto, setTexto] = useState(formatarQuantidade(valorInicial));
  const valor = textoParaQuantidade(texto);
  const valido = typeof valor === "number" && Number.isFinite(valor) && valor >= minimo && (decimal || Number.isInteger(valor));
  const erroLocal = texto && !valido ? `Quantidade inválida. Use números. Ex.: ${decimal ? "2 ou 2,5" : "2"}` : undefined;
  const erro = erroProp ?? erroLocal ?? erroForm;

  function mudar(novoTexto: string) {
    setTexto(novoTexto);
    const n = textoParaQuantidade(novoTexto);
    aoMudar?.(typeof n === "number" && Number.isFinite(n) && n >= minimo ? n : null);
  }

  function somar(delta: number) {
    const atual = typeof valor === "number" && Number.isFinite(valor) ? valor : minimo;
    // Arredonda para nao acumular 0,1 + 0,2 = 0,30000000000000004.
    const novo = Math.max(minimo, Math.round((atual + delta) * 1000) / 1000);
    mudar(formatarQuantidade(novo));
  }

  const podeDiminuir = typeof valor === "number" && Number.isFinite(valor) && valor - passo >= minimo;
  const classeBotao =
    "inline-flex size-14 shrink-0 items-center justify-center rounded-md border-2 border-borda bg-superficie text-texto active:bg-superficie-2 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-bold text-texto">
        {rotulo}
      </label>
      <div className="flex items-center gap-2">
        <button type="button" aria-label="Diminuir" className={classeBotao} onClick={() => somar(-passo)} disabled={!podeDiminuir}>
          <Minus size={26} strokeWidth={2.5} aria-hidden />
        </button>
        <input
          id={id}
          value={texto}
          onChange={(e) => mudar(e.target.value.replace(decimal ? /[^\d.,]/g : /\D/g, ""))}
          inputMode={decimal ? "decimal" : "numeric"}
          autoComplete="off"
          aria-invalid={erro ? true : undefined}
          aria-describedby={erro ? `${id}-erro` : undefined}
          className={`h-14 w-24 min-w-0 rounded-md border-2 bg-superficie px-2 text-center font-mono text-2xl text-texto outline-none focus:border-foco focus:ring-[3px] focus:ring-foco/30 ${
            erro ? "border-erro" : "border-borda"
          }`}
        />
        <button type="button" aria-label="Aumentar" className={classeBotao} onClick={() => somar(passo)}>
          <Plus size={26} strokeWidth={2.5} aria-hidden />
        </button>
        {unidade && <span className="text-base font-bold text-texto-suave">{unidade}</span>}
      </div>
      <input type="hidden" name={name} value={valido && typeof valor === "number" ? String(valor) : ""} />
      {erro && (
        <p id={`${id}-erro`} className="flex items-start gap-1.5 text-sm font-bold text-erro-texto">
          <CircleAlert size={18} strokeWidth={2.25} aria-hidden className="mt-0.5 shrink-0" />
          {erro}
        </p>
      )}
    </div>
  );
}
