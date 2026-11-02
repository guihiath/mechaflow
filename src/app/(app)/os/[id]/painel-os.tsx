"use client";

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useSyncExternalStore,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from "react";
import { Camera, Check, CircleAlert, CircleCheckBig, ClipboardCheck, ClipboardX, Images, Play, Plus, Search, ThumbsDown, ThumbsUp, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { iniciarVistoria } from "@/acoes/vistoria";
import {
  adicionarItemOS,
  alterarItemMecanicoOS,
  atribuirMecanicoOS,
  carregarCatalogoMecanicoOS,
  carregarCatalogoOS,
  lancarItemMecanicoOS,
  comecarServicoOS,
  marcarProntaOS,
  mudarStatusOS,
  registrarPagamentoOS,
  registrarRespostaOS,
  removerItemMecanicoOS,
  removerItemOS,
  salvarItemOS,
  trocarModoOS,
  type CatalogoMecanico,
  type CatalogoOS,
  type ItemCatalogoMecanico,
  type ItemCatalogoOS,
} from "@/acoes/os";
import {
  EtiquetaAposAprovacao,
  EtiquetaConferido,
  EtiquetaLancadoPor,
  EtiquetaVoceLancou,
} from "@/components/os/etiquetas-fase3";
import { EsconderNavegacao } from "@/components/layout/marcador-pagina";
import { EtiquetaSemPreco } from "@/components/os/badge-status";
import { BarraAcoesMecanico, BarraAcoesOS, classesBotaoBarra } from "@/components/os/barra-acoes-os";
import { LinhaItemOS, ListaItensOS } from "@/components/os/linha-item-os";
import { AvisoDesfazer } from "@/components/ui/aviso-desfazer";
import { Botao, BotaoLink } from "@/components/ui/botao";
import { AreaTexto, Campo } from "@/components/ui/campo";
import { ConfirmarAcao } from "@/components/ui/confirmar-acao";
import { Escolha } from "@/components/ui/escolha";
import { Folha } from "@/components/ui/folha";
import { AvisoLento, BotaoEnviar, CaixaMensagem, focarPrimeiroErro } from "@/components/ui/formulario";
import { Quantidade } from "@/components/ui/quantidade";
import { SUGESTOES_RECUSA, SugestoesTexto, acrescentarTexto } from "@/components/ui/sugestoes-texto";
import type { EstadoAcao } from "@/lib/acao";
import { assinarOSCheia, entregarFotosDaBarra, osCheia } from "@/lib/fotos/barra";
import { LIMITE_FOTOS_OS } from "@/lib/fotos/regras";
import { centavosParaCampo, formatarCentavos, formatarDiaHora, formatarTelefone, reaisParaCentavos } from "@/lib/formato";
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
  /** Nome de quem lancou, so quando entrou pelo mecanico (etiqueta "Lançado por João"). */
  lancadoPorNome?: string | null;
  /** Quando entrou (ISO, UTC): "Lançado por João em 29/10 às 14:20". */
  criadoEm?: string | null;
  /** OS com orcamento ja aprovada quando o item entrou (etiqueta "Após a aprovação"). */
  aposAprovacao?: boolean;
  /** Item do mecanico que o balcao ja precificou (sai do aviso). */
  conferido?: boolean;
};

/**
 * Item na tela do MECANICO (F3-B3): nenhuma chave de valor. As marcas vem do banco
 * (vw_os_itens) ja reduzidas a booleanos pelo servidor.
 */
export type ItemMecanico = {
  id: string;
  tipo: TipoItemOS;
  descricao: string;
  quantidade: number;
  unidade: string;
  /** Entrou fora do catalogo (descricao editavel). */
  avulso: boolean;
  /** Ele mesmo lancou. */
  meu: boolean;
  /** Ele lancou e o balcao ja conferiu (so leitura). */
  conferido: boolean;
  /** vw_os_itens.mecanico_pode_alterar: editar/remover agora. */
  podeAlterar: boolean;
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
  /** So na versao do mecanico. */
  itensMecanico?: ItemMecanico[];
  /** Mecanico da OS, em status que deixa lancar (F3.3). */
  podeLancar?: boolean;
  /** `?precificar=1` (vindo do fechamento): abre "Definir preços" ao carregar. */
  precificarAoAbrir?: boolean;
  /** Só na versão do mecânico, na OS dele aberta e sem vistoria concluída (DESIGN §12.2 c). */
  vistoriaBarra?: { emAndamento: boolean; obrigatoria: boolean } | null;
  /**
   * Só dono/atendente: oficina com vistoria obrigatória e OS aberta sem a de entrada concluída.
   * Em "em andamento"/"pronta" o primário vira "Fazer vistoria" (DESIGN §12.2 c, F4-B5).
   */
  vistoriaBloqueia?: { emAndamento: boolean } | null;
};

type FolhaAberta =
  | { tipo: "item-novo" }
  | { tipo: "item"; item: ItemOSCliente }
  /** "Definir preços": itens sem preco em sequencia (DESIGN §11.9). "Conferir itens"
   * (F3-B8, I4): itens do mecanico ainda nao conferidos, mesma folha em sequencia. */
  | { tipo: "precificar"; fila: string[]; modo: ModoFila }
  | { tipo: "lancar" }
  | { tipo: "item-mecanico"; item: ItemMecanico }
  | { tipo: "resposta" }
  | { tipo: "pronta" }
  | { tipo: "mecanico" }
  | { tipo: "comecar" }
  | { tipo: "pagamento" }
  | { tipo: "modo" };

/** Folha "Editar item" em sequencia: "precos" passa pelos sem preco; "conferir", pelos do mecanico nao conferidos. */
type ModoFila = "precos" | "conferir";

/** Item ainda na fila daquele modo (some da fila quando ganha preco / e conferido). */
const pendenteNaFila = (modo: ModoFila, i: ItemOSCliente) =>
  modo === "precos" ? i.precoUnitarioCentavos === null : Boolean(i.lancadoPorNome) && !i.conferido;

type Desfazer = { chave: number; mensagem: string; de: StatusOS; para: StatusOS };

type Ctx = {
  os: DadosPainel;
  abrir: (f: FolhaAberta) => void;
  /** Aplica um passo de status e oferece "Desfazer" (6 s). */
  passo: (de: StatusOS, para: StatusOS) => void;
  ocupado: boolean;
  erro: string | null;
  /** Mostra um erro acima da barra (ex.: a folha fechou porque a OS mudou). */
  mostrarErro: (erro: string) => void;
  /** Abre a folha do 1o item sem preco e segue para os proximos (dono/atendente). */
  definirPrecos: () => void;
  /** Abre a folha dos itens do mecanico ainda nao conferidos, em sequencia (F3-B8, I4). */
  conferirItens: () => void;
  /** Recado de sucesso acima da barra ("Todos os itens têm preço."). */
  sucesso: string | null;
  mostrarSucesso: (texto: string) => void;
  /** Rascunho de cada folha (C1): sobrevive a fechar a folha e a recarregar a pagina. */
  lerRascunho: (chave: string) => Record<string, string> | undefined;
  guardarRascunho: (chave: string, campos: Record<string, string>) => void;
  limparRascunho: (chave: string) => void;
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
  /** Erro que pede para fechar a folha (`dados.fechar`, itens do mecanico). */
  aoFecharPorErro?: (r: EstadoAcao) => void,
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
        else if (!r?.ok && r?.dados?.fechar && aoFecharPorErro) aoFecharPorErro(r);
      } catch {
        setEstado({ erro: falha });
      } finally {
        travado.current = false;
      }
    });
  }
  return { estado, setEstado, enviando, enviar, campos: estado?.campos ?? {} };
}

