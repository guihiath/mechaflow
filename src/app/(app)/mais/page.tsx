import type { Metadata } from "next";
import { Suspense } from "react";
import { BookOpen, ChevronRight, Search, Truck, User, Users } from "lucide-react";
import { Cabecalho } from "@/components/layout/cabecalho";
import { Cartao, ListaCarregando, Pagina } from "@/components/ui/estados";
import { exigirContexto } from "@/lib/dal";

export const metadata: Metadata = { title: "Mais" };

const VEICULOS = { href: "/veiculos", titulo: "Veículos", texto: "Cadastro de caminhões e placas", icone: Truck };
const PLACA = { href: "/placa", titulo: "Buscar placa", texto: "Achar veículo pelo número da placa", icone: Search };
const CONTA = { href: "/conta", titulo: "Conta", texto: "Seus dados e sair", icone: User };

/** DESIGN §10.2: o dono ve tudo; o atendente so o que pode usar. */
const ITENS = {
  dono: [
    VEICULOS,
    PLACA,
    { href: "/catalogo", titulo: "Catálogo", texto: "Serviços e peças, preços e custos", icone: BookOpen },
    { href: "/equipe", titulo: "Equipe", texto: "Convidar, desativar, mudar papel", icone: Users },
    CONTA,
  ],
  atendente: [VEICULOS, PLACA, CONTA],
};

export default function MaisPage() {
  return (
    <>
      <Cabecalho titulo="Mais" />
      <Pagina>
        <Suspense fallback={<ListaCarregando linhas={4} />}>
          <Lista />
        </Suspense>
      </Pagina>
    </>
  );
}

async function Lista() {
  const ctx = await exigirContexto(["dono", "atendente"]);
  return (
    <ul className="flex flex-col gap-3">
      {ITENS[ctx.papel === "dono" ? "dono" : "atendente"].map(({ href, titulo, texto, icone: Icone }) => (
        <li key={href}>
          <Cartao href={href}>
            <div className="flex min-h-12 items-center gap-3">
              <Icone size={26} strokeWidth={2.25} aria-hidden className="shrink-0" />
              <div className="flex-1">
                <p className="text-lg font-bold">{titulo}</p>
                <p className="text-base text-texto-suave">{texto}</p>
              </div>
              <ChevronRight size={24} aria-hidden className="text-texto-suave" />
            </div>
          </Cartao>
        </li>
      ))}
    </ul>
  );
}
