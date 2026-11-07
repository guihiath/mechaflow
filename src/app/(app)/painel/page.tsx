import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Wallet } from "lucide-react";
import { Cabecalho } from "@/components/layout/cabecalho";
import { CartaoContagem, CartaoNumero, NumerosCarregando } from "@/components/painel/cartao-numero";
import { CaixaErro, EstadoVazio, Pagina } from "@/components/ui/estados";
import { exigirContexto } from "@/lib/dal";
import { param } from "@/lib/formato";
import {
  diaEmSaoPaulo,
  diasDesde,
  ehMes,
  lerMes,
  mesAnterior,
  mesAtualEmSaoPaulo,
  mesDoDia,
  nomeMes,
  TEXTO_PAINEL,
  textoClientes,
  textoDias,
  textoOS,
  type Mes,
} from "@/lib/painel";
import type { PainelHoje, PainelMes } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { AvisoSemInternet, SeletorMesPainel } from "./cliente";

export const metadata: Metadata = { title: "Painel do mês" };

type Params = Record<string, string | string[] | undefined>;
type Resposta<T> = { data: T | null; error: { message: string; code?: string } | null };

/**
 * Painel mínimo do dono (F7-B4; DESIGN §14.2, ARQUITETURA §14.5).
 * - Só o dono: atendente vai para `/os` e mecânico para `/minhas-os` (`exigirContexto`), antes de
 *   qualquer leitura.
 * - Dados sempre frescos, por sessão: o cliente do Supabase usa os cookies do usuário (RLS), nada
 *   aqui tem `"use cache"`, e a oficina vem da sessão no banco.
 * - Mês padrão: `mesAtualEmSaoPaulo(agora)` (`lib/painel.ts`), nunca a data do servidor em UTC.
 * - Sem serviços mais feitos, produtividade e OS abertas por status (F7-B6).
 */
export default function PainelPage({ searchParams }: PageProps<"/painel">) {
  return (
    <>
      <Cabecalho titulo="Painel do mês" voltar="/inicio" voltarSoCelular />
      <AvisoSemInternet />
      <Pagina larga>
        <Suspense fallback={<PainelCarregando />}>
          <Painel searchParams={searchParams} />
        </Suspense>
      </Pagina>
    </>
  );
}

function PainelCarregando() {
  return (
    <>
      <section className="flex flex-col gap-3 rounded-lg bg-superficie-2 p-3">
        <NumerosCarregando tamanho="hoje" />
      </section>
      <NumerosCarregando />
    </>
  );
}

/** "07/11 às 10:32" em São Paulo. */
function carimbo(agora: Date): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(agora)
      .map((x) => [x.type, x.value]),
  );
  return `${p.day}/${p.month} às ${p.hour}:${p.minute}`;
}

async function Painel({ searchParams }: { searchParams: Promise<Params> }) {
  await exigirContexto(["dono"]);
  const sp = await searchParams;
  const agora = new Date();
  const hoje = diaEmSaoPaulo(agora);
  const mesAtual = mesAtualEmSaoPaulo(agora);
  const mesUrl = param(sp.mes);
  // `?mes=` inválido ou futuro: mês atual (DESIGN §14.1). URL limpa para não guardar o erro.
  if (mesUrl && (!ehMes(mesUrl) || mesUrl > mesAtual)) redirect("/painel");
  const mes = lerMes(mesUrl, mesAtual);
  const [ano, numMes] = mes.split("-").map(Number);

  const supabase = await createClient();
  // As duas leituras saem juntas; `.then` dispara a do mês sem esperar a de hoje.
  const pedidoMes = supabase.rpc("painel_mes", { p_ano: ano, p_mes: numMes }).then((r) => r as Resposta<PainelMes>);
  const rHoje = (await supabase.rpc("painel_hoje")) as Resposta<PainelHoje>;
  const painelHoje = rHoje.error ? null : rHoje.data;

  const primeiroRegistro = painelHoje?.primeiro_registro_em ?? null;
  if (painelHoje && !primeiroRegistro) {
    // Primeira vez (DESIGN §14.2): sem seletor e sem cartões em zero.
    const temAbertas = painelHoje.abertas.total > 0;
    return (
      <EstadoVazio
        icone={Wallet}
        titulo="Seu painel começa na primeira entrega."
        texto="Quando uma OS for entregue, aparecem aqui o valor, o dinheiro recebido e quem deve."
        acao={temAbertas ? { href: "/os", rotulo: "Ver OS abertas" } : { href: "/os/nova", rotulo: "Abrir OS" }}
      />
    );
  }
  // Sem a leitura de hoje, o seletor só anda para a frente a partir do mês aberto.
  const primeiroMes: Mes = primeiroRegistro ? mesDoDia(primeiroRegistro) : mes;
  if (mes < primeiroMes) redirect("/painel");

  return (
    <>
      <BlocoHoje dados={painelHoje} hoje={hoje} />

      <section aria-label={`Números de ${nomeMes(mes)}`} className="flex flex-col gap-3">
        <SeletorMesPainel mes={mes} hoje={hoje} primeiroMes={primeiroMes} mesAtual={mesAtual} />
        <Suspense key={mes} fallback={<NumerosCarregando />}>
          <BlocoMes pedido={pedidoMes} mes={mes} mesAtual={mesAtual} primeiroMes={primeiroMes} />
        </Suspense>
      </section>

      <p className="text-xs text-texto-suave">Números de {carimbo(agora)}.</p>
    </>
  );
}

