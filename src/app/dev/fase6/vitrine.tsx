"use client";

import { useState, type ReactNode } from "react";
import { Moon, Sun } from "lucide-react";
import { FaixaTeste } from "@/components/layout/cabecalho";
import { CartaoLink } from "@/components/orcamento/cartao-link";
import { DocumentoOrcamento } from "@/components/orcamento/documento-orcamento";
import { PreviaOrcamento } from "@/components/orcamento/previa-orcamento";
import { ProvaOrcamento, RecusaDestaque, RespostasVersoes } from "@/components/orcamento/prova-orcamento";
import { Botao } from "@/components/ui/botao";
import { TEMA_STORAGE_KEY } from "@/lib/tema";
import { AGORA, DOC_30_ITENS, DOC_ITEM_SEM_PRECO, DOC_PADRAO, DOC_SEM_TELEFONE, EXPIRA_EM, RESPONDIDO_EM } from "./dados";
import { CASOS } from "./publica/[caso]/casos";

const DOCS_PREVIA = { padrao: DOC_PADRAO, longa: DOC_30_ITENS, sem_preco: DOC_ITEM_SEM_PRECO, sem_telefone: DOC_SEM_TELEFONE };

const acaoFicticia = async () => {
  await new Promise((resolver) => setTimeout(resolver, 400));
  return {};
};

