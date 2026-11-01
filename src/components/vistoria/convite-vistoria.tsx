"use client";

import { useState, useTransition } from "react";
import { ClipboardCheck } from "lucide-react";
import { iniciarVistoria } from "@/acoes/vistoria";
import { Botao } from "@/components/ui/botao";
import { Cartao } from "@/components/ui/estados";
import { CaixaMensagem } from "@/components/ui/formulario";

/**
 * Convite no fim do "Abrir OS" (DESIGN §12.2 a): aparece só na chegada (`?vistoria=oferecer`),
 * logo abaixo de "OS #1043 aberta.". "Depois" só fecha o convite; o cartão da vistoria continua.
 */
export function ConviteVistoria({ osId, obrigatoria }: { osId: string; obrigatoria: boolean }) {
  const [fechado, setFechado] = useState(false);
  const [erro, setErro] = useState<string>();
  const [abrindo, iniciar] = useTransition();
  if (fechado) return null;

  return (
    <Cartao faixa="bg-info">
      <div className="flex flex-col gap-2" data-teste="convite-vistoria">
        <h2 className="text-lg">Fazer a vistoria agora?</h2>
        <p className="text-base text-texto-suave">
          {obrigatoria
            ? "Esta oficina exige a vistoria: sem ela a OS não fica pronta nem é entregue."
            : "Com o motorista ainda aqui, ele assina na hora. Leva uns 4 minutos."}
        </p>
        {erro && <CaixaMensagem tipo="erro">{erro}</CaixaMensagem>}
        <Botao
          onClick={() => {
            setErro(undefined);
            iniciar(async () => {
              const r = await iniciarVistoria(osId);
              if (r?.erro) setErro(r.erro);
            });
          }}
          disabled={abrindo}
          aria-busy={abrindo}
          className="mt-1"
        >
          <ClipboardCheck size={22} strokeWidth={2.25} aria-hidden />
          {abrindo ? "Abrindo…" : "Fazer vistoria agora"}
        </Botao>
        <button
          type="button"
          onClick={() => setFechado(true)}
          className="inline-flex min-h-toque items-center justify-center rounded-md text-base font-bold text-texto-suave underline underline-offset-4"
        >
          Depois
        </button>
      </div>
    </Cartao>
  );
}
