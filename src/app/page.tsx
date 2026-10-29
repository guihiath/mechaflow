import Image from "next/image";
import { BotaoLink } from "@/components/ui/botao";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))]">
      <div className="flex w-full max-w-[560px] flex-1 flex-col justify-center gap-3">
        <Image
          src="/icons/icon.svg"
          alt=""
          width={72}
          height={72}
          priority
          className="mb-3 rounded-lg"
        />
        <h1 className="text-4xl">{APP_NAME}</h1>
        <p className="text-lg text-texto-suave">{APP_TAGLINE}</p>
      </div>

      <div className="flex w-full max-w-[560px] flex-col gap-3">
        <BotaoLink href="/cadastro" variante="secundario">
          Criar conta da oficina
        </BotaoLink>
        <BotaoLink href="/login" variante="primario">
          Entrar
        </BotaoLink>
      </div>
    </main>
  );
}
