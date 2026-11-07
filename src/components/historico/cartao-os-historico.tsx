"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { ChevronDown, CircleAlert } from "lucide-react";
import { BadgeStatus, EtiquetaPagamento } from "@/components/os/badge-status";
import { FotoTelaCheia, type FotoTelaCheiaDados } from "@/components/os/foto-tela-cheia";
import { GradeFotos } from "@/components/os/grade-fotos";
import { LinhaTempo, type EventoOS } from "@/components/os/linha-tempo";
import { ResumoTotais } from "@/components/os/resumo-totais";
import { Botao, classesBotao, classesFantasma } from "@/components/ui/botao";
import { ValorQuebravel } from "@/components/ui/valor-quebravel";
import { VistoriaSemAssinatura, type VistoriaMecanico } from "@/components/historico/vistoria-sem-assinatura";
import { EtiquetaVistoria } from "@/components/vistoria/etiquetas-vistoria";
import {
  formatarCentavos,
  formatarDiaHora,
  formatarNumero,
  formatarQuantidade,
  ROTULO_TIPO_VISTORIA,
  type StatusVistoria,
  type TipoVistoria,
} from "@/lib/formato";
import { ROTULO_FORMA_PAGAMENTO, textoUnidade, type FormaPagamento } from "@/lib/os";
import { INFO_STATUS, type StatusOS } from "@/lib/os-status";
import { formatarDataCurta, formatarDataLonga, textoContagemHistorico } from "@/lib/painel";

export type PapelHistorico = "dono" | "atendente" | "mecanico";

/**
 * OS do histórico, fechada (DESIGN §14.6 e §14.7). Os campos de dinheiro e de balcão são opcionais:
 * a leitura do mecânico não os traz (lista fechada da decisão 7), e o componente, com
 * `papel="mecanico"`, não os mostra mesmo que venham.
 */
export type OSHistorico = {
  id: string;
  numero: number;
  status: StatusOS;
  /** ISO (UTC): data do título do cartão e do grupo por ano. */
  abertaEm: string;
  km?: number | null;
  sintoma?: string | null;
  /**
   * "3 serviços · 2 peças · 5 fotos". A leitura `historico_placa` traz só `qtd_itens` e `qtd_fotos`
   * (ARQUITETURA §14.6): sem a divisão, passe `itens` e a linha vira "5 itens · 5 fotos".
   */
  contagem: { servicos?: number; pecas?: number; itens?: number; fotos?: number | null };
  /** Etiqueta da vistoria (concluída tem prioridade sobre anulada). `null` = sem vistoria. */
  vistoria?: StatusVistoria | null;
  /** `/os/<id>`. Mecânico: só quando ele já pode abrir aquela OS (senão, sem link). */
  hrefOS?: string | null;
  // ---- só dono e atendente
  cliente?: string | null;
  totalCentavos?: number | null;
  /** OS entregue: pago ou a receber. */
  pago?: boolean | null;
  motivoCancelamento?: string | null;
};

export type ItemHistorico = {
  id: string;
  descricao: string;
  quantidade: number;
  unidade: string;
  /** Só dono e atendente. */
  unitarioCentavos?: number | null;
  subtotalCentavos?: number | null;
};

export type VistoriaHistorico = {
  id: string;
  tipo: TipoVistoria;
  status: "concluida" | "anulada";
  /** ISO (UTC). */
  em: string;
  /** Quem fez. Mecânico: nunca chega (nome de outra pessoa). */
  por?: string | null;
  /** Anulada, só dono e atendente; o mecânico vê o texto fixo. */
  motivo?: string | null;
  hrefLeitura?: string | null;
  hrefPdf?: string | null;
  /** Mecânico: a vistoria abre no próprio cartão, sem assinatura (DESIGN §14.7). */
  leitura?: VistoriaMecanico | null;
};

/** O que só chega ao expandir (busca sob demanda; URLs das fotos assinadas por 15 min). */
export type DetalheOSHistorico = {
  entregueEm?: string | null;
  /** Só dono e atendente. */
  mecanico?: string | null;
  causa?: string | null;
  solucao?: string | null;
  codigoFalha?: string | null;
  servicos: ItemHistorico[];
  pecas: ItemHistorico[];
  /** Só dono e atendente. */
  totais?: { servicosCentavos: number; pecasCentavos: number; totalCentavos: number } | null;
  /** Só dono e atendente, OS entregue. */
  pagamento?: { pagoEm?: string | null; forma?: FormaPagamento | null } | null;
  vistorias: VistoriaHistorico[];
  fotos: FotoTelaCheiaDados[];
  /** Só dono e atendente. */
  observacoes?: string | null;
  /** Só dono e atendente (`montarEventos`). */
  eventos?: EventoOS[];
};

