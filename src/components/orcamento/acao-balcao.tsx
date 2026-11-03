"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { classesBotao, classesFantasma } from "@/components/ui/botao";

/** Destino de uma ação do balcão: rota ou função. */
export type GatilhoAcao = string | (() => void);

/** Botão ou link, conforme o gatilho. `estilo`: fantasma (48 px, sublinhado) ou secundário (48 px). */
export function AcaoBalcao({
  gatilho,
  estilo = "fantasma",
  children,
  className = "",
}: {
  gatilho: GatilhoAcao;
  estilo?: "fantasma" | "secundario";
  children: ReactNode;
  className?: string;
}) {
  const classes = `${estilo === "fantasma" ? `${classesFantasma} self-start` : classesBotao("secundario", "h-toque!")} ${className}`;
  return typeof gatilho === "string" ? (
    <Link href={gatilho} className={classes}>
      {children}
    </Link>
  ) : (
    <button type="button" onClick={gatilho} className={classes}>
      {children}
    </button>
  );
}
