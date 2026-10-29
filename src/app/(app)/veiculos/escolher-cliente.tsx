"use client";

import { useId, useMemo, useState } from "react";
import { CircleAlert, Search } from "lucide-react";
import { useErroCampo } from "@/components/ui/formulario";

type ClienteOpcao = { id: string; nome: string };

/**
 * Escolha do cliente com busca (DESIGN 5.3: lista grande = busca + itens de 56px).
 * Envia o id no campo oculto "cliente_id".
 */
export function EscolherCliente({ clientes, inicial }: { clientes: ClienteOpcao[]; inicial?: string | null }) {
  const id = useId();
  const erro = useErroCampo("cliente_id");
  const [selecionado, setSelecionado] = useState<string | null>(inicial ?? null);
  const [trocando, setTrocando] = useState(!inicial);
  const [busca, setBusca] = useState("");

  const atual = clientes.find((c) => c.id === selecionado);
  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const lista = termo ? clientes.filter((c) => c.nome.toLowerCase().includes(termo)) : clientes;
    return lista.slice(0, 8);
  }, [busca, clientes]);

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-sm font-bold">Cliente (dono do veículo)</legend>
      <input type="hidden" name="cliente_id" value={selecionado ?? ""} />

      {atual && !trocando ? (
        <div className="flex items-center gap-3 rounded-md border-2 border-borda bg-superficie p-3">
          <p className="flex-1 text-lg font-bold">{atual.nome}</p>
          <button
            type="button"
            onClick={() => setTrocando(true)}
            className="min-h-toque px-2 text-base font-bold text-info-texto underline"
          >
            Trocar
          </button>
        </div>
      ) : clientes.length === 0 ? (
        <p className="text-base text-texto-suave">Nenhum cliente cadastrado. Cadastre o cliente primeiro.</p>
      ) : (
        <>
          <div className="relative">
            <label htmlFor={id} className="sr-only">
              Buscar cliente
            </label>
            <Search size={22} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-texto-suave" />
            <input
              id={id}
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar cliente pelo nome"
              autoComplete="off"
              className={`h-[52px] w-full rounded-md border-2 bg-superficie pl-11 pr-3 text-lg outline-none focus:border-foco focus:ring-[3px] focus:ring-foco/30 ${
                erro ? "border-erro" : "border-borda"
              }`}
            />
          </div>
          <ul className="flex flex-col overflow-hidden rounded-md border border-borda-sutil bg-superficie">
            {filtrados.map((c) => (
              <li key={c.id} className="border-b border-borda-sutil last:border-b-0">
                <button
                  type="button"
                  onClick={() => {
                    setSelecionado(c.id);
                    setTrocando(false);
                  }}
                  aria-pressed={c.id === selecionado}
                  className={`flex min-h-14 w-full items-center px-4 text-left text-lg ${
                    c.id === selecionado ? "bg-primaria font-bold text-primaria-texto" : "active:bg-superficie-2"
                  }`}
                >
                  {c.nome}
                </button>
              </li>
            ))}
            {!filtrados.length && <li className="p-4 text-base text-texto-suave">Nenhum cliente com esse nome.</li>}
          </ul>
        </>
      )}

      {erro && (
        <p className="flex items-start gap-1.5 text-sm font-bold text-erro-texto">
          <CircleAlert size={18} strokeWidth={2.25} aria-hidden className="mt-0.5 shrink-0" />
          {erro}
        </p>
      )}
    </fieldset>
  );
}
