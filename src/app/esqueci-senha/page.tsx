import type { Metadata } from "next";
import { TelaSimples } from "@/components/layout/tela-simples";
import { BotaoLink } from "@/components/ui/botao";
import { FormEsqueciSenha } from "./form-esqueci-senha";

export const metadata: Metadata = { title: "Esqueci minha senha" };

export default function EsqueciSenhaPage() {
  return (
    <TelaSimples
      titulo="Esqueci minha senha"
      subtitulo="Digite o e-mail da sua conta. Mandamos um link para você criar uma senha nova."
    >
      <FormEsqueciSenha />
      <p className="text-base text-texto-suave">Funcionário: se esqueceu a senha, fale com o dono da oficina.</p>
      <BotaoLink href="/login" variante="secundario">
        Voltar para o login
      </BotaoLink>
    </TelaSimples>
  );
}
