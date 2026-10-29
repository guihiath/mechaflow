import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BookOpen, PackageSearch, Plus } from "lucide-react";
import { Cabecalho } from "@/components/layout/cabecalho";
import { BotaoLink } from "@/components/ui/botao";
import { Busca } from "@/components/ui/busca";
import { CaixaErro, Cartao, Etiqueta, EstadoVazio, ListaCarregando, Pagina } from "@/components/ui/estados";
import { exigirContexto } from "@/lib/dal";
import { formatarCentavos, padraoIlike, param, ROTULO_UNIDADE, type UnidadePeca } from "@/lib/formato";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Catálogo" };

type Params = Record<string, string | string[] | undefined>;

export default function CatalogoPage({ searchParams }: PageProps<"/catalogo">) {
  return (
    <>
      <Cabecalho titulo="Catálogo" />
      <Pagina>
        <Suspense fallback={<ListaCarregando />}>
          <Conteudo searchParams={searchParams} />
        </Suspense>
      </Pagina>
    </>
  );
}

async function Conteudo({ searchParams }: { searchParams: Promise<Params> }) {
  const ctx = await exigirContexto();
  const sp = await searchParams;
  const aba = param(sp.aba) === "pecas" ? "pecas" : "servicos";
  const q = param(sp.q);
  const ehDono = ctx.papel === "dono";
  const pendentes = ehDono && aba === "pecas" && param(sp.pendentes) === "1";
  const inativos = ehDono && param(sp.inativos) === "1";
  // Valores: dono ve preco e custo; atendente so preco; mecanico nenhum (a view ja devolve NULL).
  const vePreco = ctx.papel !== "mecanico";

  const url = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const tudo = { aba, q: q || undefined, pendentes: pendentes ? "1" : undefined, inativos: inativos ? "1" : undefined, ...extra };
    Object.entries(tudo).forEach(([k, v]) => v && p.set(k, v));
    return `/catalogo?${p.toString()}`;
  };

  return (
    <>
      <nav aria-label="Tipo de item" className="grid grid-cols-2 gap-2">
        {(
          [
            ["servicos", "Serviços"],
            ["pecas", "Peças"],
          ] as const
        ).map(([valor, rotulo]) => (
          <Link
            key={valor}
            href={url({ aba: valor, pendentes: undefined })}
            aria-current={aba === valor ? "page" : undefined}
            className={`flex min-h-toque items-center justify-center rounded-md border-2 text-lg font-bold ${
              aba === valor ? "border-grafite bg-primaria text-primaria-texto" : "border-borda bg-superficie"
            }`}
          >
            {rotulo}
          </Link>
        ))}
      </nav>

      <Busca acao="/catalogo" rotulo={aba === "pecas" ? "Buscar peça por nome ou código" : "Buscar serviço"} valor={q} extras={{ aba, pendentes: pendentes ? "1" : undefined, inativos: inativos ? "1" : undefined }} />

      {ehDono && (
        <div className="flex flex-col gap-3">
          <BotaoLink href={aba === "pecas" ? "/catalogo/pecas/novo" : "/catalogo/servicos/novo"}>
            <Plus size={24} strokeWidth={2.25} aria-hidden />
            {aba === "pecas" ? "Nova peça" : "Novo serviço"}
          </BotaoLink>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-base">
            {aba === "pecas" && (
              <Link href={url({ pendentes: pendentes ? undefined : "1" })} className="min-h-toque content-center font-bold text-info-texto underline">
                {pendentes ? "Ver todas as peças" : "Ver só peças sem preço"}
              </Link>
            )}
            <Link href={url({ inativos: inativos ? undefined : "1" })} className="min-h-toque content-center font-bold text-info-texto underline">
              {inativos ? "Esconder desativados" : "Mostrar desativados"}
            </Link>
          </div>
        </div>
      )}

      {!vePreco && <p className="text-base text-texto-suave">Lista de consulta. Valores ficam com o dono.</p>}

      {aba === "servicos" ? (
        <ListaServicos q={q} inativos={inativos} ehDono={ehDono} vePreco={vePreco} />
      ) : (
        <ListaPecas q={q} inativos={inativos} pendentes={pendentes} ehDono={ehDono} vePreco={vePreco} />
      )}
    </>
  );
}