function Secao({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-t`} className="flex flex-col gap-3">
      <h2 id={`${id}-t`} className="text-2xl">
        {titulo}
      </h2>
      {children}
    </section>
  );
}

function Sub({ children }: { children: ReactNode }) {
  return <h3 className="mt-2 text-lg">{children}</h3>;
}

export function Vitrine() {
  const [previa, setPrevia] = useState<keyof typeof DOCS_PREVIA | null>(null);

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
      <main className="flex w-full max-w-[720px] flex-col gap-8 px-4 py-5">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-3xl">Vitrine Fase 6</h1>
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

        <Secao id="publica" titulo="Página pública (tela inteira)">
          <p className="text-base text-texto-suave">Abre como será a rota real: sem menu, sempre clara e com a resposta simulada, sem rede.</p>
          <ul className="flex flex-col">
            {Object.entries(CASOS).map(([caso, rotulo]) => (
              <li key={caso}>
                {/* <a>, não <Link>: a rota pública sempre abre em carga completa (globals.css). */}
                <a href={`/dev/fase6/publica/${caso}`} className="inline-flex min-h-toque items-center text-base font-bold text-info-texto underline underline-offset-4">
                  {rotulo}
                </a>
              </li>
            ))}
          </ul>
        </Secao>

        <Secao id="previa" titulo="Ver como o cliente vê (prévia do balcão)">
          <div className="flex flex-col gap-2">
            <Botao variante="secundario" className="h-toque!" onClick={() => setPrevia("padrao")} data-teste="previa-padrao">
              Prévia: orçamento normal
            </Botao>
            <Botao variante="secundario" className="h-toque!" onClick={() => setPrevia("sem_preco")} data-teste="previa-sem-preco">
              Prévia: item sem preço
            </Botao>
            <Botao variante="secundario" className="h-toque!" onClick={() => setPrevia("longa")} data-teste="previa-longa">
              Prévia: 30 itens
            </Botao>
            <Botao variante="secundario" className="h-toque!" onClick={() => setPrevia("sem_telefone")} data-teste="previa-sem-telefone">
              Prévia: oficina sem telefone
            </Botao>
          </div>
          <PreviaOrcamento aberta={previa !== null} aoFechar={() => setPrevia(null)} documento={DOCS_PREVIA[previa ?? "padrao"]} expiraEm={EXPIRA_EM} />
        </Secao>

        <Secao id="consulta" titulo="Versão congelada (consulta no balcão)">
          <div className="papel-claro flex flex-col gap-6 rounded-lg border border-borda-sutil bg-fundo p-4 text-texto" data-teste="consulta">
            <DocumentoOrcamento documento={DOC_PADRAO} expiraEm={EXPIRA_EM} variante="consulta" />
          </div>
        </Secao>

        <Secao id="link" titulo="Situação do link">
          <Sub>Ativo</Sub>
          <div data-teste="link-ativo">
            <CartaoLink
              osNumero={1042}
              dados={{ situacao: "ativo", geradoPor: "Ana", geradoEm: "2026-11-02T12:30:00.000Z", versao: 2, expiraEm: EXPIRA_EM, agora: AGORA }}
              aoReenviar={() => {}}
              aoVerComoCliente={() => setPrevia("padrao")}
              aoCancelarLink={acaoFicticia}
            />
          </div>
          <Sub>Vencido</Sub>
          <div data-teste="link-vencido">
            <CartaoLink
              osNumero={1042}
              dados={{ situacao: "vencido", versao: 2, expiraEm: EXPIRA_EM }}
              aoVerComoCliente={() => setPrevia("padrao")}
              aoRegistrarResposta={() => {}}
            />
          </div>
          <Sub>Cancelado</Sub>
          <div data-teste="link-cancelado">
            <CartaoLink
              osNumero={1042}
              dados={{ situacao: "cancelado", canceladoPor: "Ana", canceladoEm: "2026-11-03T11:10:00.000Z", versao: 2 }}
              aoVerComoCliente={() => setPrevia("padrao")}
              aoRegistrarResposta={() => {}}
            />
          </div>
          <Sub>OS antiga, sem link</Sub>
          <div data-teste="link-sem">
            <CartaoLink osNumero={1042} dados={{ situacao: "sem_link" }} aoEnviarWhatsApp={() => {}} />
          </div>
        </Secao>

        <Secao id="prova" titulo="Prova da aprovação">
          <Sub>Pelo link</Sub>
          <div data-teste="prova-link">
            <ProvaOrcamento
              osNumero={1042}
              canal="link"
              nome="Carlos Souza"
              respondidoEm={RESPONDIDO_EM}
              versao={2}
              valorCentavos={345_000}
              codigoConferencia="A1B2-C3D4"
              aoVerAprovado={() => {}}
              aoDesfazer={acaoFicticia}
            />
          </div>
          <Sub>À mão</Sub>
          <div data-teste="prova-mao">
            <ProvaOrcamento
              osNumero={1042}
              canal="telefone"
              nome="Ricardo, gerente"
              respondidoEm={RESPONDIDO_EM}
              marcadoPor="Ana"
              versao={3}
              valorCentavos={345_000}
              codigoConferencia="E5F6-A7B8"
              aoVerAprovado={() => {}}
            />
          </div>
          <Sub>Respostas e versões</Sub>
          <div data-teste="respostas-versoes">
            <RespostasVersoes
              linhas={[
                { versao: 3, resposta: "enviada", href: "#" },
                {
                  versao: 2,
                  resposta: "aprovou",
                  canal: "link",
                  nome: "Carlos Souza",
                  em: RESPONDIDO_EM,
                  desfeitaPor: "Ana",
                  desfeitaEm: "2026-11-03T14:00:00.000Z",
                  href: "#",
                },
                { versao: 1, resposta: "recusou", canal: "link", em: "2026-11-02T21:02:00.000Z", motivo: "achei caro", href: "#" },
              ]}
            />
          </div>
        </Secao>

        <Secao id="recusa" titulo="Recusa em destaque">
          <div data-teste="recusa-motivo">
            <RecusaDestaque motivo="Achei caro" respondidoEm={RESPONDIDO_EM} versao={2} telefoneCliente="11988887777" aoRegistrarResposta={() => {}} />
          </div>
          <div data-teste="recusa-sem-motivo">
            <RecusaDestaque motivo={null} respondidoEm={RESPONDIDO_EM} versao={2} aoRegistrarResposta={() => {}} />
          </div>
        </Secao>
      </main>
    </div>
  );
}
