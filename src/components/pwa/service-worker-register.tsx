"use client";

import { useEffect } from "react";

/**
 * Registra o service worker (public/sw.js).
 * So em producao: em `next dev` o cache atrapalha o hot reload.
 *
 * O navegador so procura SW novo ao abrir uma pagina. No icone instalado o app costuma voltar
 * de segundo plano sem abrir pagina nenhuma, entao a procura tambem roda ao voltar para a tela.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch((error) => {
        console.error("Falha ao registrar o service worker", error);
      });

    const aoVoltarParaTela = () => {
      if (document.visibilityState !== "visible") return;
      navigator.serviceWorker
        .getRegistration()
        .then((registro) => registro?.update())
        .catch(() => undefined); // sem internet: procura na proxima vez
    };
    document.addEventListener("visibilitychange", aoVoltarParaTela);
    return () => document.removeEventListener("visibilitychange", aoVoltarParaTela);
  }, []);

  return null;
}
