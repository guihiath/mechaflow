"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from "react";
import { Check, CircleAlert, Plus, Search, ThumbsDown, ThumbsUp, TriangleAlert } from "lucide-react";
import {
  adicionarItemOS,
  atribuirMecanicoOS,
  carregarCatalogoOS,
  comecarServicoOS,
  marcarProntaOS,
  mudarStatusOS,
  registrarPagamentoOS,
  registrarRespostaOS,
  removerItemOS,
  salvarItemOS,
  trocarModoOS,
  type CatalogoOS,
  type ItemCatalogoOS,
} from "@/acoes/os";
import { EtiquetaSemPreco } from "@/components/os/badge-status";
import { BarraAcoesOS } from "@/components/os/barra-acoes-os";
import { LinhaItemOS, ListaItensOS } from "@/components/os/linha-item-os";
import { AvisoDesfazer } from "@/components/ui/aviso-desfazer";
import { Botao, BotaoLink } from "@/components/ui/botao";
import { AreaTexto, Campo } from "@/components/ui/campo";
import { ConfirmarAcao } from "@/components/ui/confirmar-acao";
import { Escolha } from "@/components/ui/escolha";
import { Folha } from "@/components/ui/folha";
import { CaixaMensagem, focarPrimeiroErro } from "@/components/ui/formulario";
import { Quantidade } from "@/components/ui/quantidade";
import { SUGESTOES_RECUSA, SugestoesTexto, acrescentarTexto } from "@/components/ui/sugestoes-texto";
import type { EstadoAcao } from "@/lib/acao";
import { centavosParaCampo, formatarCentavos, formatarTelefone, reaisParaCentavos } from "@/lib/formato";
import {
  CANAIS_RESPOSTA,
  FORMAS_PAGAMENTO,
  hojeEmSaoPaulo,
  textoUnidade,
  unidadeFracionada,
  type FormaPagamento,
} from "@/lib/os";
import { rotuloStatus, type ModoOS, type StatusOS, type TipoItemOS } from "@/lib/os-status";

// =================================================================== tipos

export type PessoaOS = { id: string; nome: string; emAndamento: number };

export type ItemOSCliente = {
  id: string;
  tipo: TipoItemOS;
  descricao: string;
  quantidade: number;
  unidade: string;
  catalogoId: string | null;
  precoUnitarioCentavos: number | null;
  subtotalCentavos: number | null;
  /** So o dono recebe. */
  custoUnitarioCentavos?: number | null;
};

/**
 * O que o navegador recebe da OS. Para o MECANICO os campos de valor vem null/0
 * e `equipe`/`itens` vem vazios: o servidor nem os busca (DESIGN §10.0 regra 4).
 */
export type DadosPainel = {
  id: string;
  numero: number;
  placa: string;
  status: StatusOS;
  modo: ModoOS;
  /** Dono ou atendente. */
  gerencia: boolean;
  ehDono: boolean;
  /** Mecanico logado e a OS e dele: pode comecar / marcar pronta. */
  mecanicoDaOS: boolean;
  clienteNome: string;
  mecanicoId: string | null;
  mecanicoNome: string | null;
  /** Ausentes na versao do mecanico. */
  totalCentavos?: number | null;
  itensSemPreco?: number;
  qtdItens: number;
  temServico: boolean;
  semItensComTroca: boolean;
  formaPagamento?: FormaPagamento | null;
  pago?: boolean;
  equipe: PessoaOS[];
  itens: ItemOSCliente[];
};

type FolhaAberta =
  | { tipo: "item-novo" }
  | { tipo: "item"; item: ItemOSCliente }
  | { tipo: "resposta" }
  | { tipo: "pronta" }
  | { tipo: "mecanico" }
  | { tipo: "comecar" }
  | { tipo: "pagamento" }
  | { tipo: "modo" };

type Desfazer = { chave: number; mensagem: string; de: StatusOS; para: StatusOS };

type Ctx = {
  os: DadosPainel;
  abrir: (f: FolhaAberta) => void;
  /** Aplica um passo de status e oferece "Desfazer" (6 s). */
  passo: (de: StatusOS, para: StatusOS) => void;
  ocupado: boolean;
  erro: string | null;
};

const ContextoOS = createContext<Ctx | null>(null);

function useOS() {
  const c = useContext(ContextoOS);
  if (!c) throw new Error("useOS fora do PainelOS");
  return c;
}

/** Envio de formulario de folha: trava duplo envio, guarda erros por campo. */
function useEnvio(
  acao: (a: EstadoAcao, d: FormData) => Promise<EstadoAcao>,
  falha: string,
  /** Devolver "limpar" apaga a mensagem/erros (a folha continua aberta para outro item). */
  aoOk: (r: EstadoAcao) => void | "limpar",
) {
  const [estado, setEstado] = useState<EstadoAcao>(null);
  const [enviando, iniciar] = useTransition();
  const travado = useRef(false);
  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (travado.current) return;
    travado.current = true;
    const form = e.currentTarget;
    const fd = new FormData(form);
    iniciar(async () => {
      try {
        const r = await acao(null, fd);
        setEstado(r);
        if (r?.ok && aoOk(r) === "limpar") setEstado(null);
        else if (r?.campos) focarPrimeiroErro(form);
      } catch {
        setEstado({ erro: falha });
      } finally {
        travado.current = false;
      }
    });
  }
  return { estado, setEstado, enviando, enviar, campos: estado?.campos ?? {} };
}

