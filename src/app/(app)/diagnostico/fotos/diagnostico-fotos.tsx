"use client";

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type ChangeEvent } from "react";
import { Camera, Images } from "lucide-react";
import { Botao, classesBotao } from "@/components/ui/botao";
import { Cartao } from "@/components/ui/estados";
import { CaixaMensagem } from "@/components/ui/formulario";
import { formatarBytes, formatarDiaHora } from "@/lib/formato";
import { aquecerConexao, CHAVE_DIAGNOSTICO, guardarDiagnostico, type MedidaAquecimento, type RegistroDiagnostico } from "@/lib/fotos/enviar";
import { abrirBanco } from "@/lib/fotos/fila-db";
import { useFila } from "@/components/fotos/usar-fila";
import { ErroFoto, navegadorGiraSozinho, prepararFoto, type DiagnosticoPreparo } from "@/lib/fotos/preparar";

const EVENTO = CHAVE_DIAGNOSTICO;

function assinar(aviso: () => void) {
  window.addEventListener("storage", aviso);
  window.addEventListener(EVENTO, aviso);
  return () => {
    window.removeEventListener("storage", aviso);
    window.removeEventListener(EVENTO, aviso);
  };
}
const lerRegistros = () => {
  try {
    return localStorage.getItem(CHAVE_DIAGNOSTICO) ?? "[]";
  } catch {
    return "[]";
  }
};
const nadaNoServidor = () => null;

function lerAparelho() {
  const nav = navigator as Navigator & { standalone?: boolean; deviceMemory?: number };
  return JSON.stringify({
    userAgent: nav.userAgent,
    plataforma: nav.platform,
    instalado: Boolean(nav.standalone) || window.matchMedia("(display-mode: standalone)").matches,
    tela: `${screen.width}×${screen.height} @${window.devicePixelRatio}x`,
    janela: `${window.innerWidth}×${window.innerHeight}`,
    memoriaGB: nav.deviceMemory ?? null,
    createImageBitmap: typeof createImageBitmap === "function",
    randomUUID: typeof crypto?.randomUUID === "function",
    toque: "ontouchstart" in window || nav.maxTouchPoints > 0,
  });
}
let aparelhoCache: string | null = null;
const lerAparelhoCache = () => (aparelhoCache ??= lerAparelho());
const semAssinatura = () => () => {};

const sn = (v: boolean | null | undefined) => (v == null ? "—" : v ? "sim" : "não");

