import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ClipboardList, Plus } from "lucide-react";
import { Cabecalho } from "@/components/layout/cabecalho";
import { BadgeStatus, EtiquetaPagamento, SemMecanico } from "@/components/os/badge-status";
import { CartaoOS } from "@/components/os/cartao-os";
import { BotaoLink } from "@/components/ui/botao";
import { Busca } from "@/components/ui/busca";
import { CaixaErro, ChipPlaca, EstadoVazio, ListaCarregando, Pagina } from "@/components/ui/estados";
import { FiltroChips } from "@/components/ui/filtro-chips";
import { exigirContexto } from "@/lib/dal";
import {
  formatarPlaca,
  formatarReaisInteiros,
  formatarTempoDesde,
  normalizarPlaca,
  padraoIlike,
  param,
  placaValida,
} from "@/lib/formato";
import { FILTROS_OS, lerFiltroOS, type FiltroOS, type StatusOS } from "@/lib/os-status";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Ordens de serviço" };

const POR_PAGINA = 30;

/** "12 OS abertas" / "1 OS pronta" (DESIGN §10.3, resumo da lista). */
const RESUMO: Record<FiltroOS, [string, string]> = {
  abertas: ["aberta", "abertas"],
  orcamento: ["em orçamento", "em orçamento"],
  aprovadas: ["aprovada", "aprovadas"],
  em_andamento: ["em andamento", "em andamento"],
  prontas: ["pronta", "prontas"],
  entregues: ["entregue", "entregues"],
  canceladas: ["cancelada", "canceladas"],
  todas: ["no total", "no total"],
};

type Params = Record<string, string | string[] | undefined>;

export default function ListaOsPage({ searchParams }: PageProps<"/os">) {
  return (
    <>
      <Cabecalho titulo="Ordens de serviço" />
      <Pagina larga>
        <Suspense fallback={<ListaCarregando />}>
          <Lista searchParams={searchParams} />
        </Suspense>
      </Pagina>
    </>
  );
}

