"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { FaixaEnvioFotos } from "@/components/os/faixa-envio-fotos";
import { emAndamento, iniciarFila, tentarDeNovo } from "@/lib/fotos/fila";
import { useFila, useSituacaoEnvio } from "./usar-fila";

/**
 * Fila de fotos em qualquer tela do app (DESIGN §11.7): ao abrir o app com fotos guardadas
 * do usuário logado, retoma o envio; fora da OS daquelas fotos mostra a faixa
 * "Enviando 2 fotos guardadas (OS #1042)…". Avisa ao fechar a aba com envio pendente
 * (o iPhone pode não mostrar o aviso; por isso a fila fica guardada no aparelho).
 */
export function FilaFotosGlobal({ usuarioId }: { usuarioId: string }) {
  const fila = useFila();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    void iniciarFila(usuarioId);
  }, [usuarioId]);

  const pendente = fila.usuarioId === usuarioId && fila.itens.some((i) => i.usuarioId === usuarioId && emAndamento(i));
  useEffect(() => {
    if (!pendente) return;
    const aoSair = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", aoSair);
    return () => window.removeEventListener("beforeunload", aoSair);
  }, [pendente]);

  // Na tela da própria OS quem mostra a faixa é a seção Fotos.
  const fora = (osId: string) => !pathname.startsWith(`/os/${osId}`);
  const deFora = fila.itens.filter((i) => i.usuarioId === usuarioId && i.categoria !== null && fora(i.osId));
  const primeira = deFora[0];
  const { situacao, zerar } = useSituacaoEnvio(fila.itens, (i) => i.usuarioId === usuarioId && fora(i.osId), primeira?.numeroOS ?? null);

  // No detalhe de uma OS a faixa da seção Fotos ocupa o mesmo lugar: não empilha duas.
  if (!situacao || !primeira || /^\/os\/[0-9a-f-]{36}/i.test(pathname)) return null;
  return (
    <FaixaEnvioFotos
      situacao={situacao}
      aoTentarDeNovo={() => tentarDeNovo(deFora.map((i) => i.id))}
      aoTocar={() => router.push(`/os/${primeira.osId}`)}
      aoSumir={zerar}
    />
  );
}
