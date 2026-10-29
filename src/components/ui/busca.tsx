import Form from "next/form";
import { Search } from "lucide-react";

/**
 * Busca por GET (?q=): funciona sem JavaScript e navega no cliente quando ha JS.
 * Botao sempre com texto "Buscar" (acao importante nunca so com icone, DESIGN 1).
 * Campos extras (ex.: aba do catalogo) vao como hidden.
 */
export function Busca({
  acao,
  rotulo,
  rotuloVisivel,
  valor,
  nome = "q",
  placa,
  extras,
}: {
  acao: string;
  /** Placeholder / rotulo para leitor de tela. */
  rotulo: string;
  /** Rotulo visivel acima do campo (DESIGN 5.2). */
  rotuloVisivel?: string;
  valor?: string;
  nome?: string;
  placa?: boolean;
  extras?: Record<string, string | undefined>;
}) {
  const id = `busca-${nome}`;
  return (
    <Form action={acao} role="search" className="flex flex-col gap-1.5">
      {Object.entries(extras ?? {}).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <label className={rotuloVisivel ? "text-sm font-bold" : "sr-only"} htmlFor={id}>
        {rotuloVisivel ?? rotulo}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          name={nome}
          type="search"
          defaultValue={valor}
          placeholder={rotulo}
          autoComplete="off"
          enterKeyHint="search"
          {...(placa
            ? { autoCapitalize: "characters", autoCorrect: "off", spellCheck: false, maxLength: 8, inputMode: "text" as const }
            : {})}
          className={`h-[52px] min-w-0 flex-1 rounded-md border-2 border-borda bg-superficie px-3 text-lg text-texto outline-none placeholder:text-texto-suave focus:border-foco focus:ring-[3px] focus:ring-foco/30 ${
            placa ? "font-mono uppercase tracking-[0.08em]" : ""
          }`}
        />
        <button
          type="submit"
          className="flex h-[52px] shrink-0 items-center gap-2 rounded-md border-2 border-borda bg-superficie px-4 text-lg font-bold active:bg-superficie-2"
        >
          <Search size={22} strokeWidth={2.25} aria-hidden />
          Buscar
        </button>
      </div>
    </Form>
  );
}
