"use client";

import { useId, useState, type ComponentProps, type ReactNode } from "react";
import { ChevronDown, CircleAlert } from "lucide-react";
import { useErroCampo } from "@/components/ui/formulario";
import { formatarDocumento, formatarPlaca, formatarTelefone, normalizarPlaca } from "@/lib/formato";

/**
 * Campos base (DESIGN.md 5.2 e 5.3): rotulo acima, 52px, borda 2px,
 * erro com icone + texto (nunca so a borda vermelha).
 */
const classeEntrada =
  "h-[52px] w-full rounded-md border-2 bg-superficie px-3 text-lg text-texto outline-none transition-colors focus:border-foco focus:ring-[3px] focus:ring-foco/30 disabled:opacity-60";

type Base = {
  rotulo: string;
  ajuda?: ReactNode;
  /** Erro vindo do componente pai (sobrepoe o erro do formulario). */
  erro?: string;
  opcional?: boolean;
};

function Moldura({
  id,
  rotulo,
  ajuda,
  erro,
  opcional,
  children,
}: Base & { id: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-bold text-texto">
        {rotulo}
        {opcional && <span className="font-medium text-texto-suave"> (opcional)</span>}
      </label>
      {children}
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
    </div>
  );
}

function useCampo(nome: string | undefined, erroProp?: string) {
  const id = useId();
  const erroForm = useErroCampo(nome);
  const erro = erroProp ?? erroForm;
  return {
    id,
    erro,
    aria: {
      "aria-invalid": erro ? true : undefined,
      "aria-describedby": erro ? `${id}-erro` : `${id}-ajuda`,
    } as const,
    borda: erro ? "border-erro" : "border-borda",
  };
}

type CampoProps = Base & Omit<ComponentProps<"input">, "id">;

export function Campo({ rotulo, ajuda, erro: erroProp, opcional, className, ...props }: CampoProps) {
  const { id, erro, aria, borda } = useCampo(props.name, erroProp);
  return (
    <Moldura id={id} rotulo={rotulo} ajuda={ajuda} erro={erro} opcional={opcional}>
      <input id={id} {...aria} className={`${classeEntrada} ${borda} ${className ?? ""}`} {...props} />
    </Moldura>
  );
}

type AreaProps = Base & Omit<ComponentProps<"textarea">, "id">;

export function AreaTexto({ rotulo, ajuda, erro: erroProp, opcional, ...props }: AreaProps) {
  const { id, erro, aria, borda } = useCampo(props.name, erroProp);
  return (
    <Moldura id={id} rotulo={rotulo} ajuda={ajuda} erro={erro} opcional={opcional}>
      <textarea
        id={id}
        rows={3}
        {...aria}
        className={`min-h-[104px] w-full rounded-md border-2 bg-superficie p-3 text-lg text-texto outline-none focus:border-foco focus:ring-[3px] focus:ring-foco/30 ${borda}`}
        {...props}
      />
    </Moldura>
  );
}

type SelecaoProps = Base & Omit<ComponentProps<"select">, "id"> & { opcoes: { valor: string; rotulo: string }[] };

/** Select nativo (6 a 15 opcoes). */
export function Selecao({ rotulo, ajuda, erro: erroProp, opcional, opcoes, ...props }: SelecaoProps) {
  const { id, erro, aria, borda } = useCampo(props.name, erroProp);
  return (
    <Moldura id={id} rotulo={rotulo} ajuda={ajuda} erro={erro} opcional={opcional}>
      <div className="relative">
        <select id={id} {...aria} className={`${classeEntrada} ${borda} appearance-none pr-11`} {...props}>
          {opcoes.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.rotulo}
            </option>
          ))}
        </select>
        <ChevronDown
          size={22}
          strokeWidth={2.25}
          aria-hidden
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-texto-suave"
        />
      </div>
    </Moldura>
  );
}

type OpcoesBotoesProps = Base & {
  name: string;
  opcoes: { valor: string; rotulo: string }[];
  valorInicial?: string;
};

