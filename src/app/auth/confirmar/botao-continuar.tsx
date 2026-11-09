"use client";

import { useFormStatus } from "react-dom";
import { BotaoEnviar } from "@/components/ui/formulario";

/** Funciona também sem JavaScript: o formulário é um POST comum para a Server Action. */
export function BotaoContinuar({ rotulo }: { rotulo: string }) {
  const { pending } = useFormStatus();
  return <BotaoEnviar enviando={pending} rotulo={rotulo} rotuloEnviando="Abrindo…" />;
}
