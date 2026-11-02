"use client";

import { useId, type ChangeEvent, type ReactNode } from "react";
import { Camera, Check, CircleAlert, Images, Loader, PenLine, RotateCw, TriangleAlert, WifiOff, X } from "lucide-react";
import { AjudaCamera } from "@/components/fotos/ajuda-camera";
import type { EstadoFoto } from "@/components/os/grade-fotos";
import { classesBotaoArquivo } from "@/components/ui/botao";
import { AreaTexto, Campo } from "@/components/ui/campo";
import { Cartao } from "@/components/ui/estados";
import { BotaoMarcarRestoOk, ContagemChecklist, LinhaChecklist } from "@/components/vistoria/linha-checklist";
import { CombustivelLeitura, MarcadorCombustivel } from "@/components/vistoria/marcador-combustivel";
import type { NumeroPasso } from "@/components/vistoria/passos-vistoria";
import {
  formatarNumero,
  juntarContagens,
  ROTULO_LADO_AVARIA,
  ROTULO_SITUACAO_ITEM_LEITURA,
  soDigitos,
  type LadoAvaria,
  type NivelCombustivel,
  type SituacaoItemVistoria,
} from "@/lib/formato";

// ------------------------------------------------------------ números do passo ①

/** "418950" -> "418.950" enquanto digita (DESIGN §12.4). Até 8 dígitos (limite do banco). */
export function mascaraKm(texto: string): string {
  const d = soDigitos(texto).replace(/^0+(?=\d)/, "").slice(0, 8);
  return d ? formatarNumero(Number(d)) : "";
}

/** KM/horímetro do campo -> inteiro, ou null se vazio/inválido. */
export function lerInteiro(texto: string): number | null {
  const limpo = texto.replace(/\./g, "").trim();
  if (!limpo || !/^\d{1,8}$/.test(limpo)) return null;
  return Number(limpo);
}

export function erroKm(texto: string): string | undefined {
  if (!texto.trim()) return "Informe o KM do painel.";
  if (lerInteiro(texto) === null) return "KM inválido. Use só números. Ex.: 418950";
  return undefined;
}

/** O banco guarda horímetro inteiro (pendência: aceitar decimal, ver CONTEXTO F4-B4). */
export function erroHorimetro(texto: string): string | undefined {
  if (!texto.trim()) return undefined;
  if (lerInteiro(texto) === null) return "Horímetro inválido. Use só números. Ex.: 12500";
  return undefined;
}

// ------------------------------------------------------------ ① KM e combustível

export function PassoEntrada({
  km,
  horimetro,
  combustivel,
  kmVeiculo,
  horimetroVeiculo,
  erros,
  aoMudarKm,
  aoMudarHorimetro,
  aoMudarCombustivel,
  aoSairCampo,
}: {
  km: string;
  horimetro: string;
  combustivel: NivelCombustivel | null;
  kmVeiculo: number | null;
  horimetroVeiculo: number | null;
  erros: { km?: string; horimetro?: string; combustivel?: string };
  aoMudarKm: (t: string) => void;
  aoMudarHorimetro: (t: string) => void;
  aoMudarCombustivel: (n: NivelCombustivel) => void;
  aoSairCampo: (campo: "km" | "horimetro") => void;
}) {
  const kmNum = lerInteiro(km);
  const menor = kmNum !== null && kmVeiculo !== null && kmNum < kmVeiculo;
  return (
    <div className="flex flex-col gap-6 [&_input]:scroll-mb-[calc(5rem+env(safe-area-inset-bottom)+1rem)]">
      <div className="flex flex-col gap-2">
        <Campo
          rotulo="KM no painel"
          value={km}
          onChange={(e) => aoMudarKm(mascaraKm(e.target.value))}
          onBlur={() => aoSairCampo("km")}
          inputMode="numeric"
          enterKeyHint="next"
          autoComplete="off"
          className="font-mono"
          ajuda="Veio da abertura da OS. Se corrigir, a OS e o veículo ficam com este KM."
          erro={erros.km}
          data-teste="campo-km"
        />
        {menor && !erros.km && (
          <p className="flex items-start gap-1.5 text-sm font-bold text-alerta-texto">
            <TriangleAlert size={18} strokeWidth={2.25} aria-hidden className="mt-0.5 shrink-0" />
            Menor que o último KM deste veículo ({formatarNumero(kmVeiculo)}). Confira o painel.
          </p>
        )}
      </div>
      <Campo
        rotulo="Horímetro"
        opcional
        value={horimetro}
        onChange={(e) => aoMudarHorimetro(mascaraKm(e.target.value))}
        onBlur={() => aoSairCampo("horimetro")}
        inputMode="numeric"
        enterKeyHint="done"
        autoComplete="off"
        className="font-mono"
        ajuda={
          horimetroVeiculo !== null
            ? `Horas do motor, se o painel mostrar. Último registrado: ${formatarNumero(horimetroVeiculo)} h.`
            : "Horas do motor, se o painel mostrar."
        }
        erro={erros.horimetro}
        data-teste="campo-horimetro"
      />
      <MarcadorCombustivel valor={combustivel} aoMudar={aoMudarCombustivel} erro={erros.combustivel} />
    </div>
  );
}

