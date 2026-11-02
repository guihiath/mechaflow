import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Cabecalho } from "@/components/layout/cabecalho";
import { EsconderNavegacao } from "@/components/layout/marcador-pagina";
import { DetalheCarregando } from "@/components/os/detalhe-carregando";
import { CaixaErro, Pagina } from "@/components/ui/estados";
import { CaixaMensagem } from "@/components/ui/formulario";
import { LimparUrl } from "@/components/ui/limpar-url";
import { CartaoVistoriaOS } from "@/components/vistoria/cartao-vistoria-os";
import type { NumeroPasso } from "@/components/vistoria/passos-vistoria";
import { exigirContexto } from "@/lib/dal";
import { formatarPlaca, LADOS_AVARIA, param, type LadoAvaria } from "@/lib/formato";
import { BUCKET_VISTORIAS, VALIDADE_URL_FOTO_S } from "@/lib/fotos/regras";
import { ehStatusOS, osEncerrada } from "@/lib/os-status";
import { createClient } from "@/lib/supabase/server";
import { LeituraVistoria, type DadosLeitura, type FotoLeitura } from "./leitura-vistoria";
import { LimparRascunhoVistoria } from "./limpar-rascunho";
import {
  VistoriaRascunho,
  type AvariaServidor,
  type FotoServidor,
  type ItemServidor,
  type VistoriaServidor,
} from "./vistoria-rascunho";