async function ListaServicos({ q, inativos, ehDono, vePreco }: { q: string; inativos: boolean; ehDono: boolean; vePreco: boolean }) {
  const supabase = await createClient();
  let consulta = supabase
    .from("vw_catalogo_servicos")
    .select("id, nome, descricao, ativo, preco_padrao_centavos")
    .order("nome")
    .limit(200);
  if (!inativos) consulta = consulta.eq("ativo", true);
  if (q) consulta = consulta.ilike("nome", padraoIlike(q));
  const { data, error } = await consulta;

  if (error) return <CaixaErro tentarDeNovo="/catalogo" />;
  if (!data.length) {
    return (
      <EstadoVazio
        icone={BookOpen}
        titulo={q ? "Nenhum serviço encontrado." : "Nenhum serviço no catálogo."}
        texto={ehDono ? "Cadastre os serviços que a oficina faz, com o preço padrão." : "O dono ainda não cadastrou serviços."}
        acao={ehDono && !q ? { href: "/catalogo/servicos/novo", rotulo: "Cadastrar serviço" } : undefined}
      />
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {data.map((s) => (
        <li key={s.id}>
          <Cartao href={ehDono ? `/catalogo/servicos/${s.id}` : undefined} faixa={s.ativo ? undefined : "bg-borda"}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-lg font-bold">{s.nome}</p>
                {s.descricao && <p className="line-clamp-2 text-base text-texto-suave">{s.descricao}</p>}
                {!s.ativo && <Etiqueta>Desativado</Etiqueta>}
              </div>
              {vePreco && (
                <p className="shrink-0 text-right font-mono text-lg">{formatarCentavos(s.preco_padrao_centavos)}</p>
              )}
            </div>
          </Cartao>
        </li>
      ))}
    </ul>
  );
}

async function ListaPecas({
  q,
  inativos,
  pendentes,
  ehDono,
  vePreco,
}: {
  q: string;
  inativos: boolean;
  pendentes: boolean;
  ehDono: boolean;
  vePreco: boolean;
}) {
  const supabase = await createClient();
  let consulta = supabase
    .from("vw_catalogo_pecas")
    .select("id, nome, codigo, fornecedor, unidade, ativo, pendente_precificacao, preco_venda_centavos, custo_centavos")
    .order("nome")
    .limit(200);
  if (!inativos) consulta = consulta.eq("ativo", true);
  if (pendentes) consulta = consulta.eq("pendente_precificacao", true);
  if (q) {
    const padrao = padraoIlike(q);
    // padraoIlike escapa % e _; virgula e parenteses quebrariam o or(), entao removemos.
    const seguro = padrao.replace(/[,()]/g, " ");
    consulta = consulta.or(`nome.ilike.${seguro},codigo.ilike.${seguro}`);
  }
  const { data, error } = await consulta;

  if (error) return <CaixaErro tentarDeNovo="/catalogo?aba=pecas" />;
  if (!data.length) {
    return (
      <EstadoVazio
        icone={PackageSearch}
        titulo={pendentes ? "Nenhuma peça sem preço." : q ? "Nenhuma peça encontrada." : "Nenhuma peça no catálogo."}
        texto={ehDono ? "Cadastre as peças mais usadas, com custo e preço de venda." : "O dono ainda não cadastrou peças."}
        acao={ehDono && !q && !pendentes ? { href: "/catalogo/pecas/novo", rotulo: "Cadastrar peça" } : undefined}
      />
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {data.map((p) => (
        <li key={p.id}>
          <Cartao
            href={ehDono ? `/catalogo/pecas/${p.id}` : undefined}
            faixa={!p.ativo ? "bg-borda" : ehDono && p.pendente_precificacao ? "bg-alerta" : undefined}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-lg font-bold">{p.nome}</p>
                <p className="text-base text-texto-suave">
                  {[p.codigo && `Cód. ${p.codigo}`, p.unidade && ROTULO_UNIDADE[p.unidade as UnidadePeca], p.fornecedor]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {vePreco && p.pendente_precificacao && <Etiqueta tom="alerta">Sem preço</Etiqueta>}
                  {!p.ativo && <Etiqueta>Desativada</Etiqueta>}
                </div>
              </div>
              {vePreco && (
                <div className="shrink-0 text-right">
                  <p className="font-mono text-lg">{formatarCentavos(p.preco_venda_centavos)}</p>
                  {ehDono && (
                    <p className="font-mono text-sm text-texto-suave">custo {formatarCentavos(p.custo_centavos)}</p>
                  )}
                </div>
              )}
            </div>
          </Cartao>
        </li>
      ))}
    </ul>
  );
}