/** Primario do rodape da folha ligado ao formulario pelo atributo `form`. */
function BotaoForm({
  form,
  enviando,
  rotulo,
  rotuloEnviando,
  variante = "primario",
  disabled,
}: {
  form: string;
  enviando: boolean;
  rotulo: string;
  rotuloEnviando: string;
  variante?: "primario" | "perigo";
  disabled?: boolean;
}) {
  return (
    <Botao type="submit" form={form} variante={variante} disabled={enviando || disabled} aria-busy={enviando}>
      {enviando ? rotuloEnviando : rotulo}
    </Botao>
  );
}

// =================================================================== painel

/**
 * Estado do cliente do detalhe da OS: folhas, barra de acoes, Desfazer e erros
 * de acao. As secoes da pagina (Server Components) ficam em `children`.
 */
export function PainelOS({ os, children }: { os: DadosPainel; children: ReactNode }) {
  const [folha, setFolha] = useState<FolhaAberta | null>(null);
  const [desfazer, setDesfazer] = useState<Desfazer | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();
  const contador = useRef(0);

  function passo(de: StatusOS, para: StatusOS) {
    setErro(null);
    iniciar(async () => {
      try {
        const r = await mudarStatusOS(os.id, de, para);
        if (r?.erro) setErro(r.erro);
        else setDesfazer({ chave: ++contador.current, mensagem: `Status: ${rotuloStatus(para)}.`, de, para });
      } catch {
        setErro(`Não foi possível mudar o status. Confira a internet e tente de novo.`);
      }
    });
  }

  async function aoDesfazer(d: Desfazer) {
    try {
      const r = await mudarStatusOS(os.id, d.para, d.de);
      if (r?.erro) setErro(r.erro);
    } catch {
      setErro("Não foi possível desfazer. Confira a internet e tente de novo.");
    }
    setDesfazer(null);
  }

  const ctx: Ctx = { os, abrir: (f) => (setErro(null), setFolha(f)), passo, ocupado, erro };
  const fechar = () => setFolha(null);
  const aposStatus = (de: StatusOS, para: StatusOS) => {
    setFolha(null);
    setDesfazer({ chave: ++contador.current, mensagem: `Status: ${rotuloStatus(para)}.`, de, para });
  };

  return (
    <ContextoOS value={ctx}>
      {children}
      {desfazer && (
        <AvisoDesfazer
          key={desfazer.chave}
          mensagem={desfazer.mensagem}
          aoDesfazer={() => aoDesfazer(desfazer)}
          aoSumir={() => setDesfazer(null)}
        />
      )}
      {folha?.tipo === "item-novo" && <FolhaItem aoFechar={fechar} />}
      {folha?.tipo === "item" && <FolhaItem aoFechar={fechar} item={folha.item} />}
      {folha?.tipo === "resposta" && (
        <FolhaResposta aoFechar={fechar} aoAprovar={() => aposStatus(os.status, "aprovada")} />
      )}
      {folha?.tipo === "pronta" && <FolhaPronta aoFechar={fechar} aoConcluir={() => aposStatus("em_andamento", "pronta")} />}
      {folha?.tipo === "mecanico" && <FolhaMecanico aoFechar={fechar} />}
      {folha?.tipo === "comecar" && <FolhaMecanico aoFechar={fechar} comecar aoComecar={() => aposStatus("aprovada", "em_andamento")} />}
      {folha?.tipo === "pagamento" && <FolhaPagamento aoFechar={fechar} />}
      {folha?.tipo === "modo" && <FolhaModo aoFechar={fechar} />}
    </ContextoOS>
  );
}

// =================================================================== barra de acoes

/**
 * Barra de acoes (BarraAcoesOS) com o primario de cada status e papel (DESIGN §10.5).
 * Celular: fixa no rodape e esconde a navegacao. Desktop: card "Próximo passo".
 */
