"use client";

import { useCallback, useState, type ReactNode } from "react";
import { Moon, Sun } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { FaixaTeste } from "@/components/layout/cabecalho";
import { ResumoTotais } from "@/components/os/resumo-totais";
import { EtiquetaSemPreco } from "@/components/os/badge-status";
import { AprovadoAgora } from "@/components/os/aprovado-agora";
import { CartaoOSSemPreco } from "@/components/os/cartao-os-sem-preco";
import { rotuloCategoriaFoto, type CategoriaFoto } from "@/components/os/categorias-foto";
import { EscolhaCategoriaFoto, FolhaEditarFoto } from "@/components/os/escolha-categoria-foto";
import {
  EtiquetaAcimaDoAprovado,
  EtiquetaAposAprovacao,
  EtiquetaConferido,
  EtiquetaFotosNaoEnviadas,
  EtiquetaLancadoPor,
  EtiquetaSemPrecoContagem,
  EtiquetaVoceLancou,
  LinhaEtiquetas,
} from "@/components/os/etiquetas-fase3";
import { FaixaEnvioFotos, type SituacaoEnvio } from "@/components/os/faixa-envio-fotos";
import { FotoTelaCheia, type FotoTelaCheiaDados } from "@/components/os/foto-tela-cheia";
import { GradeFotos, type DadosMiniaturaFoto } from "@/components/os/grade-fotos";
import { TEMA_STORAGE_KEY } from "@/lib/tema";

