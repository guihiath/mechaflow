"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

/**
 * "A câmera não abre?" (DESIGN §11.11): o app não sabe se a permissão foi negada (a câmera
 * é a do sistema), então explica o caminho nos Ajustes. Abre sozinha se a pessoa voltar da
 * câmera sem foto 2 vezes em menos de 1 minuto (evento `cancel` do input, Safari 16.4+).
 */
export function AjudaCamera({ idCamera }: { idCamera: string }) {
  const [aberta, setAberta] = useState(false);
  const idTexto = useId();
  const cancelamentos = useRef<number[]>([]);

  useEffect(() => {
    const input = document.getElementById(idCamera);
    if (!input) return;
    const aoCancelar = () => {
      const agora = Date.now();
      cancelamentos.current = [...cancelamentos.current.filter((t) => agora - t < 60_000), agora];
      if (cancelamentos.current.length >= 2) setAberta(true);
    };
    input.addEventListener("cancel", aoCancelar);
    return () => input.removeEventListener("cancel", aoCancelar);
  }, [idCamera]);

  return (
    <div className="pointer-fine:hidden">
      <button
        type="button"
        aria-expanded={aberta}
        aria-controls={idTexto}
        onClick={() => setAberta((a) => !a)}
        className="inline-flex min-h-toque items-center gap-1 text-base font-bold text-info-texto underline underline-offset-4"
      >
        A câmera não abre?
        <ChevronDown size={20} strokeWidth={2.25} aria-hidden className={aberta ? "rotate-180" : ""} />
      </button>
      {aberta && (
        <div id={idTexto} className="flex flex-col gap-2 rounded-md bg-superficie-2 p-3 text-base">
          <p>
            No iPhone: abra <strong>Ajustes › Safari › Câmera</strong> e escolha <strong>Permitir</strong>. Se instalou o MechaFlow na tela
            de início, feche o app e abra de novo depois de mudar.
          </p>
          <p>
            Enquanto isso, use <strong>Da galeria</strong>: tire a foto com a câmera do celular e escolha aqui.
          </p>
        </div>
      )}
    </div>
  );
}
