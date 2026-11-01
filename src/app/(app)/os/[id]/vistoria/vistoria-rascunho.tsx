"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Camera, Check, Images, ListChecks, Lock, Plus, Trash2 } from "lucide-react";
import { AjudaCamera } from "@/components/fotos/ajuda-camera";
import { useFila, useSemInternet } from "@/components/fotos/usar-fila";
import { BarraAcoesOS } from "@/components/os/barra-acoes-os";
import { Botao, classesBotao } from "@/components/ui/botao";
import { Campo } from "@/components/ui/campo";
import { Cartao } from "@/components/ui/estados";
import { Folha } from "@/components/ui/folha";
import { CaixaMensagem } from "@/components/ui/formulario";
import { CampoAssinatura, type ResultadoAssinatura } from "@/components/vistoria/campo-assinatura";
import { CamposAvaria, ListaAvarias, type DadosAvaria, type FotoAvaria } from "@/components/vistoria/cartao-avaria";
import { PreviaAssinatura } from "@/components/vistoria/previa-assinatura";
import { type DadosAssinatura } from "@/lib/assinatura";
import { EH_PRODUCAO } from "@/lib/brand";
import { traduzirErro } from "@/lib/erros";
import { formatarDiaHora, LIMITE_FOTOS_AVARIA, type LadoAvaria } from "@/lib/formato";
import { aquecerConexao, ErroEnvio, novoIdFoto } from "@/lib/fotos/enviar";
import { adicionarArquivos, aoConfirmarFoto, definirTipo, descartar, iniciarFila, lerFila, tentarDeNovo, type ItemFila } from "@/lib/fotos/fila";
import { BUCKET_VISTORIAS } from "@/lib/fotos/regras";
import { createClient } from "@/lib/supabase/client";
import { concluirVistoria, enviarAssinatura, guardarDiagVistoria } from "@/lib/vistoria/envio";

export type AvariaServidor = {
  id: string;
  lado: LadoAvaria;
  descricao: string | null;
  fotos: { id: string; caminho: string; caminhoMiniatura: string; src: string | null; enviada: boolean }[];
};

type DadosVistoria = {
  id: string;
  podeEditar: boolean;
  semAvarias: boolean;
  itensMarcados: number;
  itensTotal: number;
  fotosPendentes: number;
  assinadoPorNome: string | null;
  assinaturaId: string | null;
  assinaturaUrl: string | null;
  criadoPorNome: string | null;
  criadoEm: string | null;
};

/** Assinatura feita neste aparelho (ainda não confirmada pela conclusão). */
type AssinaturaLocal = {
  id: string;
  blob: Blob;
  url: string;
  largura: number;
  altura: number;
  dados: DadosAssinatura;
  envio: "pendente" | "enviando" | "enviada" | "falhou";
  /** Nome registrado junto com este PNG (mudou depois = só salva o nome). */
  nomeEnviado?: string;
  erro?: string;
};

type FolhaAvaria = { avariaId: string; nova: boolean; fotoIds: string[]; lado: LadoAvaria | null; descricao: string };

const ANDANDO = new Set<ItemFila["estado"]>(["preparando", "na_fila", "enviando"]);
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MSG_REDE = "Sem conexão com o servidor. Confira a internet e tente de novo.";

/**
 * Vistoria em rascunho — tela única do F4-B2 (o fluxo em 5 passos é o F4-B4):
 * avarias (foto pela fila da Fase 3 → lado → descrição) ou "Sem avarias"; checklist só com
 * "Marcar o resto como ok"; nome + assinatura (o PNG sobe assim que tem nome); "Concluir"
 * espera as fotos, garante a assinatura no Storage e chama `concluir_vistoria`, que trava.
 */
