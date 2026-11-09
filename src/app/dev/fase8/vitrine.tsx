"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Moon, Plus, Sun } from "lucide-react";
import { GrupoAjuda } from "@/components/ajuda/grupo-ajuda";
import { AceiteTermos, ERRO_TERMOS } from "@/components/auth/aceite-termos";
import { CartaoPrimeirosPassos, type IdPasso, type ResultadoPassos } from "@/components/inicio/cartao-primeiros-passos";
import { FaixaTeste } from "@/components/layout/cabecalho";
import { BlocoDefinicoes } from "@/components/legal/bloco-definicoes";
import { Botao } from "@/components/ui/botao";
import { TEMA_STORAGE_KEY } from "@/lib/tema";
import { linkWhatsAppSuporte, mensagemSuporteApp } from "@/lib/suporte";
import { CASOS_INICIAL, CASOS_LEGAL, NUMERO_FICTICIO } from "./casos";

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

const LINK = "inline-flex min-h-toque items-center text-base font-bold text-info-texto underline underline-offset-4";

// ---------------------------------------------------------------- primeiros passos

const ORDEM: IdPasso[] = ["oficina", "equipe", "catalogo", "primeira_os"];
const passosCom = (feitos: IdPasso[]) => ORDEM.map((id) => ({ id, feito: feitos.includes(id) }));

type CasoPassos = {
  id: string;
  titulo: string;
  feitos: IdPasso[];
  dispensar: "ok" | "servidor" | "rede";
  erroInicial?: "servidor" | "rede";
};

const CASOS_PASSOS: CasoPassos[] = [
  { id: "p0", titulo: "0 de 4 (oficina recém-criada)", feitos: [], dispensar: "ok" },
  { id: "p1", titulo: "1 de 4 (passo 1 feito)", feitos: ["oficina"], dispensar: "ok" },
  { id: "p2", titulo: "2 de 4 fora de ordem (2 e 4 feitos; destaque no 1)", feitos: ["equipe", "primeira_os"], dispensar: "ok" },
  { id: "p3", titulo: "3 de 4 (“Falta só um.”)", feitos: ["oficina", "equipe", "primeira_os"], dispensar: "ok" },
  {
    id: "p-dispensar",
    titulo: "Dispensando: toque em “Dispensar” (some, foco no “Abrir OS”, Desfazer por 6 s)",
    feitos: ["oficina"],
    dispensar: "ok",
  },
  {
    id: "p-erro",
    titulo: "Erro ao dispensar (servidor). Tocar de novo falha outra vez",
    feitos: ["oficina"],
    dispensar: "servidor",
    erroInicial: "servidor",
  },
  {
    id: "p-rede",
    titulo: "Erro ao dispensar (sem internet)",
    feitos: ["oficina"],
    dispensar: "rede",
    erroInicial: "rede",
  },
];

function CasoPrimeirosPassos({ caso }: { caso: CasoPassos }) {
  const [chave, setChave] = useState(0);
  const idAbrir = `abrir-os-${caso.id}`;
  async function aoDispensar(): Promise<ResultadoPassos> {
    await esperar(600);
    return caso.dispensar === "ok" ? { ok: true } : { ok: false, erro: caso.dispensar };
  }
  async function aoDesfazer(): Promise<ResultadoPassos> {
    await esperar(600);
    return { ok: true };
  }
  return (
    <div className="flex flex-col gap-3">
      <Sub>{caso.titulo}</Sub>
      <CartaoPrimeirosPassos
        key={chave}
        passos={passosCom(caso.feitos)}
        dispensado={false}
        aoDispensar={aoDispensar}
        aoDesfazer={aoDesfazer}
        focoAoDispensar={idAbrir}
        erroInicial={caso.erroInicial}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Botao id={idAbrir} className="w-auto!">
          <Plus size={24} strokeWidth={2.25} aria-hidden />
          Abrir OS
        </Botao>
        <button type="button" onClick={() => setChave((n) => n + 1)} className={LINK}>
          Recomeçar este caso
        </button>
      </div>
    </div>
  );
}

function CasoVazio({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Sub>{titulo}</Sub>
      <div className="rounded-md border-2 border-dashed border-borda-sutil p-3 text-base text-texto-suave">
        {children}
        <span>Nada desenhado (correto).</span>
      </div>
    </div>
  );
}

const nada = async (): Promise<ResultadoPassos> => ({ ok: true });

// ---------------------------------------------------------------- vitrine

