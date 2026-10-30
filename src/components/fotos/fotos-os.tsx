"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Camera, Images } from "lucide-react";
import { classesBotao } from "@/components/ui/botao";
import { CaixaMensagem } from "@/components/ui/formulario";
import { FaixaEnvioFotos } from "@/components/os/faixa-envio-fotos";
import { FolhaEditarFoto } from "@/components/os/escolha-categoria-foto";
import { FotoTelaCheia, type FotoTelaCheiaDados } from "@/components/os/foto-tela-cheia";
import { fotos as nFotos } from "@/components/os/categorias-foto";
import { GradeFotos, type DadosMiniaturaFoto } from "@/components/os/grade-fotos";
import { EH_PRODUCAO } from "@/lib/brand";
import type { Papel } from "@/lib/contexto";
import { traduzirErro } from "@/lib/erros";
import { CATEGORIAS_FOTO, type CategoriaFoto } from "@/lib/formato";
import { aquecerConexao } from "@/lib/fotos/enviar";
import { adicionarArquivos, aoConfirmarFoto, definirTipo, descartar, iniciarFila, tentarDeNovo, type ItemFila } from "@/lib/fotos/fila";
import { BUCKET_FOTOS, LIMITE_FOTOS_OS, VALIDADE_URL_FOTO_S } from "@/lib/fotos/regras";
import { createClient } from "@/lib/supabase/client";
import { AjudaCamera } from "./ajuda-camera";
import { FolhaTipoFoto } from "./folha-tipo-foto";
import { useFila, useSituacaoEnvio } from "./usar-fila";

/** Foto enviada (de `vw_os_fotos`), já com a URL assinada da miniatura. */
export type FotoDaGrade = {
  id: string;
  categoria: CategoriaFoto;
  legenda: string | null;
  caminho: string;
  caminhoMiniatura: string;
  /** URL assinada da miniatura (15 min); null = não deu para assinar. */
  url: string | null;
  criadoPorNome: string | null;
  enviadaEm: string | null;
  /** Regra do banco para quem consulta (apagar e editar tipo/legenda usam a mesma). */
  podeApagar: boolean;
};

/** Renova as URLs assinadas 2 min antes de vencer (valem 15 min). */
const RENOVAR_MS = (VALIDADE_URL_FOTO_S - 120) * 1000;

const ehCategoria = (c: string | null | undefined): c is CategoriaFoto => (CATEGORIAS_FOTO as readonly string[]).includes(c ?? "");

function semChave<T>(obj: Record<string, T>, chave: string): Record<string, T> {
  const copia = { ...obj };
  delete copia[chave];
  return copia;
}

/** Lê a lista e assina as miniaturas direto do navegador (Supabase em São Paulo, sem passar pela Vercel). */
async function lerLista(osId: string): Promise<FotoDaGrade[] | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("vw_os_fotos")
    .select("id, categoria, legenda, caminho, caminho_miniatura, criado_por_nome, enviada_em, pode_apagar")
    .eq("os_id", osId)
    .order("enviada_em", { ascending: false });
  if (error) return null;
  const linhas = (data ?? []).filter((f) => f.id && f.caminho && f.caminho_miniatura);
  const urls = new Map<string, string>();
  if (linhas.length) {
    const { data: assinadas } = await supabase.storage.from(BUCKET_FOTOS).createSignedUrls(
      linhas.map((f) => f.caminho_miniatura!),
      VALIDADE_URL_FOTO_S,
    );
    for (const s of assinadas ?? []) if (s.path && s.signedUrl && !s.error) urls.set(s.path, s.signedUrl);
  }
  return linhas.map((f) => ({
    id: f.id!,
    categoria: ehCategoria(f.categoria) ? f.categoria : "outro",
    legenda: f.legenda,
    caminho: f.caminho!,
    caminhoMiniatura: f.caminho_miniatura!,
    url: urls.get(f.caminho_miniatura!) ?? null,
    criadoPorNome: f.criado_por_nome,
    enviadaEm: f.enviada_em,
    podeApagar: Boolean(f.pode_apagar),
  }));
}

