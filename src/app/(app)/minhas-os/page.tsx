import type { Metadata } from "next";
import { Suspense } from "react";
import { BookOpen, ClipboardList, Search } from "lucide-react";
import { Cabecalho } from "@/components/layout/cabecalho";
import { Cartao, EstadoVazio, ListaCarregando, Pagina } from "@/components/ui/estados";
import { exigirContexto } from "@/lib/dal";

export const metadata: Metadata = { title: "Minhas OS" };

export default function MinhasOsPage() {
  return (
    <>
      <Cabecalho titulo="Minhas OS" />
      <Pagina>
        <Suspense fallback={<ListaCarregando />}>
          <Conteudo />
        </Suspense>
      </Pagina>
    </>
  );
}

async function Conteudo() {
  const ctx = await exigirContexto(["mecanico"]);
  return (
    <>
      <p className="text-lg text-texto-suave">
        Olá, {ctx.perfil_nome} · {ctx.oficina_nome}
      </p>
      <EstadoVazio
        icone={ClipboardList}
        titulo="Minhas OS (em breve)"
        texto="Quando o dono passar um serviço para você, ele vai aparecer aqui."
      />
      <ul className="grid gap-3 sm:grid-cols-2">
        <li>
          <Cartao href="/placa">
            <div className="flex items-center gap-3">
              <Search size={26} strokeWidth={2.25} aria-hidden />
              <div>
                <p className="text-lg font-bold">Buscar placa</p>
                <p className="text-base text-texto-suave">Ver veículo e cliente</p>
              </div>
            </div>
          </Cartao>
        </li>
        <li>
          <Cartao href="/catalogo">
            <div className="flex items-center gap-3">
              <BookOpen size={26} strokeWidth={2.25} aria-hidden />
              <div>
                <p className="text-lg font-bold">Catálogo</p>
                <p className="text-base text-texto-suave">Serviços e peças da oficina</p>
              </div>
            </div>
          </Cartao>
        </li>
      </ul>
    </>
  );
}