type EstadoDetalhe = { tipo: "fechado" } | { tipo: "carregando" } | { tipo: "erro" } | { tipo: "pronto"; dados: DetalheOSHistorico };

/**
 * Cartão de OS do histórico da placa (DESIGN §14.6 e §14.7, `CartaoOSHistorico`). Tocar expande no
 * lugar (`aria-expanded`), várias podem ficar abertas, e só então busca o detalhe
 * (`carregarDetalhe`). Faixa esquerda com a cor do status. Histórico é só leitura: fotos sem
 * Editar/Apagar e nenhum botão que mude algo.
 */
export function CartaoOSHistorico({
  os,
  papel,
  hoje,
  carregarDetalhe,
  focoRef,
}: {
  os: OSHistorico;
  papel: PapelHistorico;
  hoje: string;
  carregarDetalhe: (id: string) => Promise<DetalheOSHistorico>;
  /** Recebe o botão do cartão (foco na primeira OS nova do "Mostrar mais"). */
  focoRef?: (el: HTMLButtonElement | null) => void;
}) {
  const mecanico = papel === "mecanico";
  const [aberto, setAberto] = useState(false);
  const [detalhe, setDetalhe] = useState<EstadoDetalhe>({ tipo: "fechado" });
  const idCorpo = useId();
  const cancelada = os.status === "cancelada";
  const mostraTotal = !mecanico && !cancelada && typeof os.totalCentavos === "number";
  const linhaKm = [
    typeof os.km === "number" ? `KM ${formatarNumero(os.km)}` : null,
    mecanico ? null : os.cliente,
  ].filter(Boolean);

  async function carregar() {
    setDetalhe({ tipo: "carregando" });
    try {
      setDetalhe({ tipo: "pronto", dados: await carregarDetalhe(os.id) });
    } catch {
      setDetalhe({ tipo: "erro" });
    }
  }

  function alternar() {
    const abrir = !aberto;
    setAberto(abrir);
    if (abrir && (detalhe.tipo === "fechado" || detalhe.tipo === "erro")) void carregar();
  }

  return (
    <article className="relative flex overflow-hidden rounded-lg border border-borda-sutil bg-superficie" data-teste="cartao-historico">
      <span aria-hidden className={`w-1.5 shrink-0 ${INFO_STATUS[os.status].faixa}`} />
      <div className="flex min-w-0 flex-1 flex-col">
        <button
          ref={focoRef}
          type="button"
          aria-expanded={aberto}
          aria-controls={idCorpo}
          onClick={alternar}
          className="flex flex-col gap-1.5 p-4 text-left active:bg-superficie-2"
        >
          <span className="flex w-full flex-wrap items-baseline justify-between gap-x-3">
            <span className="text-base font-bold">{formatarDataLonga(os.abertaEm)}</span>
            <span className="font-mono text-base font-semibold text-texto-suave">OS #{os.numero}</span>
          </span>
          {linhaKm.length > 0 && (
            <span className="text-base break-words">
              {typeof os.km === "number" && <span className="font-mono">KM {formatarNumero(os.km)}</span>}
              {!mecanico && os.cliente && `${typeof os.km === "number" ? " · " : ""}${os.cliente}`}
            </span>
          )}
          {os.sintoma && <span className="line-clamp-2 text-base text-texto-suave">{os.sintoma}</span>}
          <span className="flex w-full flex-wrap items-center gap-2">
            <BadgeStatus status={os.status} />
            {!mecanico && os.status === "entregue" && typeof os.pago === "boolean" && <EtiquetaPagamento pago={os.pago} />}
            {mostraTotal && (
              <span className="ml-auto font-mono text-base font-semibold">
                <ValorQuebravel centavos={os.totalCentavos} />
              </span>
            )}
          </span>
          {!mecanico && cancelada && os.motivoCancelamento && (
            <span className="text-sm break-words">Motivo: {os.motivoCancelamento}</span>
          )}
          <span className="text-sm text-texto-suave">
            {textoContagemHistorico(os.contagem)}
          </span>
          <span className="flex w-full items-center justify-between gap-2">
            {os.vistoria ? <EtiquetaVistoria estado={os.vistoria} /> : <span className="text-sm text-texto-suave">Sem vistoria</span>}
            <ChevronDown
              size={24}
              strokeWidth={2.25}
              aria-hidden
              className={`shrink-0 text-texto-suave ${aberto ? "rotate-180" : ""}`}
            />
            <span className="sr-only">{aberto ? "Fechar detalhes" : "Ver detalhes"}</span>
          </span>
        </button>

        <div id={idCorpo} hidden={!aberto} className="border-t border-borda-sutil p-4">
          {aberto && detalhe.tipo === "carregando" && <DetalheCarregando />}
          {aberto && detalhe.tipo === "erro" && (
            <div role="alert" className="flex flex-col gap-3 rounded-md border-l-4 border-erro bg-superficie p-3">
              <p className="flex items-start gap-2 text-base font-bold">
                <CircleAlert size={22} strokeWidth={2.25} aria-hidden className="mt-0.5 shrink-0 text-erro-texto" />
                Não foi possível abrir esta OS.
              </p>
              <Botao variante="secundario" className="h-auto! min-h-toque py-2 text-base sm:w-auto" onClick={() => void carregar()}>
                Tentar de novo
              </Botao>
            </div>
          )}
          {aberto && detalhe.tipo === "pronto" && <CorpoDetalhe os={os} dados={detalhe.dados} papel={papel} hoje={hoje} />}
        </div>
      </div>
    </article>
  );
}

