"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { HandCoins, Moon, Sun, Wallet } from "lucide-react";
import { FaixaTeste } from "@/components/layout/cabecalho";
import { HistoricoCarregando, LinhaTempoPlaca } from "@/components/historico/linha-tempo-placa";
import type { PapelHistorico } from "@/components/historico/cartao-os-historico";
import { CartaoContagem, CartaoNumero, FaixaSemInternet, NumerosCarregando } from "@/components/painel/cartao-numero";
import { CartaoDevedor, DevedoresCarregando, ResumoAReceber, type DadosDevedor, type OSDevedor } from "@/components/painel/cartao-devedor";
import { LinhaOSNumero, LinhasOSCarregando } from "@/components/painel/linha-os-numero";
import { ListaMecanicos } from "@/components/painel/lista-mecanicos";
import { ListaServicos } from "@/components/painel/lista-servicos";
import { SeletorMes } from "@/components/painel/seletor-mes";
import { AvisoDesfazer } from "@/components/ui/aviso-desfazer";
import { Botao } from "@/components/ui/botao";
import { CaixaErro, EstadoVazio } from "@/components/ui/estados";
import { mesAnterior, nomeMes, TEXTO_PAINEL, textoOS, type Mes } from "@/lib/painel";
import { devedoresDeContas, textoResumoHistorico, textoVeiculoHistorico } from "@/lib/painel-dados";
import { TEMA_STORAGE_KEY } from "@/lib/tema";
import {
  CONTAS_A_RECEBER,
  DEVEDOR_NOME_LONGO,
  DEVEDOR_OITO_OS,
  DEVEDOR_UMA_OS,
  detalheComo,
  historicoComo,
  HISTORICO_RESUMO,
  HISTORICO_VEICULO,
  HOJE,
  LINHAS_NUMERO,
  MECANICOS,
  MES_ATUAL,
  NUMEROS_DE,
  PRIMEIRO_MES,
  SERVICOS_1,
  SERVICOS_18,
  SERVICOS_5,
} from "./dados";

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

