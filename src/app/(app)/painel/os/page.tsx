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
import { ehRecortePainel, hrefListaPainel, hrefOSDoPainel, RECORTE_COM_CHAVE, type ListaPainel } from "@/lib/origem-os";
import { diaEmSaoPaulo, ehMes, mesAtualEmSaoPaulo, nomeMesTitulo, TEXTO_PAINEL, textoOS, type Mes } from "@/lib/painel";
import { linhaDoPainel, type LinhaPainelListaOS } from "@/lib/painel-dados";
import type { PainelMes, RecortePainel } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { AvisoSemInternet } from "../cliente";

export const metadata: Metadata = { title: "OS do painel" };

const POR_PAGINA = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Params = Record<string, string | string[] | undefined>;
type Resposta<T> = { data: T | null; error: { message: string; code?: string } | null };

/** Recortes com valor em R$ na linha e no cabeçalho (DESIGN §14.3); serviço e fora do catálogo não têm. */
const COM_VALOR: ReadonlySet<RecortePainel> = new Set(["entregues", "recebido", "mecanico", "sem_mecanico"]);
const SO_SERVICOS: ReadonlySet<RecortePainel> = new Set(["mecanico", "sem_mecanico"]);

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

/** Título, número do cabeçalho e contagem de cada recorte, lidos do mesmo `painel_mes`. */
function numeroDoRecorte(
  p: PainelMes,
  ver: RecortePainel,
  chave: string | null,
): { titulo: string; centavos: number | null; qtd: number } {
  switch (ver) {
    case "entregues":
      return { titulo: TEXTO_PAINEL.entreguesLista, centavos: p.entregues.total_centavos, qtd: p.entregues.qtd_os };
    case "recebido":
      return { titulo: TEXTO_PAINEL.recebidoLista, centavos: p.recebido.total_centavos, qtd: p.recebido.qtd_os };
    case "servico": {
      const s = p.servicos.find((x) => x.servico_id === chave);
      return { titulo: s?.nome ?? "Serviço", centavos: null, qtd: s?.qtd_os ?? 0 };
    }
    case "fora_catalogo": {
      const s = p.servicos.find((x) => x.servico_id === null);
      return { titulo: TEXTO_PAINEL.foraCatalogo, centavos: null, qtd: s?.qtd_os ?? 0 };
    }
    case "mecanico": {
      const m = p.produtividade.find((x) => x.mecanico_id === chave);
      return { titulo: m?.nome ?? "Mecânico", centavos: m?.servicos_centavos ?? 0, qtd: m?.qtd_os ?? 0 };
    }
    case "sem_mecanico": {
      const m = p.produtividade.find((x) => x.mecanico_id === null);
      return { titulo: TEXTO_PAINEL.semMecanico, centavos: m?.servicos_centavos ?? 0, qtd: m?.qtd_os ?? 0 };
    }
  }
}