export function BarraOS({ proximoPasso }: { proximoPasso?: string }) {
  const { os, abrir, passo, ocupado, erro } = useOS();
  const acima = erro ? <CaixaMensagem tipo="erro">{erro}</CaixaMensagem> : undefined;
  const add = (
    <Botao variante="secundario" onClick={() => abrir({ tipo: "item-novo" })}>
      Adicionar item
    </Botao>
  );
  const rotuloOcupado = (r: string) => (ocupado ? "Enviando…" : r);

  let primario: ReactNode = null;
  let secundario: ReactNode = null;

  if (os.gerencia) {
    switch (os.status) {
      case "aguardando_orcamento":
        if (os.qtdItens === 0) {
          primario = (
            <Botao onClick={() => abrir({ tipo: "item-novo" })}>
              <Plus size={24} strokeWidth={2.25} aria-hidden />
              Adicionar serviço ou peça
            </Botao>
          );
        } else {
          primario = <Botao onClick={() => abrir({ tipo: "resposta" })}>Registrar resposta do cliente</Botao>;
          secundario = add;
        }
        break;
      case "orcamento_enviado":
        primario = <Botao onClick={() => abrir({ tipo: "resposta" })}>Registrar resposta do cliente</Botao>;
        secundario = add;
        break;
      case "aprovada":
        primario = (
          <Botao disabled={ocupado} onClick={() => (os.mecanicoId ? passo("aprovada", "em_andamento") : abrir({ tipo: "comecar" }))}>
            {rotuloOcupado("Começar serviço")}
          </Botao>
        );
        secundario = add;
        break;
      case "em_andamento":
        primario = (
          <Botao onClick={() => abrir({ tipo: "pronta" })}>
            <Check size={24} strokeWidth={2.5} aria-hidden />
            Marcar como pronta
          </Botao>
        );
        secundario = add;
        break;
      case "pronta":
        primario = <BotaoLink href={`/os/${os.id}/fechar`}>Fechar e entregar</BotaoLink>;
        secundario = add;
        break;
      case "entregue":
        if (!os.pago) primario = <Botao onClick={() => abrir({ tipo: "pagamento" })}>Registrar pagamento</Botao>;
        break;
    }
  } else if (os.mecanicoDaOS) {
    if (os.status === "aprovada") {
      primario = (
        <Botao disabled={ocupado} onClick={() => passo("aprovada", "em_andamento")}>
          {rotuloOcupado("Começar serviço")}
        </Botao>
      );
    } else if (os.status === "em_andamento") {
      primario = (
        <Botao onClick={() => abrir({ tipo: "pronta" })}>
          <Check size={24} strokeWidth={2.5} aria-hidden />
          Marcar como pronta
        </Botao>
      );
    }
  }

  if (!primario && !secundario) {
    return acima ? <div className="fixed inset-x-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 lg:static">{acima}</div> : null;
  }
  return (
    <>
      <span hidden data-esconde-navegacao />
      <BarraAcoesOS primario={primario} secundario={secundario} acima={acima} proximoPasso={proximoPasso} />
    </>
  );
}

// =================================================================== botoes usados nas secoes

/** "Adicionar serviço ou peça" (secundario, largura total, abaixo da lista). */
export function BotaoAdicionarItem() {
  const { abrir } = useOS();
  return (
    <Botao variante="secundario" onClick={() => abrir({ tipo: "item-novo" })}>
      <Plus size={24} strokeWidth={2.25} aria-hidden />
      Adicionar serviço ou peça
    </Botao>
  );
}

/** Link "Trocar" ao lado do mecanico. */
export function BotaoTrocarMecanico() {
  const { abrir } = useOS();
  return (
    <button
      type="button"
      onClick={() => abrir({ tipo: "mecanico" })}
      className="inline-flex min-h-toque shrink-0 items-center px-2 text-base font-bold text-info-texto underline underline-offset-4"
    >
      Trocar
    </button>
  );
}

/** "Já mandei o orçamento ao cliente" (aguardando_orcamento com itens). */
export function BotaoJaMandei() {
  const { passo, ocupado } = useOS();
  return (
    <button
      type="button"
      disabled={ocupado}
      onClick={() => passo("aguardando_orcamento", "orcamento_enviado")}
      className="inline-flex min-h-toque items-center self-start text-base font-bold text-info-texto underline underline-offset-4 disabled:opacity-60"
    >
      Já mandei o orçamento ao cliente
    </button>
  );
}

/** Link "Trocar o modo" (antes de o servico comecar). */
export function BotaoTrocarModo() {
  const { abrir, os } = useOS();
  return (
    <button
      type="button"
      onClick={() => abrir({ tipo: "modo" })}
      className="inline-flex min-h-toque items-center self-start text-base font-bold text-info-texto underline underline-offset-4"
    >
      {os.modo === "direto" ? "Trocar para com orçamento" : "Trocar para serviço direto"}
    </button>
  );
}

/** Lista de itens: cada linha abre a folha de edicao (dono/atendente, OS aberta). */
export function ListaItensEditavel({ editavel, mostrarCusto }: { editavel: boolean; mostrarCusto: boolean }) {
  const { os, abrir } = useOS();
  const ordenados = [...os.itens].sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === "servico" ? -1 : 1));
  return (
    <ListaItensOS rotulo="Serviços e peças">
      {ordenados.map((i) => (
        <LinhaItemOS
          key={i.id}
          mostrarCusto={mostrarCusto}
          aoTocar={editavel ? () => abrir({ tipo: "item", item: i }) : undefined}
          item={{
            tipo: i.tipo,
            descricao: i.descricao,
            quantidade: i.quantidade,
            precoUnitarioCentavos: i.precoUnitarioCentavos,
            subtotalCentavos: i.subtotalCentavos,
            custoUnitarioCentavos: i.custoUnitarioCentavos,
          }}
        />
      ))}
    </ListaItensOS>
  );
}

// =================================================================== folha: item

const catalogoCache: { dados: CatalogoOS | null } = { dados: null };

type Escolhido = { catalogo: ItemCatalogoOS | null; descricao: string; tipo: TipoItemOS };

