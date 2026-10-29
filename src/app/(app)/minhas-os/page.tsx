import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BookOpen, ClipboardList, Search } from "lucide-react";
import { Cabecalho } from "@/components/layout/cabecalho";
import { CartaoOS } from "@/components/os/cartao-os";
import { CaixaErro, Cartao, EstadoVazio, ListaCarregando, Pagina } from "@/components/ui/estados";
import { FiltroChips } from "@/components/ui/filtro-chips";
import { exigirContexto } from "@/lib/dal";
import { param } from "@/lib/formato";
import type { StatusOS } from "@/lib/os-status";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Minhas OS" };

const DIA = 24 * 60 * 60 * 1000;

/** Lista do mecanico (DESIGN §10.10): por secoes, SEM nenhum valor (nem pedido ao banco). */
export default function MinhasOsPage({ searchParams }: PageProps<"/minhas-os">) {
  return (
    <>
      <Cabecalho titulo="Minhas OS" />
      <Pagina>
        <Suspense fallback={<ListaCarregando />}>
          <Conteudo searchParams={searchParams} />
        </Suspense>
      </Pagina>
    </>
  );
}

type Linha = {
  id: string | null;
  numero: number | null;
  status: StatusOS | null;
  placa: string | null;
  veiculo_marca: string | null;
  veiculo_modelo: string | null;
  cliente_nome: string | null;
  sintoma_relatado: string | null;
  mecanico_nome: string | null;
  atualizado_em: string | null;
  criado_em: string | null;
  iniciado_em: string | null;
  pronta_em: string | null;
  entregue_em: string | null;
};

const COLUNAS =
  "id, numero, status, placa, veiculo_marca, veiculo_modelo, cliente_nome, sintoma_relatado, mecanico_nome, atualizado_em, criado_em, iniciado_em, pronta_em, entregue_em";

async function Conteudo({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await exigirContexto(["mecanico"]);
  const sp = await searchParams;
  const todas = Boolean(ctx.ve_todas_os) && param(sp.ver) === "todas";
  const verEntregues = param(sp.entregues) === "1";
  const agora = new Date();
  const supabase = await createClient();

  let abertas = supabase.from("vw_os").select(COLUNAS).not("status", "in", "(entregue,cancelada)").limit(300);
  if (!todas) abertas = abertas.eq("mecanico_id", ctx.usuario_id);
  let entregues = supabase
    .from("vw_os")
    .select(COLUNAS)
    .eq("status", "entregue")
    .gte("entregue_em", new Date(agora.getTime() - 30 * DIA).toISOString())
    .order("entregue_em", { ascending: false })
    .limit(100);
  if (!todas) entregues = entregues.eq("mecanico_id", ctx.usuario_id);

  const [{ data, error }, ent] = await Promise.all([abertas, verEntregues ? entregues : Promise.resolve({ data: [] as Linha[], error: null })]);
  if (error || ent.error) {
    return <CaixaErro titulo="Não foi possível carregar suas OS." tentarDeNovo={todas ? "/minhas-os?ver=todas" : "/minhas-os"} />;
  }

  const lista = (data ?? []) as Linha[];
  const porData = (campo: keyof Linha) => (a: Linha, b: Linha) => String(a[campo] ?? a.criado_em).localeCompare(String(b[campo] ?? b.criado_em));
  const limitePronta = agora.getTime() - 7 * DIA;
  const secoes: { titulo: string; itens: Linha[] }[] = [
    { titulo: "Para fazer agora", itens: lista.filter((o) => o.status === "em_andamento").sort(porData("iniciado_em")) },
    { titulo: "Liberadas para começar", itens: lista.filter((o) => o.status === "aprovada").sort(porData("atualizado_em")) },
    {
      titulo: "Esperando o cliente",
      itens: lista.filter((o) => o.status === "aguardando_orcamento" || o.status === "orcamento_enviado").sort(porData("criado_em")),
    },
    {
      titulo: "Prontas",
      itens: lista
        .filter((o) => o.status === "pronta" && o.pronta_em && new Date(o.pronta_em).getTime() >= limitePronta)
        .sort(porData("pronta_em")),
    },
  ];
  if (verEntregues) secoes.push({ titulo: "Entregues nos últimos 30 dias", itens: (ent.data ?? []) as Linha[] });
  const visiveis = secoes.filter((s) => s.itens.length > 0);

  const base = todas ? "/minhas-os?ver=todas" : "/minhas-os";
  const cartao = (o: Linha) => (
    <li key={o.id}>
      <CartaoOS
        semValores
        agora={agora}
        os={{
          href: `/os/${o.id}`,
          numero: o.numero ?? 0,
          placa: o.placa ?? "",
          veiculo: [o.veiculo_marca, o.veiculo_modelo].filter(Boolean).join(" ") || null,
          cliente: o.cliente_nome,
          sintoma: o.sintoma_relatado,
          status: (o.status ?? "em_andamento") as StatusOS,
          atualizadoEm: o.atualizado_em,
          mecanico: o.mecanico_nome,
        }}
      />
    </li>
  );

  return (
    <>
      <p className="text-base text-texto-suave">Olá, {ctx.perfil_nome}</p>

      {ctx.ve_todas_os && (
        <FiltroChips
          rotulo="Quais OS mostrar"
          ativo={todas ? "todas" : "minhas"}
          opcoes={[
            { valor: "minhas", rotulo: "Minhas", href: "/minhas-os" },
            { valor: "todas", rotulo: "Todas da oficina", href: "/minhas-os?ver=todas" },
          ]}
        />
      )}

      {visiveis.length === 0 ? (
        <EstadoVazio
          icone={ClipboardList}
          titulo="Nenhuma OS com você agora."
          texto="Quando o dono passar um serviço, ele aparece aqui."
          acao={{ href: base, rotulo: "Atualizar", variante: "secundario" }}
        />
      ) : (
        visiveis.map((s) => (
          <section key={s.titulo} className="flex flex-col gap-3">
            <h2 className="text-xl">
              {s.titulo} ({s.itens.length})
            </h2>
            <ul className="flex flex-col gap-3">{s.itens.map(cartao)}</ul>
          </section>
        ))
      )}

      {!verEntregues && (
        <Link
          href={`${base}${base.includes("?") ? "&" : "?"}entregues=1`}
          className="inline-flex min-h-toque items-center self-start text-base font-bold text-info-texto underline underline-offset-4"
        >
          Ver entregues dos últimos 30 dias
        </Link>
      )}

      <ul className="grid gap-3 sm:grid-cols-2">
        <li>
          <Cartao href="/placa">
            <div className="flex items-center gap-3">
              <Search size={26} strokeWidth={2.25} aria-hidden />
              <div>
                <p className="text-lg font-bold">Buscar placa</p>
                <p className="text-base text-texto-suave">Ver veículo e histórico</p>
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