export const metadata: Metadata = { title: "Vistoria" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ehLado = (l: string | null | undefined): l is LadoAvaria => (LADOS_AVARIA as readonly string[]).includes(l ?? "");

/**
 * Vistoria de entrada da OS (F4-B4; DESIGN §12): rascunho = os 5 passos (`?passo=1..5`), com
 * cada mudança guardada no aparelho e salva no banco em segundo plano; concluída ou anulada
 * (`?ver=<id>`) = leitura completa com complementos (F4-B5), miniaturas e assinatura por URL
 * assinada (15 min) e a foto grande assinada só ao abrir.
 * Nada de valor em dinheiro aqui (o mecânico lê a mesma página).
 */
export default function VistoriaPage({ params, searchParams }: PageProps<"/os/[id]/vistoria">) {
  return (
    <Suspense
      fallback={
        <>
          <Cabecalho titulo="Vistoria" voltar="/entrar" />
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
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  // `?ver=<id>`: uma vistoria específica desta OS (a anulada, que a OS não mostra mais).
  const ver = param(sp.ver);
  const verId = UUID.test(ver) ? ver : null;

  const [osR, vR, anuladasR] = await Promise.all([
    supabase.from("vw_os").select("id, numero, status, placa, mecanico_id, veiculo_id").eq("id", id).maybeSingle(),
    verId
      ? supabase.from("vw_vistorias").select("*").eq("id", verId).eq("os_id", id).maybeSingle()
      : supabase.from("vw_vistorias").select("*").eq("os_id", id).eq("tipo", "entrada").neq("status", "anulada").maybeSingle(),
    supabase
      .from("vw_vistorias")
      .select("id")
      .eq("os_id", id)
      .eq("tipo", "entrada")
      .eq("status", "anulada")
      .order("anulada_em", { ascending: false }),
  ]);
  const voltar = `/os/${id}`;
  if (osR.error || vR.error) {
    return (
      <>
        <Cabecalho titulo="Vistoria" voltar={voltar} />
        <Pagina>
          <CaixaErro titulo="Não foi possível abrir a vistoria." tentarDeNovo={`/os/${id}/vistoria`} />
        </Pagina>
      </>
    );
  }
  const os = osR.data;
  if (!os || !ehStatusOS(os.status)) notFound();
  const placa = formatarPlaca(os.placa);
  const encerrada = osEncerrada(os.status);
  const v = vR.data;
  if (verId && !v?.id) notFound();
  const titulo = `Vistoria · ${placa}`;
  const anuladas = (anuladasR.data ?? []).map((a) => a.id).filter((x): x is string => Boolean(x));
  const podeFazer = !encerrada && (ctx.papel !== "mecanico" || os.mecanico_id === ctx.usuario_id);

  if (!v?.id) {
    return (
      <>
        <EsconderNavegacao />
        <Cabecalho titulo={titulo} voltar={voltar} />
        <Pagina>
          <CartaoVistoriaOS osId={id} vistoria={null} podeFazer={podeFazer} encerrada={encerrada} anuladas={anuladas} />
        </Pagina>
      </>
    );
  }

  const concluida = v.status === "concluida";
  const leitura = concluida || v.status === "anulada";
  const [avR, fotosR, itensR, veiculoR, autorizouR, complR] = await Promise.all([
    supabase.from("vistoria_avarias").select("id, lado, descricao, criado_em").eq("vistoria_id", v.id).order("criado_em"),
    supabase
      .from("vw_vistoria_fotos")
      .select("id, tipo, avaria_id, complemento_id, caminho, caminho_miniatura, enviada_em, criado_em, criado_por_nome")
      .eq("vistoria_id", v.id)
      .order("criado_em"),
    supabase.from("vistoria_itens").select("id, ordem, descricao, situacao, observacao").eq("vistoria_id", v.id).order("ordem"),
    // Último KM/horímetro do veículo: só para o aviso "menor que o último" (não bloqueia).
    !leitura && os.veiculo_id
      ? supabase.from("veiculos").select("km_atual, horimetro_atual").eq("id", os.veiculo_id).maybeSingle()
      : Promise.resolve({ data: null }),
    // Atalho "quem autorizou" no nome de quem assina: só dono/atendente (o mecânico não lê).
    !leitura && ctx.papel !== "mecanico"
      ? supabase.from("vw_os").select("autorizado_por_nome").eq("id", id).maybeSingle()
      : Promise.resolve({ data: null }),
    leitura
      ? supabase.from("vw_vistoria_complementos").select("id, texto, criado_em, criado_por_nome").eq("vistoria_id", v.id).order("criado_em")
      : Promise.resolve({ data: null }),
  ]);
  const todas = (fotosR.data ?? []).filter((f) => f.id && f.caminho && f.caminho_miniatura);
  const fotos = todas.filter((f) => !f.complemento_id); // originais (avaria, painel)
  const enviadas = todas.filter((f) => f.enviada_em);

  // URLs assinadas (15 min): só as miniaturas e a assinatura. A foto grande da leitura é assinada
  // no navegador, só ao abrir a tela cheia (padrão da Fase 3). A assinatura do rascunho, se já
  // subiu, também (sem arquivo o Storage recusa e a prévia fica vazia).
  const caminhos = [...enviadas.map((f) => f.caminho_miniatura!), ...(v.assinatura_caminho ? [v.assinatura_caminho] : [])];
  const urls = new Map<string, string>();
  if (caminhos.length) {
    const { data } = await supabase.storage.from(BUCKET_VISTORIAS).createSignedUrls(caminhos, VALIDADE_URL_FOTO_S);
    for (const s of data ?? []) if (s.path && s.signedUrl && !s.error) urls.set(s.path, s.signedUrl);
  }
  const assinaturaUrl = v.assinatura_caminho ? (urls.get(v.assinatura_caminho) ?? null) : null;

  if (leitura) {
    const paraLeitura = (f: (typeof todas)[number]): FotoLeitura => ({
      id: f.id!,
      caminho: f.caminho!,
      src: urls.get(f.caminho_miniatura!) ?? null,
      enviadoPor: f.criado_por_nome,
      enviadoEm: f.enviada_em,
    });
    const originais = enviadas.filter((f) => !f.complemento_id);
    const dadosLeitura: DadosLeitura = {
      id: v.id,
      osId: id,
      numeroOS: os.numero ?? 0,
      placa,
      concluidaEm: v.concluida_em,
      concluidaPor: v.concluida_por_nome ?? "—",
      km: v.km,
      horimetro: v.horimetro,
      combustivel: v.combustivel,
      objetos: v.objetos,
      observacoes: v.observacoes,
      semAvarias: Boolean(v.sem_avarias),
      hash: v.hash_conteudo,
      assinatura: v.sem_assinatura_motivo
        ? { tipo: "sem", motivo: v.sem_assinatura_motivo, nome: v.assinado_por_nome }
        : concluida || v.assinatura_caminho
          ? { tipo: "assinada", src: assinaturaUrl, nome: v.assinado_por_nome ?? "—", em: v.concluida_em }
          : null,
      itens: (itensR.data ?? []).map((i) => ({ id: i.id, descricao: i.descricao, situacao: i.situacao, observacao: i.observacao })),
      avarias: (avR.data ?? [])
        .filter((a) => ehLado(a.lado))
        .map((a) => ({
          id: a.id,
          lado: a.lado as LadoAvaria,
          descricao: a.descricao,
          fotos: originais.filter((f) => f.avaria_id === a.id).map(paraLeitura),
        })),
      painel: originais.filter((f) => f.tipo === "painel").map(paraLeitura),
      complementos: (complR.data ?? [])
        .filter((c) => c.id && c.criado_em)
        .map((c) => ({
          id: c.id!,
          texto: c.texto,
          criadoEm: c.criado_em!,
          criadoPor: c.criado_por_nome ?? "—",
          fotos: enviadas.filter((f) => f.complemento_id === c.id).map(paraLeitura),
        })),
      fotosComplemento: todas.filter((f) => f.complemento_id).length,
      anulada:
        v.status === "anulada" && v.anulada_em
          ? { em: v.anulada_em, por: v.anulada_por_nome ?? "o dono", motivo: v.motivo_anulacao ?? "" }
          : null,
      podeComplementar: Boolean(v.pode_complementar),
      podeAnular: Boolean(v.pode_anular),
    };
    // Anulada: a OS pode ter (ou ganhar) outra vistoria de entrada.
    const ativaR =
      v.status === "anulada"
        ? await supabase
            .from("vw_vistorias")
            .select("status, criado_em, criado_por_nome, concluida_em, concluida_por_nome, qtd_avarias, assinado_por_nome, sem_assinatura_motivo")
            .eq("os_id", id)
            .eq("tipo", "entrada")
            .neq("status", "anulada")
            .maybeSingle()
        : null;
    const ativa = ativaR?.data?.status
      ? {
          status: ativaR.data.status,
          criadoEm: ativaR.data.criado_em,
          criadoPorNome: ativaR.data.criado_por_nome,
          concluidaEm: ativaR.data.concluida_em,
          concluidaPorNome: ativaR.data.concluida_por_nome,
          qtdAvarias: ativaR.data.qtd_avarias ?? 0,
          assinadoPorNome: ativaR.data.assinado_por_nome,
          semAssinaturaMotivo: ativaR.data.sem_assinatura_motivo,
        }
      : null;
    return (
      <>
        <EsconderNavegacao />
        {concluida && <LimparRascunhoVistoria usuarioId={ctx.usuario_id} vistoriaId={v.id} />}
        <Cabecalho titulo={titulo} voltar={voltar} />
        <Pagina>
          {param(sp.concluida) === "1" && concluida && (
            <CaixaMensagem tipo="sucesso">Vistoria concluída. Agora ninguém pode mudar.</CaixaMensagem>
          )}
          {param(sp.anulada) === "1" && v.status === "anulada" && (
            <CaixaMensagem tipo="sucesso">Vistoria anulada. Ela fica guardada aqui e outra pode ser feita na OS.</CaixaMensagem>
          )}
          {(param(sp.concluida) === "1" || param(sp.anulada) === "1") && <LimparUrl manter={verId ? `?ver=${verId}` : undefined} />}
          {v.status === "anulada" && (
            <CartaoVistoriaOS osId={id} vistoria={ativa} podeFazer={podeFazer} encerrada={encerrada} />
          )}
          <LeituraVistoria dados={dadosLeitura} usuarioId={ctx.usuario_id} ehMecanico={ctx.papel === "mecanico"} />
        </Pagina>
      </>
    );
  }

  const paraServidor = (f: (typeof fotos)[number]): FotoServidor => ({
    id: f.id!,
    caminho: f.caminho!,
    caminhoMiniatura: f.caminho_miniatura!,
    src: f.enviada_em ? (urls.get(f.caminho_miniatura!) ?? null) : null,
    enviada: Boolean(f.enviada_em),
  });
  const avarias: AvariaServidor[] = (avR.data ?? [])
    .filter((a) => ehLado(a.lado))
    .map((a) => ({
      id: a.id,
      lado: a.lado as LadoAvaria,
      descricao: a.descricao,
      fotos: fotos.filter((f) => f.avaria_id === a.id).map(paraServidor),
    }));
  const fotosPainel = fotos.filter((f) => f.tipo === "painel").map(paraServidor);
  const itens: ItemServidor[] = (itensR.data ?? []).map((i) => ({
    id: i.id,
    descricao: i.descricao,
    situacao: i.situacao,
    observacao: i.observacao ?? "",
  }));
  const pedido = Number(param(sp.passo));
  const passoUrl = Number.isInteger(pedido) && pedido >= 1 && pedido <= 5 ? (pedido as NumeroPasso) : null;

  const dados: VistoriaServidor = {
    id: v.id,
    podeEditar: Boolean(v.pode_editar),
    criadoPorId: v.criado_por,
    criadoPorNome: v.criado_por_nome,
    criadoEm: v.criado_em,
    km: v.km,
    horimetro: v.horimetro,
    kmVeiculo: veiculoR.data?.km_atual ?? null,
    horimetroVeiculo: veiculoR.data?.horimetro_atual ?? null,
    combustivel: v.combustivel,
    objetos: v.objetos,
    observacoes: v.observacoes,
    semAvarias: Boolean(v.sem_avarias),
    assinadoPorNome: v.assinado_por_nome,
    assinaturaId: v.assinatura_id,
    assinaturaUrl,
    autorizadoPorNome: autorizouR.data?.autorizado_por_nome ?? null,
    qtdFotos: fotos.length,
  };

  return (
    <>
      <EsconderNavegacao />
      <VistoriaRascunho
        osId={id}
        numeroOS={os.numero ?? null}
        placa={placa}
        titulo={titulo}
        usuarioId={ctx.usuario_id}
        vistoria={dados}
        itens={itens}
        avarias={avarias}
        fotosPainel={fotosPainel}
        passoUrl={passoUrl}
        passoInicial={passoInicial(dados, itens, avarias.length)}
      />
    </>
  );
}

/**
 * Retomada (DESIGN §12.3): abre no primeiro passo com pendência; nada pendente = passo 5.
 * O rascunho do aparelho pode mudar isso depois de hidratar (o servidor não o lê).
 */
function passoInicial(v: VistoriaServidor, itens: ItemServidor[], qtdAvarias: number): NumeroPasso {
  if (v.km == null || !v.combustivel) return 1;
  if (itens.some((i) => !i.situacao)) return 2;
  if (qtdAvarias === 0 && !v.semAvarias) return 3;
  return 5;
}
