import Form from "next/form";
import { Search } from "lucide-react";

/**
 * Busca por GET (?q=): funciona sem JavaScript e navega no cliente quando ha JS.
 * Campos extras (ex.: aba do catalogo) vao como hidden.
 */
export function Busca({
  acao,
  rotulo,
  valor,
  nome = "q",
  placa,
  extras,
}: {
  acao: string;
  rotulo: string;
  valor?: string;
  nome?: string;
  placa?: boolean;
  extras?: Record<string, string | undefined>;
}) {
  return (
    <Form action={acao} role="search" className="flex gap-2">
      {Object.entries(extras ?? {}).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <label className="sr-only" htmlFor={`busca-${nome}`}>
        {rotulo}
      </label>
      <input
        id={`busca-${nome}`}
        name={nome}
        type="search"
        defaultValue={valor}
        placeholder={rotulo}
        autoComplete="off"
        {...(placa ? { autoCapitalize: "characters", spellCheck: false } : {})}
        className={`h-[52px] min-w-0 flex-1 rounded-md border-2 border-borda bg-superficie px-3 text-lg text-texto outline-none placeholder:text-texto-suave focus:border-foco focus:ring-[3px] focus:ring-foco/30 ${
          placa ? "font-mono uppercase tracking-[0.08em]" : ""
        }`}
      />
      <button
        type="submit"
        className="flex h-[52px] shrink-0 items-center gap-2 rounded-md border-2 border-borda bg-superficie px-4 text-lg font-bold active:bg-superficie-2"
      >
        <Search size={22} strokeWidth={2.25} aria-hidden />
        <span className="sr-only sm:not-sr-only">Buscar</span>
      </button>
    </Form>
  );
}
