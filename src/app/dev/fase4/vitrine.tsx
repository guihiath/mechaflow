"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Moon, Sun } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { Campo } from "@/components/ui/campo";
import { FaixaTeste } from "@/components/layout/cabecalho";
import { AvisoDesfazer } from "@/components/ui/aviso-desfazer";
import { Folha } from "@/components/ui/folha";
import { LinhaEtiquetas } from "@/components/os/etiquetas-fase3";
import { CampoAssinatura, type ResultadoAssinatura } from "@/components/vistoria/campo-assinatura";
import {
  EtiquetaAcrescentado,
  EtiquetaSemAssinatura,
  EtiquetaSemFoto,
  EtiquetaVistoria,
  EtiquetaVistoriaCartao,
} from "@/components/vistoria/etiquetas-vistoria";
import { CombustivelLeitura, MarcadorCombustivel } from "@/components/vistoria/marcador-combustivel";
import {
  BotaoMarcarRestoOk,
  ContagemChecklist,
  LinhaChecklist,
  LinhaChecklistLeitura,
  ordenarParaLeitura,
} from "@/components/vistoria/linha-checklist";
import { CamposAvaria, ListaAvarias, type DadosAvaria } from "@/components/vistoria/cartao-avaria";
import {
  IndicadorSalvo,
  LinhaPasso,
  PassosVistoria,
  type EstadoPasso,
  type NumeroPasso,
} from "@/components/vistoria/passos-vistoria";
import { BlocoVistoriaConcluida, type DadosComplemento } from "@/components/vistoria/vistoria-concluida";
import {
  LinhaLinkChecklist,
  ListaEditorChecklist,
  moverNaLista,
  type ItemEditorChecklist,
} from "@/components/vistoria/editor-checklist";
import { PreviaAssinatura } from "@/components/vistoria/previa-assinatura";
import { temTraco, type DadosAssinatura } from "@/lib/assinatura";
import {
  formatarBytes,
  LIMITE_BYTES_ASSINATURA,
  type LadoAvaria,
  type NivelCombustivel,
  type SituacaoItemVistoria,
} from "@/lib/formato";
import { TEMA_STORAGE_KEY } from "@/lib/tema";

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

