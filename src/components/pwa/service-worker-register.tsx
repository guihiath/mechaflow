"use client";

import { useEffect } from "react";

/**
 * Registra o service worker (public/sw.js).
 * So em producao: em `next dev` o cache atrapalha o hot reload.
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
  }, []);

  return null;
}
