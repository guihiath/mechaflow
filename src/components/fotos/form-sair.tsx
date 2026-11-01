"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { sair } from "@/acoes/sessao";
import { Botao } from "@/components/ui/botao";
import { fotos as nFotos } from "@/components/os/categorias-foto";
import { lerFila, pendente } from "@/lib/fotos/fila";
import { contarGuardados } from "@/lib/fotos/fila-db";
import { apagarRascunhosAoSair, contarRascunhosPendentes } from "@/lib/vistoria/rascunho";

type Aviso = { fotos: number; vistorias: number };

/**
 * Formulário "Sair" (DESIGN §11.7 e §12.14).
 * - Fotos guardadas no aparelho e ainda não enviadas: avisa; elas ficam no celular e enviam
 *   quando a pessoa entrar de novo (não são apagadas).
 * - Rascunhos da vistoria: os que já estão no banco são apagados do aparelho sem perguntar;
 *   se algum tem dado não enviado, avisa que sair APAGA esses dados ("Voltar e enviar" /
 *   "Sair e apagar").
 */
export function FormSair({ className, botaoClassName, children }: { className?: string; botaoClassName: string; children: ReactNode }) {
  const form = useRef<HTMLFormElement>(null);
  const confirmado = useRef(false);
  const usuario = useRef<string | null>(null);
  const seguro = useRef<HTMLButtonElement>(null);
  const botaoSair = useRef<HTMLButtonElement>(null);
  const abriu = useRef(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  // Abriu o aviso: foco no botão seguro. Fechou: volta para o "Sair".
  useEffect(() => {
    if (aviso) {
      abriu.current = true;
      seguro.current?.focus();
    } else if (abriu.current) {
      abriu.current = false;
      botaoSair.current?.focus();
    }
  }, [aviso]);

  function sairAgora(apagarPendentes: boolean) {
    if (usuario.current) apagarRascunhosAoSair(usuario.current, apagarPendentes);
    confirmado.current = true;
    form.current?.requestSubmit();
  }

  async function aoEnviar(e: React.FormEvent<HTMLFormElement>) {
    if (confirmado.current) return;
    const f = lerFila();
    const naMemoria = f.itens.filter((i) => i.usuarioId === f.usuarioId && pendente(i)).length;
    if (naMemoria === 0 && !f.usuarioId) return;
    e.preventDefault();
    usuario.current = f.usuarioId;
    const n = Math.max(naMemoria, f.usuarioId ? await contarGuardados(f.usuarioId) : 0);
    const vistorias = f.usuarioId ? contarRascunhosPendentes(f.usuarioId) : 0;
    if (n === 0 && vistorias === 0) {
      sairAgora(false);
      return;
    }
    setAviso({ fotos: n, vistorias });
  }

  const comVistoria = Boolean(aviso?.vistorias);
  const qtd = aviso?.fotos ?? 0;

  return (
    <form ref={form} action={sair} onSubmit={aoEnviar} className={className}>
      {aviso ? (
        <div
          role="alertdialog"
          aria-label={comVistoria ? "Há dados não enviados" : "Fotos não enviadas"}
          className="flex flex-col gap-3 rounded-lg border-2 border-alerta bg-superficie p-4 text-texto"
        >
          {comVistoria && (
            <p className="text-base">
              {aviso.vistorias === 1 ? "Uma vistoria tem dados" : `${aviso.vistorias} vistorias têm dados`} guardados só neste celular que ainda não
              foram enviados. Se sair, esses dados da vistoria são <strong>apagados do celular</strong> e se perdem. Para não perder, volte, abra a
              vistoria com internet e espere salvar.
            </p>
          )}
          {qtd > 0 &&
            (comVistoria ? (
              <p className="text-base">
                {qtd === 1 ? "A foto guardada" : `As ${nFotos(qtd)} guardadas`} que ainda não {qtd === 1 ? "foi enviada não é apagada" : "foram enviadas não são apagadas"}:{" "}
                {qtd === 1 ? "fica" : "ficam"} no celular e {qtd === 1 ? "envia" : "enviam"} quando você entrar de novo.
              </p>
            ) : (
              <p className="text-base">
                Você tem {nFotos(qtd)} {qtd === 1 ? "guardada que ainda não foi enviada" : "guardadas que ainda não foram enviadas"}. Se sair,{" "}
                {qtd === 1 ? "ela fica" : "elas ficam"} no celular e {qtd === 1 ? "envia" : "enviam"} quando você entrar de novo.
              </p>
            ))}
          <Botao ref={seguro} onClick={() => setAviso(null)}>
            {comVistoria ? "Voltar e enviar" : "Ficar"}
          </Botao>
          <Botao variante={comVistoria ? "perigo" : "secundario"} onClick={() => sairAgora(true)}>
            {comVistoria ? "Sair e apagar" : "Sair mesmo assim"}
          </Botao>
        </div>
      ) : (
        <button ref={botaoSair} type="submit" className={botaoClassName}>
          {children}
        </button>
      )}
    </form>
  );
}
