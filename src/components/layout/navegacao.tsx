"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  ClipboardList,
  Ellipsis,
  House,
  Search,
  Truck,
  User,
  Users,
  Contact,
  LogOut,
} from "lucide-react";
import type { Papel } from "@/lib/contexto";
import { sair } from "@/acoes/sessao";
import { APP_NAME } from "@/lib/brand";

type Item = { href: string; rotulo: string; icone: typeof House; ativoEm?: string[] };

const OS: Item = { href: "/os", rotulo: "OS", icone: ClipboardList, ativoEm: ["/os"] };
const OS_LATERAL: Item = { ...OS, rotulo: "Ordens de serviço" };

/** Barra inferior do celular (DESIGN 5.6, 6.2 e §10.2). */
const BARRA: Record<Papel, Item[]> = {
  dono: [
    { href: "/inicio", rotulo: "Início", icone: House },
    OS,
    { href: "/clientes", rotulo: "Clientes", icone: Contact },
    {
      href: "/mais",
      rotulo: "Mais",
      icone: Ellipsis,
      ativoEm: ["/mais", "/veiculos", "/catalogo", "/equipe", "/conta", "/placa"],
    },
  ],
  atendente: [
    OS,
    { href: "/clientes", rotulo: "Clientes", icone: Contact },
    { href: "/catalogo", rotulo: "Catálogo", icone: BookOpen },
    { href: "/mais", rotulo: "Mais", icone: Ellipsis, ativoEm: ["/mais", "/veiculos", "/placa", "/conta"] },
  ],
  mecanico: [
    { href: "/minhas-os", rotulo: "Minhas OS", icone: ClipboardList, ativoEm: ["/minhas-os", "/os", "/catalogo"] },
    { href: "/placa", rotulo: "Buscar placa", icone: Search },
    { href: "/conta", rotulo: "Conta", icone: User },
  ],
};

/** Menu lateral do desktop (>= 1024px). */
const LATERAL: Record<Papel, Item[]> = {
  dono: [
    { href: "/inicio", rotulo: "Início", icone: House },
    OS_LATERAL,
    { href: "/clientes", rotulo: "Clientes", icone: Contact },
    { href: "/veiculos", rotulo: "Veículos", icone: Truck },
    { href: "/placa", rotulo: "Buscar placa", icone: Search },
    { href: "/catalogo", rotulo: "Catálogo", icone: BookOpen },
    { href: "/equipe", rotulo: "Equipe", icone: Users },
    { href: "/conta", rotulo: "Conta", icone: User },
  ],
  atendente: [
    OS_LATERAL,
    { href: "/clientes", rotulo: "Clientes", icone: Contact },
    { href: "/veiculos", rotulo: "Veículos", icone: Truck },
    { href: "/placa", rotulo: "Buscar placa", icone: Search },
    { href: "/catalogo", rotulo: "Catálogo", icone: BookOpen },
    { href: "/conta", rotulo: "Conta", icone: User },
  ],
  mecanico: [
    { href: "/minhas-os", rotulo: "Minhas OS", icone: ClipboardList, ativoEm: ["/minhas-os", "/os"] },
    { href: "/placa", rotulo: "Buscar placa", icone: Search },
    { href: "/catalogo", rotulo: "Catálogo", icone: BookOpen },
    { href: "/conta", rotulo: "Conta", icone: User },
  ],
};

function estaAtivo(caminho: string, item: Item) {
  const bases = item.ativoEm ?? [item.href];
  return bases.some((b) => caminho === b || caminho.startsWith(`${b}/`));
}

export function Navegacao({ papel, oficina }: { papel: Papel; oficina: string | null }) {
  const caminho = usePathname();

  return (
    <>
      {/* Desktop: menu lateral fixo 240px */}
      <nav
        aria-label="Menu principal"
        className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col bg-grafite text-[#EDEBE6] lg:flex"
      >
        <div className="px-5 pb-4 pt-6">
          <p className="font-display text-2xl text-primaria">{APP_NAME}</p>
          {oficina && <p className="truncate text-sm text-[#B4B0A8]">{oficina}</p>}
        </div>
        <ul className="flex flex-1 flex-col gap-1">
          {LATERAL[papel].map((item) => {
            const ativo = estaAtivo(caminho, item);
            const Icone = item.icone;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={ativo ? "page" : undefined}
                  className={`relative flex h-12 items-center gap-3 px-5 text-lg font-bold transition-colors hover:bg-white/5 ${
                    ativo ? "text-primaria" : "text-[#B4B0A8]"
                  }`}
                >
                  {ativo && <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-primaria" />}
                  <Icone size={24} strokeWidth={2.25} aria-hidden />
                  {item.rotulo}
                </Link>
              </li>
            );
          })}
        </ul>
        <form action={sair} className="p-3">
          <button
            type="submit"
            className="flex h-12 w-full items-center gap-3 rounded-md px-2 text-lg font-bold text-[#B4B0A8] hover:bg-white/5"
          >
            <LogOut size={24} strokeWidth={2.25} aria-hidden />
            Sair
          </button>
        </form>
      </nav>

      {/* Celular/tablet: barra inferior 64px + safe area */}
      <nav
        aria-label="Menu principal"
        className="navegacao-inferior fixed inset-x-0 bottom-0 z-40 bg-grafite pb-[env(safe-area-inset-bottom)] shadow-barra lg:hidden"
      >
        <ul className="mx-auto flex h-barra max-w-[720px]">
          {BARRA[papel].map((item) => {
            const ativo = estaAtivo(caminho, item);
            const Icone = item.icone;
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={ativo ? "page" : undefined}
                  className={`relative flex h-full flex-col items-center justify-center gap-0.5 text-xs font-bold ${
                    ativo ? "text-primaria" : "text-[#B4B0A8]"
                  }`}
                >
                  {ativo && <span aria-hidden className="absolute inset-x-3 top-0 h-1 bg-primaria" />}
                  <Icone size={26} strokeWidth={2.25} aria-hidden />
                  {item.rotulo}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

/** Espaco reservado enquanto o papel carrega (evita pulo de layout). */
export function NavegacaoEsqueleto() {
  return (
    <>
      <div aria-hidden className="fixed inset-y-0 left-0 z-40 hidden w-60 bg-grafite lg:block" />
      <div aria-hidden className="navegacao-inferior fixed inset-x-0 bottom-0 z-40 bg-grafite pb-[env(safe-area-inset-bottom)] lg:hidden">
        <div className="h-barra" />
      </div>
    </>
  );
}
