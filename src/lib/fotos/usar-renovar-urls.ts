"use client";

import { useEffect, useRef } from "react";
import { RENOVAR_URL_FOTO_MS } from "./regras";

/** Sem sucesso na renovação (sem internet, erro): tenta de novo neste intervalo. */
const TENTAR_DE_NOVO_MS = 60_000;

/**
 * Mantém válidas as URLs assinadas (15 min) de uma tela que pode ficar aberta muito tempo (F8-P2).
 * `assinadasEm` = quando as URLs atuais foram assinadas (ms); `null` = nada a renovar agora.
 * Chama `renovar` 2 min antes de vencer (na hora, se já estiver vencendo), ao voltar para a
 * aba/app (o celular segura o timer com a tela apagada) e quando a internet volta. Quem renova
 * deve trocar `assinadasEm`; enquanto não troca (falhou), tenta de novo a cada 1 min.
 *
 * Relógio: o primeiro `assinadasEm` pode vir do servidor; depois de uma renovação pedida aqui,
 * a contagem usa o relógio do aparelho a partir da resposta. Assim um celular com a hora errada
 * renova no máximo uma vez a mais, em vez de pedir de novo a cada resposta.
 */
export function useRenovarUrlsAssinadas(assinadasEm: number | null, renovar: () => void | Promise<unknown>) {
  const renovarRef = useRef(renovar);
  const pediuRenovacao = useRef(false);
  useEffect(() => {
    renovarRef.current = renovar;
  });

  useEffect(() => {
    if (assinadasEm === null) return;
    const base = pediuRenovacao.current ? Date.now() : assinadasEm;
    pediuRenovacao.current = false;
    let t: ReturnType<typeof setTimeout> | undefined;
    const agendar = (ms: number) => {
      if (t) clearTimeout(t);
      t = setTimeout(tentar, ms);
    };
    function tentar() {
      // Agenda a próxima antes: se a renovação der certo, `assinadasEm` muda e o efeito limpa este timer.
      agendar(TENTAR_DE_NOVO_MS);
      pediuRenovacao.current = true;
      void Promise.resolve(renovarRef.current()).catch(() => {});
    }
    const aoVoltar = () => {
      if (document.visibilityState === "visible" && Date.now() - base >= RENOVAR_URL_FOTO_MS) tentar();
    };
    const falta = base + RENOVAR_URL_FOTO_MS - Date.now();
    if (falta <= 0) tentar();
    else agendar(falta);
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("online", aoVoltar);
    window.addEventListener("pageshow", aoVoltar);
    return () => {
      if (t) clearTimeout(t);
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("online", aoVoltar);
      window.removeEventListener("pageshow", aoVoltar);
    };
  }, [assinadasEm]);
}
