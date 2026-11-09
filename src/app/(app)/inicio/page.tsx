import type { Metadata } from "next";
import { Suspense } from "react";
import { BookOpen, ChevronRight, Contact, PackageSearch, Plus, Truck, Users, Wallet } from "lucide-react";
import { Cabecalho } from "@/components/layout/cabecalho";
import { AtalhosOSAbertas } from "@/components/os/atalhos-os-abertas";
import { CartaoOSSemPreco } from "@/components/os/cartao-os-sem-preco";
import { CartaoRespondidos } from "@/components/os/cartao-respondidos";
import { CartaoPrimeirosPassos, type IdPasso } from "@/components/inicio/cartao-primeiros-passos";
import { desfazerDispensarPrimeirosPassos, dispensarPrimeirosPassos } from "@/acoes/primeiros-passos";
import { BotaoLink } from "@/components/ui/botao";
import { Cartao, ListaCarregando, Pagina } from "@/components/ui/estados";
import { exigirContexto } from "@/lib/dal";
import { STATUS_ABERTOS } from "@/lib/os-status";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Início" };

/** Recebe o foco quando o cartão Primeiros passos some (DESIGN 15.4). */
const ID_ABRIR_OS = "abrir-os";

/** jsonb de primeiros_passos() -> os 4 passos na ordem do cartão; null se vier fora do formato. */
function lerPrimeirosPassos(dados: unknown): { passos: { id: IdPasso; feito: boolean }[]; dispensado: boolean } | null {
  if (!dados || typeof dados !== "object") return null;
  const d = dados as Record<string, unknown>;
  const chaves: [IdPasso, string][] = [["oficina", "dados_oficina"], ["equipe", "equipe"], ["catalogo", "catalogo"], ["primeira_os", "primeira_os"]];
  if (![...chaves.map(([, k]) => k), "dispensado"].every((k) => typeof d[k] === "boolean")) return null;
  return { passos: chaves.map(([id, k]) => ({ id, feito: d[k] === true })), dispensado: d.dispensado === true };
}

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

  const [clientes, veiculos, pendentes, equipe, abertas, semPreco, respondidos, primeiros] = await Promise.all([
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
    // Primeiros passos (ARQUITETURA 15.15, DESIGN 15.4): com erro, o cartão não aparece.
    supabase.rpc("primeiros_passos"),
  ]);
  const passos = lerPrimeirosPassos(primeiros.error ? null : primeiros.data);
  const contar = (st: string) => (abertas.data ?? []).filter((o) => o.status === st).length;
  const contagemAbertas = {
    pronta: contar("pronta"),
    aguardando_orcamento: contar("aguardando_orcamento"),
    orcamento_enviado: contar("orcamento_enviado"),
    aprovada: contar("aprovada"),
    em_andamento: contar("em_andamento"),
  };

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

      {passos && (
        <CartaoPrimeirosPassos
          passos={passos.passos}
          dispensado={passos.dispensado}
          aoDispensar={dispensarPrimeirosPassos}
          aoDesfazer={desfazerDispensarPrimeirosPassos}
          focoAoDispensar={ID_ABRIR_OS}
        />
      )}

      <BotaoLink id={ID_ABRIR_OS} href="/os/nova" className="lg:w-auto lg:self-start">
        <Plus size={24} strokeWidth={2.25} aria-hidden />
        Abrir OS
      </BotaoLink>

      <CartaoRespondidos respostas={respondidos.data ?? []} />

      <CartaoOSSemPreco quantidade={semPreco.count ?? 0} />

      <AtalhosOSAbertas contagem={contagemAbertas} />

      {/* DESIGN §14.1: entrada do painel, sem valor no cartão. */}
      <Cartao href="/painel">
        <div className="flex min-h-12 items-center gap-3">
          <Wallet size={26} strokeWidth={2.25} aria-hidden className="shrink-0 text-texto-suave" />
          <div className="flex-1">
            <p className="text-lg font-bold">Painel do mês</p>
            <p className="text-base text-texto-suave">Entregues, dinheiro recebido e quem deve.</p>
          </div>
          <ChevronRight size={24} aria-hidden className="shrink-0 text-texto-suave" />
        </div>
      </Cartao>

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