/**
 * Campos de uma folha guardados no rascunho do PainelOS (C1 da REVISAO-FASE2).
 * - `inicial`: valores de quando a folha abre sem rascunho; so o que difere e guardado.
 * - `digitados`: campos que contam como "algo digitado" (fechar pede confirmacao).
 * - `fixos`: valores que vencem o rascunho (ex.: descricao nova do item avulso).
 */
function useRascunho<T extends Record<string, string>>(
  chave: string,
  inicial: T,
  { digitados, fixos }: { digitados?: (keyof T)[]; fixos?: Partial<T> } = {},
) {
  const { lerRascunho, guardarRascunho, limparRascunho } = useOS();
  const [base] = useState(inicial);
  const [salvo] = useState(() => lerRascunho(chave));
  const [v, setV] = useState<T>(() => ({ ...base, ...(salvo ?? {}), ...(fixos ?? {}) }) as T);
  const chaves = Object.keys(base) as (keyof T)[];
  const alterado = chaves.some((k) => v[k] !== base[k]);
  const sujo = (digitados ?? chaves).some((k) => v[k] !== base[k] && String(v[k] ?? "").trim() !== "");

  useEffect(() => {
    if (alterado) guardarRascunho(chave, v);
    else limparRascunho(chave);
  }, [alterado, chave, v, guardarRascunho, limparRascunho]);

  return {
    v,
    mudar: <K extends keyof T>(k: K, valor: T[K]) => setV((a) => ({ ...a, [k]: valor })),
    sujo,
    recuperado: Boolean(salvo && Object.keys(salvo).length),
    limpar: () => limparRascunho(chave),
  };
}

const chaveSessaoFolhas = (osId: string) => `mf-folha-${osId}`;

/** Primario do rodape da folha ligado ao formulario pelo atributo `form` (com aviso de internet lenta). */
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
    <BotaoEnviar
      type="submit"
      form={form}
      enviando={enviando}
      rotulo={rotulo}
      rotuloEnviando={rotuloEnviando}
      variante={variante}
      disabled={disabled}
    />
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
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();
  const contador = useRef(0);
  const rascunhos = useRef<Record<string, Record<string, string>>>({});
  const chaveSessao = chaveSessaoFolhas(os.id);

  // Rascunhos desta OS guardados na aba (voltam se o PWA recarregar no meio).
  useEffect(() => {
    try {
      const salvo = JSON.parse(sessionStorage.getItem(chaveSessao) ?? "null") as Record<string, Record<string, string>> | null;
      rascunhos.current = salvo && typeof salvo === "object" ? salvo : {};
    } catch {
      rascunhos.current = {};
    }
  }, [chaveSessao]);

  const gravarSessao = useCallback(() => {
    try {
      if (Object.keys(rascunhos.current).length) sessionStorage.setItem(chaveSessao, JSON.stringify(rascunhos.current));
      else sessionStorage.removeItem(chaveSessao);
    } catch {
      /* sessionStorage cheio ou bloqueado: fica so na memoria */
    }
  }, [chaveSessao]);
  const lerRascunho = useCallback((chave: string) => rascunhos.current[chave], []);
  const guardarRascunho = useCallback(
    (chave: string, campos: Record<string, string>) => {
      rascunhos.current = { ...rascunhos.current, [chave]: campos };
      gravarSessao();
    },
    [gravarSessao],
  );
  const limparRascunho = useCallback(
    (chave: string) => {
      if (!(chave in rascunhos.current)) return;
      const { [chave]: _fora, ...resto } = rascunhos.current;
      void _fora;
      rascunhos.current = resto;
      gravarSessao();
    },
    [gravarSessao],
  );

  function passo(de: StatusOS, para: StatusOS) {
    setErro(null);
    iniciar(async () => {
      try {
        const r = await mudarStatusOS(os.id, de, para);
        if (r?.erro) {
          setErro(r.erro);
          setDesfazer(null);
        } else setDesfazer({ chave: ++contador.current, mensagem: `Status: ${rotuloStatus(para)}.`, de, para });
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

  const filaSemPreco = () => itensOrdenados(os.itens).filter((i) => i.precoUnitarioCentavos === null).map((i) => i.id);
  const definirPrecos = () => {
    const fila = filaSemPreco();
    setErro(null);
    setSucesso(null);
    if (fila.length) setFolha({ tipo: "precificar", fila, modo: "precos" });
  };
  const conferirItens = () => {
    const fila = itensOrdenados(os.itens).filter((i) => pendenteNaFila("conferir", i)).map((i) => i.id);
    setErro(null);
    setSucesso(null);
    if (fila.length) setFolha({ tipo: "precificar", fila, modo: "conferir" });
  };

  // Vindo do fechamento ("Definir preços" -> /os/[id]?precificar=1): abre a folha do 1o item sem preco.
  const precificarAoAbrir = useRef(os.precificarAoAbrir && os.gerencia);
  useEffect(() => {
    if (!precificarAoAbrir.current) return;
    precificarAoAbrir.current = false;
    const fila = itensOrdenados(os.itens).filter((i) => i.precoUnitarioCentavos === null).map((i) => i.id);
    if (fila.length) setFolha({ tipo: "precificar", fila, modo: "precos" });
  }, [os.itens]);

  const ctx: Ctx = {
    os,
    abrir: (f) => (setErro(null), setSucesso(null), setFolha(f)),
    passo,
    ocupado,
    erro,
    mostrarErro: (e) => (setDesfazer(null), setErro(e)),
    definirPrecos,
    conferirItens,
    sucesso,
    mostrarSucesso: (t) => (setErro(null), setSucesso(t)),
    lerRascunho,
    guardarRascunho,
    limparRascunho,
  };
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
      {folha?.tipo === "precificar" && <FolhaItem aoFechar={fechar} fila={folha.fila} modoFila={folha.modo} />}
      {folha?.tipo === "lancar" && <FolhaItemMecanico aoFechar={fechar} />}
      {folha?.tipo === "item-mecanico" && <FolhaItemMecanico aoFechar={fechar} item={folha.item} />}
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
  const { os, abrir, passo, ocupado, erro, sucesso, definirPrecos } = useOS();
  if (!os.gerencia) return <BarraMecanico proximoPasso={proximoPasso} />;
  const acima = ocupado ? (
    <AvisoLento />
  ) : erro ? (
    <CaixaMensagem tipo="erro">{erro}</CaixaMensagem>
  ) : sucesso ? (
    <CaixaMensagem tipo="sucesso">{sucesso}</CaixaMensagem>
  ) : undefined;
  const add = (
    <Botao variante="secundario" onClick={() => abrir({ tipo: "item-novo" })}>
      Adicionar item
    </Botao>
  );
  const rotuloOcupado = (r: string) => (ocupado ? "Enviando…" : r);
  // Vistoria obrigatória ainda não feita: o primário que o banco bloquearia leva à vistoria.
  const vb = os.vistoriaBloqueia;
  const bloqueadaPelaVistoria = vb != null && (os.status === "em_andamento" || os.status === "pronta");
  const avisoVistoria = bloqueadaPelaVistoria ? (
    <p className="flex items-start gap-1.5 text-[15px] font-bold text-alerta-texto" data-teste="aviso-vistoria-obrigatoria">
      <ClipboardX size={20} strokeWidth={2.25} aria-hidden className="mt-0.5 shrink-0" />
      {os.status === "pronta" ? "Vistoria obrigatória: sem ela a OS não pode ser entregue." : "Vistoria obrigatória: sem ela a OS não fica pronta."}
    </p>
  ) : null;

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
          primario = <Botao onClick={() => abrir({ tipo: "resposta" })}>{REGISTRAR_RESPOSTA}</Botao>;
          secundario = add;
        }
        break;
      case "orcamento_enviado":
        primario = <Botao onClick={() => abrir({ tipo: "resposta" })}>{REGISTRAR_RESPOSTA}</Botao>;
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
        primario =
          vb != null ? (
            <BotaoFazerVistoria osId={os.id} emAndamento={vb.emAndamento} />
          ) : (
            <Botao onClick={() => abrir({ tipo: "pronta" })}>
              <Check size={24} strokeWidth={2.5} aria-hidden />
              Marcar como pronta
            </Botao>
          );
        secundario = add;
        break;
      case "pronta":
        // Com item sem preco a entrega esta bloqueada: o primario leva ao que destrava (DESIGN §11.9).
        // Vistoria obrigatória não feita bloqueia também (DESIGN §12.2 c).
        primario = vb != null ? (
          <BotaoFazerVistoria osId={os.id} emAndamento={vb.emAndamento} />
        ) : (os.itensSemPreco ?? 0) > 0 ? (
            <Botao onClick={definirPrecos}>Definir preços ({os.itensSemPreco})</Botao>
          ) : (
            <BotaoLink href={`/os/${os.id}/fechar`}>Fechar e entregar</BotaoLink>
          );
        secundario = add;
        break;
      case "entregue":
        if (!os.pago) primario = <Botao onClick={() => abrir({ tipo: "pagamento" })}>Registrar pagamento</Botao>;
        break;
    }
  }

  if (!primario && !secundario) {
    return acima ? <AcimaSemBarra>{acima}</AcimaSemBarra> : null;
  }
  return (
    <>
      <EsconderNavegacao />
      <BarraAcoesOS primario={primario} secundario={secundario} acima={acima ?? avisoVistoria ?? undefined} proximoPasso={proximoPasso} />
    </>
  );
}

