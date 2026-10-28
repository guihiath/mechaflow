import Image from "next/image";
import Link from "next/link";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col justify-between px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(3rem,env(safe-area-inset-top))]">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4">
        <Image
          src="/icons/icon.svg"
          alt=""
          width={72}
          height={72}
          priority
          className="rounded-app"
        />
        <h1 className="text-4xl font-bold tracking-tight">{APP_NAME}</h1>
        <p className="text-lg text-muted">{APP_TAGLINE}</p>
      </div>

      <div className="mx-auto w-full max-w-md">
        <Link
          href="/login"
          className="flex h-14 w-full items-center justify-center rounded-app bg-primary text-lg font-semibold text-primary-foreground transition-opacity active:opacity-80"
        >
          Entrar
        </Link>
      </div>
    </main>
  );
}
