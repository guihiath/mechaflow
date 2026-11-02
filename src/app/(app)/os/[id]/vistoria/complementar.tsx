"use client";

import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Camera, Images, RotateCw, X } from "lucide-react";
import { useFila } from "@/components/fotos/usar-fila";
import { Botao, classesBotaoArquivo } from "@/components/ui/botao";
import { AreaTexto } from "@/components/ui/campo";
import { Folha } from "@/components/ui/folha";
import { CaixaMensagem } from "@/components/ui/formulario";
import { traduzirErro } from "@/lib/erros";
import { adicionarArquivos, definirTipo, iniciarFila, tentarDeNovo } from "@/lib/fotos/fila";
import { createClient } from "@/lib/supabase/client";

/** Fotos de complemento por vistoria (ARQUITETURA 12.3: 10, fora das 30 da vistoria). */
export const LIMITE_FOTOS_COMPLEMENTO = 10;
/** Texto do complemento (banco: até 1000). */
const LIMITE_TEXTO = 1000;

type Escolhida = { chave: string; arquivo: File; previa: string };

type Fase = { tipo: "escrevendo" } | { tipo: "salvando" } | { tipo: "enviando"; ids: string[] };

/**
 * Folha "Acrescentar à vistoria" (DESIGN §12.12, F4-B5): texto e/ou fotos, só por inserção.
 *
 * Ordem (o complemento precisa existir antes das fotos, FK no banco):
 * 1. `complementar_vistoria` com o id gerado ao abrir a folha (reenvio não duplica);
 * 2. as fotos escolhidas entram na fila da Fase 3 (IndexedDB) com `complementoId`, e sobem pelo
 *    `registrar_foto_vistoria`/`confirmar_foto_vistoria` no bucket `vistorias`.
 * Antes do passo 1 as fotos ficam só na memória desta folha: nada vai para o aparelho nem para
 * o banco sem a pessoa tocar em "Acrescentar". Depois do passo 1 o app pode fechar: a fila retoma.
 */