function FolhaItem({ aoFechar, item }: { aoFechar: () => void; item?: ItemOSCliente }) {
  const { os } = useOS();
  const [escolhido, setEscolhido] = useState<Escolhido | null>(null);
  const [adicionados, setAdicionados] = useState(0);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const editando = Boolean(item);
  const passo2 = editando || escolhido;
  const envio = useEnvio(
    editando ? salvarItemOS : adicionarItemOS,
    editando
      ? "Não foi possível salvar o item. Confira a internet e tente de novo."
      : "Não foi possível adicionar o item. Confira a internet e tente de novo.",
    (r) => {
      if (editando) {
        aoFechar();
        return;
      }
      setAdicionados((n) => n + 1);
      setMensagem(r?.mensagem ?? "Item adicionado.");
      setEscolhido(null);
      return "limpar";
    },
  );

  const titulo = editando ? "Editar item" : escolhido ? escolhido.descricao || "Item avulso" : `Adicionar à OS #${os.numero}`;

  return (
    <Folha
      aberta
      aoFechar={aoFechar}
      titulo={titulo}
      topo={
        escolhido && !editando ? (
          <button
            type="button"
            onClick={() => {
              setEscolhido(null);
              envio.setEstado(null);
            }}
            className="inline-flex min-h-toque shrink-0 items-center rounded-md px-2 text-base font-bold text-info-texto"
          >
            ← Escolher outro
          </button>
        ) : undefined
      }
      rodape={
        passo2 ? (
          <BotaoForm
            form="form-item-os"
            enviando={envio.enviando}
            rotulo={editando ? "Salvar item" : "Adicionar à OS"}
            rotuloEnviando={editando ? "Salvando…" : "Adicionando…"}
          />
        ) : adicionados > 0 ? (
          <Botao variante="secundario" onClick={aoFechar}>
            Concluir
          </Botao>
        ) : undefined
      }
    >
      {passo2 ? (
        <FormItem item={item} escolhido={escolhido} envio={envio} aoRemover={aoFechar} />
      ) : (
        <SeletorItem
          mensagem={mensagem}
          aoEscolher={(e) => {
            setMensagem(null);
            setEscolhido(e);
          }}
        />
      )}
    </Folha>
  );
}

function SeletorItem({ mensagem, aoEscolher }: { mensagem: string | null; aoEscolher: (e: Escolhido) => void }) {
  const { os } = useOS();
  const [catalogo, setCatalogo] = useState<CatalogoOS | null>(catalogoCache.dados);
  const [erro, setErro] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  const [aba, setAba] = useState<TipoItemOS>(os.temServico ? "peca" : "servico");
  const [busca, setBusca] = useState("");
  const idBusca = useId();

  useEffect(() => {
    let vivo = true;
    carregarCatalogoOS()
      .then((r) => {
        if (!vivo) return;
        if ("erro" in r) setErro(true);
        else {
          catalogoCache.dados = r;
          setCatalogo(r);
          setErro(false);
        }
      })
      .catch(() => vivo && setErro(true));
    return () => {
      vivo = false;
    };
  }, [tentativa]);

  const termo = busca.trim().toLowerCase();
  const daAba = useMemo(() => (catalogo?.itens ?? []).filter((i) => i.tipo === aba), [catalogo, aba]);
  const filtrados = termo
    ? daAba.filter((i) => i.nome.toLowerCase().includes(termo) || (i.codigo ?? "").toLowerCase().includes(termo))
    : daAba;
  const maisUsados = !termo && catalogo ? catalogo.maisUsados[aba].map((id) => daAba.find((i) => i.id === id)).filter((i): i is ItemCatalogoOS => Boolean(i)) : [];

  const avulso = (
    <button
      type="button"
      onClick={() => aoEscolher({ catalogo: null, descricao: busca.trim(), tipo: aba })}
      className="flex min-h-14 w-full items-center gap-2 rounded-md border-2 border-dashed border-borda px-4 text-left text-lg font-bold text-info-texto active:bg-superficie-2"
    >
      <Plus size={22} strokeWidth={2.5} aria-hidden className="shrink-0" />
      {busca.trim() ? `Item avulso: “${busca.trim()}”` : "Item avulso"}
    </button>
  );

  const linha = (i: ItemCatalogoOS) => (
    <li key={i.id} className="border-b border-borda-sutil last:border-b-0">
      <button
        type="button"
        onClick={() => aoEscolher({ catalogo: i, descricao: i.nome, tipo: i.tipo })}
        className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left active:bg-superficie-2"
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-lg font-bold">{i.nome}</span>
          {i.tipo === "peca" && (
            <span className="text-sm text-texto-suave">
              {i.codigo && <span className="font-mono">{i.codigo} · </span>}
              {textoUnidade(i.unidade)}
            </span>
          )}
        </span>
        {i.precoCentavos !== null ? (
          <span className="shrink-0 font-mono text-base">{formatarCentavos(i.precoCentavos)}</span>
        ) : (
          <EtiquetaSemPreco />
        )}
      </button>
    </li>
  );

  return (
    <div className="flex flex-col gap-4">
      {mensagem && <CaixaMensagem tipo="sucesso">{mensagem}</CaixaMensagem>}
      <div role="tablist" aria-label="Tipo de item" className="grid grid-cols-2 gap-2">
        {(
          [
            ["servico", "Serviços"],
            ["peca", "Peças"],
          ] as const
        ).map(([valor, rotulo]) => (
          <button
            key={valor}
            type="button"
            role="tab"
            aria-selected={aba === valor}
            onClick={() => setAba(valor)}
            className={`flex min-h-toque items-center justify-center gap-1.5 rounded-md border-2 text-base font-bold ${
              aba === valor ? "border-grafite bg-primaria text-primaria-texto" : "border-borda bg-superficie"
            }`}
          >
            {aba === valor && <Check size={20} strokeWidth={2.5} aria-hidden />}
            {rotulo}
          </button>
        ))}
      </div>

      <div className="relative">
        <label htmlFor={idBusca} className="sr-only">
          Buscar no catálogo
        </label>
        <Search size={22} aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-texto-suave" />
        <input
          id={idBusca}
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Nome ou código"
          autoComplete="off"
          enterKeyHint="search"
          className="h-[52px] w-full rounded-md border-2 border-borda bg-superficie pr-3 pl-11 text-lg outline-none focus:border-foco focus:ring-[3px] focus:ring-foco/30"
        />
      </div>

      {erro ? (
        <>
          <div role="alert" className="flex flex-col gap-3 rounded-md border-l-4 border-erro bg-superficie p-4">
            <p className="flex items-start gap-2 text-lg font-bold">
              <CircleAlert size={24} strokeWidth={2.25} aria-hidden className="mt-0.5 shrink-0 text-erro-texto" />
              Não foi possível carregar o catálogo.
            </p>
            <Botao variante="secundario" onClick={() => setTentativa((t) => t + 1)}>
              Tentar de novo
            </Botao>
          </div>
          {avulso}
        </>
      ) : !catalogo ? (
        <div aria-busy="true" className="flex flex-col gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-md bg-superficie-2" />
          ))}
          <span className="sr-only">Carregando…</span>
        </div>
      ) : catalogo.itens.length === 0 ? (
        <>
          <p className="text-base text-texto-suave">Seu catálogo ainda está vazio.</p>
          {avulso}
          {os.ehDono && (
            <a href="/catalogo" className="inline-flex min-h-toque items-center font-bold text-info-texto underline">
              Cadastrar no catálogo
            </a>
          )}
        </>
      ) : termo && !filtrados.length ? (
        <>
          <p className="text-base text-texto-suave">Nada no catálogo com “{busca.trim()}”.</p>
          {avulso}
        </>
      ) : (
        <>
          {maisUsados.length > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className="text-lg">Mais usados</h3>
              <ul className="overflow-hidden rounded-md border border-borda-sutil bg-superficie">{maisUsados.map(linha)}</ul>
            </section>
          )}
          <section className="flex flex-col gap-2">
            {!termo && <h3 className="text-lg">Todos</h3>}
            <ul className="overflow-hidden rounded-md border border-borda-sutil bg-superficie">{filtrados.map(linha)}</ul>
          </section>
          {avulso}
        </>
      )}
    </div>
  );
}

