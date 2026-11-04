import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Cabecalho } from "@/components/layout/cabecalho";
import { EsconderNavegacao } from "@/components/layout/marcador-pagina";
import { TelaEnviarOrcamento } from "@/components/orcamento/tela-enviar-orcamento";
import { DetalheCarregando } from "@/components/os/detalhe-carregando";
import { BotaoLink } from "@/components/ui/botao";
import { CaixaErro, Pagina } from "@/components/ui/estados";
import { CaixaMensagem } from "@/components/ui/formulario";
import { exigirContexto } from "@/lib/dal";
import { formatarTelefone, param } from "@/lib/formato";
import { documentoDoBanco, numeroWhatsAppBrasil, previaDoBanco } from "@/lib/orcamento";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Enviar por WhatsApp" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Tela de envio e reenvio (DESIGN §13.9). Só dono e atendente; o mecânico cai no `not-found`. */
export default function EnviarOrcamentoPage({ params, searchParams }: PageProps<"/os/[id]/enviar">) {
  return (
    <Suspense
      fallback={
        <>
          <Cabecalho titulo="Enviar por WhatsApp" voltar="/os" />
          <Pagina>
            <DetalheCarregando comBarra={false} />
          </Pagina>
        </>
      }
    >
      <Conteudo params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await exigirContexto();
  const { id } = await params;
  const sp = await searchParams;
  if (ctx.papel === "mecanico" || !UUID.test(id)) notFound();

  const voltar = `/os/${id}`;
  const supabase = await createClient();
  const [{ data: os, error }, situacaoR] = await Promise.all([
    supabase
      .from("vw_os")
      .select("id, numero, status, modo, placa, cliente_id, cliente_nome, cliente_telefone, total_centavos, qtd_itens, itens_sem_preco, orcamento_itens_travados")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("vw_orcamento_situacao").select("versao_numero, link_situacao").eq("os_id", id).maybeSingle(),
  ]);

  const casca = (conteudo: React.ReactNode) => (
    <>
      <EsconderNavegacao />
      <Cabecalho titulo="Enviar por WhatsApp" voltar={voltar} />
      <Pagina>{conteudo}</Pagina>
    </>
  );

  if (error || situacaoR.error) return casca(<CaixaErro titulo="Não foi possível abrir o envio." tentarDeNovo={`${voltar}/enviar`} />);
  if (!os) notFound();

  // Só faz sentido antes da resposta. Cliente respondeu ou OS andou: o que vale está no detalhe.
  const travados = Boolean(os.orcamento_itens_travados);
  const aplicavel = os.modo === "com_orcamento" && (os.status === "aguardando_orcamento" || os.status === "orcamento_enviado");
  if (!aplicavel) redirect(voltar);

  const modo = os.status === "orcamento_enviado" && travados ? "reenviar" : "enviar";
  const qtdItens = os.qtd_itens ?? 0;
  const semPreco = os.itens_sem_preco ?? 0;

  // Bloqueio (DESIGN §13.16): a mensagem leva ao que destrava.
  if (modo === "enviar" && qtdItens === 0) {
    return casca(
      <>
        <CaixaMensagem tipo="erro">Este orçamento não tem itens. Adicione pelo menos um.</CaixaMensagem>
        <BotaoLink href={voltar}>Adicionar item</BotaoLink>
      </>,
    );
  }
  if (modo === "enviar" && semPreco > 0) {
    return casca(
      <>
        <CaixaMensagem tipo="erro">{semPreco === 1 ? "1 item está sem preço." : `${semPreco} itens estão sem preço.`} Defina antes de enviar.</CaixaMensagem>
        <BotaoLink href={`${voltar}?precificar=1`}>Definir preços</BotaoLink>
      </>,
    );
  }

  // Prévia do que vai ser congelado (a mesma função que congela) e o que foi usado na versão anterior.
  const [previaR, ultimaR] = await Promise.all([
    modo === "enviar" ? supabase.rpc("previa_orcamento", { p_os_id: id }) : Promise.resolve({ data: null, error: null }),
    supabase.from("vw_orcamento_versoes").select("conteudo").eq("os_id", id).order("numero", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (previaR.error) return casca(<CaixaErro titulo="Não foi possível abrir o envio." tentarDeNovo={`${voltar}/enviar`} />);
  const previa = previaDoBanco(previaR.data);
  const anterior = documentoDoBanco(ultimaR.data?.conteudo);

  return casca(
    <TelaEnviarOrcamento
      dados={{
        osId: id,
        osNumero: os.numero ?? 0,
        placa: os.placa ?? "",
        oficinaNome: ctx.oficina_nome ?? "",
        clienteId: os.cliente_id,
        clienteNome: os.cliente_nome ?? "",
        telefone: formatarTelefone(os.cliente_telefone),
        numeroWhatsApp: numeroWhatsAppBrasil(os.cliente_telefone),
        totalCentavos: os.total_centavos ?? 0,
        qtdItens,
        modo,
        linkAtivo: situacaoR.data?.link_situacao === "aberto",
        versao: situacaoR.data?.versao_numero ?? null,
        documento: previa?.documento ?? null,
        expiraPrevia: previa?.expira_em ?? null,
        prazoInicial: anterior?.prazo_estimado ?? "",
        condicoesIniciais: anterior?.condicoes_pagamento ?? "",
        oficinaSemTelefone: ctx.papel === "dono" && previa !== null && !previa.documento.oficina_telefone,
        abrirPrevia: param(sp.ver) === "1",
      }}
    />,
  );
}