/** Página de diagnóstico das fotos (só no ambiente de teste). */
export function DiagnosticoFotos() {
  const idCamera = useId();
  const idGaleria = useId();
  const aparelhoTxt = useSyncExternalStore(semAssinatura, lerAparelhoCache, nadaNoServidor);
  const aparelho = useMemo(() => (aparelhoTxt ? JSON.parse(aparelhoTxt) : null), [aparelhoTxt]);
  const registrosTxt = useSyncExternalStore(assinar, lerRegistros, nadaNoServidor);
  const registros = useMemo<RegistroDiagnostico[]>(() => {
    try {
      const v = JSON.parse(registrosTxt ?? "[]");
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }, [registrosTxt]);
  const [gira, setGira] = useState<boolean | null>(null);
  const [testando, setTestando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [teste, setTeste] = useState<{ diag: DiagnosticoPreparo; foto: string; mini: string } | null>(null);
  const urls = useRef<string[]>([]);
  const fila = useFila();
  const [idb, setIdb] = useState<boolean | null>(null);
  const [medindo, setMedindo] = useState(false);
  const [conexao, setConexao] = useState<MedidaAquecimento | null>(null);
  const [erroConexao, setErroConexao] = useState(false);

  useEffect(() => {
    let vivo = true;
    navegadorGiraSozinho().then((v) => vivo && setGira(v));
    abrirBanco().then((db) => vivo && setIdb(Boolean(db)));
    const lista = urls.current;
    return () => {
      vivo = false;
      lista.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  async function aoEscolher(ev: ChangeEvent<HTMLInputElement>) {
    const arquivo = ev.target.files?.[0];
    ev.target.value = "";
    if (!arquivo) return;
    setTestando(true);
    setErro(null);
    try {
      const p = await prepararFoto(arquivo);
      const foto = URL.createObjectURL(p.foto);
      const mini = URL.createObjectURL(p.mini);
      urls.current.push(foto, mini);
      setTeste({ diag: p.diag, foto, mini });
      guardarDiagnostico({ osId: null, fotoId: null, resultado: "so_preparo", preparo: p.diag });
    } catch (e) {
      const msg = e instanceof ErroFoto ? `${e.message} [${e.codigo}: ${String(e.cause ?? "")}]` : String(e);
      setErro(msg);
      guardarDiagnostico({ osId: null, fotoId: null, resultado: "erro", etapaErro: "preparo", erro: msg });
    } finally {
      setTestando(false);
      window.dispatchEvent(new Event(EVENTO));
    }
  }

  async function medirConexao() {
    setMedindo(true);
    setErroConexao(false);
    const m = await aquecerConexao({ medir: true });
    setMedindo(false);
    if (!m) return setErroConexao(true);
    setConexao(m);
    guardarDiagnostico({ osId: null, fotoId: null, resultado: "conexao", conexao: m });
  }

  function limpar() {
    try {
      localStorage.removeItem(CHAVE_DIAGNOSTICO);
    } catch {}
    window.dispatchEvent(new Event(EVENTO));
  }

  return (
    <div className="flex flex-col gap-6" data-teste="diagnostico-fotos">
      <CaixaMensagem tipo="info">
        Esta página só existe no ambiente de teste. Tire um print e mande para o time.
      </CaixaMensagem>

      <section className="flex flex-col gap-3" aria-labelledby="t-aparelho">
        <h2 id="t-aparelho" className="text-2xl">
          Este aparelho
        </h2>
        <Cartao>
          <dl className="flex flex-col gap-2 text-base">
            <Linha r="Navegador" v={aparelho?.userAgent} mono />
            <Linha r="Plataforma" v={aparelho?.plataforma} />
            <Linha r="Instalado na tela de início" v={sn(aparelho?.instalado)} />
            <Linha r="Tela" v={aparelho?.tela} />
            <Linha r="Janela" v={aparelho?.janela} />
            <Linha r="Memória (aprox.)" v={aparelho?.memoriaGB ? `${aparelho.memoriaGB} GB` : "não informada"} />
            <Linha r="Gira a foto pelo EXIF sozinho" v={sn(gira)} />
            <Linha r="createImageBitmap" v={sn(aparelho?.createImageBitmap)} />
            <Linha r="crypto.randomUUID" v={sn(aparelho?.randomUUID)} />
            <Linha r="Tela de toque" v={sn(aparelho?.toque)} />
            <Linha r="Guarda a fila no aparelho (IndexedDB)" v={sn(idb)} />
            <Linha r="Fotos na fila agora" v={String(fila.itens.length)} />
          </dl>
        </Cartao>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="t-conexao">
        <h2 id="t-conexao" className="text-2xl">
          Medir a conexão com o servidor
        </h2>
        <p className="text-base text-texto-suave">
          Abra esta página logo depois de abrir o app e toque aqui: mostra quanto demora a sessão e o 1º pedido (frio) contra o 2º (quente).
        </p>
        <Botao variante="secundario" onClick={medirConexao} disabled={medindo} data-teste="diag-medir">
          {medindo ? "Medindo…" : "Medir conexão"}
        </Botao>
        {erroConexao && <CaixaMensagem tipo="erro">Não deu para medir (sem sessão ou sem internet).</CaixaMensagem>}
        {conexao && (
          <Cartao>
            <TabelaConexao m={conexao} />
          </Cartao>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="t-teste">
        <h2 id="t-teste" className="text-2xl">
          Testar o preparo (não envia)
        </h2>
        <div className="flex gap-2">
          <label htmlFor={idCamera} className={classesBotao("secundario", `flex-1 cursor-pointer ${testando ? "pointer-events-none opacity-50" : ""}`)}>
            <Camera size={24} strokeWidth={2.25} aria-hidden />
            Tirar foto
            <input id={idCamera} type="file" accept="image/*" capture="environment" className="sr-only" onChange={aoEscolher} disabled={testando} data-teste="diag-camera" />
          </label>
          <label htmlFor={idGaleria} className={classesBotao("secundario", `flex-1 cursor-pointer ${testando ? "pointer-events-none opacity-50" : ""}`)}>
            <Images size={24} strokeWidth={2.25} aria-hidden />
            Da galeria
            <input id={idGaleria} type="file" accept="image/*" className="sr-only" onChange={aoEscolher} disabled={testando} data-teste="diag-galeria" />
          </label>
        </div>
        {testando && <p role="status" className="text-base font-bold">Preparando a foto…</p>}
        {erro && <CaixaMensagem tipo="erro">{erro}</CaixaMensagem>}
        {teste && (
          <Cartao>
            <TabelaPreparo d={teste.diag} />
            <div className="mt-3 flex items-start gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- resultado local (blob:) */}
              <img src={teste.foto} alt="Foto preparada" className="max-h-64 w-2/3 rounded-sm object-contain" data-teste="diag-foto" />
              {/* eslint-disable-next-line @next/next/no-img-element -- resultado local (blob:) */}
              <img src={teste.mini} alt="Miniatura" className="w-1/4 rounded-sm object-contain" data-teste="diag-mini" />
            </div>
            <p className="mt-2 text-sm text-texto-suave">A foto tem de aparecer em pé, do jeito que foi tirada.</p>
          </Cartao>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="t-envios">
        <h2 id="t-envios" className="text-2xl">
          Últimos envios neste aparelho ({registros.length})
        </h2>
        {registros.length === 0 && <p className="text-base text-texto-suave">Nenhum ainda. Envie uma foto pela tela da OS.</p>}
        {registros.map((r, i) => (
          <Cartao key={`${r.quando}-${i}`}>
            <p className="text-lg font-bold" data-teste="diag-registro">
              {r.resultado === "enviada" ? "Enviada" : r.resultado === "erro" ? "Erro" : r.resultado === "conexao" ? "Conexão" : "Só preparo"} · {formatarDiaHora(r.quando)}
            </p>
            {r.erro && (
              <p className="text-base text-erro-texto">
                {r.etapaErro ? `[${r.etapaErro}] ` : ""}
                {r.erro}
              </p>
            )}
            {r.conexao && <TabelaConexao m={r.conexao} />}
            {r.preparo && <TabelaPreparo d={r.preparo} />}
            {r.envio && (
              <dl className="mt-2 flex flex-col gap-1 text-base">
                {r.envio.etapas.map((e) => (
                  <Linha key={e.etapa} r={`Envio: ${e.etapa}`} v={`${e.ms} ms`} />
                ))}
                <Linha r="Envio: total" v={`${r.envio.totalMs} ms`} />
                {r.envio.sessao && (
                  <Linha
                    r="Sessão (detalhe)"
                    v={`${r.envio.sessao.ms} ms · renovou/consultou o login: ${sn(r.envio.sessao.chamouAuth)} · token vence em ${r.envio.sessao.restanteS ?? "?"} s`}
                  />
                )}
                {r.envio.registrarRede && (
                  <Linha
                    r="Registrar (só a rede)"
                    v={`${r.envio.registrarRede.duracaoMs} ms${r.envio.registrarRede.conexaoMs != null ? ` · abrir conexão ${r.envio.registrarRede.conexaoMs} ms` : ""}`}
                  />
                )}
                <Linha r="Conexão aquecida antes" v={r.envio.aquecidaHaS == null ? "não" : `sim, ${r.envio.aquecidaHaS} s antes`} />
                <Linha r="Caminho" v={r.envio.caminho} mono />
              </dl>
            )}
          </Cartao>
        ))}
        {registros.length > 0 && (
          <Botao variante="secundario" onClick={limpar}>
            Limpar a lista
          </Botao>
        )}
      </section>
    </div>
  );
}

function TabelaConexao({ m }: { m: MedidaAquecimento }) {
  return (
    <dl className="flex flex-col gap-1 text-base" data-teste="diag-conexao">
      <Linha r="Sessão (obter/renovar o login)" v={`${m.sessao.ms} ms · renovou/consultou o login: ${sn(m.sessao.chamouAuth)}`} />
      <Linha r="Token vence em" v={m.sessao.restanteS == null ? "—" : `${Math.round(m.sessao.restanteS / 60)} min`} />
      <Linha r="1º pedido ao servidor (frio)" v={`${m.primeiraMs} ms`} />
      <Linha r="2º pedido (conexão aberta)" v={`${m.segundaMs} ms`} />
    </dl>
  );
}

function TabelaPreparo({ d }: { d: DiagnosticoPreparo }) {
  return (
    <dl className="flex flex-col gap-1 text-base">
      <Linha r="Arquivo" v={`${d.nomeArquivo} (${d.tipoOriginal})`} />
      <Linha r="Antes" v={`${formatarBytes(d.bytesOriginal)} · ${d.larguraAberta}×${d.alturaAberta}`} />
      <Linha r="Depois" v={`${formatarBytes(d.bytesFoto)} · ${d.largura}×${d.altura} · JPEG ${Math.round(d.qualidade * 100)}%`} />
      <Linha r="Miniatura" v={`${formatarBytes(d.bytesMini)} · ${d.larguraMini}×${d.alturaMini}`} />
      <Linha
        r="Orientação EXIF"
        v={`${d.orientacaoExif ?? "sem"} · navegador gira: ${sn(d.navegadorGira)} · girado à mão: ${sn(d.giradoAMao)} · ${d.metodo}`}
      />
      {d.etapas.map((e) => (
        <Linha key={e.etapa} r={`Preparo: ${e.etapa}`} v={`${e.ms} ms`} />
      ))}
      <Linha r="Preparo: total" v={`${d.totalMs} ms`} />
    </dl>
  );
}

function Linha({ r, v, mono }: { r: string; v?: string | null; mono?: boolean }) {
  return (
    <div className="flex flex-col">
      <dt className="text-sm font-bold text-texto-suave">{r}</dt>
      <dd className={`break-all ${mono ? "font-mono text-sm" : ""}`}>{v ?? "—"}</dd>
    </div>
  );
}