function FormItem({
  item,
  escolhido,
  envio,
  aoRemover,
}: {
  item?: ItemOSCliente;
  escolhido: Escolhido | null;
  envio: ReturnType<typeof useEnvio>;
  aoRemover: () => void;
}) {
  const { os } = useOS();
  const editando = Boolean(item);
  const cat = escolhido?.catalogo ?? null;
  const [chave] = useState(() => crypto.randomUUID());
  const [tipo, setTipo] = useState<TipoItemOS>(item?.tipo ?? escolhido?.tipo ?? "servico");
  const [descricao, setDescricao] = useState(item?.descricao ?? escolhido?.descricao ?? "");
  const unidade = item?.unidade ?? cat?.unidade ?? "un";
  const fracionada = unidadeFracionada(unidade);
  const [qtd, setQtd] = useState<number | null>(item?.quantidade ?? 1);
  const [preco, setPreco] = useState(centavosParaCampo(item ? item.precoUnitarioCentavos : cat?.precoCentavos));
  const [custo, setCusto] = useState(centavosParaCampo(item ? item.custoUnitarioCentavos : cat?.custoCentavos));
  const avulso = !item && !cat;


  const precoCent = reaisParaCentavos(preco);
  const subtotal = qtd !== null && typeof precoCent === "number" && !Number.isNaN(precoCent) ? Math.round(qtd * precoCent) : null;
  const ehPeca = tipo === "peca";

  return (
    <form id="form-item-os" onSubmit={envio.enviar} noValidate className="flex flex-col gap-5">
      <input type="hidden" name="os_id" value={os.id} />
      {item && <input type="hidden" name="item_id" value={item.id} />}
      {!item && <input type="hidden" name="chave" value={chave} />}
      {!item && <input type="hidden" name="tipo" value={tipo} />}
      {cat && <input type="hidden" name="catalogo_id" value={cat.id} />}
      <input type="hidden" name="unidade" value={unidade} />

      {avulso || editando ? (
        <Campo
          rotulo="Descrição"
          name="descricao"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          maxLength={200}
          autoComplete="off"
          erro={envio.campos.descricao}
        />
      ) : (
        <input type="hidden" name="descricao" value={descricao} />
      )}
      {avulso && (
        <Escolha
          rotulo="Tipo"
          name="tipo_opcao"
          valor={tipo}
          aoMudar={setTipo}
          opcoes={[
            { valor: "servico", rotulo: "Serviço" },
            { valor: "peca", rotulo: "Peça" },
          ]}
        />
      )}

      <Quantidade
        valorInicial={item?.quantidade ?? 1}
        minimo={fracionada ? 0.1 : 1}
        decimal={fracionada}
        unidade={textoUnidade(unidade)}
        aoMudar={setQtd}
        erro={envio.campos.quantidade}
      />

      <Campo
        rotulo="Preço unitário (R$)"
        name="preco"
        inputMode="decimal"
        autoComplete="off"
        placeholder="0,00"
        className="font-mono"
        value={preco}
        onChange={(e) => setPreco(e.target.value.replace(/[^\d.,]/g, ""))}
        ajuda={cat && cat.precoCentavos !== null ? `Preço do catálogo: ${formatarCentavos(cat.precoCentavos)}.` : "Pode deixar vazio: o item fica “Sem preço”."}
        erro={envio.campos.preco}
      />

      {os.ehDono && ehPeca && (
        <Campo
          rotulo="Custo unitário (R$)"
          opcional
          name="custo"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0,00"
          className="font-mono"
          value={custo}
          onChange={(e) => setCusto(e.target.value.replace(/[^\d.,]/g, ""))}
          ajuda="Só você vê."
          erro={envio.campos.custo}
        />
      )}

      <p aria-live="polite" className="font-mono text-xl">
        Subtotal: {subtotal !== null ? formatarCentavos(subtotal) : "—"}
      </p>

      {envio.estado?.erro && <CaixaMensagem tipo="erro">{envio.estado.erro}</CaixaMensagem>}
      {envio.enviando && <p role="status" className="text-sm text-texto-suave">{editando ? "Salvando…" : "Adicionando…"}</p>}

      {item && (
        <ConfirmarAcao
          acao={() => removerItemOS(os.id, item.id)}
          rotulo="Remover item"
          pergunta={`Remover “${item.descricao}” da OS #${os.numero}?`}
          rotuloConfirmar="Remover item"
          rotuloEnviando="Removendo…"
          aoConcluir={aoRemover}
        />
      )}
    </form>
  );
}

