import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Cabecalho } from "@/components/layout/cabecalho";
import { LinhaOSNumero, LinhasOSCarregando, type DadosLinhaOSNumero } from "@/components/painel/linha-os-numero";
import { classesBotao } from "@/components/ui/botao";
import { CaixaErro, EstadoVazio, Pagina } from "@/components/ui/estados";
import { ValorQuebravel } from "@/components/ui/valor-quebravel";
import { exigirContexto } from "@/lib/dal";
import { param } from "@/lib/formato";
import { diaEmSaoPaulo, ehMes, mesAtualEmSaoPaulo, nomeMesTitulo, TEXTO_PAINEL, textoClientes, textoOS, type Mes } from "@/lib/painel";
import { linhaDoPainel, type LinhaContaAReceber, type LinhaPainelListaOS } from "@/lib/painel-dados";
import type { PainelHoje, PainelMes } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { AvisoSemInternet } from "../cliente";

export const metadata: Metadata = { title: "OS do painel" };

const POR_PAGINA = 30;

type Params = Record<string, string | string[] | undefined>;
type Resposta<T> = { data: T | null; error: { message: string; code?: string } | null };

/**
 * Lista fechada de números com lista nesta etapa (F7-B4). Serviço, fora do catálogo e mecânico
 * (`painel_lista_os` já aceita) entram com o painel completo, no F7-B6.
 * `a_receber` lê `contas_a_receber` só para leitura, até o F7-B5 criar `/a-receber`.
 */
const VER = {
  entregues: TEXTO_PAINEL.entreguesLista,
  recebido: TEXTO_PAINEL.recebidoLista,
  a_receber: TEXTO_PAINEL.aReceber,
} as const;
type Ver = keyof typeof VER;

function lerVer(v: string): Ver | null {
  return Object.hasOwn(VER, v) ? (v as Ver) : null;
}

/** Monta a URL desta lista (mês atual sem `?mes=`). */
function hrefLista(ver: Ver, mes: Mes | null, pagina?: number): string {
  const q = new URLSearchParams({ ver });
  if (mes) q.set("mes", mes);
  if (pagina && pagina > 1) q.set("pagina", String(pagina));
  return `/painel/os?${q.toString()}`;
}

export default function ListaPainelPage({ searchParams }: PageProps<"/painel/os">) {
  return (
    <Suspense fallback={<Carregando />}>
      <Lista searchParams={searchParams} />
    </Suspense>
  );
}

function Carregando() {
  return (
    <>
      <Cabecalho titulo="Painel do mês" voltar="/painel" />
      <Pagina larga>
        <LinhasOSCarregando />
      </Pagina>
    </>
  );
}

