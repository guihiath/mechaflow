import type { Metadata } from "next";
import { Suspense } from "react";
import { BookOpen, ClipboardList, Contact, PackageSearch, Truck, Users } from "lucide-react";
import { Cabecalho } from "@/components/layout/cabecalho";
import { Cartao, ListaCarregando, Pagina } from "@/components/ui/estados";
import { exigirContexto } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Início" };

export default function InicioPage() {
  return (
    <>
      <Cabecalho titulo="Início" />
      <Pagina larga>
        <Suspense fallback={<ListaCarregando linhas={4} />}>
          <Painel />
        </Suspense>
      </Pagina>
    </>
  );
}

async function Painel() {
  const ctx = await exigirContexto(["dono"]);
  const supabase = await createClient();

  const [clientes, veiculos, pendentes, equipe] = await Promise.all([
    supabase.from("clientes").select("id", { count: "exact", head: true }),
    supabase.from("veiculos").select("id", { count: "exact", head: true }),
    supabase
      .from("catalogo_pecas")
      .select("id", { count: "exact", head: true })
      .eq("pendente_precificacao", true)
      .eq("ativo", true),
    supabase.from("perfis").select("id", { count: "exact", head: true }).eq("ativo", true),
  ]);

  const n = (r: { count: number | null }) => r.count ?? 0;
  const qtdPendentes = n(pendentes);

  const atalhos = [
    { href: "/clientes", titulo: "Clientes", valor: n(clientes), icone: Contact },
    { href: "/veiculos", titulo: "Veículos", valor: n(veiculos), icone: Truck },
    { href: "/equipe", titulo: "Equipe ativa", valor: n(equipe), icone: Users },
    { href: "/catalogo", titulo: "Catálogo", valor: null, icone: BookOpen },
  ];

  return (
    <>
      <div>
        <p className="text-lg text-texto-suave">Olá, {ctx.perfil_nome}</p>
        <h2 className="text-3xl">{ctx.oficina_nome}</h2>
      </div>

      {qtdPendentes > 0 && (
        <Cartao href="/catalogo?aba=pecas&pendentes=1" faixa="bg-alerta">
          <div className="flex items-center gap-3">
            <PackageSearch size={28} strokeWidth={2.25} aria-hidden className="shrink-0 text-alerta-texto" />
            <div>
              <p className="text-lg font-bold">
                {qtdPendentes} {qtdPendentes === 1 ? "peça sem preço" : "peças sem preço"}
              </p>
              <p className="text-base text-texto-suave">Toque para definir preço e custo.</p>
            </div>
          </div>
        </Cartao>
      )}

      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {atalhos.map(({ href, titulo, valor, icone: Icone }) => (
          <li key={href}>
            <Cartao href={href} className="h-full">
              <Icone size={26} strokeWidth={2.25} aria-hidden className="text-texto-suave" />
              {valor !== null && <p className="mt-2 font-display text-4xl">{valor}</p>}
              <p className={`text-lg font-bold ${valor === null ? "mt-2" : ""}`}>{titulo}</p>
            </Cartao>
          </li>
        ))}
      </ul>

      <Cartao faixa="bg-superficie-2">
        <div className="flex items-start gap-3">
          <ClipboardList size={26} strokeWidth={2.25} aria-hidden className="shrink-0 text-texto-suave" />
          <div>
            <p className="text-lg font-bold">Ordens de serviço: em breve</p>
            <p className="text-base text-texto-suave">
              Abrir, executar e fechar OS chega na próxima fase. Já dá para cadastrar clientes, veículos, catálogo e
              equipe.
            </p>
          </div>
        </div>
      </Cartao>
    </>
  );
}