/** Imagem ficticia (SVG em data URI): fundo de cor + desenho simples de peca. */
function imagem(cor: string, texto: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="${cor}"/><circle cx="200" cy="140" r="70" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="18"/><circle cx="200" cy="140" r="22" fill="#fff" fill-opacity=".55"/><text x="200" y="270" font-family="sans-serif" font-size="28" font-weight="700" fill="#fff" text-anchor="middle">${texto}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const AGORA = "2026-10-29T17:32:00Z";

const FOTOS_ESTADOS: DadosMiniaturaFoto[] = [
  { id: "e1", src: imagem("#5B6B7A", "1"), categoria: "peca_trocada", estado: "preparando" },
  { id: "e2", src: imagem("#7A5B3F", "2"), categoria: "diagnostico", estado: "na_fila" },
  { id: "e3", src: imagem("#3F6B5B", "3"), categoria: "antes", estado: "sem_internet" },
  { id: "e4", src: imagem("#6B3F5B", "4"), categoria: "peca_defeituosa", estado: "enviando", progresso: 45 },
  { id: "e5", src: imagem("#3F4F7A", "5"), categoria: "depois", estado: "falhou" },
  { id: "e6", src: imagem("#7A3F3F", "6"), categoria: "outro", estado: "nao_enviavel" },
  {
    id: "e7",
    src: imagem("#2F6B3F", "7"),
    categoria: "entrega",
    estado: "confirmada",
    enviadoPor: "João",
    enviadoEm: AGORA,
  },
  {
    id: "e8",
    src: imagem("#55555F", "8"),
    categoria: "peca_trocada",
    estado: "enviada",
    legenda: "Bico injetor novo",
    enviadoPor: "João",
    enviadoEm: AGORA,
  },
  { id: "e9", src: null, categoria: "diagnostico", estado: "sem_imagem", enviadoPor: "Ana", enviadoEm: AGORA },
];

const CATEGORIAS: CategoriaFoto[] = ["diagnostico", "peca_defeituosa", "peca_trocada", "antes", "depois", "entrega", "outro"];
const CORES = ["#5B6B7A", "#7A5B3F", "#3F6B5B", "#6B3F5B", "#3F4F7A", "#7A3F3F", "#2F6B3F"];

const FOTOS_MUITAS: DadosMiniaturaFoto[] = Array.from({ length: 15 }, (_, i) => ({
  id: `m${i}`,
  src: imagem(CORES[i % CORES.length], String(i + 1)),
  categoria: CATEGORIAS[i % CATEGORIAS.length],
  estado: "enviada",
  enviadoPor: "João",
  enviadoEm: AGORA,
}));

const FOTOS_TELA_CHEIA: FotoTelaCheiaDados[] = [
  {
    id: "t1",
    src: imagem("#7A5B3F", "1"),
    srcGrande: imagem("#7A5B3F", "Foto grande 1"),
    categoria: "peca_defeituosa",
    legenda: "Chicote rompido perto do sensor",
    enviadoPor: "João",
    enviadoEm: AGORA,
    estado: "enviada",
    podeEditar: true,
    podeApagar: true,
  },
  {
    id: "t2",
    src: imagem("#3F6B5B", "2"),
    srcGrande: imagem("#3F6B5B", "Foto grande 2"),
    categoria: "peca_trocada",
    enviadoPor: "Ana",
    enviadoEm: "2026-10-29T13:05:00Z",
    estado: "enviada",
    podeEditar: false,
    podeApagar: false,
  },
  {
    id: "t3",
    src: imagem("#3F4F7A", "3"),
    srcGrande: imagem("#3F4F7A", "Foto local 3"),
    categoria: "depois",
    estado: "falhou",
    podeApagar: true,
  },
  {
    id: "t4",
    src: imagem("#7A3F3F", "4"),
    srcGrande: imagem("#7A3F3F", "Foto local 4"),
    categoria: "outro",
    estado: "nao_enviavel",
    motivo: "Esta OS já tem 40 fotos. Apague alguma para enviar esta.",
    podeApagar: true,
  },
  {
    id: "t5",
    src: imagem("#55555F", "5"),
    srcGrande: "https://invalido.mechaflow.test/foto.jpg",
    categoria: "diagnostico",
    estado: "enviada",
    enviadoPor: "João",
    enviadoEm: AGORA,
  },
];

const SITUACOES: SituacaoEnvio[] = [
  { tipo: "enviando", atual: 2, total: 5, progresso: 30 },
  { tipo: "retomando", quantidade: 2, numeroOS: 1042, progresso: 60 },
  { tipo: "sem_internet", guardadas: 3 },
  { tipo: "falhou", quantidade: 2 },
  { tipo: "concluido", total: 5 },
];

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  const [escolhida, setEscolhida] = useState<string>("");
  const [selecionada, setSelecionada] = useState<CategoriaFoto>("peca_trocada");
  const [mensagem, setMensagem] = useState("");
  const [fotosTela, setFotosTela] = useState(FOTOS_TELA_CHEIA);
  const [telaAberta, setTelaAberta] = useState(false);
  const [indice, setIndice] = useState(0);
  const [editando, setEditando] = useState<FotoTelaCheiaDados | null>(null);
  const [faixaFixa, setFaixaFixa] = useState<SituacaoEnvio | null>(null);

  const mudarIndice = useCallback((i: number) => setIndice(i), []);

  function trocarTema() {
    const d = document.documentElement;
    const novo = d.getAttribute("data-tema") === "escuro" ? "claro" : "escuro";
    d.setAttribute("data-tema", novo);
    try {
      localStorage.setItem(TEMA_STORAGE_KEY, novo);
    } catch {}
  }

  function abrirTela(i: number) {
    setIndice(i);
    setTelaAberta(true);
  }

  return (
    <div className="flex flex-1 flex-col">
      <FaixaTeste />
      <main className="mx-auto flex w-full max-w-[720px] flex-col gap-8 px-4 py-5 pb-40">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl">Vitrine da Fase 3</h1>
            <p className="text-base text-texto-suave">Componentes com dados fictícios. Só no staging.</p>
          </div>
          <button
            type="button"
            onClick={trocarTema}
            aria-label="Trocar tema claro/escuro"
            className="inline-flex min-h-toque min-w-toque items-center justify-center rounded-md border-2 border-borda bg-superficie"
          >
            <Sun size={22} aria-hidden className="hidden dark:block" />
            <Moon size={22} aria-hidden className="dark:hidden" />
          </button>
        </div>

        <Secao id="etiquetas" titulo="Etiquetas">
          <Sub>Dono e atendente</Sub>
          <LinhaEtiquetas>
            <EtiquetaLancadoPor nome="João Carlos" />
            <EtiquetaAposAprovacao />
          </LinhaEtiquetas>
          <LinhaEtiquetas>
            <EtiquetaSemPreco />
            <EtiquetaSemPrecoContagem quantidade={2} />
            <EtiquetaAcimaDoAprovado />
          </LinhaEtiquetas>
          <Sub>Mecânico</Sub>
          <LinhaEtiquetas>
            <EtiquetaVoceLancou />
            <EtiquetaConferido />
          </LinhaEtiquetas>
          <Sub>Fila no aparelho</Sub>
          <LinhaEtiquetas>
            <EtiquetaFotosNaoEnviadas quantidade={2} />
            <EtiquetaFotosNaoEnviadas quantidade={1} />
          </LinhaEtiquetas>
        </Secao>

        <Secao id="categoria" titulo="Do que é esta foto?">
          <Sub>Tocar já escolhe (envio)</Sub>
          <EscolhaCategoriaFoto aoEscolher={(c) => setEscolhida(rotuloCategoriaFoto(c))} />
          <p role="status" className="text-base font-bold">
            {escolhida ? `Escolheu: ${escolhida}` : ""}
          </p>
          <Sub>Só marca (editar)</Sub>
          <EscolhaCategoriaFoto modo="selecionar" selecionada={selecionada} aoEscolher={setSelecionada} />
        </Secao>

        <Secao id="grade" titulo="Fotos (9)">
          <Sub>Todos os estados</Sub>
          <GradeFotos
            fotos={FOTOS_ESTADOS}
            aoAbrir={(id) => setMensagem(`Abrir ${id}`)}
            aoTentarDeNovo={(id) => setMensagem(`Tentar de novo ${id}`)}
            aoRecarregar={(id) => setMensagem(`Recarregar ${id}`)}
          />
          <p role="status" className="text-base text-texto-suave">
            {mensagem}
          </p>
          <Sub>Mais de 12</Sub>
          <GradeFotos fotos={FOTOS_MUITAS} aoAbrir={() => abrirTela(0)} />
          <Sub>Vazia (mecânico)</Sub>
          <GradeFotos fotos={[]} vazio="mecanico" />
          <Sub>Vazia (dono/atendente)</Sub>
          <GradeFotos fotos={[]} />
          <Sub>Carregando</Sub>
          <GradeFotos fotos={[]} carregando />
          <Sub>Erro ao carregar</Sub>
          <GradeFotos fotos={[]} erro aoTentarCarregar={() => setMensagem("Tentar carregar")} />
        </Secao>

        <Secao id="tela-cheia" titulo="Foto em tela cheia">
          <Botao variante="secundario" onClick={() => abrirTela(0)} data-teste="abrir-tela-cheia">
            Abrir tela cheia (pode editar e apagar)
          </Botao>
          <Botao variante="secundario" onClick={() => abrirTela(1)}>
            Abrir foto de outra pessoa (só ver)
          </Botao>
          <Botao variante="secundario" onClick={() => abrirTela(2)}>
            Abrir foto que falhou
          </Botao>
          <Botao variante="secundario" onClick={() => abrirTela(3)}>
            Abrir foto que não dá para enviar
          </Botao>
          <Botao variante="secundario" onClick={() => abrirTela(4)}>
            Abrir foto que não carrega
          </Botao>
          <Botao variante="secundario" onClick={() => setFotosTela(FOTOS_TELA_CHEIA)}>
            Restaurar fotos apagadas
          </Botao>
        </Secao>

        <Secao id="faixa" titulo="Faixa de envio">
          {SITUACOES.map((s) => (
            <FaixaEnvioFotos
              key={s.tipo}
              situacao={s}
              fixa={false}
              aoTentarDeNovo={() => setMensagem("Tentar de novo (faixa)")}
            />
          ))}
          <Botao variante="secundario" onClick={() => setFaixaFixa(SITUACOES[0])}>
            Mostrar faixa fixa (acima da barra)
          </Botao>
        </Secao>

        <Secao id="totais" titulo="Aprovado × Agora × Diferença">
          <Sub>Itens depois da aprovação</Sub>
          <div className="rounded-lg border border-borda-sutil bg-superficie p-4">
            <ResumoTotais servicosCentavos={180000} pecasCentavos={210000} totalCentavos={390000} />
            <AprovadoAgora aprovadoCentavos={345000} agoraCentavos={390000} itensAposAprovacao={2} />
          </div>
          <Sub>Com item novo sem preço</Sub>
          <div className="rounded-lg border border-borda-sutil bg-superficie p-4">
            <ResumoTotais totalCentavos={390000} itensSemPreco={1} />
            <AprovadoAgora
              aprovadoCentavos={345000}
              agoraCentavos={390000}
              itensAposAprovacao={2}
              itensAposSemPreco={1}
            />
          </div>
          <Sub>Total menor que o aprovado</Sub>
          <div className="rounded-lg border border-borda-sutil bg-superficie p-4">
            <ResumoTotais totalCentavos={325000} />
            <AprovadoAgora aprovadoCentavos={345000} agoraCentavos={325000} />
          </div>
        </Secao>

        <Secao id="inicio" titulo="Cartão do início (dono)">
          <CartaoOSSemPreco quantidade={3} href="#inicio" />
          <CartaoOSSemPreco quantidade={1} href="#inicio" />
        </Secao>
      </main>

      {faixaFixa && (
        <FaixaEnvioFotos
          situacao={faixaFixa}
          aoTocar={() => document.getElementById("grade")?.scrollIntoView()}
          aoTentarDeNovo={() => setFaixaFixa({ tipo: "enviando", atual: 1, total: 2, progresso: 10 })}
          aoSumir={() => setFaixaFixa(null)}
        />
      )}
      {/* Barra ficticia de 64px, para ver a faixa fixa no lugar certo. */}
      {faixaFixa && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex h-[calc(4rem+env(safe-area-inset-bottom))] items-start gap-2 bg-superficie px-4 pt-2 shadow-barra">
          {SITUACOES.map((s) => (
            <button
              key={s.tipo}
              type="button"
              onClick={() => setFaixaFixa(s)}
              className="min-h-toque flex-1 rounded-md border-2 border-borda text-xs font-bold"
            >
              {s.tipo.replace("_", " ")}
            </button>
          ))}
        </div>
      )}

      <FotoTelaCheia
        aberta={telaAberta}
        aoFechar={() => setTelaAberta(false)}
        fotos={fotosTela}
        indice={indice}
        aoMudarIndice={mudarIndice}
        aoEditar={(f) => setEditando(f)}
        aoApagar={async (f) => {
          await esperar(800);
          setFotosTela((lista) => lista.filter((x) => x.id !== f.id));
        }}
        aoRemoverDaFila={(f) => setFotosTela((lista) => lista.filter((x) => x.id !== f.id))}
        aoTentarDeNovo={(f) =>
          setFotosTela((lista) => lista.map((x) => (x.id === f.id ? { ...x, estado: "na_fila" } : x)))
        }
      />

      {editando && (
        <FolhaEditarFoto
          key={editando.id}
          aberta
          aoFechar={() => setEditando(null)}
          categoriaInicial={editando.categoria}
          legendaInicial={editando.legenda}
          ajudaLegenda="O mecânico também vê esta legenda."
          aoSalvar={async ({ categoria, legenda }) => {
            await esperar(600);
            setFotosTela((lista) => lista.map((x) => (x.id === editando.id ? { ...x, categoria, legenda } : x)));
          }}
        />
      )}
    </div>
  );
}
