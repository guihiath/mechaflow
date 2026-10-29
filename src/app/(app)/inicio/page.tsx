import type { Metadata } from "next";
import { Suspense } from "react";
import { BookOpen, CircleCheckBig, Clock, Contact, PackageSearch, Plus, Truck, Users, Wrench } from "lucide-react";
import { Cabecalho } from "@/components/layout/cabecalho";
import { BotaoLink } from "@/components/ui/botao";
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

  const [clientes, veiculos, pendentes, equipe, abertas] = await Promise.all([
    supabase.from("clientes").select("id", { count: "exact", head: true }),
    supabase.from("veiculos").select("id", { count: "exact", head: true }),
    supabase
      .from("catalogo_pecas")
      .select("id", { count: "exact", head: true })
      .eq("pendente_precificacao", true)
      .eq("ativo", true),
    supabase.from("perfis").select("id", { count: "exact", head: true }).eq("ativo", true),
    supabase.from("ordens_servico").select("status").in("status", ["aguardando_orcamento", "orcamento_enviado", "em_andamento", "pronta"]).limit(5000),
  ]);
  const contar = (...st: string[]) => (abertas.data ?? []).filter((o) => st.includes(o.status)).length;
  const atalhosOS = [
    { href: "/os?status=prontas", titulo: "Prontas para entregar", valor: contar("pronta"), icone: CircleCheckBig },
    { href: "/os?status=orcamento", titulo: "Esperando o cliente", valor: contar("aguardando_orcamento", "orcamento_enviado"), icone: Clock },
    { href: "/os?status=em_andamento", titulo: "Em andamento", valor: contar("em_andamento"), icone: Wrench },
  ];

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

      <BotaoLink href="/os/nova" className="lg:w-auto lg:self-start">
        <Plus size={24} strokeWidth={2.25} aria-hidden />
        Abrir OS
      </BotaoLink>

      <ul className="flex flex-col gap-3 lg:grid lg:grid-cols-3">
        {atalhosOS.map(({ href, titulo, valor, icone: Icone }) => (
          <li key={href}>
            <Cartao href={href} className="h-full">
              <div className="flex min-h-12 items-center gap-3">
                <Icone size={26} strokeWidth={2.25} aria-hidden className="shrink-0 text-texto-suave" />
                <p className="text-lg font-bold">
                  {titulo} ({valor})
                </p>
              </div>
            </Cartao>
          </li>
        ))}
      </ul>

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

    </>
  );
}