/** Texto livre seguro para o filtro .or() do PostgREST (sem virgula, parenteses, aspas). */
function limparParaOr(t: string) {
  return t.replace(/[,()"\\]/g, " ").trim();
}

async function Lista({ searchParams }: { searchParams: Promise<Params> }) {
  await exigirContexto(["dono", "atendente"]);
  const sp = await searchParams;
  const q = param(sp.q).slice(0, 80);
  const statusParam = param(sp.status);
  // Busca sem filtro escolhido procura em todas (achar a OS entregue pelo numero).
  const filtro = lerFiltroOS(statusParam || (q ? "todas" : undefined));
  const pagina = Math.min(Math.max(Number.parseInt(param(sp.pagina) || "1", 10) || 1, 1), 50);
  const limite = POR_PAGINA * pagina;

  const supabase = await createClient();
  let consulta = supabase
    .from("vw_os")
    .select(
      "id, numero, status, placa, veiculo_marca, veiculo_modelo, cliente_nome, mecanico_nome, sintoma_relatado, atualizado_em, total_centavos, pago_em",
      { count: "exact" },
    )
    .in("status", [...filtro.status]);

  if (q) {
    const soNumero = q.replace(/^#/, "");
    if (/^\d{1,9}$/.test(soNumero)) {
      consulta = consulta.eq("numero", Number(soNumero));
    } else {
      const placa = normalizarPlaca(q);
      const livre = limparParaOr(q);
      consulta =
        placa.length >= 3 && /\d/.test(placa) && livre
          ? consulta.or(`placa.ilike.${placa}%,cliente_nome.ilike.${padraoIlike(livre)}`)
          : consulta.ilike("cliente_nome", padraoIlike(q));
    }
  }
  consulta =
    filtro.valor === "prontas"
      ? consulta.order("pronta_em", { ascending: true, nullsFirst: false })
      : consulta.order("atualizado_em", { ascending: false });

  const [{ data: lista, count, error }, { data: abertas }] = await Promise.all([
    consulta.range(0, limite - 1),
    supabase
      .from("ordens_servico")
      .select("status")
      .in("status", ["aguardando_orcamento", "orcamento_enviado", "aprovada", "em_andamento", "pronta"])
      .limit(5000),
  ]);

  const contagemStatus = new Map<StatusOS, number>();
  for (const o of abertas ?? []) contagemStatus.set(o.status, (contagemStatus.get(o.status) ?? 0) + 1);

  const href = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const tudo = { status: filtro.valor === "abertas" && !q ? undefined : filtro.valor, q: q || undefined, ...extra };
    Object.entries(tudo).forEach(([k, v]) => v && p.set(k, v));
    const s = p.toString();
    return s ? `/os?${s}` : "/os";
  };

  const chips = FILTROS_OS.map((f) => {
    const abertos = !f.status.includes("entregue") && !f.status.includes("cancelada");
    return {
      valor: f.valor,
      rotulo: f.rotulo,
      href: href({ status: f.valor === "abertas" ? (q ? "abertas" : undefined) : f.valor, pagina: undefined }),
      contagem: abertos && abertas ? f.status.reduce((soma, s) => soma + (contagemStatus.get(s) ?? 0), 0) : undefined,
    };
  });

  const placaBuscada = normalizarPlaca(q);
  const total = count ?? 0;
  const agora = new Date();

  return (
    <>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="lg:flex-1">
          <Busca
            acao="/os"
            rotulo="Número, placa ou cliente"
            rotuloVisivel="Buscar OS"
            valor={q}
            extras={{ status: statusParam || undefined }}
          />
        </div>
        <BotaoLink href="/os/nova" className="hidden lg:inline-flex lg:w-auto">
          <Plus size={24} strokeWidth={2.25} aria-hidden />
          Abrir OS
        </BotaoLink>
      </div>

      <FiltroChips opcoes={chips} ativo={filtro.valor} />

      {error ? (
        <CaixaErro titulo="Não foi possível carregar as OS." tentarDeNovo={href({})} />
      ) : !lista.length ? (
        <ListaVazia q={q} placaBuscada={placaBuscada} filtro={filtro} />
      ) : (
        <>
          <p className="text-sm text-texto-suave">
            {q
              ? `${total} ${total === 1 ? "OS encontrada" : "OS encontradas"}`
              : `${total} OS ${RESUMO[filtro.valor][total === 1 ? 0 : 1]}`}
          </p>

          {/* Celular: cards */}
          <ul className="flex flex-col gap-3 lg:hidden">
            {lista.map((o) => (
              <li key={o.id}>
                <CartaoOS
                  agora={agora}
                  os={{
                    href: `/os/${o.id}`,
                    numero: o.numero ?? 0,
                    placa: o.placa ?? "",
                    veiculo: [o.veiculo_marca, o.veiculo_modelo].filter(Boolean).join(" ") || null,
                    cliente: o.cliente_nome,
                    sintoma: o.sintoma_relatado,
                    status: (o.status ?? "aguardando_orcamento") as StatusOS,
                    atualizadoEm: o.atualizado_em,
                    mecanico: o.mecanico_nome,
                    totalCentavos: o.total_centavos ?? 0,
                    aReceber: o.status === "entregue" && !o.pago_em,
                  }}
                />
              </li>
            ))}
          </ul>

          {/* Desktop: tabela, linha inteira clicavel (link na celula do numero cobre a linha) */}
          <div className="hidden overflow-hidden rounded-lg border border-borda-sutil bg-superficie lg:block">
            <table className="w-full border-collapse text-left">
              <thead className="bg-superficie-2 text-sm font-bold text-texto-suave">
                <tr>
                  <th scope="col" className="px-4 py-3">Nº</th>
                  <th scope="col" className="px-4 py-3">Placa</th>
                  <th scope="col" className="px-4 py-3">Cliente</th>
                  <th scope="col" className="px-4 py-3">Veículo</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                  <th scope="col" className="px-4 py-3">Mecânico</th>
                  <th scope="col" className="px-4 py-3 text-right">Total</th>
                  <th scope="col" className="px-4 py-3 text-right">Atualizada</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((o) => (
                  <tr key={o.id} className="relative h-14 border-t border-borda-sutil hover:bg-superficie-2">
                    <td className="px-4 font-mono font-semibold">
                      <Link href={`/os/${o.id}`} className="after:absolute after:inset-0">
                        #{o.numero}
                      </Link>
                    </td>
                    <td className="px-4">
                      <span className="[&>span]:text-lg">
                        <ChipPlaca placa={formatarPlaca(o.placa)} />
                      </span>
                    </td>
                    <td className="max-w-56 truncate px-4 font-bold">{o.cliente_nome}</td>
                    <td className="max-w-48 truncate px-4">{[o.veiculo_marca, o.veiculo_modelo].filter(Boolean).join(" ")}</td>
                    <td className="px-4">
                      <span className="flex items-center gap-2">
                        {o.status && <BadgeStatus status={o.status as StatusOS} />}
                        {o.status === "entregue" && !o.pago_em && <EtiquetaPagamento pago={false} />}
                      </span>
                    </td>
                    <td className="px-4">{o.mecanico_nome ?? <SemMecanico />}</td>
                    <td className="px-4 text-right font-mono">{formatarReaisInteiros(o.total_centavos ?? 0)}</td>
                    <td className="px-4 text-right text-sm text-texto-suave">{formatarTempoDesde(o.atualizado_em, agora)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {total > lista.length && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-texto-suave">
                Mostrando {lista.length} de {total}.
              </p>
              <BotaoLink href={href({ pagina: String(pagina + 1) })} variante="secundario" scroll={false} className="lg:w-auto">
                Mostrar mais {Math.min(POR_PAGINA, total - lista.length)}
              </BotaoLink>
            </div>
          )}
        </>
      )}

      {/* Celular: "Abrir OS" fixo acima da barra inferior; o espaco evita cobrir o ultimo card */}
      <div aria-hidden className="h-20 lg:hidden" />
      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 px-4 pb-2 lg:hidden">
        <BotaoLink href="/os/nova" className="shadow-barra">
          <Plus size={24} strokeWidth={2.25} aria-hidden />
          Abrir OS
        </BotaoLink>
      </div>
    </>
  );
}

async function ListaVazia({
  q,
  placaBuscada,
  filtro,
}: {
  q: string;
  placaBuscada: string;
  filtro: ReturnType<typeof lerFiltroOS>;
}) {
  if (q) {
    return (
      <EstadoVazio
        icone={ClipboardList}
        titulo={`Nada encontrado para “${q}”.`}
        texto="Confira o número, a placa ou o nome."
        acao={
          placaValida(placaBuscada)
            ? { href: `/os/nova?placa=${placaBuscada}`, rotulo: `Abrir OS para ${formatarPlaca(placaBuscada)}` }
            : undefined
        }
      />
    );
  }
  const supabase = await createClient();
  const { count } = await supabase.from("ordens_servico").select("id", { count: "exact", head: true });
  if (!count) {
    return (
      <EstadoVazio
        icone={ClipboardList}
        titulo="Nenhuma OS ainda."
        texto="Comece pela placa do caminhão que chegou."
        acao={{ href: "/os/nova", rotulo: "Abrir OS" }}
      />
    );
  }
  return (
    <EstadoVazio
      icone={ClipboardList}
      titulo={`Nenhuma OS ${filtro.rotuloVazio}.`}
      texto="Troque o filtro ou veja todas."
      acao={{ href: "/os?status=todas", rotulo: "Ver todas", variante: "secundario" }}
    />
  );
}
