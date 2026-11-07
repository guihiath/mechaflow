"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { classesFantasma } from "@/components/ui/botao";
import { Folha } from "@/components/ui/folha";
import {
  anoDoMes,
  formatarDataCurta,
  mesAnterior,
  mesDoDia,
  mesSeguinte,
  mesesDisponiveis,
  nomeMes,
  nomeMesTitulo,
  type Mes,
} from "@/lib/painel";

const classeSeta =
  "inline-flex size-12 shrink-0 items-center justify-center rounded-md border-2 border-borda bg-superficie text-texto active:bg-superficie-2";

function Seta({
  destino,
  ativa,
  direcao,
  href,
  aoIr,
}: {
  destino: Mes;
  ativa: boolean;
  direcao: "anterior" | "seguinte";
  href?: string;
  aoIr: (m: Mes) => void;
}) {
  const Icone = direcao === "anterior" ? ChevronLeft : ChevronRight;
  const rotulo = `${direcao === "anterior" ? "Mês anterior" : "Mês seguinte"}: ${nomeMes(destino)}`;
  const icone = <Icone size={26} strokeWidth={2.5} aria-hidden />;
  if (!ativa) {
    return (
      <span aria-hidden className={`${classeSeta} opacity-50`}>
        {icone}
      </span>
    );
  }
  if (href) {
    return (
      <Link href={href} scroll={false} aria-label={rotulo} className={classeSeta}>
        {icone}
      </Link>
    );
  }
  return (
    <button type="button" onClick={() => aoIr(destino)} aria-label={rotulo} className={classeSeta}>
      {icone}
    </button>
  );
}

/**
 * Seletor de mês (DESIGN §14.2.1). `‹` e `›` de 48×48; o nome do mês é um botão de 56 px dentro do
 * h2 e abre a folha "Escolher mês". Mês futuro não existe: `›` no mês atual e `‹` no primeiro mês
 * ficam no lugar, a 50 %, sem pular o layout. Sem arrastar (SC 2.5.7).
 *
 * Navegação: com `hrefDoMes` (padrão, a URL guarda o mês) as setas são links com `scroll={false}`;
 * com `aoTrocar` (vitrine, tela no navegador) são botões. `role="status"` anuncia a troca.
 */
export function SeletorMes({
  mes,
  hoje,
  primeiroMes,
  hrefDoMes,
  aoTrocar,
}: {
  mes: Mes;
  /** Hoje em São Paulo ("AAAA-MM-DD"), calculado por quem chama (`diaEmSaoPaulo`). */
  hoje: string;
  /** Mês do primeiro registro (menor entre primeira entrega e primeiro pagamento). */
  primeiroMes: Mes;
  hrefDoMes?: (mes: Mes) => string;
  aoTrocar?: (mes: Mes) => void;
}) {
  const router = useRouter();
  const [escolhendo, setEscolhendo] = useState(false);
  // Anuncia a troca de mês (DESIGN §14.2, "Trocando de mês"), nunca na primeira tela.
  const [mesVisto, setMesVisto] = useState(mes);
  const [anuncio, setAnuncio] = useState("");
  if (mesVisto !== mes) {
    setMesVisto(mes);
    setAnuncio(`Mostrando ${nomeMes(mes)}.`);
  }
  const idTitulo = useId();
  // Nome do grupo de rádio único por seletor (mais de um na mesma página não se mistura).
  const nomeGrupo = `mes-${idTitulo}`;
  const mesAtual = mesDoDia(hoje);
  const temAnterior = mes > primeiroMes;
  const temSeguinte = mes < mesAtual;

  function ir(destino: Mes) {
    if (aoTrocar) aoTrocar(destino);
    else if (hrefDoMes) router.push(hrefDoMes(destino), { scroll: false });
  }
  const linkDe = (m: Mes) => (!aoTrocar && hrefDoMes ? hrefDoMes(m) : undefined);

  const meses = mesesDisponiveis(primeiroMes, mesAtual);
  const anos = [...new Set(meses.map(anoDoMes))];

  return (
    <div className="flex flex-col gap-2" data-teste="seletor-mes">
      {/* Texto grande (F7-B11, I3): quando a largura em rem fica pequena, o nome do mês ocupa a linha
          toda e as setas descem para a linha de baixo, uma em cada canto, em vez de a palavra quebrar
          letra por letra. Em tela normal continua [‹] Novembro de 2026 ⌄ [›] numa linha só. */}
      <div className="@container">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Seta destino={mesAnterior(mes)} ativa={temAnterior} direcao="anterior" href={linkDe(mesAnterior(mes))} aoIr={ir} />
          <h2 id={idTitulo} className="min-w-0 flex-1 @max-[18rem]:order-first @max-[18rem]:basis-full">
            <button
              type="button"
              onClick={() => setEscolhendo(true)}
              aria-haspopup="dialog"
              className="inline-flex min-h-toque-principal w-full items-center justify-center gap-1.5 rounded-md px-2 text-xl font-bold active:bg-superficie-2"
            >
              <span className="min-w-0 text-center [overflow-wrap:normal]">{nomeMesTitulo(mes)}</span>
              <ChevronDown size={22} strokeWidth={2.5} aria-hidden className="shrink-0" />
              <span className="sr-only">, escolher outro mês</span>
            </button>
          </h2>
          <Seta destino={mesSeguinte(mes)} ativa={temSeguinte} direcao="seguinte" href={linkDe(mesSeguinte(mes))} aoIr={ir} />
        </div>
      </div>

      {mes === mesAtual ? (
        <p className="text-sm text-texto-suave">Mês em andamento, até hoje ({formatarDataCurta(hoje, hoje)}).</p>
      ) : (
        <div className="flex flex-col items-start">
          <p className="text-sm text-texto-suave">Você está vendo um mês que já passou.</p>
          {aoTrocar || !hrefDoMes ? (
            <button type="button" onClick={() => ir(mesAtual)} className={classesFantasma}>
              Voltar para {nomeMes(mesAtual)}
            </button>
          ) : (
            <Link href={hrefDoMes(mesAtual)} scroll={false} className={classesFantasma}>
              Voltar para {nomeMes(mesAtual)}
            </Link>
          )}
        </div>
      )}

      <p role="status" className="sr-only">
        {anuncio}
      </p>

      <Folha aberta={escolhendo} aoFechar={() => setEscolhendo(false)} titulo="Escolher mês">
        <div className="flex flex-col gap-4">
          {anos.map((ano) => (
            <fieldset key={ano} className="flex flex-col">
              <legend className="mb-1 font-display text-lg font-bold">{ano}</legend>
              {meses
                .filter((m) => anoDoMes(m) === ano)
                .map((m) => (
                  <label
                    key={m}
                    className="flex min-h-toque-principal cursor-pointer items-center gap-3 border-b border-borda-sutil px-1 text-lg last:border-b-0 has-[:checked]:font-bold"
                  >
                    <input
                      type="radio"
                      name={nomeGrupo}
                      value={m}
                      checked={m === mes}
                      onChange={() => {
                        setEscolhendo(false);
                        if (m !== mes) ir(m);
                      }}
                      className="size-6 shrink-0 accent-primaria"
                    />
                    <span>
                      {nomeMesTitulo(m).replace(` de ${ano}`, "")}
                      {m === mesAtual && <span className="text-texto-suave"> (este mês)</span>}
                    </span>
                  </label>
                ))}
            </fieldset>
          ))}
        </div>
      </Folha>
    </div>
  );
}