// ------------------------------------------------------------ ② Checklist

export type ItemTela = { id: string; descricao: string; situacao: SituacaoItemVistoria | null; observacao: string };

const ehItemPainel = (descricao: string) => /^painel\b/i.test(descricao.trim());

export function PassoChecklist({
  itens,
  aoMudarSituacao,
  aoMudarObservacao,
  aoMarcarResto,
  irPara,
}: {
  itens: ItemTela[];
  aoMudarSituacao: (id: string, s: SituacaoItemVistoria) => void;
  aoMudarObservacao: (id: string, t: string) => void;
  aoMarcarResto: () => void;
  irPara: (p: NumeroPasso) => void;
}) {
  const restantes = itens.filter((i) => !i.situacao).length;
  if (itens.length === 0) {
    return <p className="text-base text-texto-suave">Esta oficina não tem itens no checklist.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-base text-texto-suave">
        Marque só o que tem problema ou não se aplica. Depois toque em <strong className="text-texto">Marcar o resto como ok</strong>.
      </p>
      <BotaoMarcarRestoOk restantes={restantes} aoMarcar={aoMarcarResto} />
      <ContagemChecklist total={itens.length} marcados={itens.length - restantes} />
      <div className="pl-3" data-teste="lista-checklist">
        {itens.map((i) => (
          <div key={i.id} id={`item-${i.id}`} className="scroll-mt-20 scroll-mb-28">
            <LinhaChecklist
              descricao={i.descricao}
              situacao={i.situacao}
              observacao={i.observacao}
              aoMudarSituacao={(s) => aoMudarSituacao(i.id, s)}
              aoMudarObservacao={(t) => aoMudarObservacao(i.id, t)}
              ajudaProblema={
                ehItemPainel(i.descricao) ? (
                  <>
                    Fotografe o painel no{" "}
                    <button type="button" onClick={() => irPara(4)} className="font-bold text-info-texto underline underline-offset-4">
                      passo 4
                    </button>
                    .
                  </>
                ) : undefined
              }
            />
          </div>
        ))}
      </div>
      <BotaoMarcarRestoOk restantes={restantes} aoMarcar={aoMarcarResto} />
    </div>
  );
}

// ------------------------------------------------------------ ④ Painel e objetos

/** Chips dos objetos (DESIGN §12.7; nomes provisórios até o Guilherme ajustar, F4-C1). */
export const OBJETOS_VISTORIA = ["Documentos", "Celular ou carregador", "Ferramentas", "Rádio PX", "Roupas e pertences", "Carga no baú"] as const;
export const LIMITE_OUTROS_OBJETOS = 60;

export type FotoTela = { id: string; src?: string | null; estado: EstadoFoto; progresso?: number };

const TEXTO_ESTADO: Partial<Record<EstadoFoto, string>> = {
  preparando: "Preparando",
  na_fila: "Na fila",
  sem_internet: "Sem internet",
  enviando: "Enviando",
  falhou: "Não foi enviada",
  nao_enviavel: "Não dá para enviar",
};

