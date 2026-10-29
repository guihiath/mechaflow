import type { Metadata } from "next";
import { Suspense } from "react";
import { Cabecalho } from "@/components/layout/cabecalho";
import { CaixaErro, FormularioCarregando, Pagina } from "@/components/ui/estados";
import { exigirContexto } from "@/lib/dal";
import { normalizarPlaca, param, placaValida } from "@/lib/formato";
import { createClient } from "@/lib/supabase/server";
import { FormNovaOS, type PessoaEquipe } from "./form-nova-os";

export const metadata: Metadata = { title: "Abrir OS" };

/** Abrir OS pela placa (DESIGN §10.4). Dono e atendente. Sem barra de navegacao. */
export default function NovaOsPage({ searchParams }: PageProps<"/os/nova">) {
  return (
    <>
      <span hidden data-esconde-navegacao />
      <Cabecalho titulo="Abrir OS" voltar="/os" />
      <Pagina>
        <Suspense fallback={<FormularioCarregando />}>
          <Conteudo searchParams={searchParams} />
        </Suspense>
      </Pagina>
    </>
  );
}

const ORDEM_PAPEL = { mecanico: 0, dono: 1, atendente: 2 } as const;

async function Conteudo({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigirContexto(["dono", "atendente"]);
  const placa = normalizarPlaca(param((await searchParams).placa));
  const supabase = await createClient();

  const [{ data: perfis, error: e1 }, { data: clientes, error: e2 }] = await Promise.all([
    supabase.from("perfis").select("id, nome, papel").eq("ativo", true).order("nome"),
    supabase.from("clientes").select("id, nome, modo_padrao").order("nome").limit(2000),
  ]);
  if (e1 || e2) return <CaixaErro titulo="Não foi possível abrir a tela." tentarDeNovo={placa ? `/os/nova?placa=${placa}` : "/os/nova"} />;

  // Mecanicos ativos primeiro; dono e atendente depois, com o papel apos o nome (DESIGN §10.4).
  const equipe: PessoaEquipe[] = [...(perfis ?? [])]
    .sort((a, b) => ORDEM_PAPEL[a.papel] - ORDEM_PAPEL[b.papel] || a.nome.localeCompare(b.nome, "pt-BR"))
    .map((p) => ({ id: p.id, nome: p.papel === "mecanico" ? p.nome : `${p.nome} (${p.papel})` }));

  return (
    <FormNovaOS
      placaInicial={placaValida(placa) ? placa : ""}
      equipe={equipe}
      clientes={(clientes ?? []).map((c) => ({ id: c.id, nome: c.nome, modoPadrao: c.modo_padrao }))}
    />
  );
}
