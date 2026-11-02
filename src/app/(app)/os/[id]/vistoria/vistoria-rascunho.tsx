"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type MouseEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Camera, Images, Lock, Plus, Trash2 } from "lucide-react";
import { AjudaCamera } from "@/components/fotos/ajuda-camera";
import { useFila, useSemInternet } from "@/components/fotos/usar-fila";
import { Cabecalho } from "@/components/layout/cabecalho";
import { BarraAcoesOS } from "@/components/os/barra-acoes-os";
import { AvisoDesfazer } from "@/components/ui/aviso-desfazer";
import { Botao, classesBotaoArquivo } from "@/components/ui/botao";
import { Campo } from "@/components/ui/campo";
import { Escolha } from "@/components/ui/escolha";
import { Cartao, Pagina } from "@/components/ui/estados";
import { Folha } from "@/components/ui/folha";
import { CaixaMensagem } from "@/components/ui/formulario";
import { CampoAssinatura, type ResultadoAssinatura } from "@/components/vistoria/campo-assinatura";
import { CamposAvaria, ListaAvarias, type DadosAvaria, type FotoAvaria } from "@/components/vistoria/cartao-avaria";
import { LinhaPasso, PassosVistoria, PASSOS_VISTORIA, type EstadoPasso, type EstadoSalvo, type NumeroPasso } from "@/components/vistoria/passos-vistoria";
import { PreviaAssinatura } from "@/components/vistoria/previa-assinatura";
import { exportarAssinatura, temTraco, type DadosAssinatura } from "@/lib/assinatura";
import { EH_PRODUCAO } from "@/lib/brand";
import { traduzirErro } from "@/lib/erros";
import {
  formatarDiaHora,
  formatarNumero,
  LIMITE_FOTOS_AVARIA,
  LIMITE_FOTOS_VISTORIA,
  MOTIVOS_SEM_ASSINATURA,
  ROTULO_LADO_AVARIA,
  ROTULO_MOTIVO_SEM_ASSINATURA,
  type LadoAvaria,
  type MotivoSemAssinatura,
  type NivelCombustivel,
  type SituacaoItemVistoria,
} from "@/lib/formato";
import { aquecerConexao, ErroEnvio, novoIdFoto } from "@/lib/fotos/enviar";
import {
  adicionarArquivos,
  aguardarAvaria,
  aoConfirmarFoto,
  definirTipo,
  descartar,
  iniciarFila,
  lerFila,
  liberarAvaria,
  tentarDeNovo,
  type ItemFila,
} from "@/lib/fotos/fila";
import { BUCKET_VISTORIAS } from "@/lib/fotos/regras";
import { createClient } from "@/lib/supabase/client";
import { concluirVistoria, enviarAssinatura, guardarDiagVistoria } from "@/lib/vistoria/envio";
import { apagarRascunho, expirarRascunhos, gravarRascunho, lerRascunho, type Parte, type RascunhoVistoria } from "@/lib/vistoria/rascunho";
import {
  erroHorimetro,
  erroKm,
  lerInteiro,
  LIMITE_OUTROS_OBJETOS,
  MiniaturaVistoria,
  OBJETOS_VISTORIA,
  PassoChecklist,
  PassoEntrada,
  PassoPainelObjetos,
  ResumoVistoria,
  type FotoTela,
  type ItemTela,
} from "./passos";

// ------------------------------------------------------------ dados vindos do servidor

export type FotoServidor = { id: string; caminho: string; caminhoMiniatura: string; src: string | null; enviada: boolean };
export type AvariaServidor = { id: string; lado: LadoAvaria; descricao: string | null; fotos: FotoServidor[] };
export type ItemServidor = { id: string; descricao: string; situacao: SituacaoItemVistoria | null; observacao: string };
export type VistoriaServidor = {
  id: string;
  podeEditar: boolean;
  criadoPorId: string | null;
  criadoPorNome: string | null;
  criadoEm: string | null;
  /** KM/horímetro vivos da OS (rascunho). */
  km: number | null;
  horimetro: number | null;
  kmVeiculo: number | null;
  horimetroVeiculo: number | null;
  combustivel: NivelCombustivel | null;
  objetos: string[] | null;
  observacoes: string | null;
  semAvarias: boolean;
  assinadoPorNome: string | null;
  assinaturaId: string | null;
  assinaturaUrl: string | null;
  /** Só dono/atendente (atalho no nome de quem assina). */
  autorizadoPorNome: string | null;
  qtdFotos: number;
};

/** Assinatura feita neste aparelho (PNG na memória; os traços ficam no rascunho). */
type AssinaturaLocal = {
  id: string;
  blob: Blob;
  url: string;
  largura: number;
  altura: number;
  dados: DadosAssinatura;
  envio: "pendente" | "enviando" | "enviada" | "falhou";
  nomeEnviado: string | null;
  erro?: string;
};

const ANDANDO = new Set<ItemFila["estado"]>(["preparando", "na_fila", "enviando"]);
const PENDENTE_SAIR = new Set<ItemFila["estado"]>(["preparando", "na_fila", "enviando", "sem_internet"]);
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MSG_REDE = "Sem conexão com o servidor. Confira a internet e tente de novo.";
const ehRede = (m: string) => m === "rede" || /failed to fetch|load failed|network|fetch failed/i.test(m);

/** Erros em que tentar de novo não adianta: a vistoria ou a OS mudou por fora (DESIGN §12.14). */
const TEXTO_BLOQUEIO: Record<string, string> = {
  vistoria_concluida: "Esta vistoria já foi concluída e não pode ser mudada. Use Complementar.",
  vistoria_anulada: "Esta vistoria foi anulada pelo dono. Comece outra pela OS.",
  vistoria_nao_encontrada: "Esta vistoria não está mais disponível. Comece outra pela OS.",
  os_fechada: "Esta OS foi cancelada ou entregue enquanto você fazia a vistoria. Não dá mais para concluir.",
  os_nao_encontrada: "Esta OS não está mais disponível.",
  acesso_negado: "Esta OS passou para outra pessoa. O que você fez ficou salvo; o balcão pode terminar.",
};

/** Ordem do envio: itens antes do "resto ok" (senão ele marcaria como ok o que virou problema). */
function ordemParte(p: Parte): number {
  if (p.startsWith("item:")) return 0;
  if (p.startsWith("avaria:")) return 6;
  return { entrada: 1, objetos: 2, observacoes: 3, nome: 4, sem_avarias: 5, resto_ok: 7 }[p as string] ?? 5;
}

/**
 * Banco -> tela. null = não informado; [] = "Nenhum objeto" (só quando o banco tem a lista vazia).
 * Só texto em "Outros" deixa os chips em null: apagar o texto volta a "não informado", em vez de
 * virar "Nenhum objeto" sem ninguém ter escolhido.
 */
function separarObjetos(arr: string[] | null): { objetos: string[] | null; outros: string } {
  if (!arr) return { objetos: null, outros: "" };
  if (arr.length === 0) return { objetos: [], outros: "" };
  const chips = arr.filter((o) => (OBJETOS_VISTORIA as readonly string[]).includes(o));
  return { objetos: chips.length ? chips : null, outros: arr.filter((o) => !chips.includes(o)).join(", ") };
}

function doServidor(v: VistoriaServidor, itens: ItemServidor[], passo: NumeroPasso): RascunhoVistoria {
  const { objetos, outros } = separarObjetos(v.objetos);
  return {
    versao: 1,
    vistoriaId: v.id,
    passo,
    visitados: [],
    km: v.km != null ? formatarNumero(v.km) : "",
    horimetro: v.horimetro != null ? formatarNumero(v.horimetro) : "",
    combustivel: v.combustivel,
    objetos,
    outrosObjetos: outros,
    observacoes: v.observacoes ?? "",
    nome: v.assinadoPorNome ?? "",
    semAvarias: v.semAvarias,
    semAssinaturaMotivo: null,
    itens: Object.fromEntries(itens.map((i) => [i.id, { situacao: i.situacao, observacao: i.observacao }])),
    avarias: {},
    folha: null,
    assinatura: null,
    tracos: null,
    sujas: [],
    atualizadoEm: 0,
  };
}

/** Retomada: o que ainda não subiu (partes sujas) vem do aparelho; o resto, do banco. */
function aplicarLocal(base: RascunhoVistoria, local: RascunhoVistoria): RascunhoVistoria {
  const s = new Set(local.sujas);
  const x: RascunhoVistoria = {
    ...base,
    passo: local.passo,
    visitados: local.visitados ?? [],
    folha: local.folha,
    assinatura: local.assinatura,
    tracos: local.tracos,
    semAssinaturaMotivo: local.semAssinaturaMotivo,
    avarias: local.avarias ?? {},
    sujas: local.sujas ?? [],
  };
  if (s.has("entrada")) Object.assign(x, { km: local.km, horimetro: local.horimetro, combustivel: local.combustivel });
  if (s.has("objetos")) Object.assign(x, { objetos: local.objetos, outrosObjetos: local.outrosObjetos });
  if (s.has("observacoes")) x.observacoes = local.observacoes;
  if (s.has("nome")) x.nome = local.nome;
  if (s.has("sem_avarias")) x.semAvarias = local.semAvarias;
  const itens = { ...base.itens };
  for (const id of Object.keys(itens)) {
    const l = local.itens?.[id];
    if (!l) continue;
    if (s.has(`item:${id}`) || (s.has("resto_ok") && !itens[id].situacao && l.situacao)) itens[id] = l;
  }
  x.itens = itens;
  return x;
}

