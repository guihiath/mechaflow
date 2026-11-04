import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Lock, Phone } from "lucide-react";
import { cancelarOS, desfazerAprovacaoOS } from "@/acoes/os";
import { Cabecalho } from "@/components/layout/cabecalho";
import { EsconderNavegacao } from "@/components/layout/marcador-pagina";
import { BadgeStatus, EtiquetaModo, EtiquetaPagamento, SemMecanico } from "@/components/os/badge-status";
import { FotosDaOS } from "@/components/fotos/fotos-da-os";
import type { SituacaoCartaoLink } from "@/components/orcamento/cartao-link";
import { DesfazerAprovacao, ProvaOrcamento, RespostasVersoes, type LinhaRespostaVersao } from "@/components/orcamento/prova-orcamento";
import { AprovadoAgora } from "@/components/os/aprovado-agora";
import { DetalheCarregando } from "@/components/os/detalhe-carregando";
import { LinhaTempo } from "@/components/os/linha-tempo";
import { ResumoTotais } from "@/components/os/resumo-totais";
import { ConfirmarComMotivo } from "@/components/ui/confirmar-acao";
import { CaixaErro, Cartao, ChipPlaca, Pagina } from "@/components/ui/estados";
import { CaixaMensagem } from "@/components/ui/formulario";
import { LimparUrl } from "@/components/ui/limpar-url";
import { CartaoVistoriaOS, type ResumoVistoriaOS } from "@/components/vistoria/cartao-vistoria-os";
import { ConviteVistoria } from "@/components/vistoria/convite-vistoria";
import { exigirContexto, type ContextoAtivo } from "@/lib/dal";
import {
  formatarCentavos,
  formatarDiaHora,
  formatarDiaMes,
  formatarNumero,
  formatarPlaca,
  formatarTelefone,
  param,
  soDigitos,
} from "@/lib/formato";
import { podeEnviarFoto } from "@/lib/fotos/regras";
import { CANAL_NA_FRASE, montarEventos, ROTULO_FORMA_PAGAMENTO } from "@/lib/os";
import { ehStatusOS, osEncerrada, proximoPasso, type ModoOS, type StatusOS } from "@/lib/os-status";
import { createClient } from "@/lib/supabase/server";
import {
  AvisoItensMecanico,
  BarraOS,
  BotaoAdicionarItem,
  BotaoDefinirPrecos,
  BotaoLancarItem,
  BotaoReabrir,
  BotaoRegistrarResposta,
  BotaoTrocarMecanico,
  BotaoTrocarModo,
  CartaoLinkOS,
  ListaItensEditavel,
  ListaItensMecanico,
  PainelOS,
  RecusaDestaqueOS,
  type DadosPainel,
  type ItemMecanico,
} from "./painel-os";

