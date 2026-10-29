import type { Metadata } from "next";
import Link from "next/link";
import { TelaSimples } from "@/components/layout/tela-simples";
import { FormLogin } from "./form-login";

export const metadata: Metadata = {
  title: "Entrar",
};

const link = "inline-flex min-h-toque items-center font-bold text-info-texto underline";

export default function LoginPage() {
  return (
    <TelaSimples titulo="Entrar" subtitulo="Use o e-mail e a senha da sua conta.">
      <FormLogin />
      <div className="flex flex-col gap-3 text-base">
        <div>
          <p className="font-bold">Dono esqueceu a senha?</p>
          <Link href="/esqueci-senha" className={link}>
            Esqueci minha senha
          </Link>
        </div>
        <p className="text-texto-suave">Funcionário esqueceu a senha: fale com o dono da oficina.</p>
        <div>
          <p>É dono de oficina e ainda não tem conta?</p>
          <Link href="/cadastro" className={link}>
            Criar conta da oficina
          </Link>
        </div>
        <p className="text-texto-suave">Funcionário: peça ao dono o link de convite.</p>
      </div>
    </TelaSimples>
  );
}