/**
 * Primário "Fazer vistoria" / "Continuar vistoria" do dono/atendente quando a vistoria
 * obrigatória bloqueia "pronta"/"entregue" (DESIGN §12.2 c). Iniciar é idempotente.
 */
function BotaoFazerVistoria({ osId, emAndamento }: { osId: string; emAndamento: boolean }) {
  const router = useRouter();
  const [abrindo, iniciar] = useTransition();
  if (emAndamento) {
    return (
      <BotaoLink href={`/os/${osId}/vistoria`} data-teste="barra-fazer-vistoria">
        <ClipboardCheck size={24} strokeWidth={2.25} aria-hidden />
        Continuar vistoria
      </BotaoLink>
    );
  }
  return (
    <Botao
      disabled={abrindo}
      aria-busy={abrindo}
      data-teste="barra-fazer-vistoria"
      onClick={() =>
        iniciar(async () => {
          const r = await iniciarVistoria(osId);
          // Falhou: a tela da vistoria mostra o cartão com "Fazer vistoria" e o motivo.
          if (r?.erro) router.push(`/os/${osId}/vistoria`);
        })
      }
    >
      <ClipboardCheck size={24} strokeWidth={2.25} aria-hidden />
      {abrindo ? "Abrindo…" : "Fazer vistoria"}
    </Botao>
  );
}

function AcimaSemBarra({ children }: { children: ReactNode }) {
  return <div className="fixed inset-x-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 lg:static">{children}</div>;
}

/**
 * "Registrar resposta do cliente" não cabe numa linha na barra do celular (206 px a 16 px; M6 do F3-R1):
 * lá o texto é "Registrar resposta". O " do cliente" some com display:none, então o nome acessível é
 * sempre igual ao texto visível (SC 2.5.3).
 */
const REGISTRAR_RESPOSTA = (
  <>
    Registrar resposta<span className="max-lg:hidden"> do cliente</span>
  </>
);

const ICONE_BARRA = { size: 26, strokeWidth: 2.25, "aria-hidden": true } as const;

/** "Vistoria" na barra do mecânico: continua o rascunho ou cria (iniciar_vistoria é idempotente). */
function BotaoVistoriaBarra({ osId, emAndamento }: { osId: string; emAndamento: boolean }) {
  const router = useRouter();
  const [abrindo, iniciar] = useTransition();
  if (emAndamento) {
    return (
      <Link href={`/os/${osId}/vistoria`} aria-label="Continuar a vistoria do veículo" className={classesBotaoBarra("secundario", true)}>
        <ClipboardCheck {...ICONE_BARRA} />
        Vistoria
      </Link>
    );
  }
  return (
    <button
      type="button"
      disabled={abrindo}
      aria-label={abrindo ? undefined : "Vistoria do veículo"}
      onClick={() =>
        iniciar(async () => {
          const r = await iniciarVistoria(osId);
          // Falhou: a tela da vistoria mostra o cartão com "Fazer vistoria" e o motivo.
          if (r?.erro) router.push(`/os/${osId}/vistoria`);
        })
      }
      className={classesBotaoBarra("secundario", true)}
      data-teste="barra-vistoria"
    >
      <ClipboardCheck {...ICONE_BARRA} />
      {abrindo ? "Abrindo…" : "Vistoria"}
    </button>
  );
}

/**
 * Barra do mecanico (DESIGN §11.2, F3-B6): status · item · foto, com "Tirar foto" como
 * primario a direita (a acao que ele mais repete). So na OS dele e com a OS aberta;
 * nos outros casos volta a barra de navegacao.
 *
 * | status               | esquerda        | meio        | direita            |
 * | aguardando_orcamento | —               | Lançar item | Tirar foto         |
 * | orcamento_enviado    | —               | —           | Tirar foto (toda)  |
 * | aprovada             | Começar serviço | Lançar item | Tirar foto         |
 * | em_andamento         | Marcar pronta   | Lançar item | Tirar foto         |
 * | pronta               | —               | —           | Tirar foto (toda)  |
 */