// =================================================================== folha: resposta do cliente

function FolhaResposta({ aoFechar, aoAprovar }: { aoFechar: () => void; aoAprovar: () => void }) {
  const { os } = useOS();
  const [resposta, setResposta] = useState<"aprovou" | "recusou" | "">("");
  const [canal, setCanal] = useState<string>("");
  const [quem, setQuem] = useState(os.clienteNome);
  const [motivo, setMotivo] = useState("");
  const [depois, setDepois] = useState<"refazer" | "cancelar">("refazer");
  const envio = useEnvio(registrarRespostaOS, "Não foi possível registrar a resposta. Confira a internet e tente de novo.", (r) => {
    if (r?.mensagem === "aprovou") aoAprovar();
    else aoFechar();
  });
  const semPreco = (os.itensSemPreco ?? 0) > 0;
  const rotulo =
    resposta === "recusou"
      ? depois === "cancelar"
        ? "Registrar recusa e cancelar OS"
        : "Registrar recusa e refazer"
      : "Marcar como aprovado";

  return (
    <Folha
      aberta
      aoFechar={aoFechar}
      titulo="Resposta do cliente"
      rodape={
        <BotaoForm
          form="form-resposta"
          enviando={envio.enviando}
          rotulo={rotulo}
          rotuloEnviando="Registrando…"
          variante={resposta === "recusou" && depois === "cancelar" ? "perigo" : "primario"}
          disabled={!resposta || (resposta === "aprovou" && semPreco)}
        />
      }
    >
      <form id="form-resposta" onSubmit={envio.enviar} noValidate className="flex flex-col gap-5">
        <input type="hidden" name="os_id" value={os.id} />
        <input type="hidden" name="de" value={os.status} />
        <p className="font-mono text-2xl">Total do orçamento: {formatarCentavos(os.totalCentavos ?? 0)}</p>
        {semPreco && (
          <CaixaMensagem tipo="alerta">
            {os.itensSemPreco === 1 ? "1 item está sem preço." : `${os.itensSemPreco} itens estão sem preço.`} Defina antes de registrar a
            aprovação.
          </CaixaMensagem>
        )}
        <Escolha
          rotulo="O que o cliente respondeu?"
          name="resposta"
          valor={resposta}
          aoMudar={setResposta}
          erro={envio.campos.resposta}
          opcoes={[
            {
              valor: "aprovou",
              desabilitado: semPreco,
              rotulo: (
                <>
                  <ThumbsUp size={20} strokeWidth={2.25} aria-hidden /> Aprovou
                </>
              ),
            },
            {
              valor: "recusou",
              rotulo: (
                <>
                  <ThumbsDown size={20} strokeWidth={2.25} aria-hidden /> Recusou
                </>
              ),
            },
          ]}
        />
        {resposta && (
          <Escolha
            rotulo={resposta === "aprovou" ? "Como o cliente aprovou?" : "Como o cliente respondeu?"}
            name="canal"
            valor={canal}
            aoMudar={setCanal}
            erro={envio.campos.canal}
            opcoes={CANAIS_RESPOSTA}
          />
        )}
        {resposta === "aprovou" && (
          <Campo
            rotulo="Quem aprovou"
            name="quem"
            value={quem}
            onChange={(e) => setQuem(e.target.value)}
            placeholder="Ex.: Ricardo, gerente da frota"
            maxLength={120}
            autoComplete="off"
            erro={envio.campos.quem}
          />
        )}
        {resposta === "recusou" && (
          <>
            <div className="flex flex-col gap-2">
              <SugestoesTexto
                rotulo="Motivos comuns"
                sugestoes={SUGESTOES_RECUSA}
                aoEscolher={(s) => setMotivo((m) => acrescentarTexto(m, s))}
              />
              <Campo
                rotulo="Motivo"
                opcional
                name="motivo"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                maxLength={300}
                autoComplete="off"
                erro={envio.campos.motivo}
              />
            </div>
            <Escolha
              rotulo="E agora?"
              name="depois"
              valor={depois}
              aoMudar={setDepois}
              opcoes={[
                { valor: "refazer", rotulo: "Refazer o orçamento" },
                { valor: "cancelar", rotulo: "Cancelar a OS" },
              ]}
            />
          </>
        )}
        {envio.estado?.erro && <CaixaMensagem tipo="erro">{envio.estado.erro}</CaixaMensagem>}
      </form>
    </Folha>
  );
}