/**
 * Seção "Fotos" do detalhe da OS (DESIGN §11.5 a §11.8, F3-B5), para todos os papéis:
 * várias fotos de uma vez, tipo (tocar já envia) e legenda, fila guardada no aparelho com
 * progresso / falhou / "Tentar de novo", grade de miniaturas, tela cheia com editar e apagar.
 * O que cada um pode fazer vem do banco (`pode_apagar`, F3.4); a tela só mostra o permitido.
 */
export function FotosOS({
  osId,
  numeroOS,
  usuarioId,
  papel,
  podeEnviar,
  fotos,
  assinadasEm,
  erroLista,
}: {
  osId: string;
  numeroOS: number | null;
  usuarioId: string;
  papel: Papel;
  podeEnviar: boolean;
  fotos: FotoDaGrade[];
  /** Quando o servidor assinou as miniaturas (ms). */
  assinadasEm: number;
  erroLista?: boolean;
}) {
  const ehMecanico = papel === "mecanico";
  const idCamera = useId();
  const idGaleria = useId();
  const secao = useRef<HTMLElement>(null);

  // Lista do servidor; depois de cada envio/apagar/renovar, relida pelo navegador.
  const [origem, setOrigem] = useState(fotos);
  const [lista, setLista] = useState(fotos);
  const [assinadas, setAssinadas] = useState(assinadasEm);
  const [erro, setErro] = useState(Boolean(erroLista));
  if (origem !== fotos) {
    setOrigem(fotos);
    setLista(fotos);
    setAssinadas(assinadasEm);
    setErro(Boolean(erroLista));
  }

  const fila = useFila();
  const daOS = useMemo(() => fila.itens.filter((i) => i.osId === osId && i.usuarioId === usuarioId), [fila.itens, osId, usuarioId]);
  const naGrade = daOS.filter((i) => i.categoria !== null);
  const { situacao, zerar } = useSituacaoEnvio(fila.itens, (i) => i.osId === osId);

  const [lote, setLote] = useState<{ ids: string[]; cortadas: number; chave: number } | null>(null);
  const loteItens = lote ? daOS.filter((i) => lote.ids.includes(i.id)) : [];
  const [tela, setTela] = useState<{ aberta: boolean; indice: number }>({ aberta: false, indice: 0 });
  const [grandes, setGrandes] = useState<Record<string, { url: string; vence: number }>>({});
  const [editando, setEditando] = useState<string | null>(null);

  // ------------------------------------------------ fila do aparelho e conexão
  useEffect(() => {
    void iniciarFila(usuarioId);
  }, [usuarioId]);

  // Aquece a sessão e a conexão com o Supabase logo ao abrir a OS (1º envio sem esperar token + TLS).
  useEffect(() => {
    if (!podeEnviar) return;
    const t = setTimeout(() => void aquecerConexao(), 800);
    return () => clearTimeout(t);
  }, [podeEnviar]);

  const recarregar = useCallback(async () => {
    const nova = await lerLista(osId);
    if (nova === null) {
      setErro(true);
      return;
    }
    setErro(false);
    setLista(nova);
    setAssinadas(Date.now());
  }, [osId]);

  useEffect(() => aoConfirmarFoto((o) => o === osId && void recarregar()), [osId, recarregar]);

  // URL assinada vencendo com a tela aberta: renova sozinha (e ao voltar para a aba).
  useEffect(() => {
    const falta = Math.max(5_000, assinadas + RENOVAR_MS - Date.now());
    const t = setTimeout(() => void recarregar(), falta);
    const aoVoltar = () => {
      if (document.visibilityState === "visible" && Date.now() - assinadas > RENOVAR_MS) void recarregar();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      clearTimeout(t);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [assinadas, recarregar]);

  // ------------------------------------------------ contagem e limite de 40
  const idsServidor = new Set(lista.map((f) => f.id));
  const naFilaPendentes = daOS.filter((i) => !idsServidor.has(i.id) && i.estado !== "nao_enviavel");
  const total = lista.length + naFilaPendentes.filter((i) => i.categoria !== null).length;
  const ocupadas = lista.length + naFilaPendentes.length;
  const cabem = Math.max(0, LIMITE_FOTOS_OS - ocupadas);
  const cheio = cabem === 0;
  const retomadas = daOS.filter((i) => i.retomada && i.estado !== "confirmada" && i.estado !== "nao_enviavel");

  // ------------------------------------------------ escolher fotos
  function aoEscolher(ev: ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(ev.target.files ?? []);
    ev.target.value = ""; // deixa escolher o mesmo arquivo de novo
    if (!arquivos.length || cheio) return;
    void aquecerConexao();
    const entram = arquivos.slice(0, cabem);
    const ids = adicionarArquivos(entram, { osId, numeroOS });
    if (ids.length) setLote({ ids, cortadas: arquivos.length - entram.length, chave: Date.now() });
  }

  function escolherTipo(categoria: CategoriaFoto, legenda: string) {
    if (!lote) return;
    void definirTipo(lote.ids, categoria, legenda);
    setLote(null);
  }

  function descartarLote() {
    if (!lote) return;
    descartar(lote.ids);
    setLote(null);
  }

  // ------------------------------------------------ grade + tela cheia (mesma ordem)
  const itensGrade: (DadosMiniaturaFoto & { fila?: ItemFila; servidor?: FotoDaGrade })[] = [
    ...[...naGrade]
      .sort((a, b) => b.criadoEm - a.criadoEm)
      .map((i) => ({
        id: i.id,
        src: i.previa ?? null,
        categoria: i.categoria!,
        legenda: i.legenda,
        estado: i.estado,
        progresso: i.progresso,
        fila: i,
      })),
    ...lista
      .filter((f) => !naGrade.some((i) => i.id === f.id))
      .map((f) => ({
        id: f.id,
        src: f.url,
        categoria: f.categoria,
        legenda: f.legenda,
        enviadoPor: f.criadoPorNome,
        enviadoEm: f.enviadaEm,
        estado: (f.url ? "enviada" : "sem_imagem") as DadosMiniaturaFoto["estado"],
        servidor: f,
      })),
  ];

  const dadosTela: FotoTelaCheiaDados[] = itensGrade.map((g) => {
    if (g.fila) {
      const confirmada = g.fila.estado === "confirmada";
      return {
        ...g,
        estado: confirmada ? "confirmada" : g.estado,
        srcGrande: g.fila.previaGrande ?? null,
        podeApagar: !confirmada,
        motivo: g.fila.motivo,
      };
    }
    const s = g.servidor!;
    const grande = grandes[s.id];
    return { ...g, srcGrande: grande?.url ?? null, podeApagar: s.podeApagar, podeEditar: s.podeApagar };
  });

  // A foto grande só é assinada (e baixada) ao abrir na tela cheia.
  const atual = tela.aberta ? itensGrade[Math.min(tela.indice, itensGrade.length - 1)] : undefined;
  const caminhoAtual = atual?.servidor?.caminho;
  const idAtual = atual?.servidor?.id;
  const urlGrandeAtual = idAtual ? grandes[idAtual]?.url : undefined;
  const grandesRef = useRef(grandes);
  useEffect(() => {
    grandesRef.current = grandes;
  }, [grandes]);
  useEffect(() => {
    if (!idAtual || !caminhoAtual) return;
    let vivo = true;
    let renovar: ReturnType<typeof setTimeout> | undefined;
    const agendar = (vence: number) => {
      // Tela aberta na mesma foto até a URL vencer: assina de novo 1 min antes.
      renovar = setTimeout(() => {
        if (vivo) setGrandes((g) => semChave(g, idAtual));
      }, Math.max(1_000, vence - Date.now()));
    };
    const ja = grandesRef.current[idAtual];
    if (ja && ja.vence > Date.now() + 5_000) {
      agendar(ja.vence);
    } else {
      void createClient()
        .storage.from(BUCKET_FOTOS)
        .createSignedUrl(caminhoAtual, VALIDADE_URL_FOTO_S)
        .then(({ data }) => {
          if (!vivo || !data?.signedUrl) return;
          const vence = Date.now() + (VALIDADE_URL_FOTO_S - 60) * 1000;
          setGrandes((g) => ({ ...g, [idAtual]: { url: data.signedUrl, vence } }));
        });
    }
    return () => {
      vivo = false;
      if (renovar) clearTimeout(renovar);
    };
  }, [idAtual, caminhoAtual, urlGrandeAtual]);

  function abrir(id: string) {
    const indice = itensGrade.findIndex((g) => g.id === id);
    if (indice >= 0) setTela({ aberta: true, indice });
  }

  async function apagar(f: FotoTelaCheiaDados) {
    const s = lista.find((x) => x.id === f.id);
    if (!s) return;
    const supabase = createClient();
    // Arquivo primeiro, depois o registro (ARQUITETURA F3.1-P6); os dois passos aceitam repetir.
    const rem = await supabase.storage.from(BUCKET_FOTOS).remove([s.caminho, s.caminhoMiniatura]);
    if (rem.error) {
      return {
        erro: /row-level|403|not allowed|unauthorized/i.test(rem.error.message)
          ? "Você não pode apagar esta foto."
          : "Não foi possível apagar a foto. Confira a internet e tente de novo.",
      };
    }
    const r = await supabase.rpc("apagar_foto", { p_id: s.id });
    if (r.error) {
      return {
        erro: /failed to fetch|load failed|network/i.test(r.error.message)
          ? "Não foi possível apagar a foto. Confira a internet e tente de novo."
          : traduzirErro(r.error, "os"),
      };
    }
    setLista((l) => l.filter((x) => x.id !== s.id));
  }

  const fotoEditando = editando ? lista.find((f) => f.id === editando) : undefined;

  async function salvarEdicao(id: string, dados: { categoria: CategoriaFoto; legenda: string }) {
    const r = await createClient().rpc("editar_foto", { p_id: id, p_categoria: dados.categoria, p_legenda: dados.legenda });
    if (r.error) {
      return {
        erro: /failed to fetch|load failed|network/i.test(r.error.message)
          ? "Não foi possível salvar. Confira a internet e tente de novo."
          : traduzirErro(r.error, "os"),
      };
    }
    setLista((l) => l.map((f) => (f.id === id ? { ...f, categoria: dados.categoria, legenda: dados.legenda || null } : f)));
  }

  const desabilitado = cheio;
  const ajudaLegenda = ehMecanico ? undefined : "O mecânico também vê esta legenda.";
  const titulo = total >= 30 ? `Fotos (${total} de ${LIMITE_FOTOS_OS})` : `Fotos (${total})`;

  return (
    <section ref={secao} aria-labelledby="titulo-fotos" className="flex scroll-mt-4 flex-col gap-3" data-teste="secao-fotos">
      <h2 id="titulo-fotos" className="text-2xl">
        {titulo}
      </h2>

      {retomadas.length > 0 && (
        <CaixaMensagem tipo="info">
          {nFotos(retomadas.length)} desta OS {retomadas.length === 1 ? "ficou guardada" : "ficaram guardadas"} no celular. Enviando
          agora.
        </CaixaMensagem>
      )}
      {fila.aviso === "sem_indexeddb" && podeEnviar && (
        <CaixaMensagem tipo="alerta">Este celular não está guardando as fotos. Se fechar o app antes de enviar, elas se perdem.</CaixaMensagem>
      )}
      {fila.aviso === "sem_espaco" && (
        <CaixaMensagem tipo="alerta">O celular está sem espaço para guardar a foto. Libere espaço ou espere as outras enviarem.</CaixaMensagem>
      )}
      {daOS.some((i) => i.precisaEntrar) && (
        <CaixaMensagem tipo="alerta">
          Entre de novo para enviar as fotos guardadas.{" "}
          <Link href={`/login?voltar=/os/${osId}`} className="font-bold underline underline-offset-4">
            Entrar
          </Link>
        </CaixaMensagem>
      )}

      {podeEnviar && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <label
              htmlFor={idCamera}
              aria-disabled={desabilitado}
              className={classesBotao(
                "secundario",
                `flex-1 pointer-fine:hidden has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-foco ${desabilitado ? "pointer-events-none opacity-50" : "cursor-pointer"}`,
              )}
            >
              <Camera size={24} strokeWidth={2.25} aria-hidden />
              Tirar foto
              <input
                id={idCamera}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                disabled={desabilitado}
                onChange={aoEscolher}
                data-teste="foto-camera"
              />
            </label>
            <label
              htmlFor={idGaleria}
              aria-disabled={desabilitado}
              className={classesBotao(
                "secundario",
                `flex-1 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-foco ${desabilitado ? "pointer-events-none opacity-50" : "cursor-pointer"}`,
              )}
            >
              <Images size={24} strokeWidth={2.25} aria-hidden />
              <span className="pointer-fine:hidden">Da galeria</span>
              <span className="hidden pointer-fine:inline">Escolher fotos</span>
              <input
                id={idGaleria}
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                disabled={desabilitado}
                onChange={aoEscolher}
                data-teste="foto-galeria"
              />
            </label>
          </div>
          {cheio && (
            <p className="text-base text-texto-suave" data-teste="aviso-limite">
              Esta OS chegou ao limite de {LIMITE_FOTOS_OS} fotos. Apague alguma para enviar outra.
            </p>
          )}
          {!cheio && ocupadas >= 30 && (
            <p className="text-base text-texto-suave">
              {cabem === 1 ? "Cabe mais 1 foto nesta OS." : `Cabem mais ${cabem} fotos nesta OS.`}
            </p>
          )}
          <AjudaCamera idCamera={idCamera} />
        </div>
      )}

      <GradeFotos
        fotos={itensGrade}
        erro={erro && lista.length === 0 && itensGrade.length === 0}
        aoTentarCarregar={() => void recarregar()}
        vazio={ehMecanico ? "mecanico" : "balcao"}
        aoAbrir={abrir}
        aoTentarDeNovo={(id) => tentarDeNovo([id])}
        aoRecarregar={() => void recarregar()}
      />
      {erro && itensGrade.length > 0 && (
        <CaixaMensagem tipo="erro">Não foi possível atualizar as fotos. Confira a internet.</CaixaMensagem>
      )}

      {!EH_PRODUCAO && (
        <Link
          href="/diagnostico/fotos"
          className="inline-flex min-h-toque items-center self-start text-sm font-bold text-info-texto underline underline-offset-4"
        >
          Diagnóstico das fotos (só no ambiente de teste)
        </Link>
      )}

      {situacao && (
        <FaixaEnvioFotos
          situacao={situacao}
          aoTentarDeNovo={() => tentarDeNovo(daOS.map((i) => i.id))}
          aoTocar={() => secao.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          aoSumir={zerar}
        />
      )}

      {lote && (
        <FolhaTipoFoto
          key={lote.chave}
          aberta
          itens={loteItens}
          cortadas={lote.cortadas}
          ajudaLegenda={ajudaLegenda}
          aoEscolher={escolherTipo}
          aoDescartar={descartarLote}
        />
      )}

      <FotoTelaCheia
        aberta={tela.aberta && dadosTela.length > 0}
        aoFechar={() => setTela((t) => ({ ...t, aberta: false }))}
        fotos={dadosTela}
        indice={tela.indice}
        aoMudarIndice={(indice) => setTela((t) => ({ ...t, indice }))}
        aoEditar={(f) => setEditando(f.id)}
        aoApagar={apagar}
        aoTentarDeNovo={(f) => tentarDeNovo([f.id])}
        aoRemoverDaFila={(f) => descartar([f.id])}
        aoRecarregar={(f) => {
          if (f.id in grandes) setGrandes((g) => semChave(g, f.id));
          void recarregar();
        }}
      />

      {fotoEditando && (
        <FolhaEditarFoto
          key={fotoEditando.id}
          aberta
          aoFechar={() => setEditando(null)}
          categoriaInicial={fotoEditando.categoria}
          legendaInicial={fotoEditando.legenda}
          ajudaLegenda={ajudaLegenda}
          aoSalvar={(d) => salvarEdicao(fotoEditando.id, d)}
        />
      )}
    </section>
  );
}