export function FolhaComplemento({
  aberta,
  aoFechar,
  aoConcluir,
  vistoriaId,
  osId,
  numeroOS,
  usuarioId,
  fotosUsadas,
}: {
  aberta: boolean;
  aoFechar: () => void;
  /** Complemento gravado e fotos enviadas (ou deixadas na fila): a leitura recarrega. */
  aoConcluir: (mensagem: string) => void;
  vistoriaId: string;
  osId: string;
  numeroOS: number | null;
  usuarioId: string;
  /** Fotos de complemento que a vistoria já tem (para o limite de 10). */
  fotosUsadas: number;
}) {
  const fila = useFila();
  const idCamera = useId();
  const idGaleria = useId();
  const [complementoId, setComplementoId] = useState(() => crypto.randomUUID());
  const [texto, setTexto] = useState("");
  const [escolhidas, setEscolhidas] = useState<Escolhida[]>([]);
  const [fase, setFase] = useState<Fase>({ tipo: "escrevendo" });
  const [erro, setErro] = useState<string | null>(null);
  const [perguntando, setPerguntando] = useState(false);
  const escolhidasRef = useRef(escolhidas);
  const caixaPergunta = useRef<HTMLDivElement>(null);

  useEffect(() => {
    escolhidasRef.current = escolhidas;
  }, [escolhidas]);
  // Prévias (blob:) liberadas ao sair.
  useEffect(() => () => escolhidasRef.current.forEach((e) => URL.revokeObjectURL(e.previa)), []);
  useEffect(() => {
    void iniciarFila(usuarioId);
  }, [usuarioId]);
  useEffect(() => {
    if (perguntando) caixaPergunta.current?.focus();
  }, [perguntando]);

  const restantes = Math.max(0, LIMITE_FOTOS_COMPLEMENTO - fotosUsadas - escolhidas.length);
  const sujo = fase.tipo === "escrevendo" && (texto.trim().length > 0 || escolhidas.length > 0);

  // Envio das fotos (fase "enviando"): acompanha os itens desta folha na fila.
  const meus = useMemo(
    () => (fase.tipo === "enviando" ? fila.itens.filter((i) => fase.ids.includes(i.id)) : []),
    [fase, fila.itens],
  );
  const total = fase.tipo === "enviando" ? fase.ids.length : 0;
  const faltam = meus.filter((i) => i.estado !== "confirmada");
  const falhas = faltam.filter((i) => i.estado === "falhou" || i.estado === "nao_enviavel");
  const semRede = faltam.filter((i) => i.estado === "sem_internet");
  const terminou = fase.tipo === "enviando" && faltam.length === 0;

  const concluirRef = useRef(aoConcluir);
  useEffect(() => {
    concluirRef.current = aoConcluir;
  }, [aoConcluir]);
  useEffect(() => {
    if (!terminou) return;
    concluirRef.current(total === 1 ? "Acrescentado à vistoria, com 1 foto." : `Acrescentado à vistoria, com ${total} fotos.`);
  }, [terminou, total]);

  function limpar() {
    escolhidas.forEach((e) => URL.revokeObjectURL(e.previa));
    setEscolhidas([]);
    setTexto("");
    setErro(null);
    setPerguntando(false);
    setFase({ tipo: "escrevendo" });
    setComplementoId(crypto.randomUUID());
  }

  function pedirFechar() {
    if (fase.tipo === "salvando") return; // espera a resposta do banco
    if (fase.tipo === "enviando") {
      // O complemento já existe; as fotos continuam na fila (guardadas no celular).
      const mensagem =
        faltam.length > 0
          ? `Acrescentado à vistoria. ${faltam.length === 1 ? "1 foto ainda está" : `${faltam.length} fotos ainda estão`} sendo enviada${faltam.length === 1 ? "" : "s"}.`
          : "Acrescentado à vistoria.";
      limpar();
      aoConcluir(mensagem);
      return;
    }
    if (sujo) {
      setPerguntando(true);
      return;
    }
    limpar();
    aoFechar();
  }

  function aoEscolher(ev: ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(ev.target.files ?? []);
    ev.target.value = "";
    if (!arquivos.length) return;
    setErro(null);
    const cabem = arquivos.slice(0, restantes);
    if (cabem.length < arquivos.length) {
      setErro(
        restantes === 0
          ? `A vistoria chegou ao limite de ${LIMITE_FOTOS_COMPLEMENTO} fotos acrescentadas.`
          : `Só cabem mais ${restantes} ${restantes === 1 ? "foto" : "fotos"} acrescentadas nesta vistoria.`,
      );
    }
    setEscolhidas((atual) => [...atual, ...cabem.map((arquivo) => ({ chave: crypto.randomUUID(), arquivo, previa: URL.createObjectURL(arquivo) }))]);
  }

  function remover(chave: string) {
    setEscolhidas((atual) => {
      const e = atual.find((x) => x.chave === chave);
      if (e) URL.revokeObjectURL(e.previa);
      return atual.filter((x) => x.chave !== chave);
    });
  }

  async function acrescentar() {
    if (fase.tipo !== "escrevendo") return;
    const t = texto.trim();
    if (!t && !escolhidas.length) {
      setErro("Escreva algo ou tire uma foto para acrescentar.");
      return;
    }
    if (t.length > LIMITE_TEXTO) {
      setErro(`O texto pode ter até ${LIMITE_TEXTO} letras.`);
      return;
    }
    setErro(null);
    setFase({ tipo: "salvando" });
    const { error } = await createClient().rpc("complementar_vistoria", {
      p_id: complementoId,
      p_vistoria_id: vistoriaId,
      p_texto: t || null,
    });
    if (error) {
      const rede = /failed to fetch|load failed|network|fetch failed/i.test(error.message ?? "");
      setErro(rede || !navigator.onLine ? "Sem internet. Nada foi acrescentado ainda. Confira a internet e toque em Acrescentar de novo." : traduzirErro(error, "os"));
      setFase({ tipo: "escrevendo" });
      return;
    }
    if (!escolhidas.length) {
      limpar();
      aoConcluir("Acrescentado à vistoria.");
      return;
    }
    // Complemento gravado: as fotos vão para a fila (guardadas no aparelho até subir).
    const ids = adicionarArquivos(
      escolhidas.map((e) => e.arquivo),
      { osId, numeroOS, vistoria: { vistoriaId, avariaId: null, tipo: "outro", complementoId } },
    );
    escolhidas.forEach((e) => URL.revokeObjectURL(e.previa));
    setEscolhidas([]);
    if (!ids.length) {
      // Fila sem usuário (não deveria acontecer): o texto ficou; as fotos não.
      limpar();
      aoConcluir("Acrescentado à vistoria, mas as fotos não foram guardadas. Acrescente as fotos de novo.");
      return;
    }
    void definirTipo(ids, "outro", null);
    setFase({ tipo: "enviando", ids });
  }

  const enviadas = total - faltam.length;
  const rodape =
    fase.tipo === "enviando" ? (
      <div className="flex flex-col gap-2">
        {falhas.length > 0 && (
          <Botao onClick={() => tentarDeNovo(falhas.map((i) => i.id))}>
            <RotateCw size={20} strokeWidth={2.25} aria-hidden />
            Tentar de novo
          </Botao>
        )}
        <Botao variante="secundario" onClick={pedirFechar}>
          Fechar
        </Botao>
      </div>
    ) : perguntando ? null : (
      <Botao onClick={() => void acrescentar()} disabled={fase.tipo === "salvando"} aria-busy={fase.tipo === "salvando"} data-teste="acrescentar">
        {fase.tipo === "salvando" ? "Acrescentando…" : "Acrescentar à vistoria"}
      </Botao>
    );

  return (
    <Folha aberta={aberta} aoFechar={pedirFechar} aoPedirFechar={pedirFechar} titulo="Acrescentar à vistoria" rodape={rodape}>
      {perguntando ? (
        <div
          ref={caixaPergunta}
          tabIndex={-1}
          role="alertdialog"
          aria-label="Descartar o que você escreveu?"
          className="flex flex-col gap-3 outline-none"
        >
          <p className="text-lg font-bold">Descartar o que você escreveu?</p>
          <p className="text-base text-texto-suave">Nada foi acrescentado à vistoria ainda.</p>
          <Botao variante="secundario" onClick={() => setPerguntando(false)}>
            Continuar escrevendo
          </Botao>
          <Botao
            variante="perigo"
            onClick={() => {
              limpar();
              aoFechar();
            }}
          >
            Descartar
          </Botao>
        </div>
      ) : fase.tipo === "enviando" ? (
        <div className="flex flex-col gap-3" data-teste="complemento-enviando">
          <CaixaMensagem tipo="sucesso">O texto foi acrescentado à vistoria.</CaixaMensagem>
          {falhas.length > 0 ? (
            <CaixaMensagem tipo="erro">
              {falhas.length === 1
                ? "1 foto não subiu. Ela continua guardada no celular."
                : `${falhas.length} fotos não subiram. Elas continuam guardadas no celular.`}{" "}
              {falhas.some((i) => i.estado === "falhou") ? "Toque em Tentar de novo." : (falhas[0]?.motivo ?? "")}
            </CaixaMensagem>
          ) : semRede.length > 0 ? (
            <CaixaMensagem tipo="alerta">
              {semRede.length === 1
                ? "Sem internet. A foto está guardada no celular e envia quando a internet voltar."
                : `Sem internet. As ${semRede.length} fotos estão guardadas no celular e enviam quando a internet voltar.`}
            </CaixaMensagem>
          ) : (
            <p role="status" className="text-base font-bold">
              Enviando foto {Math.min(enviadas + 1, total)} de {total}…
            </p>
          )}
          <p className="text-base text-texto-suave">Pode fechar: as fotos continuam enviando enquanto o app estiver aberto.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <AreaTexto
            rotulo="O que quer acrescentar?"
            name="texto_complemento"
            opcional
            value={texto}
            maxLength={LIMITE_TEXTO}
            onChange={(e) => {
              setTexto(e.target.value);
              if (erro) setErro(null);
            }}
            ajuda="Ex.: motorista avisou que o retrovisor já estava solto."
            disabled={fase.tipo === "salvando"}
          />

          <div className="grid grid-cols-2 gap-2">
            <label
              htmlFor={idCamera}
              aria-disabled={restantes === 0 || fase.tipo === "salvando"}
              className={classesBotaoArquivo("secundario", `h-toque! px-2 ${restantes === 0 ? "pointer-events-none opacity-50" : ""}`)}
            >
              <Camera size={22} strokeWidth={2.25} aria-hidden />
              Tirar foto
              <input id={idCamera} type="file" accept="image/*" capture="environment" className="sr-only" onChange={aoEscolher} disabled={restantes === 0} />
            </label>
            <label
              htmlFor={idGaleria}
              aria-disabled={restantes === 0 || fase.tipo === "salvando"}
              className={classesBotaoArquivo("secundario", `h-toque! px-2 ${restantes === 0 ? "pointer-events-none opacity-50" : ""}`)}
            >
              <Images size={22} strokeWidth={2.25} aria-hidden />
              Da galeria
              <input id={idGaleria} type="file" accept="image/*" multiple className="sr-only" onChange={aoEscolher} disabled={restantes === 0} />
            </label>
          </div>

          {escolhidas.length > 0 && (
            <ul className="grid grid-cols-3 gap-2" aria-label="Fotos escolhidas">
              {escolhidas.map((e, i) => (
                <li key={e.chave} className="relative aspect-square overflow-hidden rounded-md bg-superficie-2">
                  {/* Arquivo local (blob:): sem otimizador do Next. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={e.previa} alt={`Foto ${i + 1} escolhida`} className="h-full w-full object-cover" draggable={false} />
                  <button
                    type="button"
                    onClick={() => remover(e.chave)}
                    disabled={fase.tipo === "salvando"}
                    aria-label={`Tirar a foto ${i + 1}`}
                    className="absolute top-1 right-1 flex size-12 items-center justify-center rounded-full bg-[#14161A]/80 text-white"
                  >
                    <X size={22} strokeWidth={2.5} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <p className="text-base">
            O que você acrescentar fica junto da vistoria e <strong>não pode ser mudado nem apagado</strong>.
          </p>
          {erro && <CaixaMensagem tipo="erro">{erro}</CaixaMensagem>}
        </div>
      )}
    </Folha>
  );
}