/** O que a parte "objetos" manda ao banco; null = voltar a "não informado" (p_limpar_objetos). */
function objetosParaEnviar(x: RascunhoVistoria): string[] | null {
  const outros = x.outrosObjetos.trim().slice(0, LIMITE_OUTROS_OBJETOS);
  if (x.objetos === null && !outros) return null;
  return [...(x.objetos ?? []), ...(outros ? [outros] : [])];
}

/**
 * Vistoria em rascunho — os 5 passos do DESIGN §12 (F4-B4):
 * ① KM e combustível · ② Checklist · ③ Avarias · ④ Painel e objetos · ⑤ Conferir e assinar.
 *
 * Nada se perde (§12.0 nº 4): cada toque muda o rascunho no aparelho (`localStorage`, por
 * usuário e vistoria) e marca a "parte" como suja; em segundo plano cada parte vira uma RPC
 * (ARQUITETURA V7) e sai da lista quando o banco confirma. Fotos usam a fila da Fase 3; foto
 * de avaria fica SEGURADA na fila até a avaria existir no banco (`aguardarAvaria`).
 * "Concluir" salva o que falta, espera as fotos, garante a assinatura e chama `concluir_vistoria`.
 */
export function VistoriaRascunho({
  osId,
  numeroOS,
  placa,
  titulo,
  usuarioId,
  vistoria: v,
  itens: itensServidor,
  avarias,
  fotosPainel,
  passoUrl,
  passoInicial,
}: {
  osId: string;
  numeroOS: number | null;
  placa: string;
  titulo: string;
  usuarioId: string;
  vistoria: VistoriaServidor;
  itens: ItemServidor[];
  avarias: AvariaServidor[];
  fotosPainel: FotoServidor[];
  passoUrl: NumeroPasso | null;
  passoInicial: NumeroPasso;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const fila = useFila();
  const semInternet = useSemInternet();
  const supabase = useMemo(() => createClient(), []);
  const idCamera = useId();
  const idGaleria = useId();
  const idCameraFolha = useId();
  const idGaleriaFolha = useId();
  // O input da câmera fica no passo ③ e o botão na barra de baixo: o anel de foco vai no botão.
  const [focoCamera, setFocoCamera] = useState(false);

  // ------------------------------------------------ rascunho (aparelho) e salvamento (banco)
  const [r, setR] = useState<RascunhoVistoria>(() => doServidor(v, itensServidor, passoInicial));
  const rRef = useRef(r);
  const versoes = useRef(new Map<string, number>());
  const segurarResto = useRef(false);
  const encerrada = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cadeia = useRef<Promise<boolean>>(Promise.resolve(true));
  const sincronizarRef = useRef<(() => Promise<boolean>) | null>(null);

  const [salvando, setSalvando] = useState(false);
  const [falhou, setFalhou] = useState(false);
  const [erroSalvar, setErroSalvar] = useState<string | null>(null);
  const [bloqueio, setBloqueio] = useState<string | null>(null);
  const [semEspaco, setSemEspaco] = useState(false);
  const [retomada, setRetomada] = useState<string | null>(null);

  function mudar(f: (x: RascunhoVistoria) => RascunhoVistoria, partes: Parte[] = []) {
    const novo = f(rRef.current);
    for (const p of partes) versoes.current.set(p, (versoes.current.get(p) ?? 0) + 1);
    const final = partes.length ? { ...novo, sujas: [...new Set([...novo.sujas, ...partes])] } : novo;
    rRef.current = final;
    setR(final);
    if (!encerrada.current && !gravarRascunho(usuarioId, final)) setSemEspaco(true);
    if (partes.length) agendar();
  }

  function agendar(ms = 800) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void sincronizar();
    }, ms);
  }

  /** Um envio por vez (promessas encadeadas): duas chamadas nunca mandam a mesma parte juntas. */
  function sincronizar(): Promise<boolean> {
    const p = cadeia.current.then(() => rodar());
    cadeia.current = p.catch(() => false);
    return p;
  }

  async function executar(parte: Parte, x: RascunhoVistoria): Promise<{ message: string } | null> {
    const id = v.id;
    let q: PromiseLike<{ error: { message: string } | null }> | null = null;
    if (parte === "entrada") {
      q = supabase.rpc("salvar_vistoria", {
        p_vistoria_id: id,
        p_km: lerInteiro(x.km),
        p_horimetro: lerInteiro(x.horimetro),
        p_combustivel: x.combustivel,
      });
    } else if (parte === "objetos") {
      const objetos = objetosParaEnviar(x);
      q = supabase.rpc("salvar_vistoria", objetos ? { p_vistoria_id: id, p_objetos: objetos } : { p_vistoria_id: id, p_limpar_objetos: true });
    } else if (parte === "observacoes") {
      q = supabase.rpc("salvar_vistoria", { p_vistoria_id: id, p_observacoes: x.observacoes.trim() });
    } else if (parte === "nome") {
      const nome = x.nome.trim();
      if (nome.length !== 1) q = supabase.rpc("salvar_vistoria", { p_vistoria_id: id, p_assinado_por_nome: nome });
    } else if (parte === "sem_avarias") {
      q = supabase.rpc("salvar_vistoria", { p_vistoria_id: id, p_sem_avarias: x.semAvarias });
    } else if (parte === "resto_ok") {
      q = supabase.rpc("marcar_itens_restantes_ok", { p_vistoria_id: id });
    } else if (parte.startsWith("item:")) {
      const itemId = parte.slice(5);
      const it = x.itens[itemId];
      if (it?.situacao) q = supabase.rpc("marcar_item_vistoria", { p_item_id: itemId, p_situacao: it.situacao, p_observacao: it.observacao.trim() });
    } else if (parte.startsWith("avaria:")) {
      const avariaId = parte.slice(7);
      const a = x.avarias[avariaId];
      if (a) q = supabase.rpc("salvar_avaria", { p_id: avariaId, p_vistoria_id: id, p_lado: a.lado, p_descricao: a.descricao.trim() });
    }
    if (!q) return null;
    const res = await Promise.resolve(q).then(
      (y) => y,
      (e: unknown) => ({ error: { message: String((e as Error)?.message ?? "") || "rede" } }),
    );
    return res.error ? { message: res.error.message || "rede" } : null;
  }

  async function rodar(): Promise<boolean> {
    if (encerrada.current) return false;
    let falhas = 0;
    let avariaSalva = false;
    const lento = setTimeout(() => setSalvando(true), 600);
    try {
      for (;;) {
        const atual = rRef.current;
        const parte = atual.sujas.filter((p) => !(p === "resto_ok" && segurarResto.current)).sort((a, b) => ordemParte(a) - ordemParte(b))[0];
        if (!parte) {
          setFalhou(false);
          setErroSalvar(null);
          return true;
        }
        if (!navigator.onLine) return false;
        const versao = versoes.current.get(parte);
        const erro = await executar(parte, atual);
        if (!erro) {
          falhas = 0;
          if (parte.startsWith("avaria:")) {
            liberarAvaria(parte.slice(7)); // a avaria existe no banco: as fotos dela podem subir
            avariaSalva = true;
          }
          if (versoes.current.get(parte) === versao) mudar((x) => ({ ...x, sujas: x.sujas.filter((s) => s !== parte) }));
          continue;
        }
        if (ehRede(erro.message)) return false;
        const codigo = erro.message.trim();
        if (TEXTO_BLOQUEIO[codigo]) {
          encerrada.current = true;
          setBloqueio(TEXTO_BLOQUEIO[codigo]);
          if (codigo === "vistoria_concluida") router.refresh();
          return false;
        }
        falhas++;
        if (falhas >= 3) {
          setFalhou(true);
          setErroSalvar(traduzirErro(erro, "os"));
          return false;
        }
        await espera(1500 * falhas);
      }
    } finally {
      clearTimeout(lento);
      setSalvando(false);
      if (avariaSalva) router.refresh();
    }
  }

  useEffect(() => {
    sincronizarRef.current = sincronizar;
  });

  // Ao abrir: fila de fotos, rascunho do aparelho, passo da retomada e envio do que ficou.
  useEffect(() => {
    void iniciarFila(usuarioId);
    void aquecerConexao();
    // Avaria que já está no banco não segura mais foto (o app pode ter fechado entre salvar e liberar).
    for (const a of avarias) liberarAvaria(a.id);
    expirarRascunhos(usuarioId); // rascunhos deste usuário com mais de 30 dias ou inválidos somem
    const local = lerRascunho(usuarioId, v.id);
    let base = rRef.current;
    if (local) {
      base = aplicarLocal(base, local);
      rRef.current = base;
      setR(base);
    }
    const temProgresso =
      Boolean(local) || itensServidor.some((i) => i.situacao) || avarias.length > 0 || Boolean(v.combustivel) || v.semAvarias;
    if (v.criadoPorId && v.criadoPorId !== usuarioId) {
      setRetomada(`${v.criadoPorNome ?? "Outra pessoa"} começou esta vistoria em ${formatarDiaHora(v.criadoEm)}. Você está continuando a mesma.`);
    } else if (temProgresso) {
      setRetomada("Continuando de onde parou. O que você marcou foi guardado.");
    }
    if (!passoUrl && local) {
      const p = primeiroPendente(base, avarias.length) ?? local.passo ?? passoInicial;
      if (p !== passoInicial) window.history.replaceState(null, "", `?passo=${p}`);
    }
    if (base.sujas.length) void sincronizarRef.current?.();
    const aoVoltarInternet = () => void sincronizarRef.current?.();
    window.addEventListener("online", aoVoltarInternet);
    return () => {
      window.removeEventListener("online", aoVoltarInternet);
      // Saiu da tela: tenta mandar o que falta (fica guardado no aparelho se não der).
      if (timer.current) clearTimeout(timer.current);
      if (rRef.current.sujas.length) void sincronizarRef.current?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao abrir a tela
  }, []);

  // Foto confirmada pelo banco: recarrega (miniatura do servidor, contagens).
  useEffect(
    () =>
      aoConfirmarFoto((_os, id) => {
        const i = lerFila().itens.find((x) => x.id === id);
        if (i?.vistoria?.vistoriaId === v.id) router.refresh();
      }),
    [router, v.id],
  );

  // Avaria do aparelho que o banco já mostra igual: o servidor volta a mandar.
  useEffect(() => {
    const ids = new Set(avarias.map((a) => a.id));
    const x = rRef.current;
    const sobra = Object.keys(x.avarias).filter((id) => ids.has(id) && !x.sujas.includes(`avaria:${id}`));
    if (!sobra.length) return;
    mudar((y) => ({ ...y, avarias: Object.fromEntries(Object.entries(y.avarias).filter(([id]) => !sobra.includes(id))) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só quando o servidor manda a lista nova
  }, [avarias]);

  // ------------------------------------------------ passo atual (?passo=N; voltar do celular volta um passo)
  const pedido = Number(sp.get("passo"));
  const passo: NumeroPasso = Number.isInteger(pedido) && pedido >= 1 && pedido <= 5 ? (pedido as NumeroPasso) : passoInicial;

  function irPara(p: NumeroPasso) {
    if (p === passo) return;
    mudar((x) => ({ ...x, passo: p, visitados: [...new Set([...x.visitados, passo])] }));
    setRetomada(null);
    window.history.pushState(null, "", `?passo=${p}`);
    window.scrollTo({ top: 0 });
  }

  // ------------------------------------------------ fila de fotos desta vistoria
  const [removidas, setRemovidas] = useState<Set<string>>(() => new Set());
  const daVistoria = fila.itens.filter((i) => i.usuarioId === usuarioId && i.vistoria?.vistoriaId === v.id && i.categoria !== null);
  const naFila = (id: string) => daVistoria.some((i) => i.id === id);

  function fotosTela(servidor: FotoServidor[], daFilaFiltro: (i: ItemFila) => boolean): FotoAvaria[] {
    const doServidor: FotoAvaria[] = servidor
      .filter((f) => !removidas.has(f.id) && (f.enviada || !naFila(f.id)))
      .map((f) => ({ id: f.id, src: f.src, estado: f.enviada ? "enviada" : "nao_enviavel" }));
    const daFila: FotoAvaria[] = daVistoria
      .filter((i) => daFilaFiltro(i) && !removidas.has(i.id) && !servidor.some((f) => f.enviada && f.id === i.id))
      .map((i) => ({ id: i.id, src: i.previa, estado: i.estado, progresso: i.progresso }));
    return [...daFila, ...doServidor];
  }

  // Avarias: as do banco (com a versão do aparelho por cima) + as que só existem no aparelho.
  const idsServidor = new Set(avarias.map((a) => a.id));
  const fontesAvaria = [
    ...avarias
      .filter((a) => !removidas.has(a.id))
      .map((a) => {
        const l = r.avarias[a.id];
        return { id: a.id, lado: l?.lado ?? a.lado, descricao: l ? l.descricao || null : a.descricao, servidor: a.fotos };
      }),
    ...Object.entries(r.avarias)
      .filter(([id]) => !idsServidor.has(id) && !removidas.has(id))
      .map(([id, a]) => ({ id, lado: a.lado, descricao: a.descricao || null, servidor: [] as FotoServidor[] })),
  ];
  const fotosDaAvaria = (id: string, servidor: FotoServidor[]) => fotosTela(servidor, (i) => i.vistoria?.avariaId === id);
  const lista: DadosAvaria[] = fontesAvaria.map((a) => ({ id: a.id, lado: a.lado, descricao: a.descricao, fotos: fotosDaAvaria(a.id, a.servidor) }));
  const painelTela: FotoTela[] = fotosTela(fotosPainel, (i) => i.vistoria?.tipo === "painel");

  // Limite de 30 por vistoria (banco + fila deste aparelho, sem contar duas vezes).
  const idsFotos = new Set([
    ...avarias.flatMap((a) => a.fotos.map((f) => f.id)),
    ...fotosPainel.map((f) => f.id),
    ...daVistoria.map((i) => i.id),
  ]);
  for (const id of removidas) idsFotos.delete(id);
  const totalFotos = Math.max(idsFotos.size, v.qtdFotos - removidas.size);
  const limiteAtingido = totalFotos >= LIMITE_FOTOS_VISTORIA;

  // Registro sem arquivo (o aparelho perdeu a foto): bloqueia a conclusão; dá para descartar.
  const orfas = fila.carregada
    ? [...avarias.flatMap((a) => a.fotos), ...fotosPainel].filter((f) => !f.enviada && !naFila(f.id) && !removidas.has(f.id))
    : [];
  const falhas = daVistoria.filter((i) => i.estado === "falhou" || i.estado === "nao_enviavel");

  // ------------------------------------------------ itens do checklist
  const itens: ItemTela[] = itensServidor.map((i) => ({
    id: i.id,
    descricao: i.descricao,
    situacao: r.itens[i.id]?.situacao ?? i.situacao,
    observacao: r.itens[i.id]?.observacao ?? i.observacao,
  }));
  const semMarcar = itens.filter((i) => !i.situacao);
  const [avisoResto, setAvisoResto] = useState<{ ids: string[]; chave: number } | null>(null);

  function mudarItem(id: string, patch: Partial<{ situacao: SituacaoItemVistoria; observacao: string }>) {
    mudar(
      (x) => {
        const atual = x.itens[id] ?? { situacao: null, observacao: "" };
        return { ...x, itens: { ...x.itens, [id]: { ...atual, ...patch } } };
      },
      [`item:${id}`],
    );
  }

  function marcarResto() {
    const ids = semMarcar.map((i) => i.id);
    if (!ids.length) return;
    // O banco não desmarca item: o "resto ok" só sai depois que o Desfazer some (6 s).
    segurarResto.current = true;
    mudar(
      (x) => ({ ...x, itens: Object.fromEntries(Object.entries(x.itens).map(([id, it]) => [id, ids.includes(id) ? { ...it, situacao: "ok" as const } : it])) }),
      ["resto_ok"],
    );
    setAvisoResto({ ids, chave: Date.now() });
  }

  function desfazerResto() {
    const ids = avisoResto?.ids ?? [];
    segurarResto.current = false;
    setAvisoResto(null);
    mudar((x) => ({
      ...x,
      sujas: x.sujas.filter((s) => s !== "resto_ok"),
      itens: Object.fromEntries(
        Object.entries(x.itens).map(([id, it]) => [id, ids.includes(id) && it.situacao === "ok" && !x.sujas.includes(`item:${id}`) ? { ...it, situacao: null } : it]),
      ),
    }));
  }

  function soltarResto() {
    segurarResto.current = false;
    setAvisoResto(null);
    agendar(100);
  }

  // ------------------------------------------------ passo ①
  const [errosEntrada, setErrosEntrada] = useState<{ km?: string; horimetro?: string; combustivel?: string }>({});

  // ------------------------------------------------ passo ③: folha da avaria
  const folha = r.folha;
  const [erroFolha, setErroFolha] = useState<{ lado?: string; descricao?: string; geral?: string }>({});
  const [perguntaFechar, setPerguntaFechar] = useState(false);
  const [confirmarRemover, setConfirmarRemover] = useState(false);
  const [removendo, setRemovendo] = useState<string | null>(null);
  const [erroGeral, setErroGeral] = useState<string | null>(null);

  const fonteFolha = folha ? fontesAvaria.find((a) => a.id === folha.avariaId) : undefined;
  const fotosFolha = folha ? fotosDaAvaria(folha.avariaId, fonteFolha?.servidor ?? []) : [];

  function abrirFolha(f: NonNullable<RascunhoVistoria["folha"]>) {
    setErroFolha({});
    setPerguntaFechar(false);
    setConfirmarRemover(false);
    mudar((x) => ({ ...x, folha: f }));
  }

  /** Foto de avaria entra na fila na hora (guardada no aparelho), segurada até a avaria subir. */
  function adicionarFotosAvaria(avariaId: string, arquivos: File[]): string[] {
    if (!arquivos.length) return [];
    aguardarAvaria(avariaId);
    const ids = adicionarArquivos(arquivos, { osId, numeroOS, vistoria: { vistoriaId: v.id, avariaId, tipo: "avaria" } });
    void definirTipo(ids, "outro", null);
    return ids;
  }

  function aoFotografarAvaria(ev: ChangeEvent<HTMLInputElement>) {
    const arquivo = ev.target.files?.[0];
    ev.target.value = "";
    if (!arquivo || limiteAtingido) return;
    const avariaId = novoIdFoto();
    const ids = adicionarFotosAvaria(avariaId, [arquivo]);
    abrirFolha({ avariaId, nova: true, fotoIds: ids, lado: null, descricao: "" });
  }

  function aoOutraFotoFolha(ev: ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(ev.target.files ?? []);
    ev.target.value = "";
    if (!folha) return;
    const cabem = Math.min(LIMITE_FOTOS_AVARIA - fotosFolha.length, LIMITE_FOTOS_VISTORIA - totalFotos);
    const ids = adicionarFotosAvaria(folha.avariaId, arquivos.slice(0, Math.max(0, cabem)));
    if (ids.length) mudar((x) => (x.folha ? { ...x, folha: { ...x.folha, fotoIds: [...x.folha.fotoIds, ...ids] } } : x));
  }

  function salvarFolha() {
    if (!folha) return;
    const descricao = folha.descricao.trim();
    const e: typeof erroFolha = {};
    if (!folha.lado) e.lado = "Escolha o lado da avaria.";
    if (!descricao && fotosFolha.length === 0) e.descricao = "Escreva o que é ou tire uma foto.";
    setErroFolha(e);
    if (e.lado || e.descricao) return;
    const id = folha.avariaId;
    const lado = folha.lado as LadoAvaria;
    const partes: Parte[] = [`avaria:${id}`];
    // Avaria nova desmarca "Sem avarias" no banco; aqui também (e manda false antes da avaria).
    if (rRef.current.semAvarias) partes.unshift("sem_avarias");
    mudar((x) => ({ ...x, folha: null, semAvarias: false, avarias: { ...x.avarias, [id]: { lado, descricao } } }), partes);
    setPerguntaFechar(false);
  }

  function descartarFolha() {
    if (!folha) return;
    descartar(folha.fotoIds);
    // Avaria que ainda não subiu continua segurando as fotos dela; o resto libera.
    if (!rRef.current.sujas.includes(`avaria:${folha.avariaId}`)) liberarAvaria(folha.avariaId);
    mudar((x) => ({ ...x, folha: null }));
    setPerguntaFechar(false);
    setConfirmarRemover(false);
  }

  function pedirFecharFolha() {
    if (!folha) return;
    const original = fonteFolha;
    const mexeu = folha.nova
      ? folha.fotoIds.length > 0 || Boolean(folha.lado) || folha.descricao.trim() !== ""
      : folha.fotoIds.length > 0 || folha.lado !== original?.lado || folha.descricao.trim() !== (original?.descricao ?? "");
    if (mexeu) setPerguntaFechar(true);
    else descartarFolha();
  }

  async function apagarFotoServidor(f: FotoServidor): Promise<string | null> {
    if (f.enviada) await supabase.storage.from(BUCKET_VISTORIAS).remove([f.caminho, f.caminhoMiniatura]).then(() => null, () => null);
    const res = await supabase.rpc("apagar_foto_vistoria", { p_id: f.id }).then((x) => x, () => ({ error: { message: "rede" } }));
    if (!res.error) return null;
    return ehRede(res.error.message) ? MSG_REDE : traduzirErro(res.error, "os");
  }

  async function removerFoto(fotoId: string, servidor: FotoServidor[]) {
    setRemovendo(fotoId);
    setErroGeral(null);
    setErroFolha((e) => ({ ...e, geral: undefined }));
    if (naFila(fotoId)) descartar([fotoId]);
    const doServidor = servidor.find((f) => f.id === fotoId);
    const erro = doServidor ? await apagarFotoServidor(doServidor) : null;
    setRemovendo(null);
    if (erro) {
      if (folha) setErroFolha((e) => ({ ...e, geral: erro }));
      else setErroGeral(erro);
      return;
    }
    setRemovidas((s) => new Set(s).add(fotoId));
    mudar((x) => (x.folha ? { ...x, folha: { ...x.folha, fotoIds: x.folha.fotoIds.filter((i) => i !== fotoId) } } : x));
    if (doServidor) router.refresh();
  }

  async function removerAvaria() {
    if (!folha) return;
    const id = folha.avariaId;
    const fonte = fonteFolha;
    setRemovendo(id);
    if (idsServidor.has(id)) {
      const arquivos = (fonte?.servidor ?? []).filter((f) => f.enviada).flatMap((f) => [f.caminho, f.caminhoMiniatura]);
      if (arquivos.length) await supabase.storage.from(BUCKET_VISTORIAS).remove(arquivos).then(() => null, () => null);
      const res = await supabase.rpc("remover_avaria", { p_id: id }).then((x) => x, () => ({ error: { message: "rede" } }));
      if (res.error) {
        setRemovendo(null);
        setErroFolha({ geral: ehRede(res.error.message) ? MSG_REDE : traduzirErro(res.error, "os") });
        return;
      }
    }
    setRemovendo(null);
    descartar(daVistoria.filter((i) => i.vistoria?.avariaId === id).map((i) => i.id));
    liberarAvaria(id);
    setRemovidas((s) => new Set(s).add(id));
    mudar((x) => ({
      ...x,
      folha: null,
      avarias: Object.fromEntries(Object.entries(x.avarias).filter(([k]) => k !== id)),
      sujas: x.sujas.filter((s) => s !== `avaria:${id}`),
    }));
    setConfirmarRemover(false);
    if (idsServidor.has(id)) router.refresh();
  }

  // ------------------------------------------------ passo ④
  function aoEscolherPainel(ev: ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(ev.target.files ?? []);
    ev.target.value = "";
    const cabem = Math.min(3 - painelTela.length, LIMITE_FOTOS_VISTORIA - totalFotos);
    if (cabem <= 0 || !arquivos.length) return;
    const ids = adicionarArquivos(arquivos.slice(0, cabem), { osId, numeroOS, vistoria: { vistoriaId: v.id, avariaId: null, tipo: "painel" } });
    void definirTipo(ids, "outro", null);
  }

  // ------------------------------------------------ passo ⑤: assinatura
  const [assinando, setAssinando] = useState(false);
  const [assin, setAssin] = useState<AssinaturaLocal | null>(null);
  const assinRef = useRef<AssinaturaLocal | null>(null);
  const [erroNome, setErroNome] = useState<string>();
  const [perguntaSem, setPerguntaSem] = useState(false);
  const previa = useRef<HTMLButtonElement>(null);

  function trocarAssin(a: AssinaturaLocal | null) {
    assinRef.current = a;
    setAssin(a);
  }

  useEffect(() => {
    const url = assin?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [assin?.url]);

  // Retomada: o PNG some quando o app fecha; refaz a partir dos traços guardados.
  // Já enviada: os traços não ficam no aparelho; a prévia usa a URL assinada do banco (v.assinaturaUrl).
  useEffect(() => {
    const a = r.assinatura;
    const dados = a?.dados;
    if (!a || !dados || assinRef.current?.id === a.id || !temTraco(dados)) return;
    let cancelado = false;
    void exportarAssinatura(dados).then(
      (png) => {
        if (cancelado || assinRef.current?.id === a.id) return;
        const nova: AssinaturaLocal = {
          id: a.id,
          blob: png.blob,
          url: URL.createObjectURL(png.blob),
          largura: png.largura,
          altura: png.altura,
          dados,
          envio: a.enviada ? "enviada" : "pendente",
          nomeEnviado: a.nomeEnviado,
        };
        trocarAssin(nova);
      },
      () => undefined,
    );
    return () => {
      cancelado = true;
    };
  }, [r.assinatura]);

  async function subirAssinatura(a: AssinaturaLocal, nome: string): Promise<boolean> {
    const atualizar = (patch: Partial<AssinaturaLocal>) => {
      if (assinRef.current?.id !== a.id) return;
      trocarAssin({ ...assinRef.current, ...patch });
    };
    atualizar({ envio: "enviando", erro: undefined });
    try {
      const res = await enviarAssinatura({ vistoriaId: v.id, assinaturaId: a.id, nome, png: a.blob, largura: a.largura, altura: a.altura });
      atualizar({ envio: "enviada", nomeEnviado: nome });
      mudar((x) => (x.assinatura?.id === a.id ? { ...x, assinatura: { ...x.assinatura, enviada: true, nomeEnviado: nome } } : x));
      void guardarDiagVistoria({ resultado: "enviada", vistoriaId: v.id, caminho: res.caminho, largura: a.largura, altura: a.altura, etapas: res.etapas, totalMs: res.totalMs, png: a.blob, dados: a.dados });
      return true;
    } catch (e) {
      const msg = e instanceof ErroEnvio ? e.message : MSG_REDE;
      atualizar({ envio: "falhou", erro: msg });
      void guardarDiagVistoria({ resultado: "erro", erro: `${msg} (${e instanceof ErroEnvio ? e.detalhe : String(e)})`, vistoriaId: v.id, largura: a.largura, altura: a.altura, png: a.blob, dados: a.dados });
      return false;
    }
  }

  function aoUsarAssinatura(res: ResultadoAssinatura) {
    const nova: AssinaturaLocal = {
      id: novoIdFoto(), // assinar de novo = id e caminho novos (nada é sobrescrito)
      blob: res.blob,
      url: URL.createObjectURL(res.blob),
      largura: res.largura,
      altura: res.altura,
      dados: res.dados,
      envio: "pendente",
      nomeEnviado: null,
    };
    trocarAssin(nova);
    mudar((x) => ({ ...x, tracos: res.dados, semAssinaturaMotivo: null, assinatura: { id: nova.id, dados: res.dados, enviada: false, nomeEnviado: null } }));
    setRecusa(null);
    setAssinando(false);
    const n = rRef.current.nome.trim();
    if (n.length >= 2) void subirAssinatura(nova, n);
    else setErroNome("Escreva o nome de quem assinou.");
  }

  const motivoSem = r.semAssinaturaMotivo;
  // Assinatura do banco vale quando não há uma do aparelho ou quando a do aparelho já subiu
  // (depois do envio os traços saem do aparelho e só a URL do banco mostra a imagem).
  const usarAssinaturaDoBanco = !r.assinatura || r.assinatura.enviada;
  const temAssinatura = Boolean(assin) || (Boolean(v.assinaturaUrl) && usarAssinaturaDoBanco) || Boolean(r.assinatura?.enviada);

  // ------------------------------------------------ o que falta (§12.8)
  type Falta = { texto: string; passo?: NumeroPasso; acao?: { rotulo: string; fazer: () => void } };
  const falta: Falta[] = [];
  const errKm = erroKm(r.km);
  if (errKm) falta.push({ texto: r.km.trim() ? "Corrigir o KM" : "Informar o KM do painel", passo: 1 });
  if (erroHorimetro(r.horimetro)) falta.push({ texto: "Corrigir o horímetro", passo: 1 });
  if (!r.combustivel) falta.push({ texto: "Marcar o combustível", passo: 1 });
  if (semMarcar.length)
    falta.push({ texto: semMarcar.length === 1 ? "1 item do checklist sem marcar" : `${semMarcar.length} itens do checklist sem marcar`, passo: 2 });
  if (lista.length === 0 && !r.semAvarias) falta.push({ texto: "Dizer se tem avaria (ou Sem avarias)", passo: 3 });
  if (falhas.length)
    falta.push({
      texto: falhas.length === 1 ? "1 foto ainda não enviada" : `${falhas.length} fotos ainda não enviadas`,
      acao: { rotulo: "Tentar de novo", fazer: () => tentarDeNovo(falhas.map((i) => i.id)) },
    });
  if (orfas.length)
    falta.push({
      texto: orfas.length === 1 ? "1 foto não chegou do celular que a tirou" : `${orfas.length} fotos não chegaram do celular que as tirou`,
      acao: {
        rotulo: "Descartar",
        fazer: () => {
          void (async () => {
            for (const f of orfas) await removerFoto(f.id, [f]);
          })();
        },
      },
    });
  if (!motivoSem) {
    if (r.nome.trim().length < 2) falta.push({ texto: "Nome de quem assinou", passo: 5 });
    if (!temAssinatura) falta.push({ texto: "Falta a assinatura. Peça para o motorista assinar ou toque em Não tem como assinar?", passo: 5 });
  }

  // ------------------------------------------------ estados dos passos
  const visitados = new Set<NumeroPasso>([...r.visitados, passo]);
  const est = (feito: boolean, n: NumeroPasso, faltam?: number): EstadoPasso =>
    feito ? { estado: "feito" } : visitados.has(n) && n !== passo ? { estado: "pendente", faltam } : { estado: visitados.has(n) ? "visto" : "nao_visto" };
  const estados: Partial<Record<NumeroPasso, EstadoPasso>> = {
    1: est(!errKm && !erroHorimetro(r.horimetro) && Boolean(r.combustivel), 1),
    2: est(semMarcar.length === 0, 2, semMarcar.length),
    3: est(lista.length > 0 || r.semAvarias, 3),
    4: visitados.has(4) && passo !== 4 ? { estado: "feito" } : { estado: visitados.has(4) ? "visto" : "nao_visto" },
    5: { estado: visitados.has(5) ? "visto" : "nao_visto" },
  };

  const estadoSalvo: EstadoSalvo = falhou ? "falhou" : r.sujas.length && semInternet ? "sem_internet" : salvando ? "salvando" : "salvo";

  // ------------------------------------------------ concluir
  const [confirmando, setConfirmando] = useState(false);
  const [etapa, setEtapa] = useState<string | null>(null);
  const [recusa, setRecusa] = useState<string | null>(null);
  const caixaFalta = useRef<HTMLDivElement>(null);

  function mostrarFalta() {
    requestAnimationFrame(() => {
      caixaFalta.current?.scrollIntoView({ block: "center" });
      caixaFalta.current?.focus();
    });
  }

  function pedirConcluir() {
    setRecusa(null);
    if (falta.length) {
      mostrarFalta();
      return;
    }
    setConfirmando(true);
  }

  async function concluir() {
    setConfirmando(false);
    setRecusa(null);
    const nomeAtual = rRef.current.nome.trim();
    const motivo = rRef.current.semAssinaturaMotivo;

    // 1) salva no banco tudo o que ainda está só no aparelho (inclusive o "resto ok")
    segurarResto.current = false;
    setAvisoResto(null);
    if (timer.current) clearTimeout(timer.current);
    setEtapa("Salvando…");
    const salvo = await sincronizar();
    if (!salvo || rRef.current.sujas.length) {
      setEtapa(null);
      if (!encerrada.current) setRecusa("Não deu para salvar tudo no servidor. Confira a internet e toque em Concluir de novo. Nada se perde.");
      mostrarFalta();
      return;
    }

    // 2) espera as fotos da vistoria saírem da fila (o motorista está esperando)
    const fim = Date.now() + 180_000;
    for (;;) {
      const minhas = lerFila().itens.filter((i) => i.vistoria?.vistoriaId === v.id && i.categoria !== null && i.estado !== "confirmada");
      const andando = minhas.filter((i) => ANDANDO.has(i.estado));
      if (!andando.length || Date.now() > fim) {
        const parada = minhas[0];
        if (parada) {
          setEtapa(null);
          const avaria = parada.vistoria?.avariaId ? fontesAvaria.find((a) => a.id === parada.vistoria?.avariaId) : null;
          setRecusa(
            avaria
              ? `A foto da avaria "${ROTULO_LADO_AVARIA[avaria.lado]}" não subiu. Toque em Tentar de novo ou remova a foto.`
              : "Uma foto da vistoria não subiu. Toque em Tentar de novo ou remova a foto.",
          );
          mostrarFalta();
          return;
        }
        break;
      }
      setEtapa(`Enviando fotos (${minhas.length - andando.length + 1} de ${minhas.length})…`);
      await espera(500);
    }

    // 3) assinatura no Storage (ou o caminho "sem assinatura")
    const a = assinRef.current;
    if (!motivo && a && a.envio !== "enviada") {
      setEtapa("Enviando assinatura…");
      if (!(await subirAssinatura(a, nomeAtual))) {
        setEtapa(null);
        setRecusa("A assinatura não subiu. Ela continua guardada no celular. Toque em Concluir de novo.");
        mostrarFalta();
        return;
      }
    } else if (!motivo && (a ? a.nomeEnviado : rRef.current.assinatura?.enviada ? rRef.current.assinatura.nomeEnviado : nomeAtual) !== nomeAtual) {
      // (sem `a` na memória: assinatura já enviada antes de o app fechar; o nome vem do rascunho)
      await supabase.rpc("salvar_vistoria", { p_vistoria_id: v.id, p_assinado_por_nome: nomeAtual }).then((x) => x, () => null);
    }

    // 4) concluir (o banco confere tudo e trava)
    setEtapa("Concluindo…");
    let res = await concluirVistoria(v.id, motivo);
    if ("codigo" in res && res.codigo === "assinatura_nao_enviada" && a && !motivo) {
      setEtapa("Enviando assinatura…");
      if (await subirAssinatura(a, nomeAtual)) res = await concluirVistoria(v.id, motivo);
    }
    setEtapa(null);
    if ("codigo" in res) {
      setRecusa(res.mensagem);
      if (res.codigo === "vistoria_concluida") router.refresh();
      mostrarFalta();
      return;
    }
    encerrada.current = true;
    apagarRascunho(usuarioId, v.id);
    router.replace(`/os/${osId}/vistoria?concluida=1`);
    router.refresh();
  }

  // ------------------------------------------------ sair no meio (voltar do cabeçalho)
  const [perguntaSair, setPerguntaSair] = useState(false);
  const fotosAndando = daVistoria.filter((i) => PENDENTE_SAIR.has(i.estado)).length;
  function aoClicarCabecalho(e: MouseEvent<HTMLDivElement>) {
    const link = (e.target as HTMLElement).closest("a");
    if (!link || (!r.sujas.length && !fotosAndando)) return;
    e.preventDefault();
    setPerguntaSair(true);
  }
  function sairDaVistoria() {
    setPerguntaSair(false);
    router.push(`/os/${osId}`);
  }

  // ------------------------------------------------ quem não pode editar: só vê
  const cabecalho = (
    <div onClickCapture={aoClicarCabecalho}>
      <Cabecalho titulo={titulo} voltar={`/os/${osId}`} />
    </div>
  );

  if (!v.podeEditar) {
    return (
      <>
        {cabecalho}
        <Pagina>
          <div className="flex flex-col gap-6">
            <CaixaMensagem tipo="info">
              Vistoria em andamento{v.criadoPorNome ? `, começada por ${v.criadoPorNome}` : ""} em {formatarDiaHora(v.criadoEm)}. Ela é feita pelo
              balcão ou pelo mecânico da OS.
            </CaixaMensagem>
            <ListaAvarias avarias={lista} leitura />
          </div>
        </Pagina>
      </>
    );
  }

  const nomePasso = (n: NumeroPasso) => PASSOS_VISTORIA[n - 1].nome;
  const voltarBotao =
    passo > 1 ? (
      <Botao variante="secundario" onClick={() => irPara((passo - 1) as NumeroPasso)}>
        <ArrowLeft size={22} strokeWidth={2.25} aria-hidden />
        Voltar
      </Botao>
    ) : undefined;
  const proximoBotao = (n: NumeroPasso, rotulo = `Próximo: ${PASSOS_VISTORIA[n - 1].curto === "Assinar" ? "Assinar" : nomePasso(n)}`) => (
    <Botao onClick={() => irPara(n)} data-teste="proximo-passo">
      {rotulo}
      <ArrowRight size={22} strokeWidth={2.25} aria-hidden />
    </Botao>
  );

  let barra: { primario?: ReactNode; secundario?: ReactNode; acima?: ReactNode } = {};
  if (passo === 1) barra = { primario: proximoBotao(2, "Próximo: Checklist") };
  else if (passo === 2) barra = { secundario: voltarBotao, primario: proximoBotao(3, "Próximo: Avarias") };
  else if (passo === 3)
    barra = {
      secundario:
        lista.length === 0 && !r.semAvarias ? (
          <Botao
            variante="secundario"
            className="px-2"
            aria-label="Sem avarias, próximo passo"
            onClick={() => {
              mudar((x) => ({ ...x, semAvarias: true }), ["sem_avarias"]);
              irPara(4);
            }}
            data-teste="sem-avarias"
          >
            Sem avarias
            <ArrowRight size={22} strokeWidth={2.25} aria-hidden />
          </Botao>
        ) : (
          <Botao variante="secundario" onClick={() => irPara(4)} data-teste="proximo-passo">
            Próximo
            <ArrowRight size={22} strokeWidth={2.25} aria-hidden />
          </Botao>
        ),
      primario: limiteAtingido ? (
        <Botao disabled>
          <Camera size={22} strokeWidth={2.25} aria-hidden />
          Fotografar avaria
        </Botao>
      ) : (
        <label htmlFor={idCamera} data-foco={focoCamera || undefined} className={classesBotaoArquivo("primario")}>
          <Camera size={22} strokeWidth={2.25} aria-hidden />
          Fotografar avaria
        </label>
      ),
      acima: limiteAtingido ? <p className="text-sm font-bold text-alerta-texto">A vistoria chegou ao limite de 30 fotos.</p> : undefined,
    };
  else if (passo === 4) barra = { secundario: voltarBotao, primario: proximoBotao(5, "Próximo: Assinar") };
  else if (confirmando)
    // A confirmação vai no lugar do primário: a BarraAcoesOS some quando não há primário nem
    // secundário (só `acima` não basta), e a pergunta nunca aparecia (achado do F4-B8).
    barra = {
      primario: (
        <div className="flex flex-col gap-2 py-1" role="group" aria-label="Confirmar conclusão">
          <p className="text-base font-bold">Concluir a vistoria de {placa}?</p>
          <p className="text-sm text-texto-suave">Depois disso nada pode ser mudado, nem pelo dono.</p>
          <div className="flex gap-2">
            <Botao variante="secundario" className="h-toque! flex-1" onClick={() => setConfirmando(false)}>
              Voltar e conferir
            </Botao>
            <Botao className="h-toque! flex-1" onClick={() => void concluir()} data-teste="confirmar-concluir">
              Concluir vistoria
            </Botao>
          </div>
        </div>
      ),
    };
  else
    barra = {
      secundario: voltarBotao,
      acima: semInternet ? (
        <p className="text-sm font-bold text-alerta-texto">Sem internet. Para concluir, espere a internet voltar. Nada se perde.</p>
      ) : etapa ? (
        <p role="status" className="text-sm font-bold">
          {etapa}
        </p>
      ) : undefined,
      primario: (
        <Botao
          onClick={pedirConcluir}
          disabled={semInternet || etapa !== null || Boolean(bloqueio)}
          aria-busy={etapa !== null}
          data-teste="concluir-vistoria"
        >
          <Lock size={22} strokeWidth={2.25} aria-hidden />
          {etapa ?? "Concluir vistoria"}
        </Botao>
      ),
    };

  const nomeAutorizou = v.autorizadoPorNome?.trim();

  return (
    <>
      {cabecalho}
      <Pagina>
        <div className="flex flex-col gap-4" data-teste="vistoria-rascunho" data-passo={passo}>
          <PassosVistoria atual={passo} estados={estados} aoIr={irPara} />
          <LinhaPasso atual={passo} salvo={estadoSalvo} aoTentarSalvar={() => {
            setFalhou(false);
            void sincronizar();
          }} />
          {erroSalvar && falhou && <p className="text-sm text-erro-texto">{erroSalvar}</p>}
          {bloqueio && (
            <CaixaMensagem tipo="erro">
              {bloqueio}{" "}
              <Link href={`/os/${osId}`} className="font-bold underline underline-offset-4">
                Voltar para a OS
              </Link>
            </CaixaMensagem>
          )}
          {retomada && <CaixaMensagem tipo="info">{retomada}</CaixaMensagem>}
          {semEspaco && (
            <CaixaMensagem tipo="alerta">
              O celular está sem espaço para guardar a vistoria. Ela continua sendo salva no servidor enquanto houver internet.
            </CaixaMensagem>
          )}
          {fila.aviso && (
            <CaixaMensagem tipo="alerta">
              {fila.aviso === "sem_espaco"
                ? "O celular está sem espaço para guardar as fotos. Libere espaço ou envie com internet."
                : "Este navegador não deixa guardar as fotos no celular. Mantenha a tela aberta até enviar."}
            </CaixaMensagem>
          )}
          {erroGeral && <CaixaMensagem tipo="erro">{erroGeral}</CaixaMensagem>}

          <div className="pt-2">
            {passo === 1 && (
              <PassoEntrada
                km={r.km}
                horimetro={r.horimetro}
                combustivel={r.combustivel}
                kmVeiculo={v.kmVeiculo}
                horimetroVeiculo={v.horimetroVeiculo}
                erros={errosEntrada}
                aoMudarKm={(t) => {
                  mudar((x) => ({ ...x, km: t }), ["entrada"]);
                  if (errosEntrada.km && !erroKm(t)) setErrosEntrada((e) => ({ ...e, km: undefined }));
                }}
                aoMudarHorimetro={(t) => {
                  mudar((x) => ({ ...x, horimetro: t }), ["entrada"]);
                  if (errosEntrada.horimetro && !erroHorimetro(t)) setErrosEntrada((e) => ({ ...e, horimetro: undefined }));
                }}
                aoMudarCombustivel={(n) => {
                  mudar((x) => ({ ...x, combustivel: n }), ["entrada"]);
                  setErrosEntrada((e) => ({ ...e, combustivel: undefined }));
                }}
                aoSairCampo={(c) =>
                  setErrosEntrada((e) => ({ ...e, [c]: c === "km" ? erroKm(rRef.current.km) : erroHorimetro(rRef.current.horimetro) }))
                }
              />
            )}

            {passo === 2 && (
              <PassoChecklist
                itens={itens}
                aoMudarSituacao={(id, s) => mudarItem(id, { situacao: s })}
                aoMudarObservacao={(id, t) => mudarItem(id, { observacao: t })}
                aoMarcarResto={marcarResto}
                irPara={irPara}
              />
            )}

            {passo === 3 && (
              <div className="flex flex-col gap-4">
                <p className="text-base text-texto-suave">
                  Dê a volta no caminhão. Para cada risco, amassado ou peça quebrada: tire a foto, escolha o lado e diga o que é.
                </p>
                {totalFotos >= 20 && (
                  <p className="text-sm font-bold" data-teste="contador-fotos">
                    Fotos da vistoria: {totalFotos} de {LIMITE_FOTOS_VISTORIA}.
                  </p>
                )}
                <input
                  id={idCamera}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={aoFotografarAvaria}
                  onFocus={(e) => setFocoCamera(e.currentTarget.matches(":focus-visible"))}
                  onBlur={() => setFocoCamera(false)}
                  data-teste="camera-avaria"
                />
                <AjudaCamera idCamera={idCamera} />
                {r.semAvarias && lista.length === 0 && (
                  <CaixaMensagem tipo="info">Marcado: sem avarias. Se achar alguma, é só fotografar.</CaixaMensagem>
                )}
                <ListaAvarias
                  avarias={lista}
                  aoAbrir={(a) => abrirFolha({ avariaId: a.id, nova: false, fotoIds: [], lado: a.lado, descricao: a.descricao ?? "" })}
                  aoTentarDeNovo={(a) => tentarDeNovo(a.fotos.map((f) => f.id))}
                />
                {!limiteAtingido && (
                  <label htmlFor={idGaleria} className={classesBotaoArquivo("secundario", "h-toque!")}>
                    <Images size={22} strokeWidth={2.25} aria-hidden />
                    Foto da avaria pela galeria
                    <input id={idGaleria} type="file" accept="image/*" className="sr-only" onChange={aoFotografarAvaria} data-teste="galeria-avaria" />
                  </label>
                )}
                <button
                  type="button"
                  onClick={() => abrirFolha({ avariaId: novoIdFoto(), nova: true, fotoIds: [], lado: null, descricao: "" })}
                  className="inline-flex min-h-toque items-center gap-1.5 self-start rounded-md px-1 text-base font-bold text-texto-suave underline underline-offset-4"
                  data-teste="avaria-sem-foto"
                >
                  <Plus size={18} strokeWidth={2.5} aria-hidden />
                  Registrar avaria sem foto
                </button>
              </div>
            )}

            {passo === 4 && (
              <PassoPainelObjetos
                fotosPainel={painelTela}
                limiteAtingido={limiteAtingido}
                aoEscolherPainel={aoEscolherPainel}
                aoRemoverFoto={(id) => void removerFoto(id, fotosPainel)}
                aoTentarDeNovo={(id) => tentarDeNovo([id])}
                removendo={removendo}
                objetos={r.objetos}
                outros={r.outrosObjetos}
                aoAlternarObjeto={(o) =>
                  mudar((x) => {
                    const atuais = x.objetos ?? [];
                    const novos = atuais.includes(o) ? atuais.filter((y) => y !== o) : [...atuais, o];
                    return { ...x, objetos: novos.length ? novos : null }; // desmarcou o último: não informado
                  }, ["objetos"])
                }
                aoMarcarNenhum={() =>
                  mudar((x) => ({ ...x, objetos: x.objetos?.length === 0 && !x.outrosObjetos.trim() ? null : [], outrosObjetos: "" }), ["objetos"])
                }
                aoMudarOutros={(t) => mudar((x) => ({ ...x, outrosObjetos: t, objetos: x.objetos?.length ? x.objetos : null }), ["objetos"])}
                observacoes={r.observacoes}
                aoMudarObservacoes={(t) => mudar((x) => ({ ...x, observacoes: t }), ["observacoes"])}
              />
            )}

            {passo === 5 && (
              <div className="flex flex-col gap-6">
                <div ref={caixaFalta} tabIndex={-1} className="flex flex-col gap-3 outline-none">
                  {recusa && <CaixaMensagem tipo="erro">{recusa}</CaixaMensagem>}
                  {falta.length > 0 && (
                    <Cartao faixa="bg-alerta">
                      <p className="text-base font-bold">Para concluir, falta:</p>
                      <ul className="mt-1 flex flex-col" data-teste="o-que-falta">
                        {falta.map((f) => (
                          <li key={f.texto} className="flex min-h-toque flex-wrap items-center gap-x-3">
                            <span className="text-base">• {f.texto}</span>
                            {f.passo && f.passo !== 5 && (
                              <button type="button" onClick={() => irPara(f.passo!)} className="min-h-toque text-base font-bold text-info-texto underline underline-offset-4">
                                Ir ao passo {f.passo}
                              </button>
                            )}
                            {f.acao && (
                              <button type="button" onClick={f.acao.fazer} className="min-h-toque text-base font-bold text-info-texto underline underline-offset-4">
                                {f.acao.rotulo}
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    </Cartao>
                  )}
                </div>

                <ResumoVistoria
                  km={r.km}
                  horimetro={r.horimetro}
                  combustivel={r.combustivel}
                  itens={itens}
                  avarias={lista.map((a) => ({ id: a.id, lado: a.lado, descricao: a.descricao ?? null, src: a.fotos[0]?.src ?? null }))}
                  semAvarias={r.semAvarias}
                  fotosPainel={painelTela}
                  objetos={r.objetos}
                  outros={r.outrosObjetos}
                  observacoes={r.observacoes}
                  irPara={irPara}
                />

                <section className="flex flex-col gap-3" aria-labelledby="t-assinatura">
                  <h3 id="t-assinatura" className="text-xl">
                    Quem assina?
                  </h3>
                  {motivoSem ? (
                    <CaixaMensagem tipo="alerta">
                      A vistoria vai ficar marcada como sem assinatura ({motivoSem === "recusou" ? "recusou assinar" : "motorista ausente"}).
                    </CaixaMensagem>
                  ) : (
                    nomeAutorizou &&
                    r.nome.trim() !== nomeAutorizou && (
                      <button
                        type="button"
                        onClick={() => {
                          mudar((x) => ({ ...x, nome: nomeAutorizou }), ["nome"]);
                          setErroNome(undefined);
                        }}
                        className="inline-flex min-h-toque items-center self-start rounded-md border-2 border-borda bg-superficie px-3 text-base font-bold active:bg-superficie-2"
                      >
                        {nomeAutorizou} (autorizou a OS)
                      </button>
                    )
                  )}
                  <Campo
                    rotulo={motivoSem === "recusou" ? "Nome de quem recusou" : motivoSem ? "Nome do motorista" : "Nome de quem assinou"}
                    opcional={Boolean(motivoSem)}
                    value={r.nome}
                    onChange={(e) => {
                      const t = e.target.value;
                      mudar((x) => ({ ...x, nome: t }), ["nome"]);
                      if (t.trim().length >= 2) setErroNome(undefined);
                    }}
                    onBlur={() => {
                      const n = rRef.current.nome.trim();
                      const a = assinRef.current;
                      if (!motivoSem && n.length >= 2 && a && (a.envio === "pendente" || a.envio === "falhou")) void subirAssinatura(a, n);
                    }}
                    maxLength={80}
                    placeholder="Ex.: Carlos, motorista"
                    autoComplete="off"
                    enterKeyHint="done"
                    erro={motivoSem ? undefined : erroNome}
                    className="scroll-mb-28"
                    data-teste="nome-assinou"
                  />
                  {!motivoSem && (
                    <>
                      <PreviaAssinatura
                        ref={previa}
                        src={assin?.url ?? (usarAssinaturaDoBanco ? v.assinaturaUrl : null)}
                        nome={r.nome}
                        aoAssinar={() => {
                          (document.activeElement as HTMLElement | null)?.blur();
                          setAssinando(true);
                        }}
                      />
                      {assin && (
                        <p role="status" className="text-sm font-bold" data-teste="estado-assinatura">
                          {assin.envio === "enviando"
                            ? "Enviando assinatura…"
                            : assin.envio === "enviada"
                              ? "Assinatura enviada."
                              : assin.envio === "falhou"
                                ? (assin.erro ?? "A assinatura não subiu. Ela continua guardada no celular.")
                                : "Assinatura guardada no celular. Ela sobe quando o nome estiver preenchido."}
                        </p>
                      )}
                      {assin?.envio === "falhou" && (
                        <Botao variante="secundario" className="h-toque!" onClick={() => void subirAssinatura(assin, r.nome.trim())} disabled={r.nome.trim().length < 2}>
                          Tentar de novo
                        </Botao>
                      )}
                    </>
                  )}
                  {motivoSem ? (
                    <button
                      type="button"
                      onClick={() => {
                        mudar((x) => ({ ...x, semAssinaturaMotivo: null }));
                        setPerguntaSem(false);
                      }}
                      className="inline-flex min-h-toque items-center self-start rounded-md px-1 text-base font-bold text-info-texto underline underline-offset-4"
                    >
                      Voltar para a assinatura
                    </button>
                  ) : perguntaSem ? (
                    <Escolha<MotivoSemAssinatura>
                      rotulo="Por quê?"
                      name="sem_assinatura"
                      colunas={1}
                      opcoes={MOTIVOS_SEM_ASSINATURA.map((m) => ({ valor: m, rotulo: ROTULO_MOTIVO_SEM_ASSINATURA[m] }))}
                      valor={null}
                      aoMudar={(m) => {
                        mudar((x) => ({ ...x, semAssinaturaMotivo: m }));
                        setPerguntaSem(false);
                        setRecusa(null);
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      aria-expanded={perguntaSem}
                      onClick={() => setPerguntaSem(true)}
                      className="inline-flex min-h-toque items-center self-start rounded-md px-1 text-base font-bold text-texto-suave underline underline-offset-4"
                      data-teste="sem-assinatura"
                    >
                      Não tem como assinar?
                    </button>
                  )}
                </section>

                <CaixaMensagem tipo="info">Depois de concluir, a vistoria não pode ser mudada. Dá só para acrescentar observação ou foto.</CaixaMensagem>
                {!EH_PRODUCAO && (
                  <Link
                    href="/diagnostico/vistoria"
                    className="inline-flex min-h-toque items-center self-start text-sm font-bold text-info-texto underline underline-offset-4"
                  >
                    Diagnóstico da vistoria (só no ambiente de teste)
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>

        <BarraAcoesOS primario={barra.primario} secundario={barra.secundario} acima={barra.acima} />

        {avisoResto && (
          <AvisoDesfazer
            key={avisoResto.chave}
            mensagem={`${avisoResto.ids.length === 1 ? "1 item marcado" : `${avisoResto.ids.length} itens marcados`} como ok.`}
            aoDesfazer={desfazerResto}
            aoSumir={soltarResto}
          />
        )}

        <CampoAssinatura
          aberta={assinando}
          aoFechar={() => setAssinando(false)}
          valor={r.tracos}
          aoMudar={(d) => mudar((x) => ({ ...x, tracos: d }))}
          nome={r.nome}
          aoUsar={aoUsarAssinatura}
        />

        {/* A Folha não existe no servidor: só monta aberta (aviso do F4-F2). */}
        {folha && (
          <Folha
            aberta
            aoFechar={descartarFolha}
            aoPedirFechar={pedirFecharFolha}
            titulo={folha.nova ? "Nova avaria" : "Editar avaria"}
            rodape={
              perguntaFechar ? (
                <div className="flex flex-col gap-2" role="group" aria-label="Fechar a avaria">
                  <p className="text-base font-bold">{folha.nova ? "Descartar esta avaria?" : "Descartar as mudanças?"}</p>
                  <Botao variante="secundario" onClick={() => setPerguntaFechar(false)}>
                    Continuar
                  </Botao>
                  <Botao variante="secundario" onClick={salvarFolha}>
                    Salvar como está
                  </Botao>
                  <Botao variante="perigo" onClick={descartarFolha}>
                    {folha.nova ? "Descartar avaria e foto" : "Descartar mudanças"}
                  </Botao>
                </div>
              ) : confirmarRemover ? (
                <div className="flex flex-col gap-2">
                  <p className="text-base font-bold">
                    Remover a avaria &quot;{folha.lado ? ROTULO_LADO_AVARIA[folha.lado] : "sem lado"}
                    {folha.descricao.trim() ? `: ${folha.descricao.trim()}` : ""}&quot;? A foto também sai.
                  </p>
                  <Botao variante="secundario" onClick={() => setConfirmarRemover(false)}>
                    Voltar
                  </Botao>
                  <Botao variante="perigo" onClick={() => void removerAvaria()} disabled={removendo === folha.avariaId}>
                    {removendo === folha.avariaId ? "Removendo…" : "Remover avaria"}
                  </Botao>
                </div>
              ) : (
                <Botao onClick={salvarFolha} data-teste="salvar-avaria">
                  Salvar avaria
                </Botao>
              )
            }
          >
            <div className="flex flex-col gap-5">
              {erroFolha.geral && <CaixaMensagem tipo="erro">{erroFolha.geral}</CaixaMensagem>}
              {fotosFolha.length > 0 && (
                <ul className="grid grid-cols-3 gap-2" aria-label="Fotos da avaria">
                  {fotosFolha.map((f, i) => (
                    <li key={f.id}>
                      <MiniaturaVistoria
                        foto={f}
                        alt={`Foto ${i + 1} da avaria`}
                        aoRemover={() => void removerFoto(f.id, fonteFolha?.servidor ?? [])}
                        aoTentarDeNovo={() => tentarDeNovo([f.id])}
                        removendo={removendo === f.id}
                      />
                    </li>
                  ))}
                </ul>
              )}
              {fotosFolha.length < LIMITE_FOTOS_AVARIA && !limiteAtingido ? (
                <div className="grid grid-cols-2 gap-2">
                  <label htmlFor={idCameraFolha} className={classesBotaoArquivo("secundario", "h-toque! px-2")}>
                    <Camera size={20} strokeWidth={2.25} aria-hidden />
                    {fotosFolha.length ? "Outra foto" : "Tirar foto"}
                    <input id={idCameraFolha} type="file" accept="image/*" capture="environment" className="sr-only" onChange={aoOutraFotoFolha} />
                  </label>
                  <label htmlFor={idGaleriaFolha} className={classesBotaoArquivo("secundario", "h-toque! px-2")}>
                    <Images size={20} strokeWidth={2.25} aria-hidden />
                    Da galeria
                    <input id={idGaleriaFolha} type="file" accept="image/*" multiple className="sr-only" onChange={aoOutraFotoFolha} />
                  </label>
                </div>
              ) : (
                <p className="text-sm text-texto-suave">
                  {limiteAtingido ? "A vistoria chegou ao limite de 30 fotos." : `Até ${LIMITE_FOTOS_AVARIA} fotos por avaria.`}
                </p>
              )}
              <CamposAvaria
                lado={folha.lado}
                aoMudarLado={(lado) => {
                  mudar((x) => (x.folha ? { ...x, folha: { ...x.folha, lado } } : x));
                  setErroFolha((e) => ({ ...e, lado: undefined }));
                }}
                descricao={folha.descricao}
                aoMudarDescricao={(descricao) => mudar((x) => (x.folha ? { ...x, folha: { ...x.folha, descricao } } : x))}
                erroLado={erroFolha.lado}
                erroDescricao={erroFolha.descricao}
              />
              {!folha.nova && !confirmarRemover && !perguntaFechar && (
                <Botao variante="secundario" className="h-toque! text-erro-texto" onClick={() => setConfirmarRemover(true)}>
                  <Trash2 size={20} strokeWidth={2.25} aria-hidden />
                  Remover avaria
                </Botao>
              )}
            </div>
          </Folha>
        )}

        {perguntaSair && (
          <Folha aberta aoFechar={() => setPerguntaSair(false)} titulo="Sair da vistoria?">
            <div className="flex flex-col gap-3">
              <p className="text-base">
                {semInternet
                  ? "Sem internet agora. O que você marcou está guardado neste celular e vai ser enviado quando você abrir a vistoria com internet."
                  : "Ainda está salvando o que você marcou. Se sair agora, fica guardado neste celular e é enviado quando você abrir a vistoria de novo."}
              </p>
              {semInternet ? (
                <>
                  <Botao onClick={sairDaVistoria}>Sair (fica guardado)</Botao>
                  <Botao variante="secundario" onClick={() => setPerguntaSair(false)}>
                    Continuar na vistoria
                  </Botao>
                </>
              ) : (
                <>
                  <Botao onClick={() => setPerguntaSair(false)}>Esperar salvar</Botao>
                  <Botao variante="secundario" onClick={sairDaVistoria}>
                    Sair mesmo assim
                  </Botao>
                </>
              )}
            </div>
          </Folha>
        )}
      </Pagina>
    </>
  );
}

/** Primeiro passo com pendência, pelo que está no aparelho (retomada). */
function primeiroPendente(x: RascunhoVistoria, qtdAvariasServidor: number): NumeroPasso | null {
  if (erroKm(x.km) || !x.combustivel) return 1;
  if (Object.values(x.itens).some((i) => !i.situacao)) return 2;
  if (qtdAvariasServidor === 0 && Object.keys(x.avarias).length === 0 && !x.semAvarias) return 3;
  if (x.folha) return 3;
  return null;
}
