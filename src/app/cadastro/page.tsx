import type { Metadata } from "next";
import Link from "next/link";
import { TelaSimples } from "@/components/layout/tela-simples";
import { FormOficina } from "@/components/auth/form-oficina";

export const metadata: Metadata = { title: "Criar conta da oficina" };

export default function CadastroPage() {
  return (
    <TelaSimples titulo="Criar conta da oficina" subtitulo="Você vai ser o dono. Depois convida a equipe pelo WhatsApp.">
      <FormOficina />
      <p className="text-base">
        Já tem conta?{" "}
        <Link href="/login" className="font-bold text-info-texto underline">
          Entrar
        </Link>
      </p>
      <p className="text-base text-texto-suave">
        Funcionário de oficina não cria conta aqui: peça ao dono o link de convite.
      </p>
    </TelaSimples>
  );
}
