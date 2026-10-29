import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Phone } from "lucide-react";
import { cancelarOS } from "@/acoes/os";
import { Cabecalho } from "@/components/layout/cabecalho";
import { BadgeStatus, EtiquetaModo, EtiquetaPagamento, SemMecanico } from "@/components/os/badge-status";
import { DetalheCarregando } from "@/components/os/detalhe-carregando";
import { LinhaItemOS, ListaItensOS } from "@/components/os/linha-item-os";
import { LinhaTempo } from "@/components/os/linha-tempo";
import { ResumoTotais } from "@/components/os/resumo-totais";
import { ConfirmarComMotivo } from "@/components/ui/confirmar-acao";
import { CaixaErro, Cartao, ChipPlaca, Pagina } from "@/components/ui/estados";
import { CaixaMensagem } from "@/components/ui/formulario";
import { LimparUrl } from "@/components/ui/limpar-url";
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
import { CANAL_NA_FRASE, montarEventos, ROTULO_FORMA_PAGAMENTO, textoUnidade } from "@/lib/os";
import { ehStatusOS, osEncerrada, proximoPasso, type ModoOS, type StatusOS } from "@/lib/os-status";
import { createClient } from "@/lib/supabase/server";
import {
  BarraOS,
  BotaoAdicionarItem,
  BotaoJaMandei,
  BotaoTrocarMecanico,
  BotaoTrocarModo,
  ListaItensEditavel,
  PainelOS,
  type DadosPainel,
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
          <Cabecalho titulo="OS" voltar="/os" />
          <Pagina>
            <DetalheCarregando />
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
  const [{ data: os, error }, itensR, histR, equipeR, andamentoR] = await Promise.all([
    supabase.from("vw_os").select("*").eq("id", id).maybeSingle(),
    supabase.from("vw_os_itens").select("*").eq("os_id", id).order("criado_em"),
    supabase.from("vw_os_historico").select("id, evento, de_status, para_status, observacao, por_nome, em").eq("os_id", id).order("em"),
    supabase.from("perfis").select("id, nome, papel").eq("ativo", true).order("nome"),
    supabase.from("vw_os").select("mecanico_id").eq("status", "em_andamento").not("mecanico_id", "is", null),
  ]);
  if (error || itensR.error || histR.error) return <Erro id={id} voltar="/os" />;
  if (!os || !ehStatusOS(os.status)) notFound();

  const status = os.status as StatusOS;
  const modo = (os.modo ?? "com_orcamento") as ModoOS;
  const placa = formatarPlaca(os.placa);
  const encerrada = osEncerrada(status);
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
    })),
  };

  const aberta = param(sp.aberta);
  const entregue = param(sp.entregue) === "1";
  const passouAprovado =
    modo === "com_orcamento" &&
    os.valor_aprovado_centavos != null &&
    (os.total_centavos ?? 0) > os.valor_aprovado_centavos &&
    !encerrada;
  const podeTrocarModo =
    (modo === "com_orcamento" && (status === "aguardando_orcamento" || status === "orcamento_enviado")) ||
    (modo === "direto" && status === "em_andamento" && itens.length === 0);
  const frase = proximoPasso(status, { entregueEm: os.entregue_em, motivoCancelamento: os.motivo_cancelamento });
  const temFechamento = status === "entregue" || os.causa_encontrada || os.solucao_aplicada;
  const tel = formatarTelefone(os.cliente_telefone);

  return (
    <PainelOS os={dados}>
      <span hidden data-esconde-navegacao />
      <Cabecalho titulo={`OS #${os.numero}`} voltar="/os" />
      <Pagina larga>
        {aberta && <CaixaMensagem tipo="sucesso">OS #{aberta} aberta.</CaixaMensagem>}
        {entregue && <CaixaMensagem tipo="sucesso">OS #{os.numero} entregue. Veículo liberado.</CaixaMensagem>}
        {(aberta || entregue) && <LimparUrl />}
        {status === "cancelada" && (
          <CaixaMensagem tipo="erro">
            OS cancelada em {formatarDiaMes(os.cancelado_em)}
            {os.cancelado_por_nome ? ` por ${os.cancelado_por_nome}` : ""}. Motivo: {os.motivo_cancelamento}
          </CaixaMensagem>
        )}

        <div className="flex flex-col gap-6 lg:grid lg:grid-cols-5 lg:items-start lg:gap-8">
          {/* ------------------------------------------------ coluna esquerda (3/5) */}
          <div className="flex flex-col gap-6 lg:col-span-3">
            <div className="flex flex-col gap-2">
              <div className="[&>span]:text-[2.25rem]">
                <ChipPlaca placa={placa} grande />
              </div>
              {veiculoTexto(os) && <p className="text-xl font-bold">{veiculoTexto(os)}</p>}
              <div className="flex flex-wrap items-center gap-2">
                <BadgeStatus status={status} tamanho="grande" />
                <EtiquetaModo modo={modo} />
              </div>
              <p className="text-base text-texto-suave">{frase}</p>
              {podeTrocarModo && <BotaoTrocarModo />}
            </div>

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

            <section aria-labelledby="titulo-itens" className="flex flex-col gap-3">
              <h2 id="titulo-itens" className="text-2xl">
                Serviços e peças ({itens.length})
              </h2>
              {itens.length ? (
                <ListaItensEditavel editavel={!encerrada} mostrarCusto={ehDono} />
              ) : (
                <div>
                  <p className="text-lg font-bold">Nenhum serviço ou peça ainda.</p>
                  <p className="text-base text-texto-suave">
                    {modo === "direto" ? "Lance o que foi feito e as peças usadas." : "Adicione os itens para montar o orçamento."}
                  </p>
                </div>
              )}
              {!encerrada && <BotaoAdicionarItem />}
            </section>

            <ResumoTotais
              servicosCentavos={os.total_servicos_centavos ?? 0}
              pecasCentavos={os.total_pecas_centavos ?? 0}
              totalCentavos={os.total_centavos ?? 0}
              itensSemPreco={os.itens_sem_preco ?? 0}
              custoPecasCentavos={ehDono ? (os.custo_total_centavos ?? 0) : undefined}
            />
            {passouAprovado && (
              <CaixaMensagem tipo="alerta">
                O total passou do valor aprovado ({formatarCentavos(os.valor_aprovado_centavos)}). Avise o cliente.
              </CaixaMensagem>
            )}
            {status === "aguardando_orcamento" && itens.length > 0 && <BotaoJaMandei />}
          </div>

          {/* ------------------------------------------------ coluna direita (2/5) */}
          <div className="flex flex-col gap-6 lg:col-span-2">
            <BarraOS proximoPasso={frase} />

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
            {modo === "com_orcamento" && os.orcamento_aprovado_em && (
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
              </Cartao>
            )}

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
  const [{ data: os, error }, itensR, histR] = await Promise.all([
    supabase
      .from("vw_os")
      .select(
        "id, numero, status, modo, placa, veiculo_marca, veiculo_modelo, veiculo_ano_modelo, cliente_nome, mecanico_id, mecanico_nome, km, horimetro, sintoma_relatado, codigo_falha, causa_encontrada, solucao_aplicada",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("vw_os_itens").select("id, tipo, descricao, quantidade, unidade").eq("os_id", id).order("criado_em"),
    supabase.from("vw_os_historico").select("id, evento, de_status, para_status, observacao, por_nome, em").eq("os_id", id).order("em"),
  ]);
  if (error || itensR.error || histR.error) return <Erro id={id} voltar="/minhas-os" />;
  if (!os || !ehStatusOS(os.status)) notFound();

  const status = os.status as StatusOS;
  const minha = os.mecanico_id === ctx.usuario_id;
  const itens = itensR.data ?? [];
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
    totalCentavos: null,
    itensSemPreco: 0,
    qtdItens: itens.length,
    temServico: false,
    semItensComTroca: false,
    formaPagamento: null,
    pago: false,
    equipe: [],
    itens: [],
  };

  return (
    <PainelOS os={dados}>
      <Cabecalho titulo={`OS #${os.numero}`} voltar="/minhas-os" />
      <Pagina>
        <div className="flex flex-col gap-2">
          <div className="[&>span]:text-[2.25rem]">
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

        <section aria-labelledby="titulo-itens" className="flex flex-col gap-3">
          <h2 id="titulo-itens" className="text-2xl">
            Serviços e peças ({itens.length})
          </h2>
          {itens.length ? (
            <ListaItensOS rotulo="Serviços e peças">
              {[...itens]
                .sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === "servico" ? -1 : 1))
                .map((i) => (
                  <LinhaItemOS
                    key={i.id}
                    semValores
                    item={{
                      tipo: i.tipo ?? "servico",
                      descricao: i.descricao ?? "",
                      quantidade: Number(i.quantidade ?? 1),
                      unidade: textoUnidade(i.unidade),
                    }}
                  />
                ))}
            </ListaItensOS>
          ) : (
            <p className="text-base text-texto-suave">Nenhum serviço ou peça lançado ainda.</p>
          )}
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