/** Miniatura simples (painel e folha da avaria) com o estado da fila e "Remover". */
export function MiniaturaVistoria({
  foto,
  alt,
  aoRemover,
  aoTentarDeNovo,
  removendo,
}: {
  foto: FotoTela;
  alt: string;
  aoRemover?: () => void;
  aoTentarDeNovo?: () => void;
  removendo?: boolean;
}) {
  const texto = TEXTO_ESTADO[foto.estado];
  const erro = foto.estado === "falhou" || foto.estado === "nao_enviavel";
  const Icone = erro ? CircleAlert : foto.estado === "sem_internet" ? WifiOff : foto.estado === "confirmada" ? Check : Loader;
  return (
    <div className="flex flex-col gap-1">
      <div className="relative aspect-square overflow-hidden rounded-md bg-superficie-2">
        {foto.src ? (
          // URL assinada ou blob: local: sem otimizador do Next.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={foto.src} alt={alt} className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full items-center justify-center p-1 text-center text-xs text-texto-suave">{alt}</span>
        )}
        {(texto || foto.estado === "confirmada") && (
          <span className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-[#14161A]/80 px-1.5 py-0.5 text-xs font-bold text-white">
            <Icone size={14} strokeWidth={2.5} aria-hidden className="shrink-0" />
            <span className="truncate">
              {foto.estado === "confirmada" ? "Enviada" : texto}
              {foto.estado === "enviando" && foto.progresso ? ` ${Math.round(foto.progresso)}%` : ""}
            </span>
          </span>
        )}
      </div>
      {erro && aoTentarDeNovo && foto.estado === "falhou" && (
        <button
          type="button"
          onClick={aoTentarDeNovo}
          className="inline-flex min-h-toque items-center justify-center gap-1 rounded-md text-sm font-bold text-info-texto underline underline-offset-4"
        >
          <RotateCw size={16} strokeWidth={2.5} aria-hidden />
          Tentar de novo
        </button>
      )}
      {aoRemover && (
        <button
          type="button"
          onClick={aoRemover}
          disabled={removendo}
          aria-label={`Remover ${alt.toLowerCase()}`}
          className="inline-flex min-h-toque items-center justify-center gap-1 rounded-md text-sm font-bold text-erro-texto underline underline-offset-4 disabled:opacity-50"
        >
          <X size={16} strokeWidth={2.5} aria-hidden />
          {removendo ? "Removendo…" : "Remover"}
        </button>
      )}
    </div>
  );
}

export function PassoPainelObjetos({
  fotosPainel,
  limiteAtingido,
  aoEscolherPainel,
  aoRemoverFoto,
  aoTentarDeNovo,
  removendo,
  objetos,
  outros,
  aoAlternarObjeto,
  aoMarcarNenhum,
  aoMudarOutros,
  observacoes,
  aoMudarObservacoes,
}: {
  fotosPainel: FotoTela[];
  limiteAtingido: boolean;
  aoEscolherPainel: (e: ChangeEvent<HTMLInputElement>) => void;
  aoRemoverFoto: (id: string) => void;
  aoTentarDeNovo: (id: string) => void;
  removendo: string | null;
  objetos: string[] | null;
  outros: string;
  aoAlternarObjeto: (o: string) => void;
  aoMarcarNenhum: () => void;
  aoMudarOutros: (t: string) => void;
  observacoes: string;
  aoMudarObservacoes: (t: string) => void;
}) {
  const idCamera = useId();
  const idGaleria = useId();
  const cheio = fotosPainel.length >= 3 || limiteAtingido;
  const nenhum = objetos !== null && objetos.length === 0 && !outros.trim();
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3" aria-labelledby="t-painel">
        <h3 id="t-painel" className="text-xl">
          Luzes do painel
        </h3>
        <p className="text-base text-texto-suave">Ligue a chave e fotografe o painel com as luzes acesas.</p>
        {fotosPainel.length > 0 && (
          <ul className="grid grid-cols-3 gap-2" aria-label="Fotos do painel">
            {fotosPainel.map((f, i) => (
              <li key={f.id}>
                <MiniaturaVistoria
                  foto={f}
                  alt={`Foto ${i + 1} do painel`}
                  aoRemover={() => aoRemoverFoto(f.id)}
                  aoTentarDeNovo={() => aoTentarDeNovo(f.id)}
                  removendo={removendo === f.id}
                />
              </li>
            ))}
          </ul>
        )}
        {cheio ? (
          <p className="text-sm text-texto-suave">
            {limiteAtingido ? "A vistoria chegou ao limite de 30 fotos." : "Até 3 fotos do painel. Remova uma para tirar outra."}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <label htmlFor={idCamera} className={classesBotaoArquivo("secundario", "gap-1.5 px-2 whitespace-nowrap")}>
              <Camera size={22} strokeWidth={2.25} aria-hidden className="shrink-0" />
              Fotografar
              <input id={idCamera} type="file" accept="image/*" capture="environment" aria-label="Fotografar painel" className="sr-only" onChange={aoEscolherPainel} data-teste="camera-painel" />
            </label>
            <label htmlFor={idGaleria} className={classesBotaoArquivo("secundario", "gap-1.5 px-2 whitespace-nowrap")}>
              <Images size={22} strokeWidth={2.25} aria-hidden className="shrink-0" />
              Da galeria
              <input id={idGaleria} type="file" accept="image/*" multiple className="sr-only" onChange={aoEscolherPainel} data-teste="galeria-painel" />
            </label>
          </div>
        )}
        {!cheio && <AjudaCamera idCamera={idCamera} />}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="t-objetos">
        <h3 id="t-objetos" className="text-xl">
          Objetos deixados no veículo
        </h3>
        <div className="flex flex-wrap gap-2" role="group" aria-labelledby="t-objetos">
          {OBJETOS_VISTORIA.map((o) => (
            <Chip key={o} marcado={objetos?.includes(o) ?? false} aoTocar={() => aoAlternarObjeto(o)}>
              {o}
            </Chip>
          ))}
          <Chip marcado={nenhum} aoTocar={aoMarcarNenhum}>
            Nenhum objeto
          </Chip>
        </div>
        <Campo
          rotulo="Outros objetos"
          opcional
          value={outros}
          onChange={(e) => aoMudarOutros(e.target.value)}
          maxLength={LIMITE_OUTROS_OBJETOS}
          placeholder="Ex.: caixa de ferramentas azul"
          enterKeyHint="done"
          autoComplete="off"
          className="scroll-mb-28"
        />
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="t-obs">
        <h3 id="t-obs" className="text-xl">
          Observações gerais
        </h3>
        <AreaTexto
          rotulo="Observações"
          opcional
          value={observacoes}
          onChange={(e) => aoMudarObservacoes(e.target.value)}
          maxLength={2000}
          ajuda="Dica: toque no microfone do teclado para falar. O mecânico também vê este texto."
        />
      </section>
    </div>
  );
}

