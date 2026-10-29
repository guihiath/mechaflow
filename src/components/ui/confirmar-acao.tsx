"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { Check, CircleAlert, CircleX } from "lucide-react";
import { Botao, type VarianteBotao } from "@/components/ui/botao";
import { BotaoEnviar, CaixaMensagem } from "@/components/ui/formulario";
import type { EstadoAcao } from "@/lib/acao";

/**
 * Acao que pede confirmacao antes (excluir, desativar, tornar dono).
 * DESIGN 5.1: perigo sempre confirma, citando o nome do que sera afetado.
 * Foco: vai para a caixa ao abrir (leitor de tela anuncia a pergunta) e volta ao botao ao fechar.
 */
export function ConfirmarAcao({
  acao,
  rotulo,
  pergunta,
  rotuloConfirmar,
  rotuloEnviando = "Enviando…",
  variante = "perigo",
  aoConcluir,
}: {
  acao: () => Promise<EstadoAcao>;
  rotulo: string;
  pergunta: string;
  rotuloConfirmar: string;
  rotuloEnviando?: string;
  variante?: VarianteBotao;
  aoConcluir?: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string>();
  const [enviando, iniciar] = useTransition();
  const caixa = useRef<HTMLDivElement>(null);
  const abrir = useRef<HTMLButtonElement>(null);
  const jaAbriu = useRef(false);
  const idPergunta = useId();

  useEffect(() => {
    if (aberto) {
      jaAbriu.current = true;
      caixa.current?.scrollIntoView({ block: "center" });
      caixa.current?.focus({ preventScroll: true });
    } else if (jaAbriu.current) {
      abrir.current?.focus();
    }
  }, [aberto]);

  function confirmar() {
    if (enviando) return;
    setErro(undefined);
    iniciar(async () => {
      const r = await acao();
      if (r?.erro) setErro(r.erro);
      else {
        setAberto(false);
        aoConcluir?.();
      }
    });
  }

  if (!aberto) {
    return (
      <Botao ref={abrir} variante={variante === "perigo" ? "secundario" : variante} onClick={() => setAberto(true)}>
        {rotulo}
      </Botao>
    );
  }

  return (
    <div
      ref={caixa}
      tabIndex={-1}
      role="alertdialog"
      aria-labelledby={idPergunta}
      className="flex flex-col gap-3 rounded-lg border-2 border-erro bg-superficie p-4 outline-none focus-visible:outline-[3px] focus-visible:outline-foco"
    >
      <p id={idPergunta} className="text-lg font-bold">
        {pergunta}
      </p>
      {erro && <CaixaMensagem tipo="erro">{erro}</CaixaMensagem>}
      <Botao variante="secundario" onClick={() => setAberto(false)} disabled={enviando}>
        Voltar sem mudar
      </Botao>
      <BotaoEnviar
        type="button"
        enviando={enviando}
        variante={variante}
        rotulo={rotuloConfirmar}
        rotuloEnviando={rotuloEnviando}
        onClick={confirmar}
      />
    </div>
  );
}

export const MOTIVOS_CANCELAMENTO = ["Cliente desistiu", "Orçamento recusado", "Aberta por engano", "Outro motivo"] as const;

/**
 * Acao perigosa que exige um motivo (DESIGN §10.9: cancelar OS).
 * Caixa inline com borda de erro; foco vai para a caixa ao abrir e volta ao botao ao fechar.
 * O ultimo motivo da lista ("Outro motivo") abre um campo de texto obrigatorio.
 * `acao` recebe o motivo final em texto ("Cliente desistiu" ou o que foi escrito).
 * Sem Desfazer: e irreversivel de proposito.
 */
export function ConfirmarComMotivo({
  acao,
  rotulo = "Cancelar OS",
  pergunta,
  texto = "Ela sai da lista de abertas e não pode ser reaberta. Para atender de novo, abra outra OS.",
  motivos = MOTIVOS_CANCELAMENTO,
  rotuloConfirmar,
  rotuloEnviando = "Cancelando…",
  rotuloVoltar = "Voltar sem cancelar",
  aoConcluir,
}: {
  acao: (motivo: string) => Promise<EstadoAcao>;
  rotulo?: string;
  /** Ex.: "Cancelar a OS #1042 (ABC1D23)?" */
  pergunta: string;
  texto?: string;
  /** O ultimo item abre o campo "Qual o motivo?". */
  motivos?: readonly string[];
  /** Ex.: "Cancelar OS #1042" */
  rotuloConfirmar: string;
  rotuloEnviando?: string;
  rotuloVoltar?: string;
  aoConcluir?: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState<string>();
  const [outro, setOutro] = useState("");
  const [erro, setErro] = useState<string>();
  const [erroMotivo, setErroMotivo] = useState<string>();
  const [erroOutro, setErroOutro] = useState<string>();
  const [enviando, iniciar] = useTransition();
  const caixa = useRef<HTMLDivElement>(null);
  const abrir = useRef<HTMLButtonElement>(null);
  const jaAbriu = useRef(false);
  const idPergunta = useId();
  const idMotivo = useId();
  const idOutro = useId();
  const ultimo = motivos[motivos.length - 1];
  const ehOutro = motivo === ultimo;

  useEffect(() => {
    if (aberto) {
      jaAbriu.current = true;
      caixa.current?.scrollIntoView({ block: "center" });
      caixa.current?.focus({ preventScroll: true });
    } else if (jaAbriu.current) {
      abrir.current?.focus();
    }
  }, [aberto]);

  function fechar() {
    setAberto(false);
    setMotivo(undefined);
    setOutro("");
    setErro(undefined);
    setErroMotivo(undefined);
    setErroOutro(undefined);
  }

  function confirmar() {
    if (enviando) return;
    setErro(undefined);
    if (!motivo) {
      setErroMotivo("Escolha o motivo do cancelamento.");
      return;
    }
    const final = ehOutro ? outro.trim() : motivo;
    if (!final) {
      setErroOutro("Escreva o motivo.");
      document.getElementById(idOutro)?.focus();
      return;
    }
    iniciar(async () => {
      const r = await acao(final);
      if (r?.erro) setErro(r.erro);
      else {
        fechar();
        aoConcluir?.();
      }
    });
  }

  if (!aberto) {
    return (
      <Botao ref={abrir} variante="secundario" className="text-erro-texto!" onClick={() => setAberto(true)}>
        <CircleX size={24} strokeWidth={2.25} aria-hidden />
        {rotulo}
      </Botao>
    );
  }

  return (
    <div
      ref={caixa}
      tabIndex={-1}
      role="alertdialog"
      aria-labelledby={idPergunta}
      className="flex flex-col gap-4 rounded-lg border-2 border-erro bg-superficie p-4 outline-none focus-visible:outline-[3px] focus-visible:outline-foco"
    >
      <div className="flex flex-col gap-1">
        <p id={idPergunta} className="text-lg font-bold">
          {pergunta}
        </p>
        {texto && <p className="text-base text-texto-suave">{texto}</p>}
      </div>

      <fieldset className="flex flex-col gap-1.5" aria-describedby={erroMotivo ? `${idMotivo}-erro` : undefined}>
        <legend className="mb-1.5 text-sm font-bold text-texto">Motivo</legend>
        <div className="grid grid-cols-2 gap-2">
          {motivos.map((m) => {
            const ativo = m === motivo;
            return (
              <label
                key={m}
                className={`flex min-h-toque cursor-pointer items-center justify-center gap-1.5 rounded-md border-2 px-2 text-center text-base font-bold transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-foco ${
                  ativo
                    ? "border-grafite bg-primaria text-primaria-texto"
                    : erroMotivo
                      ? "border-erro bg-superficie text-texto"
                      : "border-borda bg-superficie text-texto"
                }`}
              >
                <input
                  type="radio"
                  name={idMotivo}
                  value={m}
                  checked={ativo}
                  onChange={() => {
                    setMotivo(m);
                    setErroMotivo(undefined);
                  }}
                  className="sr-only"
                />
                {ativo && <Check size={20} strokeWidth={2.5} aria-hidden className="shrink-0" />}
                {m}
              </label>
            );
          })}
        </div>
        {erroMotivo && <ErroLinha id={`${idMotivo}-erro`}>{erroMotivo}</ErroLinha>}
      </fieldset>

      {ehOutro && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={idOutro} className="text-sm font-bold text-texto">
            Qual o motivo?
          </label>
          <textarea
            id={idOutro}
            rows={3}
            value={outro}
            onChange={(e) => {
              setOutro(e.target.value);
              if (e.target.value.trim()) setErroOutro(undefined);
            }}
            aria-invalid={erroOutro ? true : undefined}
            aria-describedby={erroOutro ? `${idOutro}-erro` : undefined}
            className={`min-h-[104px] w-full rounded-md border-2 bg-superficie p-3 text-lg text-texto outline-none focus:border-foco focus:ring-[3px] focus:ring-foco/30 ${
              erroOutro ? "border-erro" : "border-borda"
            }`}
          />
          {erroOutro && <ErroLinha id={`${idOutro}-erro`}>{erroOutro}</ErroLinha>}
        </div>
      )}

      {erro && <CaixaMensagem tipo="erro">{erro}</CaixaMensagem>}
      <Botao variante="secundario" onClick={fechar} disabled={enviando}>
        {rotuloVoltar}
      </Botao>
      <BotaoEnviar
        type="button"
        enviando={enviando}
        variante="perigo"
        rotulo={rotuloConfirmar}
        rotuloEnviando={rotuloEnviando}
        onClick={confirmar}
      />
    </div>
  );
}

function ErroLinha({ id, children }: { id: string; children: string }) {
  return (
    <p id={id} className="flex items-start gap-1.5 text-sm font-bold text-erro-texto">
      <CircleAlert size={18} strokeWidth={2.25} aria-hidden className="mt-0.5 shrink-0" />
      {children}
    </p>
  );
}
