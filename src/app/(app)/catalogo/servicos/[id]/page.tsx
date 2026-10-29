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
import { param } from "@/lib/formato";
import { createClient } from "@/lib/supabase/server";
import { FormServico } from "../../formularios";

export const metadata: Metadata = { title: "Serviço" };

export default function ServicoPage({ params, searchParams }: PageProps<"/catalogo/servicos/[id]">) {
  return (
    <>
      <Cabecalho titulo="Serviço" voltar="/catalogo" />
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
  const { data: s, error } = await supabase
    .from("vw_catalogo_servicos")
    .select("id, nome, descricao, ativo, preco_padrao_centavos")
    .eq("id", id)
    .maybeSingle();
  if (error) return <CaixaErro tentarDeNovo={`/catalogo/servicos/${id}`} />;
  if (!s?.id || !s.nome) notFound();

  return (
    <>
      {(param(sp.salvo) || param(sp.aviso)) && <LimparUrl />}
      {param(sp.salvo) === "1" && <CaixaMensagem tipo="sucesso">Serviço cadastrado.</CaixaMensagem>}
      {param(sp.aviso) === "preco" && (
        <CaixaMensagem tipo="alerta">O serviço foi criado, mas o preço não foi salvo. Confira e salve de novo.</CaixaMensagem>
      )}
      {!s.ativo && <CaixaMensagem tipo="alerta">Este serviço está desativado e não aparece para a equipe.</CaixaMensagem>}
      <FormServico servico={{ id: s.id, nome: s.nome, descricao: s.descricao, preco_padrao_centavos: s.preco_padrao_centavos }} />
      <section className="border-t border-borda-sutil pt-6">
        {s.ativo ? (
          <ConfirmarAcao
            acao={alterarAtivoCatalogo.bind(null, "servico", s.id, false)}
            rotulo="Desativar serviço"
            pergunta={`Desativar o serviço ${s.nome}? Ele some da lista da equipe, mas dá para reativar.`}
            rotuloConfirmar={`Desativar ${s.nome}`}
          />
        ) : (
          <ConfirmarAcao
            variante="primario"
            acao={alterarAtivoCatalogo.bind(null, "servico", s.id, true)}
            rotulo="Reativar serviço"
            pergunta={`Reativar o serviço ${s.nome}?`}
            rotuloConfirmar="Reativar serviço"
          />
        )}
      </section>
    </>
  );
}