function Chip({ marcado, aoTocar, children }: { marcado: boolean; aoTocar: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={marcado}
      onClick={aoTocar}
      className={`inline-flex min-h-toque items-center gap-1.5 rounded-md border-2 px-3 text-base font-bold transition-colors ${
        marcado ? "border-grafite bg-primaria text-primaria-texto" : "border-borda bg-superficie text-texto active:bg-superficie-2"
      }`}
    >
      {marcado && <Check size={18} strokeWidth={3} aria-hidden />}
      {children}
    </button>
  );
}

// ------------------------------------------------------------ ⑤ resumo (antes de assinar)

export type ResumoAvaria = { id: string; lado: LadoAvaria; descricao: string | null; src: string | null };

function BlocoResumo({ titulo, passo, irPara, children }: { titulo: string; passo: NumeroPasso; irPara: (p: NumeroPasso) => void; children: ReactNode }) {
  return (
    <Cartao>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-lg">{titulo}</h3>
          <button
            type="button"
            onClick={() => irPara(passo)}
            aria-label={`Alterar ${titulo.toLowerCase()}`}
            className="inline-flex min-h-toque items-center gap-1 rounded-md px-2 text-base font-bold text-info-texto underline underline-offset-4"
          >
            <PenLine size={16} strokeWidth={2.5} aria-hidden />
            Alterar
          </button>
        </div>
        {children}
      </div>
    </Cartao>
  );
}

