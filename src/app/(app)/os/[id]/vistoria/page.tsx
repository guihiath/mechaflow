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
import { exigirContexto } from "@/lib/dal";
import { formatarPlaca, LADOS_AVARIA, param, type LadoAvaria } from "@/lib/formato";
import { BUCKET_VISTORIAS, VALIDADE_URL_FOTO_S } from "@/lib/fotos/regras";
import { ehStatusOS, osEncerrada } from "@/lib/os-status";
import { createClient } from "@/lib/supabase/server";
import { LeituraVistoria, type AvariaLeitura } from "./leitura-vistoria";
import { VistoriaRascunho, type AvariaServidor } from "./vistoria-rascunho";

export const metadata: Metadata = { title: "Vistoria" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ehLado = (l: string | null | undefined): l is LadoAvaria => (LADOS_AVARIA as readonly string[]).includes(l ?? "");

/**
 * Vistoria de entrada da OS — versão mínima do F4-B2 (1 avaria com foto + assinatura):
 * rascunho = tela única (avarias, checklist "Marcar o resto como ok", nome + assinatura,
 * concluir); concluída = leitura com a foto e a assinatura por URL assinada (15 min).
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

  const [osR, vR] = await Promise.all([
    supabase.from("vw_os").select("id, numero, status, placa, mecanico_id").eq("id", id).maybeSingle(),
    supabase.from("vw_vistorias").select("*").eq("os_id", id).eq("tipo", "entrada").neq("status", "anulada").maybeSingle(),
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
  const titulo = `Vistoria · ${placa}`;

  if (!v?.id) {
    const podeFazer = !encerrada && (ctx.papel !== "mecanico" || os.mecanico_id === ctx.usuario_id);
    return (
      <>
        <EsconderNavegacao />
        <Cabecalho titulo={titulo} voltar={voltar} />
        <Pagina>
          <CartaoVistoriaOS osId={id} vistoria={null} podeFazer={podeFazer} encerrada={encerrada} />
        </Pagina>
      </>
    );
  }

  const [avR, fotosR] = await Promise.all([
    supabase.from("vistoria_avarias").select("id, lado, descricao, criado_em").eq("vistoria_id", v.id).order("criado_em"),
    supabase
      .from("vw_vistoria_fotos")
      .select("id, tipo, avaria_id, caminho, caminho_miniatura, enviada_em, criado_em")
      .eq("vistoria_id", v.id)
      .is("complemento_id", null)
      .order("criado_em"),
  ]);
  const concluida = v.status === "concluida";
  const fotos = (fotosR.data ?? []).filter((f) => f.id && f.caminho && f.caminho_miniatura);
  const enviadas = fotos.filter((f) => f.enviada_em);

  // URLs assinadas: miniaturas sempre; foto grande e assinatura na leitura (e a assinatura
  // do rascunho, se já subiu: sem arquivo o Storage recusa e a prévia fica vazia).
  const caminhos = [
    ...enviadas.map((f) => f.caminho_miniatura!),
    ...(concluida ? enviadas.map((f) => f.caminho!) : []),
    ...(v.assinatura_caminho ? [v.assinatura_caminho] : []),
  ];
  const urls = new Map<string, string>();
  if (caminhos.length) {
    const { data } = await supabase.storage.from(BUCKET_VISTORIAS).createSignedUrls(caminhos, VALIDADE_URL_FOTO_S);
    for (const s of data ?? []) if (s.path && s.signedUrl && !s.error) urls.set(s.path, s.signedUrl);
  }
  const assinaturaUrl = v.assinatura_caminho ? (urls.get(v.assinatura_caminho) ?? null) : null;

  if (concluida) {
    const avarias: AvariaLeitura[] = (avR.data ?? [])
      .filter((a) => ehLado(a.lado))
      .map((a) => ({
        id: a.id,
        lado: a.lado as LadoAvaria,
        descricao: a.descricao,
        fotos: enviadas
          .filter((f) => f.avaria_id === a.id)
          .map((f) => ({ id: f.id!, src: urls.get(f.caminho_miniatura!) ?? null, srcGrande: urls.get(f.caminho!) ?? null })),
      }));
    return (
      <>
        <EsconderNavegacao />
        <Cabecalho titulo={titulo} voltar={voltar} />
        <Pagina>
          {param(sp.concluida) === "1" && (
            <>
              <CaixaMensagem tipo="sucesso">Vistoria concluída. Agora ninguém pode mudar.</CaixaMensagem>
              <LimparUrl />
            </>
          )}
          <LeituraVistoria
            numeroOS={os.numero ?? 0}
            concluidaEm={v.concluida_em ?? ""}
            concluidaPor={v.concluida_por_nome ?? "—"}
            assinatura={
              v.sem_assinatura_motivo
                ? { tipo: "sem", motivo: v.sem_assinatura_motivo, nome: v.assinado_por_nome }
                : { tipo: "assinada", src: assinaturaUrl, nome: v.assinado_por_nome ?? "—", em: v.concluida_em }
            }
            avarias={avarias}
            semAvarias={Boolean(v.sem_avarias)}
            itensTotal={v.itens_total ?? 0}
            itensComProblema={v.itens_com_problema ?? 0}
            hash={v.hash_conteudo}
          />
        </Pagina>
      </>
    );
  }

  const avarias: AvariaServidor[] = (avR.data ?? [])
    .filter((a) => ehLado(a.lado))
    .map((a) => ({
      id: a.id,
      lado: a.lado as LadoAvaria,
      descricao: a.descricao,
      fotos: fotos
        .filter((f) => f.avaria_id === a.id)
        .map((f) => ({
          id: f.id!,
          caminho: f.caminho!,
          caminhoMiniatura: f.caminho_miniatura!,
          src: f.enviada_em ? (urls.get(f.caminho_miniatura!) ?? null) : null,
          enviada: Boolean(f.enviada_em),
        })),
    }));

  return (
    <>
      <EsconderNavegacao />
      <Cabecalho titulo={titulo} voltar={voltar} />
      <Pagina>
        <VistoriaRascunho
          osId={id}
          numeroOS={os.numero ?? null}
          placa={placa}
          usuarioId={ctx.usuario_id}
          vistoria={{
            id: v.id,
            podeEditar: Boolean(v.pode_editar),
            semAvarias: Boolean(v.sem_avarias),
            itensMarcados: v.itens_marcados ?? 0,
            itensTotal: v.itens_total ?? 0,
            fotosPendentes: v.fotos_pendentes ?? 0,
            assinadoPorNome: v.assinado_por_nome,
            assinaturaId: v.assinatura_id,
            assinaturaUrl,
            criadoPorNome: v.criado_por_nome,
            criadoEm: v.criado_em,
          }}
          avarias={avarias}
        />
      </Pagina>
    </>
  );
}
