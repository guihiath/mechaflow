"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import { Check, CircleAlert, Plus, RefreshCw, Search, TriangleAlert } from "lucide-react";
import { abrirOS, consultarPlaca, type DadosPlaca } from "@/acoes/os";
import { VeiculoEncontrado } from "@/components/os/veiculo-encontrado";
import { Botao, BotaoLink } from "@/components/ui/botao";
import { AreaTexto, Campo, Selecao } from "@/components/ui/campo";
import { Escolha } from "@/components/ui/escolha";
import { BotaoEnviar, CaixaMensagem, focarPrimeiroErro } from "@/components/ui/formulario";
import { SUGESTOES_SINTOMA, SugestoesTexto, acrescentarTexto } from "@/components/ui/sugestoes-texto";
import type { EstadoAcao } from "@/lib/acao";
import {
  formatarDiaMes,
  formatarNumero,
  formatarPlaca,
  formatarTelefone,
  normalizarPlaca,
  placaValida,
  ROTULO_TIPO_VEICULO,
} from "@/lib/formato";
import { rotuloStatus } from "@/lib/os-status";

export type PessoaEquipe = { id: string; nome: string };
type ModoCliente = "exige_orcamento" | "servico_direto";
type ClienteOpcao = { id: string; nome: string; modoPadrao: ModoCliente };
type ModoOS = "com_orcamento" | "direto";
type TipoVeiculo = keyof typeof ROTULO_TIPO_VEICULO;

const CHAVE_RASCUNHO = "mf-os-nova";
const ERRO_GERAL = "Não foi possível abrir a OS. Nada foi perdido: confira a internet e toque de novo.";
const MAX_CLIENTES = 8;

/** Tudo que o atendente digitou (volta se o PWA recarregar no meio, DESIGN §10.4). */
type Rascunho = {
  chave: string;
  placa: string;
  modo: ModoOS;
  modoTocado: boolean;
  km: string;
  horimetro: string;
  sintoma: string;
  codigo: string;
  mecanico: string;
  autorizou: "cliente" | "outra";
  autNome: string;
  autTel: string;
  clienteId: string;
  clienteNovo: boolean;
  cliNome: string;
  cliTel: string;
  cliModo: ModoCliente;
  tipo: TipoVeiculo;
  marca: string;
  modelo: string;
};

function rascunhoVazio(placa: string): Rascunho {
  return {
    chave: "",
    placa,
    modo: "com_orcamento",
    modoTocado: false,
    km: "",
    horimetro: "",
    sintoma: "",
    codigo: "",
    mecanico: "nenhum",
    autorizou: "cliente",
    autNome: "",
    autTel: "",
    clienteId: "",
    clienteNovo: false,
    cliNome: "",
    cliTel: "",
    cliModo: "exige_orcamento",
    tipo: "caminhao",
    marca: "",
    modelo: "",
  };
}

type Busca =
  | { fase: "vazio" }
  | { fase: "buscando"; placa: string }
  | { fase: "erro"; placa: string }
  | { fase: "achou"; placa: string; dados: DadosPlaca }
  | { fase: "nova"; placa: string };

const modoDoCliente = (m: ModoCliente | null | undefined): ModoOS => (m === "servico_direto" ? "direto" : "com_orcamento");
const kmParaNumero = (t: string) => (t ? Number(t.replace(/\D/g, "")) : null);