export function ResumoVistoria({
  km,
  horimetro,
  combustivel,
  itens,
  avarias,
  semAvarias,
  fotosPainel,
  objetos,
  outros,
  observacoes,
  irPara,
}: {
  km: string;
  horimetro: string;
  combustivel: NivelCombustivel | null;
  itens: ItemTela[];
  avarias: ResumoAvaria[];
  semAvarias: boolean;
  fotosPainel: FotoTela[];
  objetos: string[] | null;
  outros: string;
  observacoes: string;
  irPara: (p: NumeroPasso) => void;
}) {
  const conta = (s: SituacaoItemVistoria) => itens.filter((i) => i.situacao === s).length;
  const problemas = itens.filter((i) => i.situacao === "com_problema");
  const listaObjetos = [...(objetos ?? []), ...(outros.trim() ? [outros.trim()] : [])];
  return (
    <div className="flex flex-col gap-3" data-teste="resumo-vistoria">
      <BlocoResumo titulo="Entrada" passo={1} irPara={irPara}>
        <p className="flex flex-wrap items-center gap-x-2 text-base">
          <span>
            KM <span className="font-mono">{km || "—"}</span>
          </span>
          {horimetro && (
            <span>
              · Horímetro <span className="font-mono">{horimetro}</span> h
            </span>
          )}
          <span>· Combustível</span>
          <CombustivelLeitura nivel={combustivel} />
        </p>
      </BlocoResumo>
      <BlocoResumo titulo="Checklist" passo={2} irPara={irPara}>
        <p className="text-base">
          {itens.length} {itens.length === 1 ? "item" : "itens"}:{" "}
          {juntarContagens([
            [conta("ok"), "ok"],
            [conta("com_problema"), "com problema"],
            [conta("nao_se_aplica"), "não se aplica"],
            [itens.filter((i) => !i.situacao).length, "sem marcar"],
          ])}
        </p>
        {problemas.length > 0 && (
          <ul className="flex flex-col gap-1">
            {problemas.map((i) => (
              <li key={i.id} className="flex items-start gap-1.5 text-base">
                <TriangleAlert size={18} strokeWidth={2.25} aria-hidden className="mt-0.5 shrink-0 text-alerta-texto" />
                <span>
                  {i.descricao}
                  {i.observacao.trim() ? ` — ${i.observacao.trim()}` : ` — ${ROTULO_SITUACAO_ITEM_LEITURA.com_problema.toLowerCase()}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </BlocoResumo>
      <BlocoResumo titulo={`Avarias (${avarias.length})`} passo={3} irPara={irPara}>
        {avarias.length === 0 ? (
          <p className="text-base">{semAvarias ? "Nenhuma avaria." : "Não informado."}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {avarias.map((a) => (
              <li key={a.id} className="flex items-center gap-2 text-base">
                <span className="size-12 shrink-0 overflow-hidden rounded-sm bg-superficie-2">
                  {a.src && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.src} alt="" className="h-full w-full object-cover" />
                  )}
                </span>
                <span className="min-w-0">
                  {ROTULO_LADO_AVARIA[a.lado]}
                  {a.descricao ? ` — ${a.descricao}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </BlocoResumo>
      <BlocoResumo titulo="Painel e objetos" passo={4} irPara={irPara}>
        {fotosPainel.length ? (
          <div className="flex gap-2">
            {fotosPainel.map((f) => (
              <span key={f.id} className="size-12 overflow-hidden rounded-sm bg-superficie-2">
                {f.src && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.src} alt="Foto do painel" className="h-full w-full object-cover" />
                )}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-base text-texto-suave">Sem foto do painel</p>
        )}
        {objetos === null && !outros.trim() ? (
          <p className="text-base text-texto-suave" data-teste="objetos-resumo">
            Objetos: não informado.
          </p>
        ) : (
          <p className="text-base" data-teste="objetos-resumo">
            Objetos: {listaObjetos.length ? `${listaObjetos.join(", ")}.` : "nenhum objeto."}
          </p>
        )}
        {observacoes.trim() && <p className="text-base break-words whitespace-pre-line">Observações: {observacoes.trim()}</p>}
      </BlocoResumo>
    </div>
  );
}
