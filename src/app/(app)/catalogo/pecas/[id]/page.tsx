import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Cabecalho } from "@/components/layout/cabecalho";
import { ConfirmarAcao } from "@/components/ui/confirmar-acao";
import { CaixaErro, FormularioCarregando, Pagina } from "@/components/ui/estados";
import { CaixaMensagem } from "@/components/ui/formulario";
import { LimparUrl } from "@/components/ui/limpar-url";
import { alterarAtivoCatalogo } from "@/acoes/catalogo";
import { exigirContexto } from "@/lib/dal";
import { formatarCentavos, param } from "@/lib/formato";
import { createClient } from "@/lib/supabase/server";
import { FormPeca } from "../../formularios";

export const metadata: Metadata = { title: "Peça" };

export default function PecaPage({ params, searchParams }: PageProps<"/catalogo/pecas/[id]">) {
  return (
    <>
      <Cabecalho titulo="Peça" voltar="/catalogo?aba=pecas" />
      <Pagina>
        <Suspense fallback={<FormularioCarregando />}>
          <Conteudo params={params} searchParams={searchParams} />
        </Suspense>
      </Pagina>
    </>
  );
}

async function Conteudo({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await exigirContexto(["dono"]);
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const { data: p, error } = await supabase
    .from("vw_catalogo_pecas")
    .select("id, nome, codigo, fornecedor, unidade, ativo, pendente_precificacao, preco_venda_centavos, custo_centavos")
    .eq("id", id)
    .maybeSingle();
  if (error) return <CaixaErro tentarDeNovo={`/catalogo/pecas/${id}`} />;
  if (!p?.id || !p.nome) notFound();

  const margem =
    p.preco_venda_centavos !== null && p.custo_centavos !== null ? p.preco_venda_centavos - p.custo_centavos : null;

  return (
    <>
      {(param(sp.salvo) || param(sp.aviso)) && <LimparUrl />}
      {param(sp.salvo) === "1" && <CaixaMensagem tipo="sucesso">Peça cadastrada.</CaixaMensagem>}
      {param(sp.aviso) === "preco" && (
        <CaixaMensagem tipo="alerta">A peça foi criada, mas preço/custo não foram salvos. Confira e salve de novo.</CaixaMensagem>
      )}
      {p.pendente_precificacao && (
        <CaixaMensagem tipo="alerta">Peça pendente de precificação: defina o preço de venda.</CaixaMensagem>
      )}
      {!p.ativo && <CaixaMensagem tipo="alerta">Esta peça está desativada e não aparece para a equipe.</CaixaMensagem>}
      {margem !== null && (
        <p className="text-base text-texto-suave">
          Margem por unidade: <span className="font-mono text-texto">{formatarCentavos(margem)}</span>
        </p>
      )}
      <FormPeca
        peca={{
          id: p.id,
          nome: p.nome,
          codigo: p.codigo,
          fornecedor: p.fornecedor,
          unidade: p.unidade ?? "un",
          preco_venda_centavos: p.preco_venda_centavos,
          custo_centavos: p.custo_centavos,
        }}
      />
      <section className="border-t border-borda-sutil pt-6">
        {p.ativo ? (
          <ConfirmarAcao
            acao={alterarAtivoCatalogo.bind(null, "peca", p.id, false)}
            rotulo="Desativar peça"
            pergunta={`Desativar a peça ${p.nome}? Ela some da lista da equipe, mas dá para reativar.`}
            rotuloConfirmar={`Desativar ${p.nome}`}
          />
        ) : (
          <ConfirmarAcao
            variante="primario"
            acao={alterarAtivoCatalogo.bind(null, "peca", p.id, true)}
            rotulo="Reativar peça"
            pergunta={`Reativar a peça ${p.nome}?`}
            rotuloConfirmar="Reativar peça"
          />
        )}
      </section>
    </>
  );
}
