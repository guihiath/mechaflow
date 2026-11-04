import type { Metadata } from "next";
import { Suspense } from "react";
import { BookOpen, CircleCheckBig, Clock, Contact, PackageSearch, Plus, Truck, Users, Wrench, ThumbsUp } from "lucide-react";
import { Cabecalho } from "@/components/layout/cabecalho";
import { CartaoOSSemPreco } from "@/components/os/cartao-os-sem-preco";
import { CartaoRespondidos } from "@/components/os/cartao-respondidos";
import { BotaoLink } from "@/components/ui/botao";
import { Cartao, ListaCarregando, Pagina } from "@/components/ui/estados";
import { exigirContexto } from "@/lib/dal";
import { STATUS_ABERTOS } from "@/lib/os-status";
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

  const [clientes, veiculos, pendentes, equipe, abertas, semPreco, respondidos] = await Promise.all([
    supabase.from("clientes").select("id", { count: "exact", head: true }),
    supabase.from("veiculos").select("id", { count: "exact", head: true }),
    supabase
      .from("catalogo_pecas")
      .select("id", { count: "exact", head: true })
      .eq("pendente_precificacao", true)
      .eq("ativo", true),
    supabase.from("perfis").select("id", { count: "exact", head: true }).eq("ativo", true),
    supabase.from("ordens_servico").select("status").in("status", [...STATUS_ABERTOS]).limit(5000),
    // OS abertas com item sem preco (pendencia do balcao, DESIGN §11.10)
    supabase.from("vw_os").select("id", { count: "exact", head: true }).in("status", [...STATUS_ABERTOS]).gt("itens_sem_preco", 0),
    // Respostas pelo link que esperam o balcão (DESIGN §13.13)
    supabase.from("vw_os").select("numero, status").eq("orcamento_respondido", true).order("orcamento_respondido_em").limit(500),
  ]);
  const contar = (...st: string[]) => (abertas.data ?? []).filter((o) => st.includes(o.status)).length;
  const atalhosOS = [
    { href: "/os?status=prontas", titulo: "Prontas para entregar", valor: contar("pronta"), icone: CircleCheckBig },
    { href: "/os?status=orcamento", titulo: "Esperando o cliente", valor: contar("aguardando_orcamento", "orcamento_enviado"), icone: Clock },
    { href: "/os?status=aprovadas", titulo: "Liberadas para começar", valor: contar("aprovada"), icone: ThumbsUp },
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

      <CartaoRespondidos respostas={respondidos.data ?? []} />

      <CartaoOSSemPreco quantidade={semPreco.count ?? 0} />

      <ul className="flex flex-col gap-3 lg:grid lg:grid-cols-2">
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