// =================================================================== folha: pronta

function FolhaPronta({ aoFechar, aoConcluir }: { aoFechar: () => void; aoConcluir: () => void }) {
  const { os } = useOS();
  const envio = useEnvio(marcarProntaOS, "Não foi possível marcar como pronta. Confira a internet e tente de novo.", aoConcluir);
  return (
    <Folha
      aberta
      aoFechar={aoFechar}
      titulo="Marcar como pronta"
      rodape={<BotaoForm form="form-pronta" enviando={envio.enviando} rotulo="Marcar como pronta" rotuloEnviando="Enviando…" />}
    >
      <form id="form-pronta" onSubmit={envio.enviar} noValidate className="flex flex-col gap-5">
        <input type="hidden" name="os_id" value={os.id} />
        <p className="text-base">Antes de marcar, anote o que você achou. É opcional, mas ajuda no fechamento.</p>
        <AreaTexto rotulo="O que foi encontrado?" opcional name="causa" maxLength={4000} erro={envio.campos.causa} />
        <AreaTexto rotulo="O que foi feito?" opcional name="solucao" maxLength={4000} erro={envio.campos.solucao} />
        {envio.estado?.erro && <CaixaMensagem tipo="erro">{envio.estado.erro}</CaixaMensagem>}
      </form>
    </Folha>
  );
}

// =================================================================== folha: mecanico / comecar