/** Ate 5 opcoes: botoes segmentados (cada um >= 48px). */
export function OpcoesBotoes({ rotulo, ajuda, erro: erroProp, name, opcoes, valorInicial }: OpcoesBotoesProps) {
  const erroForm = useErroCampo(name);
  const erro = erroProp ?? erroForm;
  const [valor, setValor] = useState(valorInicial ?? opcoes[0]?.valor);
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-bold text-texto">{rotulo}</legend>
      <div className="grid grid-cols-2 gap-2">
        {opcoes.map((o) => {
          const ativo = o.valor === valor;
          return (
            <label
              key={o.valor}
              className={`flex min-h-toque cursor-pointer items-center justify-center rounded-md border-2 px-3 text-center text-base font-bold transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-foco ${
                ativo ? "border-grafite bg-primaria text-primaria-texto" : "border-borda bg-superficie text-texto"
              }`}
            >
              <input
                type="radio"
                name={name}
                value={o.valor}
                checked={ativo}
                onChange={() => setValor(o.valor)}
                className="sr-only"
              />
              {o.rotulo}
            </label>
          );
        })}
      </div>
      {ajuda && !erro && <p className="text-sm text-texto-suave">{ajuda}</p>}
      {erro && <p className="text-sm font-bold text-erro-texto">{erro}</p>}
    </fieldset>
  );
}

type CaixaMarcarProps = Omit<ComponentProps<"input">, "type" | "id"> & { children: ReactNode; erro?: string };

/** Checkbox com area de toque de 48px. */
export function CaixaMarcar({ children, erro: erroProp, ...props }: CaixaMarcarProps) {
  const id = useId();
  const erroForm = useErroCampo(props.name);
  const erro = erroProp ?? erroForm;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex min-h-toque items-start gap-3">
        <input
          id={id}
          type="checkbox"
          aria-invalid={erro ? true : undefined}
          className="mt-0.5 size-7 shrink-0 cursor-pointer accent-[#14161A]"
          {...props}
        />
        <label htmlFor={id} className="cursor-pointer pt-0.5 text-base">
          {children}
        </label>
      </div>
      {erro && (
        <p className="flex items-start gap-1.5 text-sm font-bold text-erro-texto">
          <CircleAlert size={18} strokeWidth={2.25} aria-hidden className="mt-0.5 shrink-0" />
          {erro}
        </p>
      )}
    </div>
  );
}

// ------------------------------------------------------------- campos com mascara

type Mascarado = Omit<Base, "rotulo"> & { rotulo?: string } & Omit<ComponentProps<"input">, "id" | "value" | "defaultValue" | "onChange"> & { valorInicial?: string | null };

/** Placa: IBM Plex Mono 24px, maiusculas, aceita com/sem traco. Envia normalizada. */
export function CampoPlaca({ rotulo = "Placa", ajuda, erro: erroProp, valorInicial, name = "placa", ...props }: Mascarado) {
  const { id, erro, aria, borda } = useCampo(name, erroProp);
  const [valor, setValor] = useState(formatarPlaca(valorInicial));
  return (
    <Moldura id={id} rotulo={rotulo} ajuda={ajuda ?? "Antiga (ABC-1234) ou Mercosul (ABC1D23)."} erro={erro}>
      <input
        id={id}
        {...aria}
        value={valor}
        onChange={(e) => setValor(formatarPlaca(e.target.value))}
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        maxLength={8}
        inputMode="text"
        className={`${classeEntrada} ${borda} font-mono text-2xl uppercase tracking-[0.08em]`}
        {...props}
      />
      <input type="hidden" name={name} value={normalizarPlaca(valor)} />
    </Moldura>
  );
}

export function CampoTelefone({ rotulo = "Telefone", valorInicial, name = "telefone", ...props }: Mascarado) {
  const [valor, setValor] = useState(formatarTelefone(valorInicial));
  return (
    <Campo
      rotulo={rotulo}
      name={name}
      type="tel"
      inputMode="tel"
      autoComplete="tel-national"
      value={valor}
      onChange={(e) => setValor(formatarTelefone(e.target.value))}
      placeholder="(11) 98888-7777"
      {...props}
    />
  );
}

export function CampoDocumento({ rotulo = "CPF ou CNPJ", valorInicial, name = "documento", ...props }: Mascarado) {
  const [valor, setValor] = useState(formatarDocumento(valorInicial));
  return (
    <Campo
      rotulo={rotulo}
      name={name}
      inputMode="numeric"
      autoComplete="off"
      value={valor}
      onChange={(e) => setValor(formatarDocumento(e.target.value))}
      {...props}
    />
  );
}

/** Dinheiro: digita em reais ("1.234,56"); a Server Action converte para centavos. */
export function CampoDinheiro({ rotulo = "Valor (R$)", valorInicial, ...props }: Mascarado) {
  const [valor, setValor] = useState(valorInicial ?? "");
  return (
    <Campo
      rotulo={rotulo}
      inputMode="decimal"
      autoComplete="off"
      value={valor}
      onChange={(e) => setValor(e.target.value.replace(/[^\d.,]/g, ""))}
      placeholder="0,00"
      className="font-mono"
      {...props}
    />
  );
}
