"use client";

import { useId, type ReactNode } from "react";
import { Check, CircleAlert } from "lucide-react";

/**
 * Botoes segmentados CONTROLADOS (mesmo visual do OpcoesBotoes, DESIGN 5.3).
 * Use quando o valor muda outras partes da tela (modo da OS, forma de pagamento,
 * aprovou/recusou). Envia o valor no formulario pelo `name` (radio nativo).
 * `valor` vazio = nenhum marcado (forca a pergunta, ex.: "Pago agora?").
 */
export function Escolha<T extends string>({
  rotulo,
  name,
  opcoes,
  valor,
  aoMudar,
  ajuda,
  erro,
  colunas,
  rotuloOculto,
}: {
  rotulo: string;
  name: string;
  opcoes: { valor: T; rotulo: ReactNode; desabilitado?: boolean }[];
  valor: T | "" | null | undefined;
  aoMudar: (valor: T) => void;
  ajuda?: ReactNode;
  erro?: string;
  /** Padrao: 3 opcoes = 3 colunas; resto = 2. */
  colunas?: 1 | 2 | 3;
  rotuloOculto?: boolean;
}) {
  const id = useId();
  const n = colunas ?? (opcoes.length === 3 ? 3 : 2);
  const grade = n === 1 ? "grid-cols-1" : n === 3 ? "grid-cols-3" : "grid-cols-2";
  return (
    <fieldset className="flex flex-col gap-1.5" aria-describedby={erro ? `${id}-erro` : ajuda ? `${id}-ajuda` : undefined}>
      <legend className={rotuloOculto ? "sr-only" : "mb-1.5 text-sm font-bold text-texto"}>{rotulo}</legend>
      <div className={`grid ${grade} gap-2`}>
        {opcoes.map((o) => {
          const ativo = o.valor === valor;
          return (
            <label
              key={o.valor}
              className={`flex min-h-toque items-center justify-center gap-1.5 rounded-md border-2 px-2 py-1 text-center text-base font-bold transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-foco ${
                o.desabilitado ? "cursor-not-allowed opacity-50" : "cursor-pointer"
              } ${
                ativo
                  ? "border-grafite bg-primaria text-primaria-texto"
                  : erro
                    ? "border-erro bg-superficie text-texto"
                    : "border-borda bg-superficie text-texto"
              }`}
            >
              <input
                type="radio"
                name={name}
                value={o.valor}
                checked={ativo}
                disabled={o.desabilitado}
                onChange={() => aoMudar(o.valor)}
                data-invalido={erro ? "true" : undefined}
                className="sr-only"
              />
              {ativo && <Check size={20} strokeWidth={2.5} aria-hidden className="shrink-0" />}
              {o.rotulo}
            </label>
          );
        })}
      </div>
      {ajuda && !erro && (
        <p id={`${id}-ajuda`} className="text-sm text-texto-suave">
          {ajuda}
        </p>
      )}
      {erro && (
        <p id={`${id}-erro`} className="flex items-start gap-1.5 text-sm font-bold text-erro-texto">
          <CircleAlert size={18} strokeWidth={2.25} aria-hidden className="mt-0.5 shrink-0" />
          {erro}
        </p>
      )}
    </fieldset>
  );
}
