"use client";

import { useRef, useState, type ReactNode } from "react";
import { sair } from "@/acoes/sessao";
import { Botao } from "@/components/ui/botao";
import { fotos as nFotos } from "@/components/os/categorias-foto";
import { lerFila, pendente } from "@/lib/fotos/fila";
import { contarGuardados } from "@/lib/fotos/fila-db";
import { temRascunhoPendente } from "@/lib/vistoria/rascunho";

/**
 * Formulário "Sair" que avisa antes se há fotos guardadas no aparelho que ainda não foram
 * enviadas (DESIGN §11.7). Elas ficam no celular e enviam quando a pessoa entrar de novo.
 */
export function FormSair({ className, botaoClassName, children }: { className?: string; botaoClassName: string; children: ReactNode }) {
  const form = useRef<HTMLFormElement>(null);
  const confirmado = useRef(false);
  const [aviso, setAviso] = useState(0);
  const [vistoria, setVistoria] = useState(false);
  const [soVistoria, setSoVistoria] = useState(false);

  async function aoEnviar(e: React.FormEvent<HTMLFormElement>) {
    if (confirmado.current) return;
    const f = lerFila();
    const naMemoria = f.itens.filter((i) => i.usuarioId === f.usuarioId && pendente(i)).length;
    if (naMemoria === 0 && !f.usuarioId) return;
    e.preventDefault();
    const n = Math.max(naMemoria, f.usuarioId ? await contarGuardados(f.usuarioId) : 0);
    // Vistoria com mudança só no aparelho (DESIGN §12.14): salva quando a pessoa voltar à vistoria.
    const comVistoria = f.usuarioId ? temRascunhoPendente(f.usuarioId) : false;
    if (n === 0 && !comVistoria) {
      confirmado.current = true;
      form.current?.requestSubmit();
      return;
    }
    setVistoria(comVistoria);
    setAviso(Math.max(n, 1));
    setSoVistoria(n === 0);
  }

  return (
    <form ref={form} action={sair} onSubmit={aoEnviar} className={className}>
      {aviso > 0 ? (
        <div role="alertdialog" aria-label="Fotos não enviadas" className="flex flex-col gap-3 rounded-lg border-2 border-alerta bg-superficie p-4 text-texto">
          {vistoria && (
            <p className="text-base">
              Você tem uma vistoria com mudanças guardadas neste celular que ainda não foram salvas. Se sair, elas ficam no celular e são salvas
              quando você entrar de novo e abrir a vistoria.
            </p>
          )}
          <p className={soVistoria ? "hidden" : "text-base"}>
            Você tem {nFotos(aviso)} {aviso === 1 ? "guardada que ainda não foi enviada" : "guardadas que ainda não foram enviadas"}. Se sair,{" "}
            {aviso === 1 ? "ela fica" : "elas ficam"} no celular e {aviso === 1 ? "envia" : "enviam"} quando você entrar de novo.
          </p>
          <Botao onClick={() => setAviso(0)}>Ficar</Botao>
          <Botao
            variante="secundario"
            onClick={() => {
              confirmado.current = true;
              form.current?.requestSubmit();
            }}
          >
            Sair mesmo assim
          </Botao>
        </div>
      ) : (
        <button type="submit" className={botaoClassName}>
          {children}
        </button>
      )}
    </form>
  );
}