function DetalheCarregando() {
  return (
    <div aria-busy="true" className="flex animate-pulse flex-col gap-2">
      <div aria-hidden className="h-5 w-48 rounded-sm bg-superficie-2" />
      <div aria-hidden className="h-4 w-3/4 rounded-sm bg-superficie-2" />
      <div aria-hidden className="h-4 w-2/3 rounded-sm bg-superficie-2" />
      <span className="sr-only">Carregando a OS…</span>
    </div>
  );
}

function Bloco({ titulo, texto }: { titulo: string; texto?: string | null }) {
  if (!texto) return null;
  return (
    <div className="flex flex-col">
      <p className="text-sm font-bold">{titulo}</p>
      <p className="text-base break-words whitespace-pre-line">{texto}</p>
    </div>
  );
}

function ListaItens({ titulo, itens, comPreco }: { titulo: string; itens: ItemHistorico[]; comPreco: boolean }) {
  if (itens.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-lg">
        {titulo} ({itens.length})
      </h3>
      <ul className="flex flex-col gap-2">
        {itens.map((i) => {
          const qtd = `${formatarQuantidade(i.quantidade)} ${textoUnidade(i.unidade)}`;
          return (
            <li key={i.id} className="flex flex-col">
              <span className="text-base break-words">{i.descricao}</span>
              {comPreco && typeof i.unitarioCentavos === "number" ? (
                <span className="flex flex-wrap items-baseline justify-between gap-x-3 font-mono text-sm">
                  <span className="text-texto-suave">
                    {qtd} × {formatarCentavos(i.unitarioCentavos)}
                  </span>
                  <span className="ml-auto">
                    <ValorQuebravel centavos={i.subtotalCentavos} />
                  </span>
                </span>
              ) : (
                <span className="text-sm text-texto-suave">{qtd}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** "Ver vistoria" do mecânico: abre no próprio cartão, nunca em `/os/[id]/vistoria` (DESIGN §14.7). */
function LeituraMecanico({ vistoria }: { vistoria: VistoriaMecanico }) {
  const [aberta, setAberta] = useState(false);
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={aberta}
        aria-controls={id}
        onClick={() => setAberta((v) => !v)}
        className={`${classesFantasma} self-start`}
      >
        {aberta ? "Esconder a vistoria" : "Ver vistoria"}
      </button>
      <div id={id} hidden={!aberta}>
        {aberta && <VistoriaSemAssinatura vistoria={vistoria} />}
      </div>
    </div>
  );
}

function CorpoDetalhe({ os, dados, papel, hoje }: { os: OSHistorico; dados: DetalheOSHistorico; papel: PapelHistorico; hoje: string }) {
  const mecanico = papel === "mecanico";
  const [foto, setFoto] = useState<number | null>(null);
  const [eventos, setEventos] = useState(false);
  const idEventos = useId();
  // Concluída primeiro; anulada depois (DESIGN §14.6).
  const vistorias = [...dados.vistorias].sort((a, b) => (a.status === b.status ? 0 : a.status === "concluida" ? -1 : 1));
  const linhaEntrega = [
    dados.entregueEm ? `Entregue em ${formatarDataLonga(dados.entregueEm)}` : null,
    mecanico ? null : dados.mecanico,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-col gap-4" data-teste="detalhe-historico">
      {linhaEntrega && <p className="text-base font-bold">{linhaEntrega}</p>}
      <Bloco titulo="Causa encontrada" texto={dados.causa} />
      <Bloco titulo="Solução aplicada" texto={dados.solucao} />
      <Bloco titulo="Código de falha" texto={dados.codigoFalha} />

      <ListaItens titulo="Serviços" itens={dados.servicos} comPreco={!mecanico} />
      <ListaItens titulo="Peças" itens={dados.pecas} comPreco={!mecanico} />

      {!mecanico && dados.totais && os.status !== "cancelada" && (
        <ResumoTotais
          servicosCentavos={dados.totais.servicosCentavos}
          pecasCentavos={dados.totais.pecasCentavos}
          totalCentavos={dados.totais.totalCentavos}
        />
      )}
      {!mecanico && os.status === "entregue" && dados.pagamento && (
        <p className="text-base">
          {dados.pagamento.pagoEm ? (
            <>
              Pago em {formatarDataCurta(dados.pagamento.pagoEm, hoje)}
              {dados.pagamento.forma && ` · ${ROTULO_FORMA_PAGAMENTO[dados.pagamento.forma]}`}
            </>
          ) : (
            <EtiquetaPagamento pago={false} />
          )}
        </p>
      )}

      <div className="flex flex-col gap-3">
        {vistorias.length === 0 ? (
          <p className="text-sm text-texto-suave">Sem vistoria</p>
        ) : (
          vistorias.map((v) => (
            <div key={v.id} className="flex flex-col gap-1">
              <h3 className="text-lg">{ROTULO_TIPO_VISTORIA[v.tipo]}</h3>
              {v.status === "anulada" ? (
                <>
                  <span>
                    <EtiquetaVistoria estado="anulada" />
                  </span>
                  <p className="text-base break-words">
                    {mecanico ? "Vistoria anulada. Foi feita na OS errada." : v.motivo ? `Motivo: ${v.motivo}` : null}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-base">
                    Feita em {formatarDiaHora(v.em)}
                    {!mecanico && v.por && ` por ${v.por}`}
                  </p>
                  {mecanico
                    ? v.leitura && <LeituraMecanico vistoria={v.leitura} />
                    : (v.hrefLeitura || v.hrefPdf) && (
                        <span className="flex flex-wrap gap-x-4">
                          {v.hrefLeitura && (
                            <Link href={v.hrefLeitura} className={classesFantasma}>
                              Ver vistoria
                            </Link>
                          )}
                          {v.hrefPdf && (
                            <a href={v.hrefPdf} className={classesFantasma}>
                              Baixar PDF
                            </a>
                          )}
                        </span>
                      )}
                </>
              )}
            </div>
          ))
        )}
      </div>

      {dados.fotos.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-lg">Fotos ({dados.fotos.length})</h3>
          <GradeFotos fotos={dados.fotos} aoAbrir={(id) => setFoto(dados.fotos.findIndex((f) => f.id === id))} />
          <FotoTelaCheia
            aberta={foto !== null && foto >= 0}
            aoFechar={() => setFoto(null)}
            // Só leitura: sem Editar e sem Apagar, nem para quem pode no detalhe (DESIGN §14.6).
            fotos={dados.fotos.map((f) => ({ ...f, podeEditar: false, podeApagar: false }))}
            indice={Math.max(0, foto ?? 0)}
            aoMudarIndice={setFoto}
          />
        </div>
      )}

      {!mecanico && dados.observacoes && <Bloco titulo="Observações do balcão" texto={dados.observacoes} />}

      {!mecanico && dados.eventos && dados.eventos.length > 0 && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            aria-expanded={eventos}
            aria-controls={idEventos}
            onClick={() => setEventos((v) => !v)}
            className={`${classesFantasma} self-start`}
          >
            {eventos ? "Esconder o que aconteceu" : `Ver o que aconteceu (${dados.eventos.length})`}
          </button>
          <div id={idEventos} hidden={!eventos}>
            {eventos && <LinhaTempo eventos={dados.eventos} visiveis={dados.eventos.length} titulo="O que aconteceu" />}
          </div>
        </div>
      )}

      {os.hrefOS && (
        <Link href={os.hrefOS} className={classesBotao("secundario", "h-auto! min-h-toque py-2 text-base sm:w-auto sm:self-start")}>
          Abrir OS #{os.numero}
        </Link>
      )}
    </div>
  );
}
