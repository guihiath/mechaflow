"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Campo } from "@/components/ui/campo";
import { Botao } from "@/components/ui/botao";

/** Aceita o link inteiro (https://.../convite/abc...) ou so o codigo de 64 caracteres. */
export function extrairToken(texto: string): string | null {
  const achado = texto.trim().toLowerCase().match(/([0-9a-f]{64})/);
  return achado ? achado[1] : null;
}

export function ColarConvite() {
  const router = useRouter();
  const [erro, setErro] = useState<string>();

  function aoEnviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const token = extrairToken(String(new FormData(e.currentTarget).get("link") ?? ""));
    if (!token) {
      setErro("Link de convite inválido. Copie o link inteiro da mensagem.");
      return;
    }
    router.push(`/convite/${token}`);
  }

  return (
    <form onSubmit={aoEnviar} noValidate className="flex flex-col gap-3">
      <Campo rotulo="Link do convite" name="link" autoComplete="off" autoCapitalize="none" erro={erro} />
      <Botao type="submit" variante="secundario">
        Abrir convite
      </Botao>
    </form>
  );
}
