import type { Metadata } from "next";
import { TelaSimples } from "@/components/layout/tela-simples";
import { BotaoLink } from "@/components/ui/botao";

export const metadata: Metadata = { title: "Não encontrado" };

export default function NaoEncontrado() {
  return (
    <TelaSimples titulo="Não encontrado" subtitulo="Este cadastro ou página não existe, ou foi excluído.">
      <BotaoLink href="/entrar">Voltar ao início</BotaoLink>
    </TelaSimples>
  );
}