async function Lista({ searchParams }: { searchParams: Promise<Params> }) {
  await exigirContexto(["dono"]);
  const sp = await searchParams;
  const agora = new Date();
  const hoje = diaEmSaoPaulo(agora);
  const mesAtual = mesAtualEmSaoPaulo(agora);

  // Parâmetro inválido volta para o painel (DESIGN §14.3).
  const ver = lerVer(param(sp.ver));
  if (!ver) redirect("/painel");
  const mesUrl = param(sp.mes);
  if (mesUrl && (!ehMes(mesUrl) || mesUrl > mesAtual)) redirect("/painel");
  const mes: Mes = mesUrl ? (mesUrl as Mes) : mesAtual;
  const mesNaUrl = ver !== "a_receber" && mes !== mesAtual ? mes : null;
  const pagina = Math.min(Math.max(Number.parseInt(param(sp.pagina) || "1", 10) || 1, 1), 100);
  const voltar = mesNaUrl ? `/painel?mes=${mesNaUrl}` : "/painel";

  const supabase = await createClient();
  let numero: { centavos: number; qtd: number; linha: string } | null = null;
  let linhas: DadosLinhaOSNumero[] | null = null;
  const hrefOS = (id: string) => `/os/${id}`;

  if (ver === "a_receber") {
    const [rHoje, rLista] = (await Promise.all([supabase.rpc("painel_hoje"), supabase.rpc("contas_a_receber")])) as [
      Resposta<PainelHoje>,
      Resposta<LinhaContaAReceber[]>,
    ];
    if (rHoje.data && !rHoje.error) {
      const r = rHoje.data.a_receber;
      numero = { centavos: r.total_centavos, qtd: r.qtd_os, linha: `Hoje · ${textoOS(r.qtd_os)} de ${textoClientes(r.qtd_clientes)}` };
    }
    if (rLista.data && !rLista.error) {
      linhas = rLista.data.map((l) => ({
        id: l.os_id,
        href: hrefOS(l.os_id),
        numero: l.numero,
        placa: l.placa,
        cliente: l.cliente_nome,
        centavos: l.total_centavos,
        entregueEm: l.entregue_em,
        pagoEm: null,
        formaPagamento: l.forma_pagamento,
      }));
    }
  } else {
    const [ano, m] = mes.split("-").map(Number);
    const [rMes, rLista] = (await Promise.all([
      supabase.rpc("painel_mes", { p_ano: ano, p_mes: m }),
      supabase.rpc("painel_lista_os", { p_ano: ano, p_mes: m, p_recorte: ver }),
    ])) as [Resposta<PainelMes>, Resposta<LinhaPainelListaOS[]>];
    if (rMes.error?.message === "mes_invalido" || rLista.error?.message === "recorte_invalido") redirect("/painel");
    if (rMes.data && !rMes.error) {
      const n = ver === "entregues" ? rMes.data.entregues : rMes.data.recebido;
      numero = { centavos: n.total_centavos, qtd: n.qtd_os, linha: `${nomeMesTitulo(mes)} · ${textoOS(n.qtd_os)}` };
    }
    if (rLista.data && !rLista.error) linhas = rLista.data.map((r) => linhaDoPainel(r, hrefOS(r.os_id)));
  }

  const titulo = VER[ver];
  const recorte = ver === "recebido" ? "recebido" : "entregues";

  return (
    <>
      <Cabecalho titulo={titulo} voltar={voltar} />
      <AvisoSemInternet />
      <Pagina larga>
        {numero && (
          // O cabeçalho repete o valor do cartão (mesma leitura do painel), nunca a soma da tela.
          <div>
            <p className="text-base font-bold">{numero.linha}</p>
            <p className="font-display text-3xl font-bold">
              <ValorQuebravel centavos={numero.centavos} />
            </p>
          </div>
        )}

        {!linhas ? (
          <CaixaErro titulo="Não foi possível carregar as OS deste número." tentarDeNovo={hrefLista(ver, mesNaUrl, pagina)} />
        ) : linhas.length === 0 ? (
          <EstadoVazio
            titulo="Esta lista ficou vazia."
            texto="Um pagamento pode ter sido corrigido agora."
            acao={{ href: voltar, rotulo: "Voltar ao painel", variante: "secundario" }}
          />
        ) : (
          <ListaLinhas linhas={linhas} pagina={pagina} recorte={recorte} hoje={hoje} hrefMais={hrefLista(ver, mesNaUrl, pagina + 1)} />
        )}
      </Pagina>
    </>
  );
}

function ListaLinhas({
  linhas,
  pagina,
  recorte,
  hoje,
  hrefMais,
}: {
  linhas: DadosLinhaOSNumero[];
  pagina: number;
  recorte: "entregues" | "recebido";
  hoje: string;
  hrefMais: string;
}) {
  const visiveis = linhas.slice(0, POR_PAGINA * pagina);
  const faltam = linhas.length - visiveis.length;
  // Só com a lista inteira na tela (DESIGN §14.3). Soma de inteiros em centavos.
  const total = faltam === 0 ? linhas.reduce((s, l) => s + (l.centavos ?? 0), 0) : null;

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {visiveis.map((os) => (
          <li key={os.id}>
            <LinhaOSNumero os={os} ver={recorte} hoje={hoje} />
          </li>
        ))}
      </ul>
      <p className="text-sm text-texto-suave">
        Mostrando {visiveis.length} de {linhas.length}.
      </p>
      {faltam > 0 && (
        <Link href={hrefMais} scroll={false} className={classesBotao("secundario", "sm:w-auto sm:self-start")}>
          Mostrar mais {Math.min(faltam, POR_PAGINA)}
        </Link>
      )}
      {total !== null && (
        <p className="text-base font-bold">
          Total da lista: <ValorQuebravel centavos={total} />
        </p>
      )}
    </div>
  );
}