export function Vitrine() {
  const [estreita, setEstreita] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  function trocarTema() {
    const d = document.documentElement;
    const novo = d.getAttribute("data-tema") === "escuro" ? "claro" : "escuro";
    d.setAttribute("data-tema", novo);
    try {
      localStorage.setItem(TEMA_STORAGE_KEY, novo);
    } catch {}
  }

  const abrirFeedback = (quem: string) => () => setFeedback(`Aqui abriria a folha “Enviar feedback” (${quem}). A ligação é do F8-B2.`);
  const zapDono = linkWhatsAppSuporte(mensagemSuporteApp("Guilherme", "Oficina Diesel Silva"), NUMERO_FICTICIO);
  const zapAtendente = linkWhatsAppSuporte(mensagemSuporteApp("Márcia", "Oficina Diesel Silva"), NUMERO_FICTICIO);
  const zapMecanico = linkWhatsAppSuporte(mensagemSuporteApp("Zé Carlos", "Oficina Diesel Silva"), NUMERO_FICTICIO);

  return (
    <div className="flex min-h-dvh flex-col bg-fundo text-texto">
      <FaixaTeste />
      <main className={`flex w-full flex-col gap-8 py-5 ${estreita ? "max-w-[320px] px-0" : "max-w-[1280px] px-4"}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl">Vitrine Fase 8</h1>
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
          Dados fictícios, sem banco. O número do WhatsApp é fictício ({NUMERO_FICTICIO}). As páginas inteiras abrem em
          tela própria (o tema escolhido aqui vale lá também).
        </p>

        <Secao id="inicial" titulo="1. Página inicial">
          <ul className="flex flex-col">
            {Object.entries(CASOS_INICIAL).map(([caso, rotulo]) => (
              <li key={caso}>
                <Link href={`/dev/fase8/inicial/${caso}`} className={LINK}>
                  {rotulo}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/" className={LINK}>
                A página real (/), com a variável deste ambiente
              </Link>
            </li>
          </ul>
        </Secao>

        <Secao id="legal" titulo="2. Termos e Privacidade">
          <ul className="flex flex-col">
            {Object.entries(CASOS_LEGAL).map(([caso, rotulo]) => (
              <li key={caso}>
                <Link href={`/dev/fase8/legal/${caso}`} className={LINK}>
                  {rotulo}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/termos" className={LINK}>
                /termos real
              </Link>
            </li>
            <li>
              <Link href="/privacidade" className={LINK}>
                /privacidade real
              </Link>
            </li>
          </ul>
          <Sub>Tabela que vira blocos abaixo de 640 px (use “320 px”)</Sub>
          <div className="max-w-[70ch]">
            <BlocoDefinicoes
              legenda="Exemplo de tabela"
              colunas={["Dado", "Para quê", "Por quanto tempo"]}
              linhas={[
                ["Dados da oficina e dos clientes dela", "Fazer o sistema funcionar", "Enquanto a oficina usar"],
                ["Registro do aceite", "Prova do aceite", "5 anos depois do fim da conta"],
                ["IP da resposta ao orçamento", "Comprovante", "12 meses"],
                ["Registros de acesso", "Segurança", "Pelo menos 6 meses"],
                ["Cópias de segurança", "Recuperar falhas", "7 dias"],
              ]}
            />
          </div>
        </Secao>

        <Secao id="passos" titulo="3. Primeiros passos (só dono, no /inicio)">
          <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:items-start">
            {CASOS_PASSOS.map((c) => (
              <CasoPrimeirosPassos key={c.id} caso={c} />
            ))}
            <div className="flex flex-col gap-3">
              <CasoVazio titulo="4 de 4 feitos">
                <CartaoPrimeirosPassos
                  passos={passosCom(ORDEM)}
                  dispensado={false}
                  aoDispensar={nada}
                  aoDesfazer={nada}
                  focoAoDispensar="x"
                />
              </CasoVazio>
              <CasoVazio titulo="Dispensado (com passos pendentes)">
                <CartaoPrimeirosPassos
                  passos={passosCom([])}
                  dispensado
                  aoDispensar={nada}
                  aoDesfazer={nada}
                  focoAoDispensar="x"
                />
              </CasoVazio>
              <CasoVazio titulo="Erro na leitura dos passos">
                <CartaoPrimeirosPassos passos={null} dispensado={false} aoDispensar={nada} aoDesfazer={nada} focoAoDispensar="x" />
              </CasoVazio>
            </div>
          </div>
        </Secao>

        <Secao id="ajuda" titulo="4. Grupo Ajuda">
          {feedback && (
            <p role="status" className="rounded-md bg-superficie-2 p-3 text-base">
              {feedback}
            </p>
          )}
          <div className="flex flex-col gap-8 lg:grid lg:grid-cols-2">
            <div className="flex max-w-[560px] flex-col gap-3">
              <Sub>Dono, no Mais (abaixo da lista)</Sub>
              <GrupoAjuda whatsapp={zapDono} aoEnviarFeedback={abrirFeedback("dono")} />
            </div>
            <div className="flex max-w-[560px] flex-col gap-3">
              <Sub>Atendente, no Mais</Sub>
              <GrupoAjuda whatsapp={zapAtendente} aoEnviarFeedback={abrirFeedback("atendente")} />
            </div>
            <div className="flex max-w-[560px] flex-col gap-3">
              <Sub>Mecânico, na Conta (linha da senha acima; entre Tema e Sair)</Sub>
              <p className="text-base text-texto-suave">
                Esqueceu a senha ou precisa trocar o e-mail? Fale com o dono da oficina.
              </p>
              <GrupoAjuda whatsapp={zapMecanico} aoEnviarFeedback={abrirFeedback("mecânico")} />
            </div>
            <div className="flex max-w-[560px] flex-col gap-3">
              <Sub>Sem a variável do WhatsApp</Sub>
              <GrupoAjuda whatsapp={null} aoEnviarFeedback={abrirFeedback("sem variável")} />
            </div>
          </div>
          <p className="text-base text-texto-suave">
            Mensagem pronta do dono: “{mensagemSuporteApp("Guilherme", "Oficina Diesel Silva")}”
          </p>
        </Secao>

        <Secao id="aceite" titulo="7. Aceite com os 2 links">
          <div className="flex max-w-[560px] flex-col gap-6">
            <div>
              <Sub>Normal</Sub>
              <AceiteTermos />
            </div>
            <div>
              <Sub>Com erro</Sub>
              <AceiteTermos erro={ERRO_TERMOS} />
            </div>
          </div>
        </Secao>

        <p className="text-base text-texto-suave">
          Itens 5 (cabeçalho em produção) e 6 (folha do feedback com a linha de produção) do DESIGN §15.9 são do F8-B2,
          que liga o feedback em produção.
        </p>
      </main>
    </div>
  );
}