async function Lista({ searchParams }: { searchParams: Promise<Params> }) {
  await exigirContexto(["dono"]);
  const sp = await searchParams;
  const agora = new Date();
  const hoje = diaEmSaoPaulo(agora);
  const mesAtual = mesAtualEmSaoPaulo(agora);

  // "A receber" tem tela própria, com o registrar pagamento (F7-B5).
  if (param(sp.ver) === "a_receber") redirect("/a-receber");
  // Parâmetro inválido volta para o painel (DESIGN §14.3).
  const ver = param(sp.ver);
  if (!ehRecortePainel(ver)) redirect("/painel");
  const chave = param(sp.id) || null;
  if (RECORTE_COM_CHAVE.has(ver) && !(chave && UUID.test(chave))) redirect("/painel");
  const mesUrl = param(sp.mes);
  if (mesUrl && (!ehMes(mesUrl) || mesUrl > mesAtual)) redirect("/painel");
  const mes: Mes = mesUrl ? (mesUrl as Mes) : mesAtual;
  const mesNaUrl = mes !== mesAtual ? mes : null;
  const pagina = Math.min(Math.max(Number.parseInt(param(sp.pagina) || "1", 10) || 1, 1), 100);
  const voltar = mesNaUrl ? `/painel?mes=${mesNaUrl}` : "/painel";
  const lista: ListaPainel = { ver, chave: RECORTE_COM_CHAVE.has(ver) ? chave : null, mes: mesNaUrl };

  const [ano, m] = mes.split("-").map(Number);
  const supabase = await createClient();
  const [rMes, rLista] = (await Promise.all([
    supabase.rpc("painel_mes", { p_ano: ano, p_mes: m }),
    supabase.rpc("painel_lista_os", { p_ano: ano, p_mes: m, p_recorte: ver, p_chave: lista.chave ?? null }),
  ])) as [Resposta<PainelMes>, Resposta<LinhaPainelListaOS[]>];
  if (rMes.error?.message === "mes_invalido" || rLista.error?.message === "recorte_invalido") redirect("/painel");

  const numero = rMes.data && !rMes.error ? numeroDoRecorte(rMes.data, ver, lista.chave ?? null) : null;
  // A origem vai junto para o "voltar" da OS cair nesta lista, nesta página (DESIGN §14.1).
  const linhas =
    rLista.data && !rLista.error ? rLista.data.map((r) => linhaDoPainel(r, hrefOSDoPainel(r.os_id, { ...lista, pagina }))) : null;
  const titulo = numero?.titulo ?? (ver === "servico" ? "Serviço" : ver === "mecanico" ? "Mecânico" : "Painel do mês");

  return (
    <>
      <Cabecalho titulo={titulo} voltar={voltar} />
      <AvisoSemInternet />
      <Pagina larga>
        {numero && (
          // O cabeçalho repete o número do painel (mesma leitura), nunca a soma do que está na tela.
          <div>
            <p className="text-base font-bold">
              {nomeMesTitulo(mes)} · {textoOS(numero.qtd)}
            </p>
            {COM_VALOR.has(ver) && numero.centavos !== null && (
              <p className="font-display text-3xl font-bold">
                <ValorQuebravel centavos={numero.centavos} />
                {SO_SERVICOS.has(ver) && <span className="ml-2 font-sans text-base font-bold text-texto-suave">em serviços</span>}
              </p>
            )}
          </div>
        )}

        {!linhas ? (
          <CaixaErro titulo="Não foi possível carregar as OS deste número." tentarDeNovo={hrefListaPainel({ ...lista, pagina })} />
        ) : linhas.length === 0 ? (
          <EstadoVazio
            titulo="Esta lista ficou vazia."
            texto="Um pagamento pode ter sido corrigido agora."
            acao={{ href: voltar, rotulo: "Voltar ao painel", variante: "secundario" }}
          />
        ) : (
          <ListaLinhas linhas={linhas} pagina={pagina} ver={ver} hoje={hoje} hrefMais={hrefListaPainel({ ...lista, pagina: pagina + 1 })} />
        )}
      </Pagina>
    </>
  );
}

function ListaLinhas({
  linhas,
  pagina,
  ver,
  hoje,
  hrefMais,
}: {
  linhas: DadosLinhaOSNumero[];
  pagina: number;
  ver: RecortePainel;
  hoje: string;
  hrefMais: string;
}) {
  const visiveis = linhas.slice(0, POR_PAGINA * pagina);
  const faltam = linhas.length - visiveis.length;
  // Só com a lista inteira na tela e só onde a linha tem valor (DESIGN §14.3). Soma de inteiros em centavos.
  const total = faltam === 0 && COM_VALOR.has(ver) ? linhas.reduce((s, l) => s + (l.centavos ?? 0), 0) : null;

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {visiveis.map((os) => (
          <li key={os.id}>
            <LinhaOSNumero os={os} ver={ver} hoje={hoje} />
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
          {SO_SERVICOS.has(ver) && " em serviços"}
        </p>
      )}
    </div>
  );
}
