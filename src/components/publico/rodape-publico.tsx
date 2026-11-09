import Link from "next/link";

const LINK = "inline-flex min-h-toque items-center text-base font-bold text-info-texto underline underline-offset-4";

/** Rodapé da página inicial (DESIGN §15.2.2): links empilhados no celular, lado a lado a partir de 640 px. */
export function RodapePublico() {
  return (
    <footer className="flex flex-col gap-2 border-t border-borda-sutil pt-4">
      <nav aria-label="Documentos" className="flex flex-col gap-2 sm:flex-row sm:gap-6">
        <Link href="/termos" className={LINK}>
          Termos de uso
        </Link>
        <Link href="/privacidade" className={LINK}>
          Política de privacidade
        </Link>
      </nav>
      <p className="text-xs text-texto-suave">MechaFlow · 2026</p>
    </footer>
  );
}