function FolhaMecanico({ aoFechar, comecar, aoComecar }: { aoFechar: () => void; comecar?: boolean; aoComecar?: () => void }) {
  const { os } = useOS();
  const [escolha, setEscolha] = useState<string>(os.mecanicoId ?? "nenhum");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();
  const idLista = useId();
  const pessoa = os.equipe.find((p) => p.id === escolha);

  function confirmar(mecanicoId: string | null) {
    setErro(null);
    iniciar(async () => {
      try {
        const r = comecar ? await comecarServicoOS(os.id, mecanicoId) : await atribuirMecanicoOS(os.id, mecanicoId);
        if (r?.erro) setErro(r.erro);
        else if (comecar) aoComecar?.();
        else aoFechar();
      } catch {
        setErro(`Não foi possível ${comecar ? "começar o serviço" : "trocar o mecânico"}. Confira a internet e tente de novo.`);
      }
    });
  }

  const rotulo = comecar
    ? pessoa
      ? `Começar com ${pessoa.nome}`
      : "Começar sem mecânico"
    : pessoa
      ? `Passar para ${pessoa.nome}`
      : "Tirar o mecânico";

  return (
    <Folha
      aberta
      aoFechar={aoFechar}
      titulo="Quem vai fazer?"
      rodape={
        <>
          {comecar && pessoa && (
            <button
              type="button"
              disabled={enviando}
              onClick={() => confirmar(null)}
              className="inline-flex min-h-toque items-center justify-center text-base font-bold text-info-texto underline underline-offset-4"
            >
              Começar sem mecânico
            </button>
          )}
          <Botao
            disabled={enviando || (!comecar && (escolha === "nenhum" ? null : escolha) === os.mecanicoId)}
            aria-busy={enviando}
            onClick={() => confirmar(escolha === "nenhum" ? null : escolha)}
          >
            {enviando ? "Enviando…" : rotulo}
          </Botao>
        </>
      }
    >
      <fieldset className="flex flex-col gap-2">
        <legend id={idLista} className="sr-only">
          Quem vai fazer?
        </legend>
        <ul className="overflow-hidden rounded-md border border-borda-sutil bg-superficie">
          {[...os.equipe.map((p) => ({ ...p, valor: p.id })), { id: "nenhum", valor: "nenhum", nome: "Sem mecânico", emAndamento: -1 }].map((p) => {
            const ativo = escolha === p.valor;
            const atual = (os.mecanicoId ?? "nenhum") === p.valor;
            return (
              <li key={p.valor} className="border-b border-borda-sutil last:border-b-0">
                <label
                  className={`flex min-h-14 cursor-pointer items-center gap-3 px-4 py-2 has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-foco ${
                    ativo ? "bg-primaria text-primaria-texto" : "active:bg-superficie-2"
                  }`}
                >
                  <input
                    type="radio"
                    name="mecanico"
                    value={p.valor}
                    checked={ativo}
                    onChange={() => setEscolha(p.valor)}
                    className="sr-only"
                  />
                  <span className="flex size-6 shrink-0 items-center justify-center">
                    {ativo && <Check size={22} strokeWidth={2.5} aria-hidden />}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-lg font-bold">
                      {p.nome}
                      {atual && " (atual)"}
                    </span>
                    {p.emAndamento >= 0 && (
                      <span className={`text-sm ${ativo ? "" : "text-texto-suave"}`}>
                        {p.emAndamento === 1 ? "1 OS em andamento" : `${p.emAndamento} OS em andamento`}
                      </span>
                    )}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>
      {erro && (
        <div className="mt-4">
          <CaixaMensagem tipo="erro">{erro}</CaixaMensagem>
        </div>
      )}
    </Folha>
  );
}

// =================================================================== folha: pagamento

function FolhaPagamento({ aoFechar }: { aoFechar: () => void }) {
  const { os } = useOS();
  const [forma, setForma] = useState<FormaPagamento | "">(os.formaPagamento ?? "");
  const [hoje] = useState(() => hojeEmSaoPaulo());
  const envio = useEnvio(registrarPagamentoOS, "Não foi possível registrar o pagamento. Confira a internet e tente de novo.", aoFechar);
  return (
    <Folha
      aberta
      aoFechar={aoFechar}
      titulo="Registrar pagamento"
      rodape={<BotaoForm form="form-pagamento" enviando={envio.enviando} rotulo="Registrar pagamento" rotuloEnviando="Registrando…" />}
    >
      <form id="form-pagamento" onSubmit={envio.enviar} noValidate className="flex flex-col gap-5">
        <input type="hidden" name="os_id" value={os.id} />
        <p className="font-mono text-2xl">Total: {formatarCentavos(os.totalCentavos ?? 0)}</p>
        <Escolha
          rotulo="Forma de pagamento"
          name="forma_pagamento"
          valor={forma}
          aoMudar={setForma}
          colunas={2}
          opcoes={FORMAS_PAGAMENTO}
          erro={envio.campos.forma_pagamento}
        />
        <Campo rotulo="Recebido em" name="recebido_em" type="date" defaultValue={hoje} max={hoje} erro={envio.campos.recebido_em} />
        {envio.estado?.erro && <CaixaMensagem tipo="erro">{envio.estado.erro}</CaixaMensagem>}
      </form>
    </Folha>
  );
}

// =================================================================== folha: trocar modo

function FolhaModo({ aoFechar }: { aoFechar: () => void }) {
  const { os } = useOS();
  const paraDireto = os.modo === "com_orcamento";
  const [quem, setQuem] = useState<"cliente" | "outra">(os.clienteNome ? "cliente" : "outra");
  const [nome, setNome] = useState("");
  const [tel, setTel] = useState("");
  const envio = useEnvio(trocarModoOS, "Não foi possível trocar o modo. Confira a internet e tente de novo.", aoFechar);
  const autorizado = quem === "cliente" ? os.clienteNome : nome.trim();

  return (
    <Folha
      aberta
      aoFechar={aoFechar}
      titulo={paraDireto ? "Trocar para serviço direto" : "Trocar para com orçamento"}
      rodape={
        <BotaoForm
          form="form-modo"
          enviando={envio.enviando}
          rotulo={paraDireto ? "Trocar e começar serviço" : "Trocar para com orçamento"}
          rotuloEnviando="Trocando…"
        />
      }
    >
      <form id="form-modo" onSubmit={envio.enviar} noValidate className="flex flex-col gap-5">
        <input type="hidden" name="os_id" value={os.id} />
        <input type="hidden" name="modo" value={paraDireto ? "direto" : "com_orcamento"} />
        {paraDireto ? (
          <div className="flex flex-col gap-4 border-l-4 border-info pl-4">
            <div>
              <h3 className="text-xl">Quem autorizou o serviço?</h3>
              <p className="text-sm text-texto-suave">Fica registrado com data e hora, como prova se houver dúvida depois.</p>
            </div>
            <Escolha
              rotulo="Quem autorizou"
              rotuloOculto
              name="quem_autorizou"
              valor={quem}
              aoMudar={setQuem}
              opcoes={[
                { valor: "cliente", rotulo: os.clienteNome || "Cliente", desabilitado: !os.clienteNome },
                { valor: "outra", rotulo: "Outra pessoa" },
              ]}
            />
            {quem === "outra" && (
              <>
                <Campo
                  rotulo="Nome de quem autorizou"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex.: Carlos, motorista"
                  maxLength={120}
                  autoComplete="off"
                  erro={envio.campos.autorizado_nome}
                />
                <Campo
                  rotulo="Telefone de quem autorizou"
                  opcional
                  name="autorizado_telefone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  placeholder="(11) 98888-7777"
                  value={tel}
                  onChange={(e) => setTel(formatarTelefone(e.target.value))}
                  erro={envio.campos.autorizado_telefone}
                />
              </>
            )}
            <input type="hidden" name="autorizado_nome" value={autorizado} />
            <p className="flex items-start gap-1.5 text-sm text-texto-suave">
              <TriangleAlert size={18} strokeWidth={2.25} aria-hidden className="mt-0.5 shrink-0" />
              A OS passa para “Em andamento”.
            </p>
          </div>
        ) : (
          <p className="text-base">
            A OS volta para “Aguardando orçamento” e a autorização registrada é apagada. Só dá para trocar enquanto não há itens
            lançados.
          </p>
        )}
        {envio.estado?.erro && <CaixaMensagem tipo="erro">{envio.estado.erro}</CaixaMensagem>}
      </form>
    </Folha>
  );
}