export function VistoriaRascunho({
  osId,
  numeroOS,
  placa,
  usuarioId,
  vistoria: v,
  avarias,
}: {
  osId: string;
  numeroOS: number | null;
  placa: string;
  usuarioId: string;
  vistoria: DadosVistoria;
  avarias: AvariaServidor[];
}) {
  const router = useRouter();
  const idCamera = useId();
  const idGaleria = useId();
  const fila = useFila();
  const semInternet = useSemInternet();
  const supabase = useMemo(() => createClient(), []);

  const [folha, setFolha] = useState<FolhaAvaria | null>(null);
  const [erroFolha, setErroFolha] = useState<{ lado?: string; descricao?: string; geral?: string }>({});
  const [salvando, setSalvando] = useState(false);
  const [confirmarRemover, setConfirmarRemover] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const [nome, setNome] = useState(v.assinadoPorNome ?? "");
  const [erroNome, setErroNome] = useState<string>();
  const [assinando, setAssinando] = useState(false);
  const [tracos, setTracos] = useState<DadosAssinatura | null>(null);
  const [local, setLocal] = useState<AssinaturaLocal | null>(null);
  const localRef = useRef<AssinaturaLocal | null>(null);
  useEffect(() => {
    localRef.current = local;
  }, [local]);
  const previa = useRef<HTMLButtonElement>(null);

  const [confirmando, setConfirmando] = useState(false);
  const [etapa, setEtapa] = useState<string | null>(null);
  const [recusa, setRecusa] = useState<string | null>(null);
  const caixaFalta = useRef<HTMLDivElement>(null);

  // ------------------------------------------------ fila e conexão
  useEffect(() => {
    void iniciarFila(usuarioId);
    void aquecerConexao();
  }, [usuarioId]);
  useEffect(
    () =>
      aoConfirmarFoto((_os, id) => {
        const i = lerFila().itens.find((x) => x.id === id);
        if (i?.vistoria?.vistoriaId === v.id) router.refresh();
      }),
    [router, v.id],
  );
  useEffect(() => {
    const url = local?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [local?.url]);

  const daVistoria = fila.itens.filter((i) => i.usuarioId === usuarioId && i.vistoria?.vistoriaId === v.id);
  const naFila = daVistoria.filter((i) => i.categoria !== null && i.estado !== "confirmada");

  // Avarias do servidor + fotos ainda na fila deste aparelho.
  const lista: DadosAvaria[] = avarias.map((a) => {
    const doServidor: FotoAvaria[] = a.fotos
      .filter((f) => f.enviada || !daVistoria.some((i) => i.id === f.id))
      .map((f) => ({ id: f.id, src: f.src, estado: f.enviada ? "enviada" : "falhou" }));
    const daFila: FotoAvaria[] = daVistoria
      .filter((i) => i.vistoria?.avariaId === a.id && i.categoria !== null && !a.fotos.some((f) => f.enviada && f.id === i.id))
      .map((i) => ({ id: i.id, src: i.previa, estado: i.estado, progresso: i.progresso }));
    return { id: a.id, lado: a.lado, descricao: a.descricao, fotos: [...daFila, ...doServidor] };
  });

  // ------------------------------------------------ avarias
  function aoEscolherFoto(ev: ChangeEvent<HTMLInputElement>) {
    const arquivo = ev.target.files?.[0];
    ev.target.value = "";
    if (!arquivo) return;
    const avariaId = novoIdFoto();
    const ids = adicionarArquivos([arquivo], { osId, numeroOS, vistoria: { vistoriaId: v.id, avariaId, tipo: "avaria" } });
    setErroFolha({});
    setFolha({ avariaId, nova: true, fotoIds: ids, lado: null, descricao: "" });
  }

  function fecharFolha() {
    if (folha?.nova) descartar(folha.fotoIds);
    setFolha(null);
    setConfirmarRemover(false);
  }

  async function salvarAvaria() {
    if (!folha) return;
    const descricao = folha.descricao.trim();
    const e: typeof erroFolha = {};
    if (!folha.lado) e.lado = "Escolha o lado da avaria.";
    if (!descricao && folha.fotoIds.length === 0 && folha.nova) e.descricao = "Escreva o que é ou tire uma foto.";
    setErroFolha(e);
    if (e.lado || e.descricao) return;
    setSalvando(true);
    const r = await supabase
      .rpc("salvar_avaria", { p_id: folha.avariaId, p_vistoria_id: v.id, p_lado: folha.lado, p_descricao: descricao })
      .then((x) => x, () => ({ error: { message: "rede" } }));
    setSalvando(false);
    if (r.error) {
      setErroFolha({ geral: r.error.message === "rede" ? MSG_REDE : traduzirErro(r.error, "os") });
      return;
    }
    // A avaria já existe no banco: agora a foto pode registrar com o avaria_id.
    if (folha.fotoIds.length) await definirTipo(folha.fotoIds, "outro", null);
    setRecusa(null);
    setFolha(null);
    router.refresh();
  }

  async function removerAvaria() {
    if (!folha) return;
    setSalvando(true);
    const a = avarias.find((x) => x.id === folha.avariaId);
    const arquivos = (a?.fotos ?? []).flatMap((f) => [f.caminho, f.caminhoMiniatura]);
    if (arquivos.length) await supabase.storage.from(BUCKET_VISTORIAS).remove(arquivos);
    const r = await supabase.rpc("remover_avaria", { p_id: folha.avariaId }).then((x) => x, () => ({ error: { message: "rede" } }));
    setSalvando(false);
    if (r.error) {
      setErroFolha({ geral: r.error.message === "rede" ? MSG_REDE : traduzirErro(r.error, "os") });
      return;
    }
    descartar(daVistoria.filter((i) => i.vistoria?.avariaId === folha.avariaId).map((i) => i.id));
    setFolha(null);
    setConfirmarRemover(false);
    router.refresh();
  }

  async function rpcSimples(rotulo: string, fazer: () => PromiseLike<{ error: { message?: string } | null }>) {
    setErro(null);
    setOcupado(rotulo);
    const r = await Promise.resolve(fazer()).then((x) => x, () => ({ error: { message: "rede" } }));
    setOcupado(null);
    if (r.error) setErro(r.error.message === "rede" ? MSG_REDE : traduzirErro(r.error, "os"));
    else {
      setRecusa(null); // a recusa anterior pode já não valer
      router.refresh();
    }
  }

  // ------------------------------------------------ assinatura
  async function subirAssinatura(a: AssinaturaLocal, nomeAtual: string): Promise<boolean> {
    const atualizar = (patch: Partial<AssinaturaLocal>) => setLocal((x) => (x && x.id === a.id ? { ...x, ...patch } : x));
    atualizar({ envio: "enviando", erro: undefined });
    try {
      const r = await enviarAssinatura({ vistoriaId: v.id, assinaturaId: a.id, nome: nomeAtual, png: a.blob, largura: a.largura, altura: a.altura });
      atualizar({ envio: "enviada", nomeEnviado: nomeAtual });
      if (localRef.current?.id === a.id) localRef.current = { ...localRef.current, envio: "enviada", nomeEnviado: nomeAtual };
      void guardarDiagVistoria({ resultado: "enviada", vistoriaId: v.id, caminho: r.caminho, largura: a.largura, altura: a.altura, etapas: r.etapas, totalMs: r.totalMs, png: a.blob, dados: a.dados });
      return true;
    } catch (e) {
      const msg = e instanceof ErroEnvio ? e.message : MSG_REDE;
      atualizar({ envio: "falhou", erro: msg });
      void guardarDiagVistoria({ resultado: "erro", erro: `${msg} (${e instanceof ErroEnvio ? e.detalhe : String(e)})`, vistoriaId: v.id, largura: a.largura, altura: a.altura, png: a.blob, dados: a.dados });
      return false;
    }
  }

  function aoUsarAssinatura(r: ResultadoAssinatura) {
    const nova: AssinaturaLocal = {
      id: novoIdFoto(), // assinar de novo = id e caminho novos (nada é sobrescrito)
      blob: r.blob,
      url: URL.createObjectURL(r.blob),
      largura: r.largura,
      altura: r.altura,
      dados: r.dados,
      envio: "pendente",
    };
    setTracos(r.dados);
    setLocal(nova);
    setRecusa(null);
    setAssinando(false);
    const n = nome.trim();
    if (n.length >= 2) void subirAssinatura(nova, n);
    else setErroNome("Escreva o nome de quem assinou.");
  }

  // ------------------------------------------------ o que falta
  const temAssinatura = Boolean(local) || Boolean(v.assinaturaUrl);
  const falta: string[] = [];
  const semMarcar = v.itensTotal - v.itensMarcados;
  if (semMarcar > 0) falta.push(semMarcar === 1 ? "Falta 1 item do checklist." : `Faltam ${semMarcar} itens do checklist.`);
  if (avarias.length === 0 && !v.semAvarias) falta.push("Dizer se tem avaria (ou Sem avarias).");
  const falhas = naFila.filter((i) => !ANDANDO.has(i.estado));
  if (falhas.length) falta.push(falhas.length === 1 ? "1 foto ainda não enviada." : `${falhas.length} fotos ainda não enviadas.`);
  if (nome.trim().length < 2) falta.push("Nome de quem assinou.");
  if (!temAssinatura) falta.push("Falta a assinatura. Peça para o motorista assinar.");

  // ------------------------------------------------ concluir
  async function concluir() {
    setConfirmando(false);
    setRecusa(null);
    setErro(null);
    const nomeAtual = nome.trim();
    // 1) espera as fotos da vistoria saírem da fila (o motorista está esperando)
    const fim = Date.now() + 180_000;
    for (;;) {
      const minhas = lerFila().itens.filter((i) => i.vistoria?.vistoriaId === v.id && i.categoria !== null && i.estado !== "confirmada");
      const andando = minhas.filter((i) => ANDANDO.has(i.estado));
      if (!andando.length || Date.now() > fim) break;
      setEtapa(`Enviando fotos (${minhas.length - andando.length + 1} de ${minhas.length})…`);
      await espera(500);
    }
    // 2) assinatura no Storage (re-registra com o nome atual: mesmo id, mesmo caminho)
    const a = localRef.current;
    if (a && a.envio === "enviada" && nomeAtual.length >= 2) {
      // PNG já está no Storage: se o nome mudou, só grava o nome novo (sem subir de novo).
      if (a.nomeEnviado !== nomeAtual) {
        await supabase.rpc("salvar_vistoria", { p_vistoria_id: v.id, p_assinado_por_nome: nomeAtual }).then((x) => x, () => null);
      }
    } else if (a && nomeAtual.length >= 2) {
      setEtapa("Enviando assinatura…");
      if (!(await subirAssinatura(a, nomeAtual))) {
        setEtapa(null);
        setRecusa("A assinatura não subiu. Ela continua guardada no celular. Toque em Concluir de novo.");
        return;
      }
    } else if (!a && nomeAtual.length >= 2 && nomeAtual !== (v.assinadoPorNome ?? "")) {
      await supabase.rpc("salvar_vistoria", { p_vistoria_id: v.id, p_assinado_por_nome: nomeAtual }).then((x) => x, () => null);
    }
    // 3) concluir (o banco confere tudo e trava)
    setEtapa("Concluindo…");
    let r = await concluirVistoria(v.id);
    if ("codigo" in r && r.codigo === "assinatura_nao_enviada" && a && nomeAtual.length >= 2) {
      setEtapa("Enviando assinatura…");
      if (await subirAssinatura(a, nomeAtual)) r = await concluirVistoria(v.id);
    }
    setEtapa(null);
    if ("codigo" in r) {
      setRecusa(r.mensagem);
      if (r.codigo === "vistoria_concluida") router.refresh();
      requestAnimationFrame(() => caixaFalta.current?.scrollIntoView({ block: "center" }));
      return;
    }
    router.replace(`/os/${osId}/vistoria?concluida=1`);
    router.refresh();
  }

  if (!v.podeEditar) {
    return (
      <div className="flex flex-col gap-6">
        <CaixaMensagem tipo="info">
          Vistoria em andamento{v.criadoPorNome ? `, começada por ${v.criadoPorNome}` : ""} em {formatarDiaHora(v.criadoEm)}. Ela é feita pelo
          balcão ou pelo mecânico da OS.
        </CaixaMensagem>
        <ListaAvarias avarias={lista} leitura />
      </div>
    );
  }

  const folhaFotos = folha ? daVistoria.filter((i) => folha.fotoIds.includes(i.id)) : [];
  const avariaAberta = folha && !folha.nova ? lista.find((a) => a.id === folha.avariaId) : null;

  return (
    <div className="flex flex-col gap-8" data-teste="vistoria-rascunho">
      <CaixaMensagem tipo="info">
        Versão de teste da vistoria: avaria com foto e assinatura. O resto dos passos vem depois.
      </CaixaMensagem>
      {erro && <CaixaMensagem tipo="erro">{erro}</CaixaMensagem>}

      {/* ------------------------------------------------ avarias */}
      <section className="flex flex-col gap-3" aria-labelledby="t-avarias">
        <h2 id="t-avarias" className="sr-only">
          Avarias
        </h2>
        <p className="text-base text-texto-suave">
          Dê a volta no caminhão. Para cada risco, amassado ou peça quebrada: tire a foto, escolha o lado e diga o que é.
        </p>
        <ListaAvarias
          avarias={lista}
          aoAbrir={(a) => {
            setErroFolha({});
            setFolha({ avariaId: a.id, nova: false, fotoIds: [], lado: a.lado, descricao: a.descricao ?? "" });
          }}
          aoTentarDeNovo={(a) => tentarDeNovo(a.fotos.map((f) => f.id))}
        />
        <div className="flex flex-col gap-2">
          <label htmlFor={idCamera} className={classesBotao("primario", "w-full cursor-pointer")}>
            <Camera size={24} strokeWidth={2.25} aria-hidden />
            Fotografar avaria
            <input id={idCamera} type="file" accept="image/*" capture="environment" className="sr-only" onChange={aoEscolherFoto} data-teste="camera-avaria" />
          </label>
          <label htmlFor={idGaleria} className={classesBotao("secundario", "h-toque! w-full cursor-pointer")}>
            <Images size={22} strokeWidth={2.25} aria-hidden />
            Foto da galeria
            <input id={idGaleria} type="file" accept="image/*" className="sr-only" onChange={aoEscolherFoto} data-teste="galeria-avaria" />
          </label>
        </div>
        <AjudaCamera idCamera={idCamera} />
        <Botao
          variante="secundario"
          className="h-toque!"
          onClick={() => {
            setErroFolha({});
            setFolha({ avariaId: novoIdFoto(), nova: true, fotoIds: [], lado: null, descricao: "" });
          }}
        >
          <Plus size={20} strokeWidth={2.25} aria-hidden />
          Registrar avaria sem foto
        </Botao>
        {avarias.length === 0 && (
          <Botao
            variante="secundario"
            aria-pressed={v.semAvarias}
            disabled={ocupado !== null}
            onClick={() => rpcSimples("sem", () => supabase.rpc("salvar_vistoria", { p_vistoria_id: v.id, p_sem_avarias: !v.semAvarias }))}
            className={v.semAvarias ? "border-sucesso!" : ""}
          >
            {v.semAvarias && <Check size={22} strokeWidth={2.5} aria-hidden />}
            {v.semAvarias ? "Sem avarias (marcado)" : "Sem avarias"}
          </Botao>
        )}
      </section>

      {/* ------------------------------------------------ checklist (mínimo) */}
      <section className="flex flex-col gap-3" aria-labelledby="t-checklist">
        <h2 id="t-checklist" className="text-xl">
          Checklist
        </h2>
        <p className="text-base" data-teste="contagem-checklist">
          {v.itensMarcados} de {v.itensTotal} itens marcados.
        </p>
        {semMarcar > 0 && (
          <Botao
            variante="secundario"
            disabled={ocupado !== null}
            onClick={() => rpcSimples("resto", () => supabase.rpc("marcar_itens_restantes_ok", { p_vistoria_id: v.id }))}
          >
            <ListChecks size={22} strokeWidth={2.25} aria-hidden />
            {ocupado === "resto" ? "Marcando…" : "Marcar o resto como ok"}
          </Botao>
        )}
      </section>

      {/* ------------------------------------------------ assinatura */}
      <section className="flex flex-col gap-3" aria-labelledby="t-assinatura">
        <h2 id="t-assinatura" className="text-xl">
          Quem assina?
        </h2>
        <Campo
          rotulo="Nome de quem assinou"
          value={nome}
          onChange={(e) => {
            setNome(e.target.value);
            if (e.target.value.trim().length >= 2) setErroNome(undefined);
          }}
          onBlur={() => {
            const n = nome.trim();
            if (n.length >= 2 && local && local.envio !== "enviada" && local.envio !== "enviando") void subirAssinatura(local, n);
          }}
          maxLength={80}
          placeholder="Ex.: Carlos, motorista"
          autoComplete="off"
          enterKeyHint="done"
          erro={erroNome}
        />
        <PreviaAssinatura ref={previa} src={local?.url ?? v.assinaturaUrl} nome={nome} aoAssinar={() => setAssinando(true)} />
        {local && (
          <p role="status" className="text-sm font-bold" data-teste="estado-assinatura">
            {local.envio === "enviando"
              ? "Enviando assinatura…"
              : local.envio === "enviada"
                ? "Assinatura enviada."
                : local.envio === "falhou"
                  ? (local.erro ?? "A assinatura não subiu.")
                  : "Assinatura guardada no celular. Ela sobe quando o nome estiver preenchido."}
          </p>
        )}
        {local?.envio === "falhou" && (
          <Botao variante="secundario" className="h-toque!" onClick={() => void subirAssinatura(local, nome.trim())} disabled={nome.trim().length < 2}>
            Tentar de novo
          </Botao>
        )}
      </section>

      {/* ------------------------------------------------ o que falta e concluir */}
      <div ref={caixaFalta} className="flex flex-col gap-3" tabIndex={-1}>
        {recusa && <CaixaMensagem tipo="erro">{recusa}</CaixaMensagem>}
        {falta.length > 0 && (
          <Cartao faixa="bg-alerta">
            <p className="text-base font-bold">Para concluir, falta:</p>
            <ul className="mt-1 list-disc pl-5 text-base" data-teste="o-que-falta">
              {falta.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </Cartao>
        )}
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

      <BarraAcoesOS
        acima={
          confirmando ? (
            <div className="flex flex-col gap-2 py-1" role="group" aria-label="Confirmar conclusão">
              <p className="text-base font-bold">Concluir a vistoria de {placa}?</p>
              <p className="text-sm text-texto-suave">Depois disso nada pode ser mudado, nem pelo dono.</p>
              <div className="flex gap-2">
                <Botao variante="secundario" className="h-toque! flex-1" onClick={() => setConfirmando(false)}>
                  Voltar e conferir
                </Botao>
                <Botao className="h-toque! flex-1" onClick={() => void concluir()} data-teste="confirmar-concluir">
                  Concluir
                </Botao>
              </div>
            </div>
          ) : semInternet ? (
            <p className="text-sm font-bold text-alerta-texto">Sem internet. Para concluir, espere a internet voltar. Nada se perde.</p>
          ) : null
        }
        primario={
          <Botao onClick={() => setConfirmando(true)} disabled={semInternet || etapa !== null || confirmando} aria-busy={etapa !== null}>
            <Lock size={22} strokeWidth={2.25} aria-hidden />
            {etapa ?? "Concluir vistoria"}
          </Botao>
        }
      />

      <CampoAssinatura
        aberta={assinando}
        aoFechar={() => setAssinando(false)}
        valor={tracos}
        aoMudar={setTracos}
        nome={nome}
        aoUsar={aoUsarAssinatura}
      />

      {/* A Folha não existe no servidor: só monta aberta (aviso do F4-F2). */}
      {folha && (
        <Folha
          aberta
          aoFechar={fecharFolha}
          titulo={folha.nova ? "Nova avaria" : "Avaria"}
          rodape={
            confirmarRemover ? (
              <div className="flex flex-col gap-2">
                <p className="text-base font-bold">Remover esta avaria? A foto também sai.</p>
                <Botao variante="secundario" onClick={() => setConfirmarRemover(false)}>
                  Voltar
                </Botao>
                <Botao variante="perigo" onClick={() => void removerAvaria()} disabled={salvando}>
                  {salvando ? "Removendo…" : "Remover avaria"}
                </Botao>
              </div>
            ) : (
              <Botao onClick={() => void salvarAvaria()} disabled={salvando} aria-busy={salvando} data-teste="salvar-avaria">
                {salvando ? "Salvando…" : "Salvar avaria"}
              </Botao>
            )
          }
        >
          <div className="flex flex-col gap-5">
            {erroFolha.geral && <CaixaMensagem tipo="erro">{erroFolha.geral}</CaixaMensagem>}
            {folha.nova && folha.fotoIds.length > 0 && (
              <div className="flex items-center gap-3">
                <span className="flex size-24 items-center justify-center overflow-hidden rounded-md bg-superficie-2">
                  {folhaFotos[0]?.previa ? (
                    // blob: local: sem otimizador do Next.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={folhaFotos[0].previa} alt="Foto da avaria" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-sm text-texto-suave">Preparando…</span>
                  )}
                </span>
                <p className="text-sm text-texto-suave">A foto sobe sozinha depois de salvar.</p>
              </div>
            )}
            {avariaAberta && avariaAberta.fotos.length > 0 && (
              <p className="text-sm text-texto-suave">
                {avariaAberta.fotos.length} de {LIMITE_FOTOS_AVARIA} fotos.
              </p>
            )}
            <CamposAvaria
              lado={folha.lado}
              aoMudarLado={(lado) => setFolha({ ...folha, lado })}
              descricao={folha.descricao}
              aoMudarDescricao={(descricao) => setFolha({ ...folha, descricao })}
              erroLado={erroFolha.lado}
              erroDescricao={erroFolha.descricao}
            />
            {!folha.nova && !confirmarRemover && (
              <Botao variante="secundario" className="h-toque! text-erro-texto" onClick={() => setConfirmarRemover(true)}>
                <Trash2 size={20} strokeWidth={2.25} aria-hidden />
                Remover avaria
              </Botao>
            )}
          </div>
        </Folha>
      )}
    </div>
  );
}
