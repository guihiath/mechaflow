import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Cabecalho } from "@/components/layout/cabecalho";
import { DocumentoOrcamento } from "@/components/orcamento/documento-orcamento";
import { BotaoPdfOrcamento } from "@/components/orcamento/pdf-orcamento";
import { DetalheCarregando } from "@/components/os/detalhe-carregando";
import { CaixaErro, Pagina } from "@/components/ui/estados";
import { CaixaMensagem } from "@/components/ui/formulario";
import { exigirContexto } from "@/lib/dal";
import { formatarDiaHora, normalizarPlaca } from "@/lib/formato";
import { documentoDoBanco, formatarDataEHora } from "@/lib/orcamento";
import { CANAL_NA_FRASE } from "@/lib/os";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Versão do orçamento" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Consulta de uma versão congelada (DESIGN §13.12): só leitura, pelo login, sem token.
 * Só dono e atendente; a RLS já dá 0 linhas ao mecânico, e o `not-found` vem antes de consultar.
 */
export default function VersaoOrcamentoPage({ params }: PageProps<"/os/[id]/orcamento/[versao]">) {
  return (
    <Suspense
      fallback={
        <>
          <Cabecalho titulo="Versão do orçamento" voltar="/os" />
          <Pagina>
            <DetalheCarregando comBarra={false} />
          </Pagina>
        </>
      }
    >
      <Conteudo params={params} />
    </Suspense>
  );
}

async function Conteudo({ params }: { params: Promise<{ id: string; versao: string }> }) {
  const ctx = await exigirContexto();
  const { id, versao } = await params;
  const numero = Number(versao);
  if (ctx.papel === "mecanico" || !UUID.test(id) || !Number.isSafeInteger(numero) || numero < 1) notFound();

  const voltar = `/os/${id}`;
  const supabase = await createClient();
  const [{ data: v, error }, osR, situacaoR] = await Promise.all([
    supabase.from("vw_orcamento_versoes").select("id, numero, conteudo, congelada_em, codigo_conferencia").eq("os_id", id).eq("numero", numero).maybeSingle(),
    supabase.from("vw_os").select("numero, status").eq("id", id).maybeSingle(),
    supabase.from("vw_orcamento_situacao").select("versao_numero, itens_travados, link_situacao").eq("os_id", id).maybeSingle(),
  ]);
  if (error || osR.error) {
    return (
      <>
        <Cabecalho titulo="Versão do orçamento" voltar={voltar} />
        <Pagina>
          <CaixaErro titulo="Não foi possível abrir esta versão." tentarDeNovo={`${voltar}/orcamento/${numero}`} />
        </Pagina>
      </>
    );
  }
  if (!v?.id || !osR.data) notFound();
  const documento = documentoDoBanco(v.conteudo);
  if (!documento) notFound();

  const [provasR, linkR] = await Promise.all([
    supabase.from("vw_orcamento_provas").select("aprovou, canal, respondente_nome, respondido_em, desfeita_em, desfeita_por_nome").eq("versao_id", v.id).order("respondido_em", { ascending: false }),
    supabase.from("orcamento_links").select("expira_em").eq("versao_id", v.id).order("criado_em", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const prova = provasR.data?.[0];
  const vigente = situacaoR.data?.versao_numero === numero;

  let situacao: string;
  if (prova?.respondido_em) {
    const verbo = prova.aprovou ? "Aprovada pelo cliente" : "Recusada pelo cliente";
    const canal = prova.canal === "link" || !prova.canal ? "no link" : CANAL_NA_FRASE[prova.canal];
    situacao = `${verbo} ${canal} em ${formatarDataEHora(prova.respondido_em)}.`;
  } else if (vigente && situacaoR.data?.itens_travados) {
    situacao = "Enviada ao cliente. Ainda sem resposta.";
  } else {
    situacao = "Substituída: esta versão não vale mais.";
  }

  return (
    <>
      <Cabecalho titulo={`Versão ${numero} · OS #${osR.data.numero}`} voltar={voltar} />
      <Pagina>
        <CaixaMensagem tipo={prova?.aprovou && !prova.desfeita_em ? "sucesso" : "info"}>
          {situacao}
          {prova?.desfeita_em ? ` Desfeita${prova.desfeita_por_nome ? ` por ${prova.desfeita_por_nome}` : ""} em ${formatarDiaHora(prova.desfeita_em)}.` : ""}
        </CaixaMensagem>
        {prova?.aprovou && prova.respondente_nome && (
          <p className="text-base break-words">
            {prova.canal === "link" ? "Nome informado" : "Quem aprovou"}: {prova.respondente_nome}
          </p>
        )}
        <div className="papel-claro flex w-full max-w-[560px] flex-col gap-6 rounded-lg border border-borda-sutil bg-fundo p-4 text-texto">
          <DocumentoOrcamento documento={documento} expiraEm={linkR.data?.expira_em ?? null} variante="consulta" />
        </div>
        {v.codigo_conferencia && <p className="font-mono text-xs">Código de conferência: {v.codigo_conferencia}</p>}
        {/* F7-B9: PDF desta versão congelada (só dono e atendente; OS cancelada não gera). */}
        {osR.data.status !== "cancelada" && (
          <BotaoPdfOrcamento osId={id} versao={numero} numeroOS={osR.data.numero ?? documento.os_numero} placaNormalizada={normalizarPlaca(documento.veiculo_placa)} />
        )}
      </Pagina>
    </>
  );
}