/** Assinatura: previa + tela cheia + o que sairia para o Storage (tamanho, dimensoes). */
function DemoAssinatura() {
  const [nome, setNome] = useState("Carlos");
  const [aberta, setAberta] = useState(false);
  const [tracos, setTracos] = useState<DadosAssinatura | null>(null);
  const [usada, setUsada] = useState<{ url: string; info: Omit<ResultadoAssinatura, "blob" | "dados"> } | null>(null);
  const previa = useRef<HTMLButtonElement>(null);

  // Libera o blob: anterior ao trocar de assinatura.
  useEffect(() => {
    const url = usada?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [usada?.url]);

  return (
    <div className="flex flex-col gap-4">
      <Campo
        rotulo="Nome de quem assinou"
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        placeholder="Ex.: Carlos, motorista"
        autoComplete="off"
        enterKeyHint="done"
      />
      <PreviaAssinatura ref={previa} src={usada?.url} nome={nome} aoAssinar={() => setAberta(true)} />
      {usada && (
        <p data-teste="info-assinatura" className="font-mono text-sm text-texto-suave">
          PNG {usada.info.largura}×{usada.info.altura} · {formatarBytes(usada.info.tamanhoBytes)} ({usada.info.tamanhoBytes}{" "}
          bytes; limite {formatarBytes(LIMITE_BYTES_ASSINATURA)})
        </p>
      )}
      <p data-teste="tracos-guardados" className="text-sm text-texto-suave">
        Traços guardados: {tracos?.tracos.length ?? 0}
        {temTraco(tracos) ? ` (papel ${Math.round(tracos!.largura)}×${Math.round(tracos!.altura)} px)` : ""}. Fechar
        pelo voltar não apaga.
      </p>
      <Botao variante="secundario" onClick={() => setAberta(true)} data-teste="abrir-assinatura">
        Abrir a tela cheia de novo
      </Botao>
      <Botao
        variante="secundario"
        onClick={() => {
          setTracos(null);
          setUsada(null);
        }}
      >
        Zerar a demonstração
      </Botao>

      <CampoAssinatura
        aberta={aberta}
        aoFechar={() => setAberta(false)}
        valor={tracos}
        aoMudar={setTracos}
        nome={nome}
        aoUsar={async (r) => {
          setTracos(r.dados);
          setUsada({
            url: URL.createObjectURL(r.blob),
            info: { largura: r.largura, altura: r.altura, tamanhoBytes: r.tamanhoBytes },
          });
          setAberta(false);
        }}
      />
    </div>
  );
}

/** Imagem ficticia (SVG em data URI). */
function imagem(cor: string, texto: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="${cor}"/><path d="M60 220 L160 120 L240 190 L340 90" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="16"/><text x="200" y="275" font-family="sans-serif" font-size="28" font-weight="700" fill="#fff" text-anchor="middle">${texto}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** Assinatura ficticia (PNG nao precisa: so para a leitura). */
const ASSINATURA_FICTICIA = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="200" viewBox="0 0 600 200"><rect width="600" height="200" fill="#fff"/><path d="M40 140 C80 40 120 40 130 120 S190 170 220 90 S280 40 300 120 S380 160 420 100 S520 60 560 110" fill="none" stroke="#14161A" stroke-width="5" stroke-linecap="round"/></svg>`,
)}`;

const ITENS_CHECKLIST = [
  "Estepe",
  "Macaco e chave de roda",
  "Extintor",
  "Triângulo",
  "Painel (luzes de alerta)",
  "Tacógrafo",
] as const;

function DemoPassos() {
  const [atual, setAtual] = useState<NumeroPasso>(2);
  const estados: Partial<Record<NumeroPasso, EstadoPasso>> = {
    1: { estado: "feito" },
    2: { estado: "pendente", faltam: 3 },
    3: { estado: "visto" },
  };
  return (
    <div className="-mx-4 flex flex-col gap-1 border-y border-borda-sutil bg-superficie px-4 py-3">
      <PassosVistoria atual={atual} estados={estados} aoIr={setAtual} />
      <LinhaPasso atual={atual} salvo="salvo" />
    </div>
  );
}

function DemoCombustivel() {
  const [nivel, setNivel] = useState<NivelCombustivel | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <MarcadorCombustivel valor={nivel} aoMudar={setNivel} />
      <p className="text-base">
        Leitura: <CombustivelLeitura nivel={nivel} />
      </p>
      <Sub>Com erro (ao concluir sem marcar)</Sub>
      <MarcadorCombustivel valor={null} aoMudar={() => {}} erro="Marque o combustível." />
      <Sub>Leitura de cada nível</Sub>
      <div className="flex flex-wrap gap-4 text-base">
        {(["reserva", "um_quarto", "meio", "tres_quartos", "cheio"] as const).map((n) => (
          <CombustivelLeitura key={n} nivel={n} />
        ))}
      </div>
    </div>
  );
}

type ItemDemo = { descricao: string; situacao: SituacaoItemVistoria | null; observacao: string };

function DemoChecklist() {
  const [itens, setItens] = useState<ItemDemo[]>(() =>
    ITENS_CHECKLIST.map((d, i) => ({
      descricao: d,
      situacao: i === 2 ? "com_problema" : null,
      observacao: i === 2 ? "Vencido" : "",
    })),
  );
  const [desfazer, setDesfazer] = useState<{ indices: number[]; n: number } | null>(null);
  const marcados = itens.filter((i) => i.situacao).length;
  const restantes = itens.length - marcados;

  function mudar(i: number, parte: Partial<ItemDemo>) {
    setItens((lista) => lista.map((x, j) => (j === i ? { ...x, ...parte } : x)));
  }

  function marcarResto() {
    const indices = itens.flatMap((x, i) => (x.situacao ? [] : [i]));
    setItens((lista) => lista.map((x) => (x.situacao ? x : { ...x, situacao: "ok" })));
    setDesfazer((d) => ({ indices, n: (d?.n ?? 0) + 1 }));
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-base text-texto-suave">
        Marque só o que tem problema ou não se aplica. Depois toque em <b>Marcar o resto como ok</b>.
      </p>
      <BotaoMarcarRestoOk restantes={restantes} aoMarcar={marcarResto} />
      <ContagemChecklist total={itens.length} marcados={marcados} />
      <div className="px-3">
        {itens.map((item, i) => (
          <LinhaChecklist
            key={item.descricao}
            descricao={item.descricao}
            situacao={item.situacao}
            observacao={item.observacao}
            aoMudarSituacao={(s) => mudar(i, { situacao: s })}
            aoMudarObservacao={(t) => mudar(i, { observacao: t })}
            ajudaProblema={
              item.descricao.startsWith("Painel") ? (
                <>
                  Fotografe o painel no{" "}
                  <Link href="#passos" className="font-bold underline underline-offset-4">
                    passo 4
                  </Link>
                  .
                </>
              ) : undefined
            }
          />
        ))}
      </div>
      <BotaoMarcarRestoOk restantes={restantes} aoMarcar={marcarResto} />
      <Sub>Leitura (problemas primeiro)</Sub>
      <ul className="rounded-lg border border-borda-sutil bg-superficie px-3">
        {ordenarParaLeitura(itens).map((item) => (
          <LinhaChecklistLeitura
            key={item.descricao}
            descricao={item.descricao}
            situacao={item.situacao}
            observacao={item.observacao}
          />
        ))}
      </ul>
      {desfazer && (
        <AvisoDesfazer
          key={desfazer.n}
          mensagem={`${desfazer.indices.length} ${desfazer.indices.length === 1 ? "item marcado" : "itens marcados"} como ok.`}
          aoDesfazer={() => {
            setItens((lista) => lista.map((x, i) => (desfazer.indices.includes(i) ? { ...x, situacao: null } : x)));
            setDesfazer(null);
          }}
          aoSumir={() => setDesfazer(null)}
        />
      )}
    </div>
  );
}

const AVARIAS: DadosAvaria[] = [
  {
    id: "a1",
    lado: "lateral_esquerda",
    descricao: "Risco na porta do motorista, uns 20 cm, perto da maçaneta",
    fotos: [
      { id: "f1", src: imagem("#5B6B7A", "1"), estado: "enviada" },
      { id: "f2", src: imagem("#7A5B3F", "2"), estado: "enviada" },
    ],
  },
  { id: "a2", lado: "frente", descricao: "Amassado", fotos: [{ id: "f3", src: imagem("#3F6B5B", "3"), estado: "enviando", progresso: 45 }] },
  { id: "a3", lado: "traseira", descricao: "Lanterna trincada", fotos: [{ id: "f4", src: imagem("#6B3F5B", "4"), estado: "sem_internet" }] },
  { id: "a4", lado: "cabine", descricao: "Quebrado", fotos: [{ id: "f5", src: imagem("#3F4F7A", "5"), estado: "falhou" }] },
  { id: "a5", lado: "outro", descricao: "Para-choque de borracha faltando", fotos: [] },
];

function DemoAvarias() {
  const [avarias, setAvarias] = useState(AVARIAS);
  const [folha, setFolha] = useState<{ id: string | null; lado: LadoAvaria | null; descricao: string } | null>(null);
  const [erros, setErros] = useState<{ lado?: string; descricao?: string }>({});
  const [aviso, setAviso] = useState("");

  function salvar() {
    if (!folha) return;
    const e = {
      lado: folha.lado ? undefined : "Escolha o lado.",
      descricao: folha.descricao.trim() ? undefined : "Diga o que é (toque num chip ou escreva).",
    };
    setErros(e);
    if (e.lado || e.descricao || !folha.lado) return;
    const lado = folha.lado;
    if (folha.id) setAvarias((l) => l.map((a) => (a.id === folha.id ? { ...a, lado, descricao: folha.descricao } : a)));
    else setAvarias((l) => [...l, { id: `n${l.length + 1}`, lado, descricao: folha.descricao, fotos: [] }]);
    setFolha(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <ListaAvarias
        avarias={avarias}
        aoAbrir={(a) => {
          setErros({});
          setFolha({ id: a.id, lado: a.lado, descricao: a.descricao ?? "" });
        }}
        aoTentarDeNovo={(a) => {
          setAviso(`Tentar de novo: ${a.id}`);
          setAvarias((l) =>
            l.map((x) => (x.id === a.id ? { ...x, fotos: x.fotos.map((f) => ({ ...f, estado: "na_fila" as const })) } : x)),
          );
        }}
      />
      <p role="status" className="text-sm text-texto-suave">
        {aviso}
      </p>
      <Botao
        variante="secundario"
        onClick={() => {
          setErros({});
          setFolha({ id: null, lado: null, descricao: "" });
        }}
      >
        Registrar avaria sem foto
      </Botao>
      <Sub>Leitura (vistoria concluída)</Sub>
      <ListaAvarias avarias={AVARIAS.slice(0, 2)} leitura aoAbrir={(a) => setAviso(`Ver foto: ${a.id}`)} />
      <Sub>Vazio</Sub>
      <ListaAvarias avarias={[]} />

      {/* A Folha so monta depois de um toque (no servidor ela nao existe). */}
      {folha && (
        <Folha
          aberta
          aoFechar={() => setFolha(null)}
          titulo={folha.id ? "Editar avaria" : "Nova avaria"}
          rodape={<Botao onClick={salvar}>Salvar avaria</Botao>}
        >
          <CamposAvaria
            lado={folha.lado}
            aoMudarLado={(lado) => setFolha({ ...folha, lado })}
            descricao={folha.descricao}
            aoMudarDescricao={(descricao) => setFolha({ ...folha, descricao })}
            erroLado={erros.lado}
            erroDescricao={erros.descricao}
          />
        </Folha>
      )}
    </div>
  );
}

const COMPLEMENTOS: DadosComplemento[] = [
  {
    id: "c2",
    texto: "Cliente ligou: a lanterna já estava trincada antes de chegar.",
    fotos: [],
    criadoEm: "2026-10-31T15:30:00Z",
    criadoPor: "Ana",
  },
  {
    id: "c1",
    texto: "Motorista avisou que o retrovisor já estava solto.",
    fotos: [
      { id: "cf1", src: imagem("#7A3F3F", "R1") },
      { id: "cf2", src: imagem("#2F6B3F", "R2") },
    ],
    criadoEm: "2026-10-31T13:12:00Z",
    criadoPor: "João",
  },
];

function DemoConcluida() {
  return (
    <div className="flex flex-col gap-8">
      <Sub>Assinada, com complementos</Sub>
      <BlocoVistoriaConcluida
        numeroOS={1043}
        concluidaEm="2026-10-31T11:40:00Z"
        concluidaPor="Ana"
        assinatura={{ tipo: "assinada", src: ASSINATURA_FICTICIA, nome: "Carlos", em: "2026-10-31T11:39:00Z" }}
        complementos={COMPLEMENTOS}
      >
        <section className="flex flex-col gap-1">
          <h2 className="text-xl">Entrada</h2>
          <p className="flex flex-wrap items-center gap-x-3 text-base">
            <span className="font-mono">KM 418.950</span>
            <span className="font-mono">Horímetro 12.540 h</span>
            <CombustivelLeitura nivel="um_quarto" />
          </p>
        </section>
      </BlocoVistoriaConcluida>
      <Sub>Sem assinatura (motorista ausente), sem complemento</Sub>
      <BlocoVistoriaConcluida
        numeroOS={1044}
        concluidaEm="2026-10-31T22:05:00Z"
        concluidaPor="Roberto"
        assinatura={{ tipo: "sem", motivo: "motorista_ausente" }}
        complementos={[]}
      />
      <Sub>Anulada</Sub>
      <BlocoVistoriaConcluida
        numeroOS={1045}
        concluidaEm="2026-10-31T11:40:00Z"
        concluidaPor="Ana"
        assinatura={{ tipo: "sem", motivo: "recusou", nome: "Pedro" }}
        complementos={[]}
        anulada={{ em: "2026-10-31T14:02:00Z", por: "Roberto", motivo: "era o caminhão da OS #1044." }}
      />
    </div>
  );
}

const ITENS_EDITOR: ItemEditorChecklist[] = ITENS_CHECKLIST.map((d, i) => ({ id: `i${i}`, descricao: d }));

function DemoEditor() {
  const [ativos, setAtivos] = useState(ITENS_EDITOR);
  const [desativados, setDesativados] = useState<ItemEditorChecklist[]>([{ id: "d1", descricao: "Tanque de arla" }]);
  const [falhar, setFalhar] = useState(false);
  const [erro, setErro] = useState("");
  const [editando, setEditando] = useState<ItemEditorChecklist | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <LinhaLinkChecklist ativos={ativos.length} href="#editor" />
      <p className="text-sm text-texto-suave">Vale para as próximas vistorias. As já feitas ficam como estavam.</p>
      <label className="flex min-h-toque items-center gap-2 text-base">
        <input type="checkbox" checked={falhar} onChange={(e) => setFalhar(e.target.checked)} className="size-5" />
        Simular falha ao mover (a linha volta)
      </label>
      <ListaEditorChecklist
        ativos={ativos}
        desativados={desativados}
        erro={erro}
        aoMover={(id, d) => {
          setErro("");
          const antes = ativos;
          setAtivos(moverNaLista(ativos, id, d));
          if (falhar)
            setTimeout(() => {
              setAtivos(antes);
              setErro("Não foi possível mudar a ordem. Tente de novo.");
            }, 600);
        }}
        aoEditar={setEditando}
        aoReativar={(item) => {
          setDesativados((l) => l.filter((x) => x.id !== item.id));
          setAtivos((l) => [...l, item]);
        }}
      />
      {editando && (
        <Folha
          aberta
          aoFechar={() => setEditando(null)}
          titulo="Editar item"
          rodape={
            <Botao
              variante="secundario"
              onClick={() => {
                setAtivos((l) => l.filter((x) => x.id !== editando.id));
                setDesativados((l) => [...l, editando]);
                setEditando(null);
              }}
            >
              Desativar item
            </Botao>
          }
        >
          <p className="text-base">{editando.descricao}</p>
          <p className="text-sm text-texto-suave">Vistorias já feitas continuam com o nome antigo.</p>
        </Folha>
      )}
    </div>
  );
}

export function Vitrine() {
  function trocarTema() {
    const d = document.documentElement;
    const novo = d.getAttribute("data-tema") === "escuro" ? "claro" : "escuro";
    d.setAttribute("data-tema", novo);
    try {
      localStorage.setItem(TEMA_STORAGE_KEY, novo);
    } catch {}
  }

  return (
    <div className="flex flex-1 flex-col">
      <FaixaTeste />
      <main className="mx-auto flex w-full max-w-[720px] flex-col gap-8 px-4 py-5 pb-40">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl">Vitrine da Fase 4</h1>
            <p className="text-base text-texto-suave">Vistoria com dados fictícios. Só no staging.</p>
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

        <Secao id="assinatura" titulo="Assinatura (F4-F1)">
          <Sub>Conferir e assinar</Sub>
          <DemoAssinatura />
        </Secao>

        <Secao id="etiquetas" titulo="Etiquetas">
          <Sub>Detalhe da OS</Sub>
          <LinhaEtiquetas>
            <EtiquetaVistoria estado="sem" />
            <EtiquetaVistoria estado="sem" obrigatoria />
            <EtiquetaVistoria estado="rascunho" />
            <EtiquetaVistoria estado="concluida" />
            <EtiquetaVistoria estado="anulada" />
          </LinhaEtiquetas>
          <Sub>Cartão da OS (Sem vistoria só com a obrigatória)</Sub>
          <LinhaEtiquetas>
            <span className="text-sm text-texto-suave">opcional, sem vistoria: (nada)</span>
            <EtiquetaVistoriaCartao estado="sem" obrigatoria={false} />
          </LinhaEtiquetas>
          <LinhaEtiquetas>
            <EtiquetaVistoriaCartao estado="sem" obrigatoria />
            <EtiquetaVistoriaCartao estado="concluida" obrigatoria={false} />
          </LinhaEtiquetas>
          <Sub>Leitura e avaria</Sub>
          <LinhaEtiquetas>
            <EtiquetaSemAssinatura motivo="motorista_ausente" />
            <EtiquetaSemAssinatura motivo="recusou" />
          </LinhaEtiquetas>
          <LinhaEtiquetas>
            <EtiquetaAcrescentado />
            <EtiquetaSemFoto />
          </LinhaEtiquetas>
        </Secao>

        <Secao id="passos" titulo="Passos e salvamento">
          <DemoPassos />
          <Sub>Indicador de salvamento</Sub>
          <div className="flex flex-col gap-2 rounded-lg border border-borda-sutil bg-superficie p-3">
            <IndicadorSalvo estado="salvo" />
            <IndicadorSalvo estado="salvando" />
            <IndicadorSalvo estado="sem_internet" />
            <IndicadorSalvo estado="falhou" aoTentarDeNovo={() => {}} />
          </div>
        </Secao>

        <Secao id="combustivel" titulo="Combustível">
          <DemoCombustivel />
        </Secao>

        <Secao id="checklist" titulo="Checklist">
          <DemoChecklist />
        </Secao>

        <Secao id="avarias" titulo="Avarias">
          <DemoAvarias />
        </Secao>

        <Secao id="concluida" titulo="Vistoria concluída">
          <DemoConcluida />
        </Secao>

        <Secao id="editor" titulo="Editor do checklist">
          <DemoEditor />
        </Secao>
      </main>
    </div>
  );
}
