import type { Metadata } from "next";
import Link from "next/link";
import { TelaSimples } from "@/components/layout/tela-simples";
import { FormLogin } from "./form-login";

export const metadata: Metadata = {
  title: "Entrar",
};

export default function LoginPage() {
  return (
    <TelaSimples titulo="Entrar" subtitulo="Use o e-mail e a senha da sua conta.">
      <FormLogin />
      <div className="flex flex-col gap-2 text-base">
        <p>
          É dono de oficina e ainda não tem conta?{" "}
          <Link href="/cadastro" className="font-bold text-info-texto underline">
            Criar conta da oficina
          </Link>
        </p>
        <p className="text-texto-suave">
          Funcionário: peça ao dono o link de convite. Esqueceu a senha? Fale com o dono da oficina.
        </p>
      </div>
    </TelaSimples>
  );
}