export function FormNovaOS({
  placaInicial,
  equipe,
  clientes,
}: {
  placaInicial: string;
  equipe: PessoaEquipe[];
  clientes: ClienteOpcao[];
}) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const campoPlaca = useRef<HTMLInputElement>(null);
  const sintomaRef = useRef<HTMLTextAreaElement>(null);
  const pedido = useRef(0);
  const travado = useRef(false);
  const idPlaca = useId();

  const [r, setR] = useState<Rascunho>(() => rascunhoVazio(placaInicial));
  const [placaTexto, setPlacaTexto] = useState(formatarPlaca(placaInicial));
  const [busca, setBusca] = useState<Busca>({ fase: "vazio" });
  const [montado, setMontado] = useState(false);
  const [mesmoAssim, setMesmoAssim] = useState(false);
  const [estado, setEstado] = useState<EstadoAcao>(null);
  const [enviando, iniciar] = useTransition();
  const campos = estado?.campos ?? {};

  const mudar = <K extends keyof Rascunho>(k: K, v: Rascunho[K]) => setR((atual) => ({ ...atual, [k]: v }));

  async function buscar(placa: string) {
    const id = ++pedido.current;
    setBusca({ fase: "buscando", placa });
    setMesmoAssim(false);
    try {
      const resposta = await consultarPlaca(placa);
      if (id !== pedido.current) return;
      if ("erro" in resposta) setBusca({ fase: "erro", placa });
      else if (resposta.dados) setBusca({ fase: "achou", placa, dados: resposta.dados });
      else setBusca({ fase: "nova", placa });
    } catch {
      if (id === pedido.current) setBusca({ fase: "erro", placa });
    }
  }

  // Abre: recupera o rascunho desta aba (ou comeca outro) e gera a chave de idempotencia.
  useEffect(() => {
    let inicial = rascunhoVazio(placaInicial);
    try {
      const salvo = JSON.parse(sessionStorage.getItem(CHAVE_RASCUNHO) ?? "null") as Rascunho | null;
      if (salvo?.chave && (!placaInicial || salvo.placa === placaInicial)) inicial = { ...inicial, ...salvo };
    } catch {
      /* rascunho corrompido: comeca do zero */
    }
    if (!inicial.chave) inicial.chave = crypto.randomUUID();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage so existe no navegador
    setR(inicial);
    setPlacaTexto(formatarPlaca(inicial.placa));
    setMontado(true);
    if (placaValida(inicial.placa)) void buscar(normalizarPlaca(inicial.placa));
    else campoPlaca.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- so ao abrir a tela
  }, []);

  useEffect(() => {
    if (montado) sessionStorage.setItem(CHAVE_RASCUNHO, JSON.stringify(r));
  }, [r, montado]);

  function aoDigitarPlaca(valor: string) {
    const texto = formatarPlaca(valor);
    setPlacaTexto(texto);
    const placa = normalizarPlaca(texto);
    mudar("placa", placa);
    if (placaValida(placa)) {
      if (busca.fase === "vazio" || ("placa" in busca && busca.placa !== placa)) void buscar(placa);
    } else if (busca.fase !== "vazio") {
      pedido.current++;
      setBusca({ fase: "vazio" });
    }
  }

  function trocarPlaca() {
    pedido.current++;
    setBusca({ fase: "vazio" });
    setPlacaTexto("");
    mudar("placa", "");
    setMesmoAssim(false);
    requestAnimationFrame(() => campoPlaca.current?.focus());
  }

  // ------------------------------------------------------------ derivados
  const dados = busca.fase === "achou" ? busca.dados : null;
  const placaNova = busca.fase === "nova";
  const clienteEscolhido = placaNova && !r.clienteNovo ? clientes.find((c) => c.id === r.clienteId) : undefined;
  const nomeCliente = dados?.clienteNome ?? (r.clienteNovo ? r.cliNome.trim() : clienteEscolhido?.nome) ?? "";
  const modoPadrao: ModoOS = dados
    ? modoDoCliente(dados.clienteModoPadrao)
    : r.clienteNovo
      ? modoDoCliente(r.cliModo)
      : modoDoCliente(clienteEscolhido?.modoPadrao);
  const modo: ModoOS = r.modoTocado ? r.modo : modoPadrao;
  const temOsAberta = Boolean(dados?.osAberta) && !mesmoAssim;
  const resolvida = (busca.fase === "achou" || placaNova) && !temOsAberta;
  const kmDigitado = kmParaNumero(r.km);
  const kmMenor = dados?.ultimoKm != null && kmDigitado !== null && kmDigitado < dados.ultimoKm;
  const autorizadoNome = r.autorizou === "cliente" && nomeCliente ? nomeCliente : r.autNome.trim();

  function aoEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (enviando || travado.current || !resolvida || !r.chave) return;
    travado.current = true;
    const fd = new FormData(evento.currentTarget);
    iniciar(async () => {
      try {
        const resposta = await abrirOS(null, fd);
        if (resposta?.ok && resposta.dados?.os_id) {
          sessionStorage.removeItem(CHAVE_RASCUNHO);
          router.replace(`/os/${resposta.dados.os_id}?aberta=${resposta.dados.numero}`);
          return;
        }
        setEstado(resposta);
        if (resposta?.dados?.recarregarPlaca && "placa" in busca) void buscar(busca.placa);
        if (resposta?.campos) focarPrimeiroErro(form.current);
      } catch {
        setEstado({ erro: ERRO_GERAL });
      } finally {
        travado.current = false;
      }
    });
  }

  const opcoesMecanico = [{ valor: "nenhum", rotulo: "Decidir depois" }, ...equipe.map((p) => ({ valor: p.id, rotulo: p.nome }))];

  return (
    <form ref={form} onSubmit={aoEnviar} noValidate className="flex flex-col gap-6">
      <input type="hidden" name="chave" value={r.chave} />
      <input type="hidden" name="placa" value={r.placa} />
      {dados && <input type="hidden" name="veiculo_id" value={dados.veiculoId} />}

      {/* ---------------------------------------------------- Bloco 1: placa */}
      {busca.fase !== "achou" ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={idPlaca} className="text-sm font-bold">
            Placa
          </label>
          <div className="flex gap-2">
            <input
              id={idPlaca}
              ref={campoPlaca}
              value={placaTexto}
              onChange={(e) => aoDigitarPlaca(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (placaValida(placaTexto)) void buscar(normalizarPlaca(placaTexto));
                }
              }}
              enterKeyHint="search"
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              maxLength={8}
              placeholder="ABC1D23"
              aria-describedby={`${idPlaca}-ajuda`}
              className="h-[52px] min-w-0 flex-1 rounded-md border-2 border-borda bg-superficie px-3 font-mono text-2xl tracking-[0.08em] uppercase outline-none focus:border-foco focus:ring-[3px] focus:ring-foco/30"
            />
            <button
              type="button"
              onClick={() => placaValida(placaTexto) && buscar(normalizarPlaca(placaTexto))}
              className="flex h-[52px] shrink-0 items-center gap-2 rounded-md border-2 border-borda bg-superficie px-4 text-lg font-bold active:bg-superficie-2"
            >
              <Search size={22} strokeWidth={2.25} aria-hidden />
              Buscar
            </button>
          </div>
          <p id={`${idPlaca}-ajuda`} className="text-sm text-texto-suave">
            Antiga (ABC-1234) ou Mercosul (ABC1D23).
          </p>
        </div>
      ) : null}

      {busca.fase === "buscando" && (
        <div className="flex flex-col gap-2">
          <p role="status" className="text-base text-texto-suave">
            Procurando {formatarPlaca(busca.placa)}…
          </p>
          <div aria-hidden className="h-32 animate-pulse rounded-lg border border-borda-sutil bg-superficie" />
        </div>
      )}

      {busca.fase === "erro" && (
        <div role="alert" className="flex flex-col gap-3 rounded-md border-l-4 border-erro bg-superficie p-4">
          <div className="flex items-start gap-3">
            <CircleAlert size={24} strokeWidth={2.25} aria-hidden className="mt-0.5 shrink-0 text-erro-texto" />
            <div>
              <p className="text-lg font-bold">Não foi possível buscar a placa.</p>
              <p className="text-base text-texto-suave">Confira a internet e tente de novo.</p>
            </div>
          </div>
          <Botao variante="secundario" onClick={() => buscar(busca.placa)}>
            <RefreshCw size={22} strokeWidth={2.25} aria-hidden />
            Tentar de novo
          </Botao>
        </div>
      )}

      {/* ---------------------------------------------------- Bloco 2a: placa conhecida */}
      {dados && (
        <>
          <VeiculoEncontrado
            aoTrocarPlaca={trocarPlaca}
            dados={{
              placa: dados.placa,
              veiculo: dados.veiculo,
              cliente: { nome: dados.clienteNome, telefone: dados.clienteTelefone },
              ultimoKm: dados.ultimoKm,
              ultimoKmEm: dados.ultimoKmEm,
              ultimoServico: dados.ultimaOs
                ? { numero: dados.ultimaOs.numero, em: dados.ultimaOs.em, resumo: dados.ultimaOs.resumo, href: `/os/${dados.ultimaOs.id}` }
                : null,
            }}
          />
          {dados.osAberta && !mesmoAssim && (
            <div className="flex flex-col gap-3">
              <CaixaMensagem tipo="alerta">
                {formatarPlaca(dados.placa)} já tem a OS #{dados.osAberta.numero} aberta ({rotuloStatus(dados.osAberta.status)}).
              </CaixaMensagem>
              <BotaoLink href={`/os/${dados.osAberta.id}`} variante="secundario">
                Abrir a OS #{dados.osAberta.numero}
              </BotaoLink>
              <button
                type="button"
                onClick={() => setMesmoAssim(true)}
                className="inline-flex min-h-toque items-center self-start text-base font-bold text-info-texto underline underline-offset-4"
              >
                Abrir outra OS mesmo assim
              </button>
            </div>
          )}
        </>
      )}

      {/* ---------------------------------------------------- Bloco 2b: placa nova */}
      {placaNova && (
        <section aria-labelledby={`${idPlaca}-nova`} className="flex flex-col gap-5">
          <h2 id={`${idPlaca}-nova`} className="text-xl">
            {formatarPlaca(busca.placa)} é nova na oficina
          </h2>
          <EscolherClienteOS
            clientes={clientes}
            selecionado={r.clienteId}
            clienteNovo={r.clienteNovo}
            erro={campos.cliente_id}
            aoEscolher={(id) => setR((a) => ({ ...a, clienteId: id, clienteNovo: false }))}
            aoClienteNovo={() => setR((a) => ({ ...a, clienteId: "", clienteNovo: true }))}
          />
          <input type="hidden" name="cliente_id" value={r.clienteNovo ? "" : r.clienteId} />
          <input type="hidden" name="cliente_novo" value={r.clienteNovo ? "1" : ""} />

          {r.clienteNovo && (
            <div className="flex flex-col gap-4 rounded-lg border-2 border-borda-sutil p-4">
              <Campo
                rotulo="Nome do cliente"
                name="cliente_nome"
                value={r.cliNome}
                onChange={(e) => mudar("cliNome", e.target.value)}
                autoComplete="off"
                maxLength={120}
                erro={campos.cliente_nome}
              />
              <Campo
                rotulo="Telefone"
                opcional
                name="cliente_telefone"
                type="tel"
                inputMode="tel"
                autoComplete="off"
                placeholder="(11) 98888-7777"
                value={r.cliTel}
                onChange={(e) => mudar("cliTel", formatarTelefone(e.target.value))}
                erro={campos.cliente_telefone}
              />
              <Escolha
                rotulo="Este cliente costuma"
                name="cliente_modo_padrao"
                valor={r.cliModo}
                aoMudar={(v) => mudar("cliModo", v)}
                opcoes={[
                  { valor: "exige_orcamento", rotulo: "Pedir orçamento antes" },
                  { valor: "servico_direto", rotulo: "Autorizar direto" },
                ]}
              />
            </div>
          )}

          <Escolha
            rotulo="Tipo"
            name="veiculo_tipo"
            valor={r.tipo}
            aoMudar={(v) => mudar("tipo", v)}
            colunas={2}
            opcoes={(Object.keys(ROTULO_TIPO_VEICULO) as TipoVeiculo[]).map((t) => ({ valor: t, rotulo: ROTULO_TIPO_VEICULO[t] }))}
          />
          <div className="grid grid-cols-2 gap-3">
            <Campo
              rotulo="Marca"
              opcional
              name="veiculo_marca"
              value={r.marca}
              onChange={(e) => mudar("marca", e.target.value)}
              maxLength={60}
              autoComplete="off"
            />
            <Campo
              rotulo="Modelo"
              opcional
              name="veiculo_modelo"
              value={r.modelo}
              onChange={(e) => mudar("modelo", e.target.value)}
              maxLength={80}
              autoComplete="off"
            />
          </div>
          <p className="-mt-3 text-sm text-texto-suave">Ano, chassi e o resto você completa depois no cadastro do veículo.</p>
          <button
            type="button"
            onClick={trocarPlaca}
            className="inline-flex min-h-toque items-center self-start text-base font-bold text-info-texto underline underline-offset-4"
          >
            Trocar placa
          </button>
        </section>
      )}

      {/* ---------------------------------------------------- Bloco 3: atendimento */}
      {resolvida && (
        <section aria-label="Atendimento" className="flex flex-col gap-6">
          <Escolha
            rotulo="Como vai ser o serviço?"
            name="modo"
            valor={modo}
            aoMudar={(v) => setR((a) => ({ ...a, modo: v, modoTocado: true }))}
            opcoes={[
              { valor: "com_orcamento", rotulo: "Com orçamento" },
              { valor: "direto", rotulo: "Serviço direto" },
            ]}
            ajuda={
              dados || clienteEscolhido || r.clienteNovo
                ? modoPadrao === "direto"
                  ? "Padrão do cliente: autoriza direto."
                  : "Padrão do cliente: pede orçamento antes."
                : undefined
            }
            erro={campos.modo}
          />

          <div className="flex flex-col gap-1.5">
            <Campo
              rotulo="KM atual"
              name="km"
              inputMode="numeric"
              autoComplete="off"
              className="font-mono"
              value={r.km}
              onChange={(e) => {
                const d = e.target.value.replace(/\D/g, "").slice(0, 10);
                mudar("km", d ? formatarNumero(Number(d)) : "");
              }}
              ajuda={dados?.ultimoKm != null ? `Último: ${formatarNumero(dados.ultimoKm)} km${dados.ultimoKmEm ? ` em ${formatarDiaMes(dados.ultimoKmEm)}` : ""}.` : undefined}
              erro={campos.km}
            />
            {kmMenor && (
              <p className="flex items-start gap-1.5 text-sm font-bold text-alerta-texto">
                <TriangleAlert size={18} strokeWidth={2.25} aria-hidden className="mt-0.5 shrink-0" />
                Menor que o último KM ({formatarNumero(dados?.ultimoKm)}). Confira antes de abrir.
              </p>
            )}
          </div>

          {dados?.temHorimetro && (
            <Campo
              rotulo="Horímetro"
              opcional
              name="horimetro"
              inputMode="numeric"
              autoComplete="off"
              className="font-mono"
              value={r.horimetro}
              onChange={(e) => {
                const d = e.target.value.replace(/\D/g, "").slice(0, 10);
                mudar("horimetro", d ? formatarNumero(Number(d)) : "");
              }}
              erro={campos.horimetro}
            />
          )}

          <div className="flex flex-col gap-2">
            <SugestoesTexto
              rotulo="Sugestões de sintoma"
              sugestoes={SUGESTOES_SINTOMA}
              aoEscolher={(s) => setR((a) => ({ ...a, sintoma: acrescentarTexto(a.sintoma, s) }))}
            />
            <AreaTexto
              ref={sintomaRef}
              rotulo="O que o cliente relatou?"
              name="sintoma"
              value={r.sintoma}
              onChange={(e) => mudar("sintoma", e.target.value)}
              maxLength={2000}
              ajuda="Dica: toque no microfone do teclado para falar em vez de digitar."
              erro={campos.sintoma}
            />
          </div>

          <Campo
            rotulo="Código de falha do painel"
            opcional
            name="codigo_falha"
            autoComplete="off"
            autoCapitalize="characters"
            className="font-mono uppercase"
            value={r.codigo}
            onChange={(e) => mudar("codigo", e.target.value.toUpperCase())}
            maxLength={200}
            ajuda="SPN/FMI. Ex.: 100/1. Pode deixar em branco."
            erro={campos.codigo_falha}
          />

          <input type="hidden" name="mecanico_id" value={r.mecanico === "nenhum" ? "" : r.mecanico} />
          {opcoesMecanico.length <= 5 ? (
            <Escolha
              rotulo="Quem vai fazer?"
              name="mecanico_opcao"
              valor={r.mecanico}
              aoMudar={(v) => mudar("mecanico", v)}
              colunas={2}
              opcoes={opcoesMecanico}
              erro={campos.mecanico_id}
            />
          ) : (
            <Selecao
              rotulo="Quem vai fazer?"
              value={r.mecanico}
              onChange={(e) => mudar("mecanico", e.target.value)}
              opcoes={opcoesMecanico}
              erro={campos.mecanico_id}
            />
          )}

          {modo === "direto" && (
            <div className="flex flex-col gap-4 border-l-4 border-info pl-4">
              <div>
                <h2 className="text-xl">Quem autorizou o serviço?</h2>
                <p className="text-sm text-texto-suave">Fica registrado com data e hora, como prova se houver dúvida depois.</p>
              </div>
              <Escolha
                rotulo="Quem autorizou"
                rotuloOculto
                name="autorizou"
                valor={nomeCliente ? r.autorizou : "outra"}
                aoMudar={(v) => mudar("autorizou", v)}
                opcoes={[
                  { valor: "cliente", rotulo: nomeCliente || "Cliente", desabilitado: !nomeCliente },
                  { valor: "outra", rotulo: "Outra pessoa" },
                ]}
                erro={r.autorizou === "cliente" && nomeCliente ? campos.autorizado_nome : undefined}
              />
              {(r.autorizou === "outra" || !nomeCliente) && (
                <>
                  <Campo
                    rotulo="Nome de quem autorizou"
                    value={r.autNome}
                    onChange={(e) => mudar("autNome", e.target.value)}
                    placeholder="Ex.: Carlos, motorista"
                    maxLength={120}
                    autoComplete="off"
                    erro={campos.autorizado_nome}
                  />
                  <Campo
                    rotulo="Telefone de quem autorizou"
                    opcional
                    name="autorizado_telefone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="off"
                    placeholder="(11) 98888-7777"
                    value={r.autTel}
                    onChange={(e) => mudar("autTel", formatarTelefone(e.target.value))}
                    erro={campos.autorizado_telefone}
                  />
                </>
              )}
              <input type="hidden" name="autorizado_nome" value={autorizadoNome} />
            </div>
          )}
        </section>
      )}

      {/* ---------------------------------------------------- rodape fixo */}
      <div aria-hidden className="h-[calc(5.5rem+env(safe-area-inset-bottom))] lg:hidden" />
      <div className="fixed inset-x-0 bottom-0 z-50 flex flex-col gap-2 border-t-2 border-borda-sutil bg-superficie px-4 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-barra lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
        {estado?.erro && <CaixaMensagem tipo="erro">{estado.erro}</CaixaMensagem>}
        {!resolvida && busca.fase !== "buscando" && (
          <p className="text-sm text-texto-suave">
            {temOsAberta ? "Abra a OS que já existe ou toque em “Abrir outra OS mesmo assim”." : "Digite a placa para continuar."}
          </p>
        )}
        <BotaoEnviar
          enviando={enviando}
          disabled={!resolvida || !r.chave}
          rotulo={modo === "direto" ? "Abrir OS e começar serviço" : "Abrir OS e montar orçamento"}
          rotuloEnviando="Abrindo OS…"
        />
      </div>
    </form>
  );
}