function Secao({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-t`} className="flex flex-col gap-3">
      <h2 id={`${id}-t`} className="border-b-2 border-borda-sutil pb-1 text-2xl">
        {titulo}
      </h2>
      {children}
    </section>
  );
}

function Sub({ children }: { children: ReactNode }) {
  return <h3 className="mt-3 text-lg text-texto-suave">{children}</h3>;
}

// ---------------------------------------------------------------- painel montado

type CenarioPainel = "dados" | "carregando" | "erro" | "sem_dados" | "so_pagamento" | "primeira_vez" | "sem_internet";

const CENARIOS: { valor: CenarioPainel; rotulo: string }[] = [
  { valor: "dados", rotulo: "Com dados" },
  { valor: "carregando", rotulo: "Carregando" },
  { valor: "erro", rotulo: "Erro" },
  { valor: "sem_dados", rotulo: "Mês sem dados" },
  { valor: "so_pagamento", rotulo: "Só pagamento" },
  { valor: "primeira_vez", rotulo: "Primeira vez" },
  { valor: "sem_internet", rotulo: "Sem internet" },
];

function BlocoHoje({ carregando }: { carregando?: boolean }) {
  return (
    <section aria-labelledby="hoje-t" className="flex flex-col gap-3 rounded-lg bg-superficie-2 p-3">
      <div>
        <h2 id="hoje-t" className="text-xl">
          {TEXTO_PAINEL.hojeTitulo}
        </h2>
        <p className="text-sm text-texto-suave">{TEXTO_PAINEL.hojeAjuda}</p>
      </div>
      {carregando ? (
        <NumerosCarregando tamanho="hoje" />
      ) : (
        <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2">
          <CartaoNumero
            rotulo={TEXTO_PAINEL.aReceber}
            centavos={1830000}
            quantidadeOS={7}
            frases={["7 OS de 4 clientes, somando todos os meses · mais antiga há 42 dias"]}
            fraseZero={TEXTO_PAINEL.aReceberZero}
            href="#a-receber"
            tamanho="hoje"
            faixa="bg-alerta"
          />
          <CartaoContagem rotulo={TEXTO_PAINEL.osAbertas} quantidade={12} href="#painel" />
        </div>
      )}
    </section>
  );
}

function NumerosDoMes({ mes, soPagamento }: { mes: Mes; soPagamento?: boolean }) {
  const passado = mes !== MES_ATUAL;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2">
        <CartaoNumero
          rotulo={TEXTO_PAINEL.entregues}
          centavos={soPagamento ? 0 : 4832050}
          quantidadeOS={soPagamento ? 0 : 23}
          frases={["23 OS, somando serviços e peças.", "Conta pela data da entrega."]}
          fraseZero={TEXTO_PAINEL.entreguesZero}
          href="#lista"
        />
        <CartaoNumero
          rotulo={TEXTO_PAINEL.recebido}
          centavos={3987000}
          quantidadeOS={19}
          frases={["19 OS pagas no mês.", "Conta pela data do pagamento."]}
          fraseZero={TEXTO_PAINEL.recebidoZero}
          href="#lista"
        />
      </div>
      <p className="text-sm text-texto-suave">{TEXTO_PAINEL.naoPrecisamBater}</p>
      {soPagamento ? (
        <>
          <p className="text-base text-texto-suave">{TEXTO_PAINEL.entreguesZero}</p>
        </>
      ) : (
        <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2">
          <ListaServicos mes={mes} servicos={SERVICOS_18} hrefServico={() => "#lista"} hrefForaCatalogo="#lista" />
          <ListaMecanicos mes={mes} mecanicos={MECANICOS} hrefMecanico={() => "#lista"} hrefSemMecanico="#lista" />
        </div>
      )}
      {passado && <p className="text-sm text-texto-suave">{TEXTO_PAINEL.mesPassadoPodeMudar}</p>}
    </div>
  );
}

function DemoPainel() {
  const [cenario, setCenario] = useState<CenarioPainel>("dados");
  const [mes, setMes] = useState<Mes>(MES_ATUAL);
  const [trocando, setTrocando] = useState(false);

  async function trocar(m: Mes) {
    setMes(m);
    setTrocando(true);
    await esperar(900);
    setTrocando(false);
  }

  let corpo: ReactNode;
  if (cenario === "primeira_vez") {
    corpo = (
      <EstadoVazio
        icone={Wallet}
        titulo="Seu painel começa na primeira entrega."
        texto="Quando uma OS for entregue, aparecem aqui o valor, o dinheiro recebido e quem deve."
        acao={{ href: "#painel", rotulo: "Ver OS abertas" }}
      />
    );
  } else if (cenario === "carregando") {
    corpo = (
      <>
        <BlocoHoje carregando />
        <NumerosCarregando />
      </>
    );
  } else if (cenario === "erro" || cenario === "sem_internet") {
    corpo = (
      <>
        {cenario === "sem_internet" && <FaixaSemInternet />}
        <CaixaErro titulo="Não foi possível carregar o que está a receber." tentarDeNovo="#painel" />
        <CaixaErro titulo="Não foi possível carregar o mês." tentarDeNovo="#painel" />
      </>
    );
  } else {
    corpo = (
      <>
        <BlocoHoje />
        <SeletorMes mes={mes} hoje={HOJE} primeiroMes={PRIMEIRO_MES} aoTrocar={(m) => void trocar(m)} />
        {trocando ? (
          <NumerosCarregando />
        ) : cenario === "sem_dados" ? (
          <EstadoVazio
            titulo={mes === MES_ATUAL ? "Nada neste mês ainda." : "Nada neste mês."}
            texto={`Nenhuma OS entregue e nenhum pagamento recebido em ${nomeMes(mes)}.`}
            acao={mes > PRIMEIRO_MES ? { href: "#painel", rotulo: `Ver ${nomeMes(mesAnterior(mes))}`, variante: "secundario" } : undefined}
          />
        ) : (
          <NumerosDoMes mes={mes} soPagamento={cenario === "so_pagamento"} />
        )}
        <section aria-labelledby="abertas-t" className="flex flex-col gap-2">
          <div>
            <h2 id="abertas-t" className="text-2xl">
              OS abertas agora
            </h2>
            <p className="text-sm text-texto-suave">Hoje, não muda com o mês.</p>
          </div>
          <ul className="flex flex-col gap-2 lg:grid lg:grid-cols-4">
            {(
              [
                ["Prontas para entregar", 3],
                ["Em orçamento", 2],
                ["Liberadas para começar", 1],
                ["Em andamento", 0],
              ] as const
            ).map(([r, n]) => (
              <li key={r}>
                <CartaoContagem rotulo={r} quantidade={n} href="#painel" />
              </li>
            ))}
          </ul>
          <p className="text-xs text-texto-suave">{NUMEROS_DE}</p>
        </section>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Botoes opcoes={CENARIOS} valor={cenario} aoMudar={setCenario} rotulo="Cenário do painel" />
      <div className="flex flex-col gap-5 rounded-lg border-2 border-dashed border-borda-sutil p-3" data-teste="painel-montado">
        {corpo}
      </div>
    </div>
  );
}

function Botoes<T extends string>({
  opcoes,
  valor,
  aoMudar,
  rotulo,
}: {
  opcoes: { valor: T; rotulo: string }[];
  valor: T;
  aoMudar: (v: T) => void;
  rotulo: string;
}) {
  return (
    <div role="group" aria-label={rotulo} className="flex flex-wrap gap-2">
      {opcoes.map((o) => (
        <button
          key={o.valor}
          type="button"
          aria-pressed={o.valor === valor}
          onClick={() => aoMudar(o.valor)}
          className="inline-flex min-h-toque items-center rounded-md border-2 border-borda bg-superficie px-3 text-base font-bold aria-pressed:border-grafite aria-pressed:bg-primaria aria-pressed:text-primaria-texto"
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- seletor sozinho

function DemoSeletor({ inicial }: { inicial: Mes }) {
  const [mes, setMes] = useState<Mes>(inicial);
  return <SeletorMes mes={mes} hoje={HOJE} primeiroMes={PRIMEIRO_MES} aoTrocar={setMes} />;
}

// ---------------------------------------------------------------- a receber

function DemoAReceber({ papel, inicial }: { papel: "dono" | "atendente"; inicial?: DadosDevedor[] }) {
  const [devedores, setDevedores] = useState<DadosDevedor[]>(inicial ?? [DEVEDOR_OITO_OS, DEVEDOR_UMA_OS, DEVEDOR_NOME_LONGO]);
  const [aviso, setAviso] = useState<{ os: OSDevedor; antes: DadosDevedor[] } | null>(null);

  function registrar(os: OSDevedor) {
    const antes = devedores;
    setDevedores((lista) =>
      lista
        .map((d) =>
          d.os.some((o) => o.id === os.id)
            ? {
                ...d,
                totalCentavos: d.totalCentavos - os.totalCentavos,
                quantidadeOS: (d.quantidadeOS ?? d.os.length) - 1,
                os: d.os.filter((o) => o.id !== os.id),
              }
            : d,
        )
        .filter((d) => d.os.length > 0),
    );
    setAviso({ os, antes });
  }

  const totalOS = devedores.reduce((s, d) => s + (d.quantidadeOS ?? d.os.length), 0);
  const total = devedores.reduce((s, d) => s + d.totalCentavos, 0);

  return (
    <div className="flex flex-col gap-3">
      {devedores.length === 0 ? (
        <EstadoVazio
          icone={HandCoins}
          titulo="Nada a receber."
          texto="Quando uma OS for entregue sem pagamento, ela aparece aqui."
          acao={papel === "dono" ? { href: "#painel", rotulo: "Voltar ao painel", variante: "secundario" } : { href: "#a-receber", rotulo: "Ver OS", variante: "secundario" }}
        />
      ) : (
        <>
          <ResumoAReceber totalCentavos={papel === "dono" ? total : null} quantidadeOS={totalOS} quantidadeClientes={devedores.length} />
          {devedores.map((d) => (
            <CartaoDevedor key={d.clienteId} devedor={d} hoje={HOJE} aoRegistrar={registrar} />
          ))}
        </>
      )}
      {aviso && (
        <AvisoDesfazer
          key={aviso.os.id}
          mensagem={`Pagamento da OS #${aviso.os.numero} registrado.`}
          aoDesfazer={() => {
            setDevedores(aviso.antes);
            setAviso(null);
          }}
          aoSumir={() => setAviso(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- histórico

type CenarioHistorico = "lista" | "carregando" | "erro" | "vazio";

/** Uma montagem por papel (o `key` reinicia lista, cursor e cartões abertos ao trocar de papel). */
function HistoricoMontado({ papel, falharMais, aoFalharMais }: { papel: PapelHistorico; falharMais: boolean; aoFalharMais: () => void }) {
  const [todas] = useState(() => historicoComo(papel));
  // Faz o papel do cursor `proximo` de `historico_placa`: quem chama guarda onde parou.
  const cursor = useRef(10);
  const falhouDetalhe = useRef(false);
  const caixa = useRef<HTMLDivElement>(null);
  const [comDinheiro, setComDinheiro] = useState<boolean | null>(null);

  // Conferência da versão do mecânico (DESIGN §14.7): nenhum "R$" no que está na tela, aberto ou não.
  useEffect(() => {
    const el = caixa.current;
    if (!el || papel !== "mecanico") return;
    const conferir = () => setComDinheiro(/R\$|pago|a receber|faturado/i.test(el.textContent ?? ""));
    conferir();
    const obs = new MutationObserver(conferir);
    obs.observe(el, { subtree: true, childList: true, characterData: true });
    return () => obs.disconnect();
  }, [papel]);

  async function carregarDetalhe(id: string) {
    await esperar(700);
    // A OS #1035 falha na primeira vez, para ver "Não foi possível abrir esta OS."
    if (id === "h1" && !falhouDetalhe.current) {
      falhouDetalhe.current = true;
      throw new Error("falha simulada");
    }
    return detalheComo(id, papel);
  }

  async function carregarMais() {
    await esperar(700);
    if (falharMais) {
      aoFalharMais();
      throw new Error("falha simulada");
    }
    const novas = todas.slice(cursor.current, cursor.current + 10);
    cursor.current += novas.length;
    return novas;
  }

  return (
    <div className="flex flex-col gap-3">
      {papel === "mecanico" && comDinheiro !== null && (
        <p role="status" data-teste="conferencia-mecanico" className={`text-base font-bold ${comDinheiro ? "text-erro-texto" : "text-sucesso-texto"}`}>
          {comDinheiro ? "Atenção: apareceu valor ou pagamento na versão do mecânico." : "Conferido: nenhum R$, “Pago”, “A receber” ou forma de pagamento na tela do mecânico."}
        </p>
      )}
      <div ref={caixa}>
        <LinhaTempoPlaca
          papel={papel}
          placa={HISTORICO_VEICULO.placa}
          veiculo={textoVeiculoHistorico(HISTORICO_VEICULO)}
          resumo={textoResumoHistorico(HISTORICO_RESUMO)}
          inicial={todas.slice(0, 10)}
          total={HISTORICO_RESUMO.qtd_os}
          hoje={HOJE}
          carregarDetalhe={carregarDetalhe}
          carregarMais={carregarMais}
        />
      </div>
    </div>
  );
}

function DemoHistorico() {
  const [papel, setPapel] = useState<PapelHistorico>("dono");
  const [cenario, setCenario] = useState<CenarioHistorico>("lista");
  const [falharMais, setFalharMais] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <Botoes
        rotulo="Papel"
        opcoes={[
          { valor: "dono", rotulo: "Dono" },
          { valor: "atendente", rotulo: "Atendente" },
          { valor: "mecanico", rotulo: "Mecânico" },
        ]}
        valor={papel}
        aoMudar={setPapel}
      />
      <Botoes
        rotulo="Cenário do histórico"
        opcoes={[
          { valor: "lista", rotulo: "34 OS" },
          { valor: "carregando", rotulo: "Carregando" },
          { valor: "erro", rotulo: "Erro" },
          { valor: "vazio", rotulo: "Sem OS" },
        ]}
        valor={cenario}
        aoMudar={setCenario}
      />
      {cenario === "lista" && (
        <Botao variante="secundario" className="h-auto! min-h-toque py-2 text-base sm:w-auto sm:self-start" onClick={() => setFalharMais(true)}>
          {falharMais ? "O próximo “Mostrar mais” vai falhar" : "Fazer o próximo “Mostrar mais” falhar"}
        </Botao>
      )}
      <div className="rounded-lg border-2 border-dashed border-borda-sutil p-3" data-teste="historico-montado">
        {cenario === "carregando" ? (
          <HistoricoCarregando />
        ) : cenario === "erro" ? (
          <CaixaErro titulo="Não foi possível carregar o histórico desta placa." tentarDeNovo="#historico" />
        ) : cenario === "vazio" ? (
          papel === "mecanico" ? (
            <EstadoVazio titulo="Nenhuma OS para esta placa." texto="Quando abrirem uma OS para este caminhão, ela aparece aqui." />
          ) : (
            <EstadoVazio titulo="Nenhuma OS para esta placa." texto="Comece abrindo uma OS." acao={{ href: "#historico", rotulo: "Abrir OS para ABC1D23" }} />
          )
        ) : (
          <HistoricoMontado key={papel} papel={papel} falharMais={falharMais} aoFalharMais={() => setFalharMais(false)} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- página

export function Vitrine() {
  const [estreita, setEstreita] = useState(false);

  function trocarTema() {
    const d = document.documentElement;
    const novo = d.getAttribute("data-tema") === "escuro" ? "claro" : "escuro";
    d.setAttribute("data-tema", novo);
    try {
      localStorage.setItem(TEMA_STORAGE_KEY, novo);
    } catch {}
  }

  return (
    <div className="flex min-h-dvh flex-col bg-fundo text-texto">
      <FaixaTeste />
      <main className={`flex w-full flex-col gap-8 py-5 ${estreita ? "max-w-[320px] px-0" : "max-w-[1280px] px-4"}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl">Vitrine Fase 7</h1>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEstreita((v) => !v)}
              aria-pressed={estreita}
              data-teste="largura-320"
              className="inline-flex min-h-toque items-center rounded-md border-2 border-borda bg-superficie px-3 text-base font-bold aria-pressed:bg-primaria aria-pressed:text-primaria-texto"
            >
              320 px
            </button>
            <button
              type="button"
              onClick={trocarTema}
              aria-label="Trocar tema claro/escuro"
              data-teste="trocar-tema"
              className="inline-flex min-h-toque min-w-toque items-center justify-center rounded-md border-2 border-borda bg-superficie"
            >
              <Sun size={22} aria-hidden className="hidden dark:block" />
              <Moon size={22} aria-hidden className="dark:hidden" />
            </button>
          </div>
        </div>
        <p className="text-base text-texto-suave">
          Dados fictícios, sem banco. Hoje fixo em 04/11/2026. “320 px” estreita a página para conferir valores longos.
        </p>

        <Secao id="cartao" titulo="Cartão de número">
          <div className="flex flex-col gap-3 lg:grid lg:grid-cols-3">
            <div className="flex flex-col gap-2">
              <Sub>Valor comum</Sub>
              <CartaoNumero
                rotulo={TEXTO_PAINEL.entregues}
                centavos={4832050}
                quantidadeOS={23}
                frases={["23 OS, somando serviços e peças.", "Conta pela data da entrega."]}
                fraseZero={TEXTO_PAINEL.entreguesZero}
                href="#lista"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Sub>R$ 1.234.567,89</Sub>
              <CartaoNumero
                rotulo={TEXTO_PAINEL.recebido}
                centavos={123456789}
                quantidadeOS={312}
                frases={[`${textoOS(312)} pagas no mês.`, "Conta pela data do pagamento."]}
                fraseZero={TEXTO_PAINEL.recebidoZero}
                href="#lista"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Sub>Zero (sem toque)</Sub>
              <CartaoNumero
                rotulo={TEXTO_PAINEL.entregues}
                centavos={0}
                quantidadeOS={0}
                frases={[]}
                fraseZero={TEXTO_PAINEL.entreguesZero}
                href="#lista"
              />
            </div>
          </div>
          <Sub>“Hoje”: A receber (32 px, faixa alerta), com valor alto e zero</Sub>
          <div className="flex flex-col gap-3 rounded-lg bg-superficie-2 p-3 lg:grid lg:grid-cols-3">
            <CartaoNumero
              rotulo={TEXTO_PAINEL.aReceber}
              centavos={123456789}
              quantidadeOS={7}
              frases={["7 OS de 4 clientes, somando todos os meses · mais antiga há 42 dias"]}
              fraseZero={TEXTO_PAINEL.aReceberZero}
              href="#a-receber"
              tamanho="hoje"
              faixa="bg-alerta"
            />
            <CartaoNumero
              rotulo={TEXTO_PAINEL.aReceber}
              centavos={0}
              quantidadeOS={0}
              frases={[]}
              fraseZero={TEXTO_PAINEL.aReceberZero}
              href="#a-receber"
              tamanho="hoje"
              faixa="bg-alerta"
            />
            <CartaoContagem rotulo={TEXTO_PAINEL.osAbertas} quantidade={12} href="#painel" />
          </div>
        </Secao>

        <Secao id="seletor" titulo="Seletor de mês">
          <Sub>Mês atual (› desabilitado)</Sub>
          <DemoSeletor inicial={MES_ATUAL} />
          <Sub>Mês no meio</Sub>
          <DemoSeletor inicial="2026-03" />
          <Sub>Primeiro mês (‹ desabilitado)</Sub>
          <DemoSeletor inicial={PRIMEIRO_MES} />
        </Secao>

        <Secao id="painel" titulo="Painel montado (estados do §14.2)">
          <DemoPainel />
        </Secao>

        <Secao id="lista" titulo="Lista atrás de um número (LinhaOSNumero)">
          <Sub>Serviços entregues (entregues)</Sub>
          <div className="flex flex-col gap-2">
            {LINHAS_NUMERO.map((os) => (
              <LinhaOSNumero key={os.id} os={os} ver="entregues" hoje={HOJE} />
            ))}
          </div>
          <Sub>Dinheiro recebido (recebido)</Sub>
          <div className="flex flex-col gap-2">
            {LINHAS_NUMERO.filter((o) => o.pagoEm).map((os) => (
              <LinhaOSNumero key={os.id} os={os} ver="recebido" hoje={HOJE} />
            ))}
          </div>
          <Sub>Fora do catálogo e mecânico</Sub>
          <div className="flex flex-col gap-2">
            <LinhaOSNumero os={LINHAS_NUMERO[1]} ver="fora_catalogo" hoje={HOJE} />
            <LinhaOSNumero os={{ ...LINHAS_NUMERO[0], centavos: 120000 }} ver="mecanico" hoje={HOJE} />
          </div>
          <Sub>Carregando e vazio</Sub>
          <LinhasOSCarregando />
          <EstadoVazio
            titulo="Esta lista ficou vazia."
            texto="Um pagamento pode ter sido corrigido agora."
            acao={{ href: "#painel", rotulo: "Voltar ao painel", variante: "secundario" }}
          />
          <CaixaErro titulo="Não foi possível carregar as OS deste número." tentarDeNovo="#lista" />
        </Secao>

        <Secao id="a-receber" titulo="A receber (CartaoDevedor)">
          <p className="text-base text-texto-suave">
            “Registrar pagamento” aqui só tira a OS da lista e mostra o Desfazer (a folha real é a `FolhaPagamento`, do F7-B5).
          </p>
          <div className="flex flex-col gap-8 lg:grid lg:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Sub>Dono</Sub>
              <DemoAReceber papel="dono" />
            </div>
            <div className="flex flex-col gap-2">
              <Sub>Atendente (sem soma geral)</Sub>
              <DemoAReceber papel="atendente" />
            </div>
          </div>
          <Sub>Montado a partir das linhas de contas_a_receber (devedoresDeContas): entregue hoje, ontem e há 76 dias; sem telefone; sem forma</Sub>
          <DemoAReceber papel="dono" inicial={devedoresDeContas(CONTAS_A_RECEBER, () => "#a-receber")} />
          <Sub>Vazio, carregando e erro</Sub>
          <EstadoVazio
            icone={HandCoins}
            titulo="Nada a receber."
            texto="Quando uma OS for entregue sem pagamento, ela aparece aqui."
            acao={{ href: "#painel", rotulo: "Voltar ao painel", variante: "secundario" }}
          />
          <DevedoresCarregando />
          <CaixaErro titulo="Não foi possível carregar quem deve." tentarDeNovo="#a-receber" />
        </Secao>

        <Secao id="servicos" titulo="Serviços mais feitos (ranking)">
          <div className="flex flex-col gap-6 lg:grid lg:grid-cols-3">
            <div>
              <Sub>1 serviço (nome longo)</Sub>
              <ListaServicos mes="2026-10" servicos={SERVICOS_1} hrefServico={() => "#lista"} hrefForaCatalogo="#lista" />
            </div>
            <div>
              <Sub>5 + fora do catálogo (9 OS, mas sempre a última)</Sub>
              <ListaServicos mes="2026-10" servicos={SERVICOS_5} hrefServico={() => "#lista"} hrefForaCatalogo="#lista" />
            </div>
            <div>
              <Sub>18 serviços</Sub>
              <ListaServicos mes="2026-10" servicos={SERVICOS_18} hrefServico={() => "#lista"} hrefForaCatalogo="#lista" />
            </div>
          </div>
          <Sub>Vazio e erro</Sub>
          <ListaServicos mes="2026-10" servicos={[]} hrefServico={() => "#lista"} hrefForaCatalogo="#lista" />
          <ListaServicos mes="2026-10" servicos={[]} erro tentarDeNovo="#servicos" hrefServico={() => "#lista"} hrefForaCatalogo="#lista" />
        </Secao>

        <Secao id="mecanicos" titulo="Produtividade por mecânico">
          <ListaMecanicos mes="2026-10" mecanicos={MECANICOS} hrefMecanico={() => "#lista"} hrefSemMecanico="#lista" />
          <Sub>Vazio e erro</Sub>
          <ListaMecanicos mes="2026-10" mecanicos={[]} hrefMecanico={() => "#lista"} hrefSemMecanico="#lista" />
          <ListaMecanicos mes="2026-10" mecanicos={[]} erro tentarDeNovo="#mecanicos" hrefMecanico={() => "#lista"} hrefSemMecanico="#lista" />
        </Secao>

        <Secao id="historico" titulo="Linha do tempo da placa">
          <p className="text-base text-texto-suave">
            Toque numa OS para abrir. A OS #1035 falha na primeira vez. A #1042 tem fotos, código de falha e observação; a #1028 tem vistoria anulada + concluída.
          </p>
          <DemoHistorico />
        </Secao>
      </main>
    </div>
  );
}