function BarraMecanico({ proximoPasso }: { proximoPasso?: string }) {
  const { os, abrir, passo, ocupado, erro, sucesso } = useOS();
  const cheia = useSyncExternalStore(
    assinarOSCheia,
    () => osCheia(os.id),
    () => false,
  );
  const aberta = os.status !== "entregue" && os.status !== "cancelada";
  const avisoCheia = cheia ? (
    <p className="text-base text-texto-suave" data-teste="aviso-limite-barra">
      Esta OS chegou ao limite de {LIMITE_FOTOS_OS} fotos. Apague alguma para enviar outra.
    </p>
  ) : null;
  const acima = ocupado ? (
    <AvisoLento />
  ) : erro ? (
    <CaixaMensagem tipo="erro">{erro}</CaixaMensagem>
  ) : sucesso ? (
    <CaixaMensagem tipo="sucesso">{sucesso}</CaixaMensagem>
  ) : (
    avisoCheia ?? undefined
  );

  if (!os.mecanicoDaOS || !aberta) return acima ? <AcimaSemBarra>{acima}</AcimaSemBarra> : null;

  const botoes: ReactNode[] = [];
  // Vistoria ocupa a casa da esquerda quando ela está vazia (ou no lugar do "Marcar pronta"
  // bloqueado pela vistoria obrigatória), sem tirar o "Tirar foto" do lugar (DESIGN §12.2 c).
  const vb = os.vistoriaBarra;
  const vistoriaNaBarra =
    vb != null &&
    (os.status === "aguardando_orcamento" ||
      os.status === "orcamento_enviado" ||
      os.status === "pronta" ||
      (os.status === "em_andamento" && vb.obrigatoria));
  const empilhado = vistoriaNaBarra || os.status === "aguardando_orcamento" || os.status === "aprovada" || os.status === "em_andamento";

  if (vistoriaNaBarra && vb) {
    botoes.push(<BotaoVistoriaBarra key="status" osId={os.id} emAndamento={vb.emAndamento} />);
  } else if (os.status === "aprovada") {
    botoes.push(
      <button
        key="status"
        type="button"
        disabled={ocupado}
        aria-label={ocupado ? undefined : "Começar serviço"}
        onClick={() => passo("aprovada", "em_andamento")}
        className={classesBotaoBarra("secundario", true)}
      >
        <Play {...ICONE_BARRA} />
        {ocupado ? "Enviando…" : "Começar"}
      </button>,
    );
  } else if (os.status === "em_andamento") {
    botoes.push(
      <button key="status" type="button" onClick={() => abrir({ tipo: "pronta" })} className={classesBotaoBarra("secundario", true)}>
        <CircleCheckBig {...ICONE_BARRA} />
        Marcar pronta
      </button>,
    );
  }
  if (os.podeLancar) {
    botoes.push(
      <button
        key="item"
        type="button"
        aria-label="Lançar item: serviço ou peça"
        onClick={() => abrir({ tipo: "lancar" })}
        className={classesBotaoBarra("secundario", true)}
        data-teste="barra-lancar"
      >
        <Plus {...ICONE_BARRA} />
        Lançar item
      </button>,
    );
  }
  botoes.push(<BotaoFotoBarra key="foto" osId={os.id} empilhado={empilhado} desabilitado={cheia} />);

  return (
    <>
      <EsconderNavegacao />
      <BarraAcoesMecanico botoes={botoes} acima={acima} proximoPasso={proximoPasso} />
    </>
  );
}

/**
 * "Tirar foto" da barra: `<label>` com o `<input capture>` dentro (o Safari só abre a câmera
 * com o toque direto). Os arquivos vão para a seção Fotos, que abre a folha do tipo.
 * Desktop (ponteiro fino): "Escolher fotos", várias de uma vez.
 */
function BotaoFotoBarra({ osId, empilhado, desabilitado }: { osId: string; empilhado: boolean; desabilitado: boolean }) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      aria-disabled={desabilitado}
      className={`${classesBotaoBarra("primario", empilhado)} has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-foco ${
        desabilitado ? "pointer-events-none opacity-50" : "cursor-pointer"
      }`}
      data-teste="barra-foto"
    >
      <Camera {...ICONE_BARRA} className="pointer-fine:hidden" />
      <Images {...ICONE_BARRA} className="hidden pointer-fine:block" />
      <span className="pointer-fine:hidden">Tirar foto</span>
      <span className="hidden pointer-fine:inline">Escolher fotos</span>
      <input
        id={id}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        disabled={desabilitado}
        onChange={(ev) => {
          const arquivos = Array.from(ev.target.files ?? []);
          ev.target.value = "";
          entregarFotosDaBarra(osId, arquivos);
        }}
        data-teste="barra-foto-input"
      />
    </label>
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

/** "Voltar para em andamento" (OS pronta por engano, depois dos 6 s do Desfazer). */
export function BotaoReabrir() {
  const { passo, ocupado } = useOS();
  return (
    <button
      type="button"
      disabled={ocupado}
      onClick={() => passo("pronta", "em_andamento")}
      className="inline-flex min-h-toque items-center self-start text-base font-bold text-info-texto underline underline-offset-4 disabled:opacity-60"
    >
      Voltar para em andamento
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
/** Servicos antes das pecas (mesma ordem da lista e do "Definir preços"). */
function itensOrdenados(itens: ItemOSCliente[]) {
  return [...itens].sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === "servico" ? -1 : 1));
}

/**
 * Lista de itens: cada linha abre a folha de edicao (dono/atendente, OS aberta).
 * Etiquetas da Fase 3 na linha de baixo: "Lançado por João" e "Após a aprovação".
 */