/** Lista de clientes com busca e "+ Cliente novo" fixo no topo (DESIGN §10.4, placa nova). */
function EscolherClienteOS({
  clientes,
  selecionado,
  clienteNovo,
  erro,
  aoEscolher,
  aoClienteNovo,
}: {
  clientes: ClienteOpcao[];
  selecionado: string;
  clienteNovo: boolean;
  erro?: string;
  aoEscolher: (id: string) => void;
  aoClienteNovo: () => void;
}) {
  const id = useId();
  const [busca, setBusca] = useState("");
  const { filtrados, total } = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const lista = termo ? clientes.filter((c) => c.nome.toLowerCase().includes(termo)) : clientes;
    return { filtrados: lista.slice(0, MAX_CLIENTES), total: lista.length };
  }, [busca, clientes]);
  const classeItem = "flex min-h-14 w-full items-center gap-2 px-4 text-left text-lg";

  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={erro ? `${id}-erro` : undefined}>
      <legend className="mb-1.5 text-sm font-bold">De quem é o veículo?</legend>
      <div className="relative">
        <label htmlFor={id} className="sr-only">
          Nome do cliente
        </label>
        <Search size={22} aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-texto-suave" />
        <input
          id={id}
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (filtrados.length === 1) aoEscolher(filtrados[0].id);
            }
          }}
          enterKeyHint="search"
          placeholder="Nome do cliente"
          autoComplete="off"
          aria-invalid={erro ? true : undefined}
          data-invalido={erro ? "true" : undefined}
          className={`h-[52px] w-full rounded-md border-2 bg-superficie pr-3 pl-11 text-lg outline-none focus:border-foco focus:ring-[3px] focus:ring-foco/30 ${
            erro ? "border-erro" : "border-borda"
          }`}
        />
      </div>
      <ul className="flex flex-col overflow-hidden rounded-md border border-borda-sutil bg-superficie">
        <li className="border-b border-borda-sutil">
          <button
            type="button"
            onClick={aoClienteNovo}
            aria-pressed={clienteNovo}
            className={`${classeItem} font-bold ${clienteNovo ? "bg-primaria text-primaria-texto" : "text-info-texto active:bg-superficie-2"}`}
          >
            {clienteNovo ? <Check size={20} strokeWidth={2.5} aria-hidden /> : <Plus size={20} strokeWidth={2.5} aria-hidden />}
            Cliente novo
          </button>
        </li>
        {filtrados.map((c) => {
          const ativo = !clienteNovo && c.id === selecionado;
          return (
            <li key={c.id} className="border-b border-borda-sutil last:border-b-0">
              <button
                type="button"
                onClick={() => aoEscolher(c.id)}
                aria-pressed={ativo}
                className={`${classeItem} ${ativo ? "bg-primaria font-bold text-primaria-texto" : "active:bg-superficie-2"}`}
              >
                {ativo && <Check size={20} strokeWidth={2.5} aria-hidden />}
                {c.nome}
              </button>
            </li>
          );
        })}
        {busca.trim() && !filtrados.length && <li className="p-4 text-base text-texto-suave">Nenhum cliente com esse nome.</li>}
        {total > MAX_CLIENTES && (
          <li className="p-3 text-sm text-texto-suave">
            Mostrando {MAX_CLIENTES} de {total}. Digite o nome para achar os outros.
          </li>
        )}
      </ul>
      {erro && (
        <p id={`${id}-erro`} className="flex items-start gap-1.5 text-sm font-bold text-erro-texto">
          <CircleAlert size={18} strokeWidth={2.25} aria-hidden className="mt-0.5 shrink-0" />
          {erro}
        </p>
      )}
    </fieldset>
  );
}
