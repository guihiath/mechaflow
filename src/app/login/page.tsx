import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Entrar",
};

export default function LoginPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-3xl font-bold tracking-tight">Entrar</h1>
      <p className="text-lg text-muted">Em breve.</p>
      <Link
        href="/"
        className="flex h-12 items-center justify-center rounded-app border border-border bg-surface px-6 font-semibold"
      >
        Voltar
      </Link>
    </main>
  );
}