export function ListaItensEditavel({ editavel, mostrarCusto }: { editavel: boolean; mostrarCusto: boolean }) {
  const { os, abrir } = useOS();
  const ordenados = itensOrdenados(os.itens);
  return (
    <ListaItensOS rotulo="Serviços e peças">
      {ordenados.map((i) => (
        <LinhaItemOS
          key={i.id}
          mostrarCusto={mostrarCusto}
          aoTocar={editavel ? () => abrir({ tipo: "item", item: i }) : undefined}
          etiquetas={
            i.lancadoPorNome || (i.aposAprovacao && os.modo === "com_orcamento") ? (
              <>
                {i.lancadoPorNome && <EtiquetaLancadoPor nome={i.lancadoPorNome} />}
                {i.aposAprovacao && os.modo === "com_orcamento" && <EtiquetaAposAprovacao />}
              </>
            ) : undefined
          }
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

/** Primeiro nome ("João Carlos" -> "João"), como nas etiquetas. */
const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] || nome;

/**
 * Aviso dos itens do mecanico (DESIGN §11.9), logo abaixo do topo: so aparece se houver
 * item lancado pelo mecanico que o balcao ainda nao conferiu. "Definir preços" abre a
 * folha do 1o item sem preco e segue em sequencia.
 */
export function AvisoItensMecanico() {
  const { os } = useOS();
  const pendentes = os.itens.filter((i) => i.lancadoPorNome && !i.conferido);
  if (!pendentes.length || os.status === "entregue" || os.status === "cancelada") return null;
  const nomes = [...new Set(pendentes.map((i) => primeiroNome(i.lancadoPorNome ?? "")))];
  const quem = nomes.length === 1 ? nomes[0] : `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
  const n = pendentes.length;
  const semPreco = pendentes.filter((i) => i.precoUnitarioCentavos === null).length;
  const lancou = nomes.length === 1 ? "lançou" : "lançaram";
  const qtd = n === 1 ? "1 item" : `${n} itens`;
  // Todos com preco (ex.: vieram do catalogo): nomeia os itens que faltam conferir (F3-B8, I4).
  const descricoes = itensOrdenados(pendentes).map((i) => i.descricao);
  const texto =
    semPreco === 0
      ? n <= 2
        ? `${quem} ${lancou} ${qtd}: ${descricoes.join(" e ")}. Confira e salve.`
        : `${quem} ${lancou} ${qtd} para conferir.`
      : `${quem} ${lancou} ${qtd}.` +
        (n === 1 ? " Está sem preço." : semPreco === 1 ? " 1 está sem preço." : ` ${semPreco} estão sem preço.`);
  return (
    <div className="flex flex-col gap-2">
      <CaixaMensagem tipo="alerta">{texto}</CaixaMensagem>
      {semPreco > 0 ? (
        <BotaoDefinirPrecos />
      ) : (
        <>
          <BotaoConferirItens />
          {/* Item do proprio balcao sem preco: o "Definir preços" de baixo some quando ha este aviso. */}
          {(os.itensSemPreco ?? 0) > 0 && <BotaoDefinirPrecos />}
        </>
      )}
    </div>
  );
}

/** "Conferir itens" (mesmo estilo do "Definir preços"): itens do mecanico ainda nao conferidos. */
export function BotaoConferirItens() {
  const { conferirItens } = useOS();
  return (
    <Botao onClick={conferirItens} className="h-toque lg:w-auto lg:self-start">
      Conferir itens
    </Botao>
  );
}

/** "Definir preços" (primario pequeno, 48px, largura total no celular). */
export function BotaoDefinirPrecos() {
  const { definirPrecos } = useOS();
  return (
    <Botao onClick={definirPrecos} className="h-toque lg:w-auto lg:self-start">
      Definir preços
    </Botao>
  );
}

// =================================================================== folha: item

const catalogoCache: { dados: CatalogoOS | null } = { dados: null };
/** Mecanico: catalogo sem nenhuma chave de valor (vem de outra Server Action). */
const catalogoMecanicoCache: { dados: CatalogoMecanico | null } = { dados: null };

type ItemSeletor = ItemCatalogoMecanico | ItemCatalogoOS;
type Escolhido = { catalogo: ItemSeletor | null; descricao: string; tipo: TipoItemOS };
type CatalogoSeletor = { itens: ItemSeletor[]; maisUsados: { servico: string[]; peca: string[] } };

/** Dono/atendente: item do catalogo com preco (o mecanico nunca chega aqui). */
const comPreco = (i: ItemSeletor | null): ItemCatalogoOS | null => (i && "precoCentavos" in i ? i : null);

function FolhaItem({
  aoFechar,
  item: itemAberto,
  fila,
  modoFila = "precos",
}: {
  aoFechar: () => void;
  item?: ItemOSCliente;
  fila?: string[];
  modoFila?: ModoFila;
}) {
  const { os, mostrarSucesso } = useOS();
  // "Definir preços" / "Conferir itens": a folha passa pelos itens da fila, um de cada vez.
  const [indice, setIndice] = useState(0);
  const proximos = (de: number) =>
    (fila ?? []).slice(de + 1).filter((id) => os.itens.some((i) => i.id === id && pendenteNaFila(modoFila, i)));
  const item = fila ? os.itens.find((i) => i.id === fila[indice]) : itemAberto;
  const restantes = fila ? proximos(indice).length : 0;
  const [escolhido, setEscolhido] = useState<Escolhido | null>(null);
  const [adicionados, setAdicionados] = useState(0);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const editando = Boolean(item);
  const passo2 = editando || escolhido;
  const [rasc, setRasc] = useState({ sujo: false, recuperado: false });
  const descartarRef = useRef<(() => void) | null>(null);
  const envio = useEnvio(
    editando ? salvarItemOS : adicionarItemOS,
    editando
      ? "Não foi possível salvar o item. Confira a internet e tente de novo."
      : "Não foi possível adicionar o item. Confira a internet e tente de novo.",
    (r) => {
      descartarRef.current?.();
      if (fila) {
        const seguir = proximos(indice);
        if (seguir.length) {
          setIndice(fila.indexOf(seguir[0]));
          return "limpar";
        }
        // Ultimo da fila: so diz "todos" se nenhum outro item ficou sem preco / sem conferir.
        const outros = os.itens.filter((i) => i.id !== item?.id && pendenteNaFila(modoFila, i)).length;
        const salvouPreco = r?.dados?.comPreco === "1";
        if (salvouPreco && outros === 0)
          mostrarSucesso(modoFila === "conferir" ? "Itens do mecânico conferidos." : "Todos os itens têm preço.");
        aoFechar();
        return;
      }
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

  // Fila vazia (o item sumiu ou ja tem preco): nada para mostrar.
  useEffect(() => {
    if (fila && !item) aoFechar();
  }, [fila, item, aoFechar]);
  if (fila && !item) return null;

  return (
    <Folha
      aberta
      aoFechar={aoFechar}
      titulo={titulo}
      sujo={rasc.sujo}
      recuperado={rasc.recuperado}
      aoDescartar={() => descartarRef.current?.()}
      rodape={
        fila ? (
          <>
            {/* "Pular" vai para o proximo sem salvar (F3-B8, I5); no ultimo, fecha. */}
            <div className="flex">
              <button
                type="button"
                disabled={envio.enviando}
                onClick={() => {
                  const seguir = proximos(indice);
                  envio.setEstado(null);
                  if (seguir.length) setIndice(fila.indexOf(seguir[0]));
                  else aoFechar();
                }}
                className="inline-flex min-h-toque flex-1 items-center justify-center text-base font-bold text-info-texto underline underline-offset-4 disabled:opacity-60"
              >
                Pular
              </button>
              <button
                type="button"
                onClick={aoFechar}
                className="inline-flex min-h-toque flex-1 items-center justify-center text-base font-bold text-info-texto underline underline-offset-4"
              >
                Concluir
              </button>
            </div>
            <BotaoForm
              form="form-item-os"
              enviando={envio.enviando}
              rotulo={
                modoFila === "conferir"
                  ? restantes > 0
                    ? `Conferido e ir para o próximo (${restantes})`
                    : "Conferido"
                  : restantes > 0
                    ? `Salvar e ir para o próximo (${restantes})`
                    : "Salvar preço"
              }
              rotuloEnviando="Salvando…"
            />
          </>
        ) : passo2 ? (
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
      {escolhido && !editando && (
        // D17: fica na 1a linha do corpo (nao no topo) para o nome do item caber no titulo.
        <button
          type="button"
          onClick={() => {
            setEscolhido(null);
            envio.setEstado(null);
          }}
          className="-mt-2 mb-2 inline-flex min-h-toque items-center text-base font-bold text-info-texto underline underline-offset-4"
        >
          ← Escolher outro
        </button>
      )}
      {passo2 ? (
        <FormItem
          key={item?.id ?? "novo"}
          item={item}
          focarPreco={Boolean(fila) || item?.precoUnitarioCentavos === null}
          exigirPreco={Boolean(fila)}
          escolhido={escolhido && { ...escolhido, catalogo: comPreco(escolhido.catalogo) }}
          envio={envio}
          aoRemover={() => {
            descartarRef.current?.();
            aoFechar();
          }}
          aoRascunho={setRasc}
          descartarRef={descartarRef}
        />
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

/**
 * Passo 1 da folha de item: Servicos/Pecas, busca, "Mais usados", "Todos" e o item fora do catalogo.
 * `semValores` (mecanico, DESIGN §11.3): catalogo de outra Server Action, sem preco nem
 * "Sem preço", abre em Pecas e chama o avulso de "fora do catálogo".
 */
function SeletorItem({
  mensagem,
  aoEscolher,
  semValores = false,
}: {
  mensagem: string | null;
  aoEscolher: (e: Escolhido) => void;
  semValores?: boolean;
}) {
  const { os } = useOS();
  const cache = semValores ? catalogoMecanicoCache : catalogoCache;
  const [catalogo, setCatalogo] = useState<CatalogoSeletor | null>(cache.dados);
  const [erro, setErro] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  const [aba, setAba] = useState<TipoItemOS>(semValores || os.temServico ? "peca" : "servico");
  const [busca, setBusca] = useState("");
  const idBusca = useId();

  useEffect(() => {
    let vivo = true;
    const carregar = semValores
      ? carregarCatalogoMecanicoOS().then((r) => {
          if (!("erro" in r)) catalogoMecanicoCache.dados = r;
          return r;
        })
      : carregarCatalogoOS().then((r) => {
          if (!("erro" in r)) catalogoCache.dados = r;
          return r;
        });
    carregar
      .then((r) => {
        if (!vivo) return;
        if ("erro" in r) setErro(true);
        else {
          setCatalogo(r);
          setErro(false);
        }
      })
      .catch(() => vivo && setErro(true));
    return () => {
      vivo = false;
    };
  }, [tentativa, semValores]);

  const termo = busca.trim().toLowerCase();
  const daAba = useMemo(() => (catalogo?.itens ?? []).filter((i) => i.tipo === aba), [catalogo, aba]);
  const filtrados = termo
    ? daAba.filter((i) => i.nome.toLowerCase().includes(termo) || (i.codigo ?? "").toLowerCase().includes(termo))
    : daAba;
  const maisUsados = !termo && catalogo ? catalogo.maisUsados[aba].map((id) => daAba.find((i) => i.id === id)).filter((i): i is ItemSeletor => Boolean(i)) : [];

  const avulso = (
    <button
      type="button"
      onClick={() => aoEscolher({ catalogo: null, descricao: busca.trim(), tipo: aba })}
      className="flex min-h-14 w-full items-center gap-2 rounded-md border-2 border-dashed border-borda px-4 text-left text-lg font-bold text-info-texto active:bg-superficie-2"
    >
      <Plus size={22} strokeWidth={2.5} aria-hidden className="shrink-0" />
      {semValores
        ? busca.trim()
          ? `Peça ou serviço fora do catálogo: “${busca.trim()}”`
          : "Peça ou serviço fora do catálogo"
        : busca.trim()
          ? `Item avulso: “${busca.trim()}”`
          : "Item avulso"}
    </button>
  );

  const linha = (i: ItemSeletor) => (
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
        {"precoCentavos" in i &&
          (i.precoCentavos !== null ? (
            <span className="shrink-0 font-mono text-base">{formatarCentavos(i.precoCentavos)}</span>
          ) : (
            <EtiquetaSemPreco />
          ))}
      </button>
    </li>
  );

  return (
    <div className="flex flex-col gap-4">
      {mensagem && <CaixaMensagem tipo="sucesso">{mensagem}</CaixaMensagem>}
      <div role="group" aria-label="Tipo de item" className="grid grid-cols-2 gap-2">
        {(
          [
            ["servico", "Serviços"],
            ["peca", "Peças"],
          ] as const
        ).map(([valor, rotulo]) => (
          <button
            key={valor}
            type="button"
            aria-pressed={aba === valor}
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
            <Link
              href={aba === "peca" ? "/catalogo/pecas/novo" : "/catalogo/servicos/novo"}
              className="inline-flex min-h-toque items-center font-bold text-info-texto underline"
            >
              Cadastrar no catálogo
            </Link>
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

/** Mesmo texto no navegador e na Server Action (salvarItemOS com exigir_preco). */
const ERRO_PRECO_FILA = "Digite o preço. Para deixar este para depois, toque em Pular.";

function FormItem({
  item,
  focarPreco,
  escolhido,
  envio,
  aoRemover,
  aoRascunho,
  descartarRef,
  exigirPreco = false,
}: {
  item?: ItemOSCliente;
  /** Item sem preco (ou "Definir preços"): o campo de preco ja vem com o foco. */
  focarPreco?: boolean;
  /** Folha em sequencia ("Definir preços"/"Conferir itens"): preco obrigatorio; "Pular" deixa para depois (I5). */
  exigirPreco?: boolean;
  escolhido: { catalogo: ItemCatalogoOS | null; descricao: string; tipo: TipoItemOS } | null;
  envio: ReturnType<typeof useEnvio>;
  aoRemover: () => void;
  /** Avisa a folha se ha algo digitado (fechar pede confirmacao). */
  aoRascunho: (e: { sujo: boolean; recuperado: boolean }) => void;
  descartarRef: { current: (() => void) | null };
}) {
  const { os } = useOS();
  const editando = Boolean(item);
  const cat = escolhido?.catalogo ?? null;
  const avulso = !item && !cat;
  const descricaoNova = avulso ? (escolhido?.descricao ?? "").trim() : "";
  // A chave de idempotencia vai no rascunho: reenviar o mesmo item depois de uma
  // falha de rede nao duplica. Rascunho por item (editar) ou por item do catalogo.
  const r = useRascunho(
    `item-${item?.id ?? cat?.id ?? "avulso"}`,
    {
      chave: crypto.randomUUID(),
      tipo: item?.tipo ?? escolhido?.tipo ?? "servico",
      descricao: item?.descricao ?? escolhido?.descricao ?? "",
      qtd: String(item?.quantidade ?? 1),
      preco: centavosParaCampo(item ? item.precoUnitarioCentavos : cat?.precoCentavos),
      custo: centavosParaCampo(item ? item.custoUnitarioCentavos : cat?.custoCentavos),
    },
    { digitados: ["descricao", "qtd", "preco", "custo"], fixos: descricaoNova ? { descricao: descricaoNova } : undefined },
  );
  const { chave, descricao, preco, custo } = r.v;
  const tipo = r.v.tipo as TipoItemOS;
  const unidade = item?.unidade ?? cat?.unidade ?? "un";
  const fracionada = unidadeFracionada(unidade);
  const [qtdInicial] = useState(() => {
    const n = Number(r.v.qtd);
    return Number.isFinite(n) && n > 0 ? n : 1;
  });
  const [qtd, setQtd] = useState<number | null>(qtdInicial);
  const setTipo = (t: TipoItemOS) => r.mudar("tipo", t);
  const setDescricao = (t: string) => r.mudar("descricao", t);
  const setPreco = (t: string) => r.mudar("preco", t);
  const setCusto = (t: string) => r.mudar("custo", t);
  const { sujo, recuperado, limpar } = r;

  useEffect(() => {
    aoRascunho({ sujo, recuperado });
  }, [sujo, recuperado, aoRascunho]);
  useEffect(() => {
    descartarRef.current = limpar;
  });
  useEffect(
    () => () => {
      aoRascunho({ sujo: false, recuperado: false });
      descartarRef.current = null;
    },
    [aoRascunho, descartarRef],
  );

  // Item sem preco: o campo de preco ja vem marcado. Depois do showModal da Folha
  // (ele foca o 1o elemento), por isso no proximo ciclo.
  const campoPreco = useRef<HTMLInputElement>(null);
  const [focarAoAbrir] = useState(() => Boolean(focarPreco) && !preco);
  useEffect(() => {
    if (!focarAoAbrir) return;
    const t = window.setTimeout(() => campoPreco.current?.focus({ preventScroll: true }), 0);
    return () => window.clearTimeout(t);
  }, [focarAoAbrir]);

  const precoCent = reaisParaCentavos(preco);
  const subtotal = qtd !== null && typeof precoCent === "number" && !Number.isNaN(precoCent) ? Math.round(qtd * precoCent) : null;
  const ehPeca = tipo === "peca";

  return (
    <form
      id="form-item-os"
      onSubmit={(e) => {
        if (exigirPreco && !preco.trim()) {
          e.preventDefault();
          envio.setEstado({ campos: { preco: ERRO_PRECO_FILA } });
          focarPrimeiroErro(e.currentTarget);
          return;
        }
        envio.enviar(e);
      }}
      noValidate
      className="flex flex-col gap-5"
    >
      {exigirPreco && <input type="hidden" name="exigir_preco" value="1" />}
      {item?.lancadoPorNome && (
        <p className="-mt-1 text-sm text-texto-suave">
          Lançado por {primeiroNome(item.lancadoPorNome)}
          {item.criadoEm ? ` em ${formatarDiaHora(item.criadoEm)}` : ""}
          {item.aposAprovacao && os.modo === "com_orcamento" ? " · depois da aprovação" : ""}
        </p>
      )}
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
        valorInicial={qtdInicial}
        minimo={fracionada ? 0.1 : 1}
        decimal={fracionada}
        unidade={textoUnidade(unidade)}
        aoMudar={(n) => {
          setQtd(n);
          if (n !== null) r.mudar("qtd", String(n));
        }}
        erro={envio.campos.quantidade}
      />

      <Campo
        rotulo="Preço unitário (R$)"
        name="preco"
        ref={campoPreco}
        inputMode="decimal"
        autoComplete="off"
        placeholder="0,00"
        className="font-mono"
        value={preco}
        onChange={(e) => setPreco(e.target.value.replace(/[^\d.,]/g, ""))}
        ajuda={
          cat && cat.precoCentavos !== null
            ? `Preço do catálogo: ${formatarCentavos(cat.precoCentavos)}.`
            : exigirPreco
              ? undefined
              : "Pode deixar vazio: o item fica “Sem preço”."
        }
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

// =================================================================== mecanico: itens (F3-B3, DESIGN §11.3)

/** "Lançar serviço ou peça" (secundario, largura total, abaixo da lista do mecanico). */
export function BotaoLancarItem() {
  const { abrir } = useOS();
  return (
    <Botao variante="secundario" onClick={() => abrir({ tipo: "lancar" })}>
      <Plus size={24} strokeWidth={2.25} aria-hidden />
      Lançar serviço ou peça
    </Botao>
  );
}

/**
 * Lista do mecanico, sem valores: item dele que ainda pode mexer vira botao
 * ("Você lançou" + chevron); o que o balcao ja conferiu fica "Conferido pelo balcão".
 */
export function ListaItensMecanico() {
  const { os, abrir } = useOS();
  const itens = [...(os.itensMecanico ?? [])].sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === "servico" ? -1 : 1));
  return (
    <ListaItensOS rotulo="Serviços e peças">
      {itens.map((i) => (
        <LinhaItemOS
          key={i.id}
          semValores
          aoTocar={i.podeAlterar ? () => abrir({ tipo: "item-mecanico", item: i }) : undefined}
          etiquetas={i.conferido ? <EtiquetaConferido /> : i.meu ? <EtiquetaVoceLancou /> : undefined}
          item={{ tipo: i.tipo, descricao: i.descricao, quantidade: i.quantidade, unidade: textoUnidade(i.unidade) }}
        />
      ))}
    </ListaItensOS>
  );
}

function FolhaItemMecanico({ aoFechar, item }: { aoFechar: () => void; item?: ItemMecanico }) {
  const { os, mostrarErro } = useOS();
  // Com a confirmacao de remover aberta, so uma decisao na tela: o rodape some (M7 do F3-R1).
  const [removendo, setRemovendo] = useState(false);
  const [escolhido, setEscolhido] = useState<Escolhido | null>(null);
  const [lancados, setLancados] = useState(0);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const editando = Boolean(item);
  const passo2 = editando || escolhido;
  const [rasc, setRasc] = useState({ sujo: false, recuperado: false });
  const descartarRef = useRef<(() => void) | null>(null);
  const envio = useEnvio(
    editando ? alterarItemMecanicoOS : lancarItemMecanicoOS,
    editando
      ? "Não foi possível salvar o item. Nada foi perdido: confira a internet e toque de novo."
      : "Não foi possível lançar. Nada foi perdido: confira a internet e toque de novo.",
    (r) => {
      descartarRef.current?.();
      if (editando) {
        aoFechar();
        return;
      }
      setLancados((n) => n + 1);
      setMensagem(r?.mensagem ?? "Item lançado.");
      setEscolhido(null);
      return "limpar";
    },
    // A OS mudou, passou para outro mecanico ou o balcao conferiu: fecha guardando o rascunho.
    (r) => {
      aoFechar();
      if (r?.erro) mostrarErro(r.erro);
    },
  );

  const titulo = editando ? "Editar item" : escolhido ? escolhido.descricao || "Fora do catálogo" : `Lançar na OS #${os.numero}`;

  return (
    <Folha
      aberta
      aoFechar={aoFechar}
      titulo={titulo}
      sujo={rasc.sujo}
      recuperado={rasc.recuperado}
      aoDescartar={() => descartarRef.current?.()}
      rodape={
        removendo ? undefined : passo2 ? (
          <BotaoForm
            form="form-item-mecanico"
            enviando={envio.enviando}
            rotulo={editando ? "Salvar item" : "Lançar na OS"}
            rotuloEnviando={editando ? "Salvando…" : "Lançando…"}
          />
        ) : lancados > 0 ? (
          <Botao variante="secundario" onClick={aoFechar}>
            Concluir
          </Botao>
        ) : undefined
      }
    >
      {escolhido && !editando && (
        <button
          type="button"
          onClick={() => {
            setEscolhido(null);
            envio.setEstado(null);
          }}
          className="-mt-2 mb-2 inline-flex min-h-toque items-center text-base font-bold text-info-texto underline underline-offset-4"
        >
          ← Escolher outro
        </button>
      )}
      {passo2 ? (
        <FormItemMecanico
          item={item}
          escolhido={escolhido}
          envio={envio}
          aoRemover={() => {
            descartarRef.current?.();
            aoFechar();
          }}
          aoRascunho={setRasc}
          descartarRef={descartarRef}
          aoConfirmarRemover={setRemovendo}
        />
      ) : (
        <SeletorItem
          semValores
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

/** Passo 2 do mecanico: o que e (fora do catalogo), servico/peca e quantidade. Nenhum campo de valor. */
function FormItemMecanico({
  item,
  escolhido,
  envio,
  aoRemover,
  aoRascunho,
  descartarRef,
  aoConfirmarRemover,
}: {
  item?: ItemMecanico;
  escolhido: Escolhido | null;
  envio: ReturnType<typeof useEnvio>;
  aoRemover: () => void;
  aoRascunho: (e: { sujo: boolean; recuperado: boolean }) => void;
  descartarRef: { current: (() => void) | null };
  /** A confirmacao de remover abriu/fechou (a folha esconde o "Salvar item", M7 do F3-R1). */
  aoConfirmarRemover?: (aberta: boolean) => void;
}) {
  const { os } = useOS();
  const editando = Boolean(item);
  const cat = escolhido?.catalogo ?? null;
  const novoAvulso = !item && !cat;
  const comDescricao = novoAvulso || Boolean(item?.avulso);
  const descricaoNova = novoAvulso ? (escolhido?.descricao ?? "").trim() : "";
  // Chave de idempotencia no rascunho: reenviar depois de uma falha de rede nao duplica.
  const r = useRascunho(
    `mec-item-${item?.id ?? cat?.id ?? "avulso"}`,
    {
      chave: crypto.randomUUID(),
      tipo: item?.tipo ?? escolhido?.tipo ?? "peca",
      descricao: item?.descricao ?? escolhido?.descricao ?? "",
      qtd: String(item?.quantidade ?? 1),
    },
    { digitados: ["descricao", "qtd"], fixos: descricaoNova ? { descricao: descricaoNova } : undefined },
  );
  const { chave, descricao } = r.v;
  const tipo = r.v.tipo as TipoItemOS;
  const unidade = item?.unidade ?? cat?.unidade ?? "un";
  const fracionada = unidadeFracionada(unidade);
  const [qtdInicial] = useState(() => {
    const n = Number(r.v.qtd);
    return Number.isFinite(n) && n > 0 ? n : 1;
  });
  const { sujo, recuperado, limpar } = r;

  useEffect(() => {
    aoRascunho({ sujo, recuperado });
  }, [sujo, recuperado, aoRascunho]);
  useEffect(() => {
    descartarRef.current = limpar;
  });
  useEffect(
    () => () => {
      aoRascunho({ sujo: false, recuperado: false });
      descartarRef.current = null;
    },
    [aoRascunho, descartarRef],
  );

  // OS com orcamento ja aprovada: o balcao vai ver que o item entrou depois (DESIGN §11.3).
  const aposAprovacao = !editando && os.modo === "com_orcamento" && (os.status === "aprovada" || os.status === "em_andamento");

  return (
    <form id="form-item-mecanico" onSubmit={envio.enviar} noValidate className="flex flex-col gap-5">
      <input type="hidden" name="os_id" value={os.id} />
      {item && <input type="hidden" name="item_id" value={item.id} />}
      {item && <input type="hidden" name="com_descricao" value={comDescricao ? "1" : "0"} />}
      {!item && <input type="hidden" name="chave" value={chave} />}
      {!item && <input type="hidden" name="tipo" value={tipo} />}
      {cat && <input type="hidden" name="catalogo_id" value={cat.id} />}
      {!item && <input type="hidden" name="unidade" value={unidade} />}

      {comDescricao ? (
        <Campo
          rotulo="O que é?"
          name="descricao"
          value={descricao}
          onChange={(e) => r.mudar("descricao", e.target.value)}
          maxLength={200}
          autoComplete="off"
          ajuda="Ex.: anel de vedação do bico. Dica: use o microfone do teclado."
          erro={envio.campos.descricao}
        />
      ) : (
        <>
          <input type="hidden" name="descricao" value={descricao} />
          {editando && <p className="text-lg font-bold">{descricao}</p>}
        </>
      )}
      {novoAvulso && (
        <Escolha
          rotulo="É serviço ou peça?"
          name="tipo_opcao"
          valor={tipo}
          aoMudar={(t) => r.mudar("tipo", t)}
          opcoes={[
            { valor: "servico", rotulo: "Serviço" },
            { valor: "peca", rotulo: "Peça" },
          ]}
        />
      )}

      <Quantidade
        valorInicial={qtdInicial}
        minimo={fracionada ? 0.1 : 1}
        decimal={fracionada}
        unidade={textoUnidade(unidade)}
        aoMudar={(n) => {
          if (n !== null) r.mudar("qtd", String(n));
        }}
        erro={envio.campos.quantidade}
      />

      {aposAprovacao && (
        <CaixaMensagem tipo="info">O cliente já aprovou o orçamento. O balcão vai ver que este item entrou depois.</CaixaMensagem>
      )}
      {envio.estado?.erro && <CaixaMensagem tipo="erro">{envio.estado.erro}</CaixaMensagem>}
      {envio.enviando && <p role="status" className="text-sm text-texto-suave">{editando ? "Salvando…" : "Lançando…"}</p>}

      {item && (
        <ConfirmarAcao
          acao={() => removerItemMecanicoOS(os.id, item.id)}
          rotulo="Remover item"
          pergunta={`Remover “${item.descricao}” da OS #${os.numero}?`}
          rotuloConfirmar="Remover item"
          rotuloEnviando="Removendo…"
          aoConcluir={aoRemover}
          aoMudarAberto={aoConfirmarRemover}
        />
      )}
    </form>
  );
}

// =================================================================== folha: resposta do cliente

function FolhaResposta({ aoFechar, aoAprovar }: { aoFechar: () => void; aoAprovar: () => void }) {
  const { os } = useOS();
  const r = useRascunho(
    "resposta",
    { resposta: "", canal: "", quem: os.clienteNome, motivo: "", depois: "refazer" },
    { digitados: ["quem", "motivo"] },
  );
  const resposta = r.v.resposta as "aprovou" | "recusou" | "";
  const depois = r.v.depois as "refazer" | "cancelar";
  const { canal, quem, motivo } = r.v;
  const setResposta = (v: "aprovou" | "recusou" | "") => r.mudar("resposta", v);
  const setCanal = (v: string) => r.mudar("canal", v);
  const setQuem = (v: string) => r.mudar("quem", v);
  const setMotivo = (v: string | ((m: string) => string)) => r.mudar("motivo", typeof v === "function" ? v(motivo) : v);
  const setDepois = (v: "refazer" | "cancelar") => r.mudar("depois", v);
  const envio = useEnvio(registrarRespostaOS, "Não foi possível registrar a resposta. Confira a internet e tente de novo.", (res) => {
    r.limpar();
    if (res?.mensagem === "aprovou") aoAprovar();
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
      sujo={r.sujo}
      recuperado={r.recuperado}
      aoDescartar={r.limpar}
      rodape={
        <>
        {!resposta && <p className="text-sm text-texto-suave">Escolha se o cliente aprovou ou recusou.</p>}
        <BotaoForm
          form="form-resposta"
          enviando={envio.enviando}
          rotulo={rotulo}
          rotuloEnviando="Registrando…"
          variante={resposta === "recusou" && depois === "cancelar" ? "perigo" : "primario"}
          disabled={!resposta || (resposta === "aprovou" && semPreco)}
        />
        </>
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
            colunas={1}
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
            {depois === "cancelar" && (
              <p className="flex items-start gap-1.5 text-sm font-bold text-erro-texto">
                <TriangleAlert size={18} strokeWidth={2.25} aria-hidden className="mt-0.5 shrink-0" />
                A OS será cancelada e não pode ser reaberta.
              </p>
            )}
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
  const r = useRascunho("pronta", { causa: "", solucao: "" });
  const envio = useEnvio(marcarProntaOS, "Não foi possível marcar como pronta. Confira a internet e tente de novo.", () => {
    r.limpar();
    aoConcluir();
  });
  return (
    <Folha
      aberta
      aoFechar={aoFechar}
      titulo="Marcar como pronta"
      sujo={r.sujo}
      recuperado={r.recuperado}
      aoDescartar={r.limpar}
      rodape={<BotaoForm form="form-pronta" enviando={envio.enviando} rotulo="Marcar como pronta" rotuloEnviando="Enviando…" />}
    >
      <form id="form-pronta" onSubmit={envio.enviar} noValidate className="flex flex-col gap-5">
        <input type="hidden" name="os_id" value={os.id} />
        <p className="text-base">Antes de marcar, anote o que você achou. É opcional, mas ajuda no fechamento.</p>
        <AreaTexto
          rotulo="O que foi encontrado?"
          opcional
          name="causa"
          maxLength={4000}
          value={r.v.causa}
          onChange={(e) => r.mudar("causa", e.target.value)}
          erro={envio.campos.causa}
        />
        <AreaTexto
          rotulo="O que foi feito?"
          opcional
          name="solucao"
          maxLength={4000}
          value={r.v.solucao}
          onChange={(e) => r.mudar("solucao", e.target.value)}
          erro={envio.campos.solucao}
        />
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
          {!comecar && pessoa && pessoa.id === os.mecanicoId && (
            <p className="text-sm text-texto-suave">{os.mecanicoNome ?? pessoa.nome} já é o mecânico desta OS.</p>
          )}
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
          {enviando && <AvisoLento />}
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
  const r = useRascunho(
    "modo",
    { quem: os.clienteNome ? "cliente" : "outra", nome: "", tel: "" },
    { digitados: ["nome", "tel"] },
  );
  const quem = r.v.quem as "cliente" | "outra";
  const { nome, tel } = r.v;
  const setQuem = (v: "cliente" | "outra") => r.mudar("quem", v);
  const setNome = (v: string) => r.mudar("nome", v);
  const setTel = (v: string) => r.mudar("tel", v);
  const envio = useEnvio(trocarModoOS, "Não foi possível trocar o modo. Confira a internet e tente de novo.", () => {
    r.limpar();
    aoFechar();
  });
  const autorizado = quem === "cliente" ? os.clienteNome : nome.trim();

  return (
    <Folha
      aberta
      aoFechar={aoFechar}
      sujo={r.sujo}
      recuperado={r.recuperado}
      aoDescartar={r.limpar}
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