function BlocoHoje({ dados, hoje }: { dados: PainelHoje | null; hoje: string }) {
  return (
    <section aria-labelledby="painel-hoje" className="flex flex-col gap-3 rounded-lg bg-superficie-2 p-3">
      <div>
        <h2 id="painel-hoje" className="text-xl">
          {TEXTO_PAINEL.hojeTitulo}
        </h2>
        <p className="text-sm text-texto-suave">{TEXTO_PAINEL.hojeAjuda}</p>
      </div>
      {!dados ? (
        // Erro nunca vira zero (DESIGN §14.0, regra 4).
        <CaixaErro titulo="Não foi possível carregar o que está a receber." tentarDeNovo="/painel" />
      ) : (
        <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2">
          <CartaoNumero
            rotulo={TEXTO_PAINEL.aReceber}
            centavos={dados.a_receber.total_centavos}
            quantidadeOS={dados.a_receber.qtd_os}
            frases={[fraseAReceber(dados.a_receber, hoje)]}
            fraseZero={TEXTO_PAINEL.aReceberZero}
            href="/a-receber"
            tamanho="hoje"
            faixa="bg-alerta"
          />
          <CartaoContagem rotulo={TEXTO_PAINEL.osAbertas} quantidade={dados.abertas.total} href="/os" />
        </div>
      )}
    </section>
  );
}

function fraseAReceber(r: PainelHoje["a_receber"], hoje: string): string {
  const base = `${textoOS(r.qtd_os)} de ${textoClientes(r.qtd_clientes)}, somando todos os meses`;
  if (!r.mais_antiga_em) return `${base}.`;
  const dias = diasDesde(r.mais_antiga_em, hoje);
  return `${base} · mais antiga ${dias === 0 ? "entregue hoje" : textoDias(dias)}.`;
}

async function BlocoMes({
  pedido,
  mes,
  mesAtual,
  primeiroMes,
}: {
  pedido: PromiseLike<Resposta<PainelMes>>;
  mes: Mes;
  mesAtual: Mes;
  primeiroMes: Mes;
}) {
  const { data, error } = await pedido;
  if (error || !data) {
    if (error?.message === "mes_invalido") redirect("/painel");
    return <CaixaErro titulo="Não foi possível carregar o mês." tentarDeNovo={mes === mesAtual ? "/painel" : `/painel?mes=${mes}`} />;
  }

  const passado = mes !== mesAtual;
  const { entregues, recebido } = data;

  if (entregues.qtd_os === 0 && recebido.qtd_os === 0) {
    const anterior = mesAnterior(mes);
    return (
      <EstadoVazio
        titulo={passado ? "Nada neste mês." : "Nada neste mês ainda."}
        texto={`Nenhuma OS entregue e nenhum pagamento recebido em ${nomeMes(mes)}.`}
        acao={mes > primeiroMes ? { href: `/painel?mes=${anterior}`, rotulo: `Ver ${nomeMes(anterior)}`, variante: "secundario" } : undefined}
      />
    );
  }

  const sufixo = passado ? `&mes=${mes}` : "";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2">
        <CartaoNumero
          rotulo={TEXTO_PAINEL.entregues}
          centavos={entregues.total_centavos}
          quantidadeOS={entregues.qtd_os}
          frases={[`${textoOS(entregues.qtd_os)}, somando serviços e peças.`, "Conta pela data da entrega."]}
          fraseZero={TEXTO_PAINEL.entreguesZero}
          href={`/painel/os?ver=entregues${sufixo}`}
        />
        <CartaoNumero
          rotulo={TEXTO_PAINEL.recebido}
          centavos={recebido.total_centavos}
          quantidadeOS={recebido.qtd_os}
          frases={[`${textoOS(recebido.qtd_os)} ${recebido.qtd_os === 1 ? "paga" : "pagas"} no mês.`, "Conta pela data do pagamento."]}
          fraseZero={TEXTO_PAINEL.recebidoZero}
          href={`/painel/os?ver=recebido${sufixo}`}
        />
      </div>
      <p className="text-sm text-texto-suave">{TEXTO_PAINEL.naoPrecisamBater}</p>
      {passado && <p className="text-sm text-texto-suave">{TEXTO_PAINEL.mesPassadoPodeMudar}</p>}
    </div>
  );
}
