import type { Metadata } from "next";
import { BotaoLink } from "@/components/ui/botao";

export const metadata: Metadata = {
  title: "Entrar",
};

export default function LoginPage() {
  return (
    <main className="flex flex-1 flex-col px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))]">
      <div className="flex w-full max-w-[560px] flex-1 flex-col justify-center gap-3">
        <h1 className="text-3xl">Entrar</h1>
        <p className="text-lg text-texto-suave">
          Em breve. O acesso da oficina ainda está sendo preparado.
        </p>
      </div>

      <div className="w-full max-w-[560px]">
        <BotaoLink href="/" variante="secundario">
          Voltar ao início
        </BotaoLink>
      </div>
    </main>
  );
}