export const metadata: Metadata = { title: "OS" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Params = Record<string, string | string[] | undefined>;

/**
 * Detalhe da OS (DESIGN §10.5 e §10.10). O servidor monta a versao do papel:
 * para o MECANICO nenhuma coluna de valor ou contato e consultada nem enviada.
 */
export default function OsPage({ params, searchParams }: PageProps<"/os/[id]">) {
  return (
    <Suspense
      fallback={
        <>
          <Cabecalho titulo="OS" voltar="/entrar" />
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

async function Conteudo({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Params> }) {
  const ctx = await exigirContexto();
  const { id } = await params;
  const sp = await searchParams;
  if (!UUID.test(id)) notFound();
  return ctx.papel === "mecanico" ? <DetalheMecanico ctx={ctx} id={id} /> : <DetalheGerencia ctx={ctx} id={id} sp={sp} />;
}

const COLUNAS_VISTORIA =
  "status, criado_em, criado_por_nome, concluida_em, concluida_por_nome, qtd_avarias, assinado_por_nome, sem_assinatura_motivo";

type Cliente = Awaited<ReturnType<typeof createClient>>;

/** Vistoria de entrada da OS (a anulada não conta: a OS volta a "Sem vistoria"). */
function lerVistoriaEntrada(supabase: Cliente, osId: string) {
  return supabase.from("vw_vistorias").select(COLUNAS_VISTORIA).eq("os_id", osId).eq("tipo", "entrada").neq("status", "anulada").maybeSingle();
}

/** Vistorias de entrada anuladas da OS (só os ids, a mais nova primeiro): "1 vistoria anulada". */
function lerAnuladas(supabase: Cliente, osId: string) {
  return supabase.from("vw_vistorias").select("id").eq("os_id", osId).eq("tipo", "entrada").eq("status", "anulada").order("anulada_em", { ascending: false });
}

const idsAnuladas = (r: Awaited<ReturnType<typeof lerAnuladas>>) => (r.data ?? []).map((a) => a.id).filter((x): x is string => Boolean(x));

/** Chave "vistoria obrigatória" da oficina (todos os papéis leem; ARQUITETURA 12.6). */
function lerObrigatoria(supabase: Cliente, oficinaId: string) {
  return supabase.from("oficinas").select("vistoria_obrigatoria").eq("id", oficinaId).maybeSingle();
}

function resumoVistoria(v: Awaited<ReturnType<typeof lerVistoriaEntrada>>["data"]): ResumoVistoriaOS {
  if (!v?.status) return null;
  return {
    status: v.status,
    criadoEm: v.criado_em,
    criadoPorNome: v.criado_por_nome,
    concluidaEm: v.concluida_em,
    concluidaPorNome: v.concluida_por_nome,
    qtdAvarias: v.qtd_avarias ?? 0,
    assinadoPorNome: v.assinado_por_nome,
    semAssinaturaMotivo: v.sem_assinatura_motivo,
  };
}

const COLUNAS_SITUACAO_LINK =
  "link_situacao, link_criado_em, link_criado_por_nome, link_expira_em, link_revogado_em, link_revogado_motivo, link_revogado_por_nome, versao_numero, respondido, resposta_aprovou, resposta_motivo, respondido_em";

function lerSituacaoLink(supabase: Cliente, osId: string) {
  return supabase.from("vw_orcamento_situacao").select(COLUNAS_SITUACAO_LINK).eq("os_id", osId).maybeSingle();
}

/** Situação do link para o `CartaoLink` (ARQUITETURA 13.9), só em `orcamento_enviado` com versão. */
function cartaoDoLink(s: Awaited<ReturnType<typeof lerSituacaoLink>>["data"]): SituacaoCartaoLink | null {
  if (!s?.link_situacao || !s.versao_numero) return null;
  if (s.link_situacao === "aberto" && s.link_criado_em && s.link_expira_em) {
    return {
      situacao: "ativo",
      geradoPor: s.link_criado_por_nome,
      geradoEm: s.link_criado_em,
      versao: s.versao_numero,
      expiraEm: s.link_expira_em,
      agora: new Date().toISOString(),
    };
  }
  if (s.link_situacao === "vencido" && s.link_expira_em) return { situacao: "vencido", versao: s.versao_numero, expiraEm: s.link_expira_em };
  if (s.link_situacao === "encerrado" && s.link_revogado_motivo === "manual" && s.link_revogado_em) {
    return { situacao: "cancelado", canceladoPor: s.link_revogado_por_nome, canceladoEm: s.link_revogado_em, versao: s.versao_numero };
  }
  return null;
}

const COLUNAS_PROVA =
  "id, versao_id, versao_numero, canal, aprovou, respondente_nome, motivo, valor_centavos, codigo_conferencia, respondido_em, registrada_por_nome, desfeita_em, desfeita_por_nome";

function lerProvas(supabase: Cliente, osId: string) {
  return supabase.from("vw_orcamento_provas").select(COLUNAS_PROVA).eq("os_id", osId).order("respondido_em", { ascending: false });
}

function lerVersoes(supabase: Cliente, osId: string) {
  return supabase.from("vw_orcamento_versoes").select("id, numero").eq("os_id", osId).order("numero", { ascending: false });
}

type Prova = NonNullable<Awaited<ReturnType<typeof lerProvas>>["data"]>[number];
type VersaoResumo = NonNullable<Awaited<ReturnType<typeof lerVersoes>>["data"]>[number];

/** "Ver respostas e versões" (DESIGN §13.12): versão mais nova primeiro; sem resposta, "Enviada". */
function linhasRespostas(osId: string, versoes: VersaoResumo[], provas: Prova[]): LinhaRespostaVersao[] {
  return versoes.flatMap((v): LinhaRespostaVersao[] => {
    const numero = v.numero ?? 0;
    const href = `/os/${osId}/orcamento/${numero}`;
    const dela = provas.filter((p) => p.versao_id === v.id);
    if (!dela.length) return [{ versao: numero, resposta: "enviada", href }];
    return dela.map((p) => ({
      versao: numero,
      resposta: p.aprovou ? "aprovou" : "recusou",
      canal: p.canal ?? undefined,
      nome: p.respondente_nome,
      em: p.respondido_em,
      motivo: p.motivo,
      desfeitaPor: p.desfeita_por_nome,
      desfeitaEm: p.desfeita_em,
      href,
    }));
  });
}

function Erro({ id, voltar }: { id: string; voltar: string }) {
  return (
    <>
      <Cabecalho titulo="OS" voltar={voltar} />
      <Pagina>
        <CaixaErro titulo="Não foi possível abrir a OS." tentarDeNovo={`/os/${id}`} />
      </Pagina>
    </>
  );
}

const veiculoTexto = (o: { veiculo_marca: string | null; veiculo_modelo: string | null; veiculo_ano_modelo: number | null }) =>
  [[o.veiculo_marca, o.veiculo_modelo].filter(Boolean).join(" "), o.veiculo_ano_modelo].filter(Boolean).join(" · ");

function Info({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-sm font-bold text-texto-suave">{rotulo}</dt>
      <dd className="text-lg">{children}</dd>
    </div>
  );
}

// =================================================================== dono e atendente

async function DetalheGerencia({ ctx, id, sp }: { ctx: ContextoAtivo; id: string; sp: Params }) {
  const supabase = await createClient();
  const ehDono = ctx.papel === "dono";
  const [{ data: os, error }, itensR, histR, equipeR, andamentoR, vistoriaR, oficinaR, anuladasR, situacaoLinkR, provasR, versoesR] = await Promise.all([
    supabase.from("vw_os").select("*").eq("id", id).maybeSingle(),
    supabase.from("vw_os_itens").select("*").eq("os_id", id).order("criado_em"),
    supabase.from("vw_os_historico").select("id, evento, de_status, para_status, observacao, por_nome, em").eq("os_id", id).order("em"),
    supabase.from("perfis").select("id, nome, papel").eq("ativo", true).order("nome"),
    supabase.from("vw_os").select("mecanico_id").eq("status", "em_andamento").not("mecanico_id", "is", null),
    lerVistoriaEntrada(supabase, id),
    lerObrigatoria(supabase, ctx.oficina_id),
    lerAnuladas(supabase, id),
    lerSituacaoLink(supabase, id),
    lerProvas(supabase, id),
    lerVersoes(supabase, id),
  ]);
  if (error || itensR.error || histR.error) return <Erro id={id} voltar="/os" />;
  if (!os || !ehStatusOS(os.status)) notFound();

  const status = os.status as StatusOS;
  const modo = (os.modo ?? "com_orcamento") as ModoOS;
  const placa = formatarPlaca(os.placa);
  const encerrada = osEncerrada(status);
  // Fase 6: a garantia da trava é o trigger; aqui é só para a tela não oferecer o que o banco recusa.
  const itensTravados = Boolean(os.orcamento_itens_travados);
  const cartaoLink: SituacaoCartaoLink | null =
    modo === "com_orcamento" && status === "orcamento_enviado"
      ? itensTravados
        ? cartaoDoLink(situacaoLinkR.data)
        : { situacao: "sem_link" }
      : null;
  const obrigatoria = Boolean(oficinaR.data?.vistoria_obrigatoria);
  const itens = itensR.data ?? [];
  const contagem = new Map<string, number>();
  for (const r of andamentoR.data ?? []) if (r.mecanico_id) contagem.set(r.mecanico_id, (contagem.get(r.mecanico_id) ?? 0) + 1);
  const ordem = { mecanico: 0, dono: 1, atendente: 2 } as const;
  const equipe = [...(equipeR.data ?? [])]
    .sort((a, b) => ordem[a.papel] - ordem[b.papel] || a.nome.localeCompare(b.nome, "pt-BR"))
    .map((p) => ({ id: p.id, nome: p.papel === "mecanico" ? p.nome : `${p.nome} (${p.papel})`, emAndamento: contagem.get(p.id) ?? 0 }));

  const dados: DadosPainel = {
    id: os.id!,
    numero: os.numero ?? 0,
    placa: os.placa ?? "",
    status,
    modo,
    gerencia: true,
    ehDono,
    mecanicoDaOS: os.mecanico_id === ctx.usuario_id,
    clienteNome: os.cliente_nome ?? "",
    mecanicoId: os.mecanico_id,
    mecanicoNome: os.mecanico_nome,
    totalCentavos: os.total_centavos ?? 0,
    itensSemPreco: os.itens_sem_preco ?? 0,
    qtdItens: os.qtd_itens ?? itens.length,
    temServico: itens.some((i) => i.tipo === "servico"),
    semItensComTroca: itens.length === 0,
    formaPagamento: os.forma_pagamento,
    pago: Boolean(os.pago_em),
    equipe,
    itens: itens.map((i) => ({
      id: i.id!,
      tipo: i.tipo ?? "servico",
      descricao: i.descricao ?? "",
      quantidade: Number(i.quantidade ?? 1),
      unidade: i.unidade ?? "un",
      catalogoId: i.servico_id ?? i.peca_id,
      precoUnitarioCentavos: i.preco_unitario_centavos,
      subtotalCentavos: i.subtotal_centavos,
      ...(ehDono ? { custoUnitarioCentavos: i.custo_unitario_centavos } : {}),
      lancadoPorNome: i.lancado_pelo_mecanico ? (i.lancado_por_nome ?? "mecânico") : null,
      criadoEm: i.criado_em,
      aposAprovacao: Boolean(i.apos_aprovacao),
      conferido: i.precificado_pelo_balcao_em != null,
    })),
    precificarAoAbrir: param(sp.precificar) === "1",
    // Vistoria obrigatória sem a de entrada concluída: o primário de "em andamento"/"pronta"
    // leva à vistoria (DESIGN §12.2 c; o banco bloqueia pronta e entregue, ARQUITETURA 12.5).
    vistoriaBloqueia:
      obrigatoria && !encerrada && vistoriaR.data?.status !== "concluida" ? { emAndamento: vistoriaR.data?.status === "rascunho" } : null,
    itensTravados,
    linkAtivo: itensTravados && cartaoLink?.situacao === "ativo",
  };

  const aberta = param(sp.aberta);
  const entregue = param(sp.entregue) === "1";
  // Aprovado x atual (DESIGN §11.9): so com orcamento, depois da aprovacao. Nao bloqueia nada.
  const mostrarAprovado =
    modo === "com_orcamento" && os.orcamento_aprovado_em != null && os.valor_aprovado_centavos != null && status !== "cancelada";
  const itensApos = itens.filter((i) => i.apos_aprovacao);
  const semPreco = os.itens_sem_preco ?? 0;
  const aposSemPreco = itensApos.filter((i) => i.preco_unitario_centavos == null).length;
  // Aviso do mecanico ja traz o "Definir preços"; sem ele, o botao fica abaixo dos totais.
  const temAvisoMecanico = !encerrada && itens.some((i) => i.lancado_pelo_mecanico && i.precificado_pelo_balcao_em == null);
  const podeTrocarModo =
    (modo === "com_orcamento" && (status === "aguardando_orcamento" || status === "orcamento_enviado")) ||
    (modo === "direto" && status === "em_andamento" && itens.length === 0);
  const linkSituacao = os.orcamento_link_situacao;
  const frase = proximoPasso(status, {
    entregueEm: os.entregue_em,
    motivoCancelamento: os.motivo_cancelamento,
    linkSituacao,
    temItens: itens.length > 0,
  });
  // A última resposta, se é a aprovação que está valendo. Aprovação de antes da Fase 6 não tem
  // prova: continua no cartão antigo.
  const provas = provasR.data ?? [];
  const provaAtual = modo === "com_orcamento" && os.orcamento_aprovado_em && provas[0]?.aprovou && !provas[0].desfeita_em ? provas[0] : null;
  const situacaoLink = situacaoLinkR.data;
  const recusaAtual = status === "aguardando_orcamento" && situacaoLink?.respondido && situacaoLink.resposta_aprovou === false ? situacaoLink : null;
  const linhasVersoes = linhasRespostas(id, versoesR.data ?? [], provas);
  const temFechamento = status === "entregue" || os.causa_encontrada || os.solucao_aplicada;
  const tel = formatarTelefone(os.cliente_telefone);

  const cartaoCliente = (
    <Cartao>
      <dl className="flex flex-col gap-3">
        <div className="flex flex-col">
          <dt className="text-sm font-bold text-texto-suave">Cliente</dt>
          <dd className="text-lg font-bold">{os.cliente_nome}</dd>
          {tel && (
            <dd>
              <a
                href={`tel:${soDigitos(os.cliente_telefone)}`}
                className="inline-flex min-h-toque items-center gap-2 text-base font-bold text-info-texto underline underline-offset-4"
              >
                <Phone size={20} strokeWidth={2.25} aria-hidden />
                {tel}
              </a>
            </dd>
          )}
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-sm font-bold text-texto-suave">KM na entrada</dt>
          <dd className="font-mono text-lg">{formatarNumero(os.km) || "—"}</dd>
        </div>
        {os.horimetro != null && (
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-sm font-bold text-texto-suave">Horímetro</dt>
            <dd className="font-mono text-lg">{formatarNumero(os.horimetro)}</dd>
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <dt className="text-sm font-bold text-texto-suave">Mecânico</dt>
          <dd className="flex items-center gap-1 text-lg">
            {os.mecanico_nome ?? <SemMecanico />}
            {!encerrada && <BotaoTrocarMecanico />}
          </dd>
        </div>
      </dl>
      <Link
        href={`/veiculos/${os.veiculo_id}`}
        className="mt-2 inline-flex min-h-toque items-center text-base font-bold text-info-texto underline underline-offset-4"
      >
        Ver cadastro do veículo
      </Link>
    </Cartao>
  );
  const cartaoAutorizacao =
    (modo === "direto" && os.autorizado_em && os.autorizado_por_nome) || (modo === "com_orcamento" && os.orcamento_aprovado_em && !provaAtual) ? (
      <>
        {modo === "direto" && os.autorizado_em && os.autorizado_por_nome && (
          <Cartao faixa="bg-info">
            <p className="text-lg font-bold">Autorizado por {os.autorizado_por_nome}</p>
            {os.autorizado_por_telefone && <p className="font-mono text-base">{formatarTelefone(os.autorizado_por_telefone)}</p>}
            <p className="text-sm text-texto-suave">
              {formatarDiaHora(os.autorizado_em)}
              {os.autorizacao_registrada_por_nome && ` · registrado por ${os.autorizacao_registrada_por_nome}`}
            </p>
          </Cartao>
        )}
        {modo === "com_orcamento" && os.orcamento_aprovado_em && !provaAtual && (
          <Cartao faixa="bg-info">
            <p className="text-lg font-bold">
              Aprovado {os.orcamento_aprovado_por_nome ? `por ${os.orcamento_aprovado_por_nome}` : "pelo cliente"}
              {os.orcamento_aprovacao_canal && ` ${CANAL_NA_FRASE[os.orcamento_aprovacao_canal]}`}
            </p>
            {os.valor_aprovado_centavos != null && (
              <p className="text-base">
                Valor aprovado: <span className="font-mono">{formatarCentavos(os.valor_aprovado_centavos)}</span>
              </p>
            )}
            <p className="text-sm text-texto-suave">
              {formatarDiaHora(os.orcamento_aprovado_em)}
              {os.orcamento_aprovacao_registrada_por_nome && ` · marcado por ${os.orcamento_aprovacao_registrada_por_nome}`}
            </p>
            {/* Aprovação de antes da Fase 6, sem prova: o caminho de desfazer é o mesmo (DESIGN §13.12). */}
            {status === "aprovada" && <DesfazerAprovacao osNumero={os.numero ?? 0} aoDesfazer={desfazerAprovacaoOS.bind(null, id)} />}
          </Cartao>
        )}
      </>
    ) : null;

  return (
    <PainelOS os={dados}>
      <EsconderNavegacao />
      <Cabecalho titulo={`OS #${os.numero}`} voltar="/os" />
      <Pagina larga>
        {aberta && <CaixaMensagem tipo="sucesso">OS #{aberta} aberta.</CaixaMensagem>}
        {/* Convite no fim do "Abrir OS" (DESIGN §12.2 a), só na chegada */}
        {param(sp.vistoria) === "oferecer" && !vistoriaR.data && !encerrada && (
          <ConviteVistoria osId={id} obrigatoria={obrigatoria} />
        )}
        {entregue && <CaixaMensagem tipo="sucesso">OS #{os.numero} entregue. Veículo liberado.</CaixaMensagem>}
        {(aberta || entregue || dados.precificarAoAbrir) && <LimparUrl />}
        {status === "cancelada" && (
          <CaixaMensagem tipo="erro">
            OS cancelada em {formatarDiaMes(os.cancelado_em)}
            {os.cancelado_por_nome ? ` por ${os.cancelado_por_nome}` : ""}. Motivo: {os.motivo_cancelamento}
          </CaixaMensagem>
        )}

        <div className="flex flex-col gap-6 lg:grid lg:grid-cols-5 lg:items-start lg:gap-8">
          {/* ------------------------------------------------ coluna esquerda (3/5) */}
          <div className="flex flex-col gap-6 lg:col-span-3">
            {/* Desktop: o aviso dos itens do mecanico fica acima dos itens (DESIGN §11.9) */}
            <div className="flex flex-col gap-2">
              <div className="[&>span]:text-[2.25rem] min-[400px]:[&>span]:text-[2.75rem]">
                <ChipPlaca placa={placa} grande />
              </div>
              {veiculoTexto(os) && <p className="text-xl font-bold">{veiculoTexto(os)}</p>}
              <div className="flex flex-wrap items-center gap-2">
                <BadgeStatus status={status} tamanho="grande" />
                <EtiquetaModo modo={modo} />
              </div>
              {status !== "cancelada" && <p className="text-base text-texto-suave">{frase}</p>}
              {podeTrocarModo && <BotaoTrocarModo />}
              {status === "pronta" && <BotaoReabrir />}
            </div>

            {/* Recusa pelo link: logo depois do topo, é o que o balcão precisa resolver (DESIGN §13.13) */}
            {recusaAtual?.respondido_em && (
              <RecusaDestaqueOS
                motivo={recusaAtual.resposta_motivo}
                respondidoEm={recusaAtual.respondido_em}
                versao={recusaAtual.versao_numero ?? 0}
                telefoneCliente={soDigitos(os.cliente_telefone) || null}
              />
            )}

            {/* Vistoria de entrada: alto na página, é o que se faz na chegada (DESIGN §12.2 b) */}
            <CartaoVistoriaOS
              osId={id}
              vistoria={resumoVistoria(vistoriaR.data)}
              podeFazer={!encerrada}
              encerrada={encerrada}
              obrigatoria={obrigatoria}
              anuladas={idsAnuladas(anuladasR)}
              botaoNaBarra={dados.vistoriaBloqueia != null && (status === "em_andamento" || status === "pronta")}
            />

            {/* Link ou prova: logo depois da vistoria (DESIGN §13.8, §13.11, §13.12). */}
            {cartaoLink && <CartaoLinkOS dados={cartaoLink} />}
            {provaAtual?.respondido_em && provaAtual.canal && (
              <ProvaOrcamento
                osNumero={os.numero ?? 0}
                canal={provaAtual.canal}
                nome={provaAtual.respondente_nome}
                respondidoEm={provaAtual.respondido_em}
                marcadoPor={provaAtual.registrada_por_nome}
                versao={provaAtual.versao_numero ?? 0}
                valorCentavos={provaAtual.valor_centavos ?? 0}
                codigoConferencia={provaAtual.codigo_conferencia ?? ""}
                aoVerAprovado={`/os/${id}/orcamento/${provaAtual.versao_numero}`}
                aoDesfazer={status === "aprovada" ? desfazerAprovacaoOS.bind(null, id) : undefined}
              />
            )}
            {(provas.length > 0 || linhasVersoes.length > 1) && <RespostasVersoes linhas={linhasVersoes} />}

            {/* Celular: aviso dos itens do mecanico logo abaixo do topo (DESIGN §11.9) */}
            <div className="lg:hidden">
              <AvisoItensMecanico />
            </div>

            {/* Celular: cliente e telefone logo abaixo do topo (DESIGN §10.5) */}
            <div className="lg:hidden">{cartaoCliente}</div>

            <Cartao>
              <div className="flex flex-col gap-1">
                <p className="text-sm font-bold text-texto-suave">O que o cliente relatou</p>
                <p className="text-lg whitespace-pre-line">{os.sintoma_relatado || "Não informado"}</p>
                <p className="mt-2 text-sm font-bold text-texto-suave">Código de falha</p>
                {os.codigo_falha ? (
                  <p className="font-mono text-lg">{os.codigo_falha}</p>
                ) : (
                  <p className="text-base text-texto-suave">Não informado</p>
                )}
              </div>
            </Cartao>
            {cartaoAutorizacao && <div className="flex flex-col gap-6 lg:hidden">{cartaoAutorizacao}</div>}

            <div className="hidden lg:block">
              <AvisoItensMecanico />
            </div>

            <section aria-labelledby="titulo-itens" className="flex flex-col gap-3">
              <h2 id="titulo-itens" className="text-2xl">
                Serviços e peças ({itens.length})
              </h2>
              {itensTravados && (
                <p className="flex items-start gap-1.5 text-[15px] font-bold">
                  <Lock size={18} strokeWidth={2.25} aria-hidden className="mt-0.5 shrink-0" />
                  Itens travados: este é o orçamento enviado ao cliente. Para mudar, toque em Alterar.
                </p>
              )}
              {itens.length ? (
                <ListaItensEditavel editavel={!encerrada && !itensTravados} mostrarCusto={ehDono} />
              ) : (
                <div>
                  <p className="text-lg font-bold">Nenhum serviço ou peça ainda.</p>
                  <p className="text-base text-texto-suave">
                    {modo === "direto" ? "Lance o que foi feito e as peças usadas." : "Adicione os itens para montar o orçamento."}
                  </p>
                </div>
              )}
              {!encerrada && !itensTravados && <BotaoAdicionarItem />}
            </section>

            <ResumoTotais
              servicosCentavos={os.total_servicos_centavos ?? 0}
              pecasCentavos={os.total_pecas_centavos ?? 0}
              totalCentavos={os.total_centavos ?? 0}
              // M5 do F3-R1: se todo item sem preco entrou depois da aprovacao, o AprovadoAgora
              // ja diz isso ("+ 1 item sem preço" e a caixa); a linha da Fase 2 seria a 3a vez.
              itensSemPreco={mostrarAprovado && aposSemPreco > 0 && aposSemPreco === semPreco ? 0 : (os.itens_sem_preco ?? 0)}
              custoPecasCentavos={ehDono ? (os.custo_total_centavos ?? 0) : undefined}
            >
              {mostrarAprovado && (
                <AprovadoAgora
                  aprovadoCentavos={os.valor_aprovado_centavos ?? 0}
                  agoraCentavos={os.total_centavos ?? 0}
                  itensAposAprovacao={os.itens_apos_aprovacao ?? itensApos.length}
                  itensAposSemPreco={aposSemPreco}
                />
              )}
            </ResumoTotais>
            {semPreco > 0 && !encerrada && !itensTravados && !temAvisoMecanico && <BotaoDefinirPrecos />}
            {status === "aguardando_orcamento" && itens.length > 0 && (
              <div className="flex flex-col gap-1">
                {semPreco === 0 && (
                  <Link
                    href={`/os/${id}/enviar?ver=1`}
                    className="inline-flex min-h-toque items-center self-start text-base font-bold text-info-texto underline underline-offset-4"
                  >
                    Ver como o cliente vê
                  </Link>
                )}
                <BotaoRegistrarResposta />
              </div>
            )}

            <FotosDaOS
              osId={id}
              numeroOS={os.numero}
              usuarioId={ctx.usuario_id}
              papel={ctx.papel}
              podeEnviar={podeEnviarFoto(ctx.papel, status, os.mecanico_id === ctx.usuario_id)}
            />
          </div>

          {/* ------------------------------------------------ coluna direita (2/5) */}
          <div className="flex flex-col gap-6 lg:col-span-2">
            <BarraOS proximoPasso={frase} />

            <div className="hidden flex-col gap-6 lg:flex">
              {cartaoCliente}
              {cartaoAutorizacao}
            </div>

            {temFechamento && (
              <Cartao>
                <dl className="flex flex-col gap-3">
                  <Info rotulo="Causa encontrada">{os.causa_encontrada || "—"}</Info>
                  <Info rotulo="Solução aplicada">{os.solucao_aplicada || "—"}</Info>
                  {status === "entregue" && (
                    <>
                  <Info rotulo="Código de falha">
                    <span className="font-mono">{os.codigo_falha || "—"}</span>
                  </Info>
                  <Info rotulo="Forma de pagamento">
                    <span className="flex flex-wrap items-center gap-2">
                      {os.forma_pagamento ? ROTULO_FORMA_PAGAMENTO[os.forma_pagamento] : "—"}
                      {os.pago_em ? (
                        <span className="inline-flex items-center gap-2">
                          <EtiquetaPagamento pago />
                          <span className="text-sm text-texto-suave">em {formatarDiaMes(os.pago_em)}</span>
                        </span>
                      ) : (
                        <EtiquetaPagamento pago={false} />
                      )}
                    </span>
                  </Info>
                </>
              )}
            </dl>
          </Cartao>
        )}
        {status === "entregue" && os.pago_em && (
          <p className="rounded-md bg-superficie-2 p-3 text-base font-bold">OS fechada em {formatarDiaMes(os.entregue_em)}.</p>
        )}

        <LinhaTempo eventos={montarEventos(histR.data ?? [], ctx.papel)} />

        {!encerrada && (
          <div className="mt-8">
            <ConfirmarComMotivo
              acao={cancelarOS.bind(null, id, status)}
              pergunta={`Cancelar a OS #${os.numero} (${placa})?`}
              rotuloConfirmar={`Cancelar OS #${os.numero}`}
              aviso={dados.linkAtivo ? "O link enviado ao cliente para de valer." : undefined}
              motivoInicial={recusaAtual ? "Orçamento recusado" : undefined}
            />
          </div>
        )}
      </div>
    </div>
  </Pagina>
</PainelOS>
  );
}

// =================================================================== mecanico (sem valores)

const RECADO: Partial<Record<StatusOS, { tipo: "alerta" | "info" | "sucesso"; texto: string }>> = {
  aguardando_orcamento: { tipo: "alerta", texto: "Esperando o cliente aprovar. Não comece o serviço ainda." },
  orcamento_enviado: { tipo: "alerta", texto: "Esperando o cliente aprovar. Não comece o serviço ainda." },
  aprovada: { tipo: "info", texto: "Aprovada pelo cliente. O dono ou o atendente vai liberar o início." },
  pronta: { tipo: "sucesso", texto: "Pronta. Se precisar voltar a mexer, fale com o dono." },
  entregue: { tipo: "sucesso", texto: "Esta OS já foi encerrada." },
  cancelada: { tipo: "alerta", texto: "Esta OS já foi encerrada." },
};

async function DetalheMecanico({ ctx, id }: { ctx: ContextoAtivo; id: string }) {
  const supabase = await createClient();
  // Colunas escolhidas uma a uma: nada de valor, telefone ou autorizacao (DESIGN §10.10).
  const [{ data: os, error }, itensR, histR, vistoriaR, oficinaR, anuladasR] = await Promise.all([
supabase
  .from("vw_os")
  .select(
    "id, numero, status, modo, placa, veiculo_marca, veiculo_modelo, veiculo_ano_modelo, cliente_nome, mecanico_id, mecanico_nome, km, horimetro, sintoma_relatado, codigo_falha, causa_encontrada, solucao_aplicada",
  )
  .eq("id", id)
  .maybeSingle(),
// Itens: so marcas (booleanos/data), nunca preco, custo ou subtotal (ARQUITETURA F3.5).
supabase
  .from("vw_os_itens")
  .select("id, tipo, descricao, quantidade, unidade, servico_id, peca_id, lancado_pelo_mecanico, lancado_por, precificado_pelo_balcao_em, mecanico_pode_alterar")
  .eq("os_id", id)
  .order("criado_em"),
supabase.from("vw_os_historico").select("id, evento, de_status, para_status, observacao, por_nome, em").eq("os_id", id).order("em"),
lerVistoriaEntrada(supabase, id),
lerObrigatoria(supabase, ctx.oficina_id),
lerAnuladas(supabase, id),
  ]);
  if (error || itensR.error || histR.error) return <Erro id={id} voltar="/minhas-os" />;
  if (!os || !ehStatusOS(os.status)) notFound();

  const status = os.status as StatusOS;
  const minha = os.mecanico_id === ctx.usuario_id;
  const itens: ItemMecanico[] = (itensR.data ?? []).map((i) => {
    const meu = Boolean(i.lancado_pelo_mecanico) && i.lancado_por === ctx.usuario_id;
    return {
      id: i.id!,
      tipo: i.tipo ?? "servico",
      descricao: i.descricao ?? "",
      quantidade: Number(i.quantidade ?? 1),
      unidade: i.unidade ?? "un",
      avulso: !i.servico_id && !i.peca_id,
      meu,
      conferido: meu && i.precificado_pelo_balcao_em != null,
      podeAlterar: Boolean(i.mecanico_pode_alterar),
    };
  });
  // Mesma regra do banco (private.mecanico_lanca_itens + OS atribuida a ele).
  const podeLancar = minha && (status === "aguardando_orcamento" || status === "aprovada" || status === "em_andamento");
  const recado =
status === "aprovada" && minha ? { tipo: "info" as const, texto: "Aprovada pelo cliente. Pode começar o serviço." } : RECADO[status];

  // Sem nenhum valor: so o que a tela do mecanico usa.
  const dados: DadosPainel = {
id: os.id!,
numero: os.numero ?? 0,
placa: os.placa ?? "",
status,
modo: (os.modo ?? "com_orcamento") as ModoOS,
gerencia: false,
ehDono: false,
mecanicoDaOS: minha,
clienteNome: "",
mecanicoId: os.mecanico_id,
mecanicoNome: os.mecanico_nome,
qtdItens: itens.length,
temServico: false,
semItensComTroca: false,
equipe: [],
itens: [],
itensMecanico: itens,
podeLancar,
// Vistoria na barra (DESIGN §12.2 c): OS dele, aberta, vistoria ainda não concluída.
vistoriaBarra:
  minha && !osEncerrada(status) && vistoriaR.data?.status !== "concluida"
    ? { emAndamento: vistoriaR.data?.status === "rascunho", obrigatoria: Boolean(oficinaR.data?.vistoria_obrigatoria) }
    : null,
  };

  return (
<PainelOS os={dados}>
  <Cabecalho titulo={`OS #${os.numero}`} voltar="/minhas-os" />
  <Pagina>
    <div className="flex flex-col gap-2">
      <div className="[&>span]:text-[2.25rem] min-[400px]:[&>span]:text-[2.75rem]">
        <ChipPlaca placa={formatarPlaca(os.placa)} grande />
      </div>
      {veiculoTexto(os) && <p className="text-xl font-bold">{veiculoTexto(os)}</p>}
      <div>
        <BadgeStatus status={status} tamanho="grande" />
      </div>
    </div>

    {recado && (
      <CaixaMensagem tipo={recado.tipo} grande>
        {recado.texto}
      </CaixaMensagem>
    )}

    {/* Mecânico faz a vistoria só na OS dele e aberta (ARQUITETURA 12.6) */}
    <CartaoVistoriaOS
      osId={id}
      vistoria={resumoVistoria(vistoriaR.data)}
      podeFazer={minha && !osEncerrada(status)}
      encerrada={osEncerrada(status)}
      obrigatoria={Boolean(oficinaR.data?.vistoria_obrigatoria)}
      anuladas={idsAnuladas(anuladasR)}
    />

    <Cartao>
      <dl className="flex flex-col gap-3">
        <Info rotulo="Cliente">{os.cliente_nome}</Info>
        <Info rotulo="O que o cliente relatou">
          <span className="whitespace-pre-line">{os.sintoma_relatado || "Não informado"}</span>
        </Info>
        <div className="flex flex-col">
          <dt className="text-sm font-bold text-texto-suave">Código de falha</dt>
          <dd className={os.codigo_falha ? "font-mono text-2xl" : "text-base text-texto-suave"}>{os.codigo_falha || "Não informado"}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-sm font-bold text-texto-suave">KM na entrada</dt>
          <dd className="font-mono text-lg">{formatarNumero(os.km) || "—"}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-sm font-bold text-texto-suave">Mecânico</dt>
          <dd className="text-lg">{os.mecanico_nome ?? <SemMecanico />}</dd>
        </div>
      </dl>
    </Cartao>

    {/* Fotos antes dos itens: é o que o mecânico mais mexe (DESIGN §11.2) */}
    <FotosDaOS osId={id} numeroOS={os.numero} usuarioId={ctx.usuario_id} papel="mecanico" podeEnviar={podeEnviarFoto("mecanico", status, minha)} />

    <section aria-labelledby="titulo-itens" className="flex flex-col gap-3">
      <h2 id="titulo-itens" className="text-2xl">
        Serviços e peças ({itens.length})
      </h2>
      {itens.length ? (
        <ListaItensMecanico />
      ) : podeLancar ? (
        <div>
          <p className="text-lg font-bold">Nenhum serviço ou peça lançado ainda.</p>
          <p className="text-base text-texto-suave">Lance o que você fez e as peças que usou.</p>
        </div>
      ) : (
        <p className="text-base text-texto-suave">Nenhum serviço ou peça lançado ainda.</p>
      )}
      {minha && status === "orcamento_enviado" && (
        <p className="text-base text-texto-suave">O orçamento está com o cliente. Para lançar mais, fale com o balcão.</p>
      )}
      {minha && status === "pronta" && (
        <p className="text-base text-texto-suave">A OS está pronta. Para lançar mais, fale com o dono.</p>
      )}
      {podeLancar && <BotaoLancarItem />}
    </section>

    {(os.causa_encontrada || os.solucao_aplicada) && (
      <Cartao>
        <dl className="flex flex-col gap-3">
          {os.causa_encontrada && <Info rotulo="O que foi encontrado">{os.causa_encontrada}</Info>}
          {os.solucao_aplicada && <Info rotulo="O que foi feito">{os.solucao_aplicada}</Info>}
        </dl>
      </Cartao>
    )}

    <LinhaTempo eventos={montarEventos(histR.data ?? [], "mecanico")} />

    <Link
      href={`/placa?placa=${os.placa}`}
      className="inline-flex min-h-toque items-center self-start text-base font-bold text-info-texto underline underline-offset-4"
    >
      Ver histórico desta placa
    </Link>

    <BarraOS />
  </Pagina>
</PainelOS>
  );
}
