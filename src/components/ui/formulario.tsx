"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useRef, type FormEvent, type ReactNode } from "react";
import { CircleAlert, CircleCheck } from "lucide-react";
import { Botao, type VarianteBotao } from "@/components/ui/botao";
import type { EstadoAcao } from "@/lib/acao";

/**
 * Formulario ligado a uma Server Action.
 * - Nao reenvia enquanto a acao anterior nao terminou (sem duplo envio).
 * - Nao limpa os campos em caso de erro (o que foi digitado nunca se perde).
 * - Erros por campo chegam aos <Campo> pelo contexto (prop `name`).
 */
type Acao = (anterior: EstadoAcao, dados: FormData) => Promise<EstadoAcao>;

const ErrosContexto = createContext<Record<string, string | undefined>>({});

export function useErroCampo(nome?: string) {
  const erros = useContext(ErrosContexto);
  return nome ? erros[nome] : undefined;
}

type Props = {
  acao: Acao;
  children: ReactNode;
  rotulo: string;
  rotuloEnviando?: string;
  variante?: VarianteBotao;
  /** Chamado quando a acao devolve ok (ex.: fechar painel). */
  aoConcluir?: (estado: EstadoAcao) => void;
  /** Botoes extras acima do principal (no celular o primario fica embaixo). */
  acoesExtras?: ReactNode;
  className?: string;
};

export function Formulario({
  acao,
  children,
  rotulo,
  rotuloEnviando = "Salvando…",
  variante = "primario",
  aoConcluir,
  acoesExtras,
  className,
}: Props) {
  const [estado, enviar, enviando] = useActionState(acao, null);
  const travado = useRef(false);

  useEffect(() => {
    if (!enviando) travado.current = false;
  }, [enviando]);

  useEffect(() => {
    if (estado?.ok && aoConcluir) aoConcluir(estado);
  }, [estado, aoConcluir]);

  function aoEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (enviando || travado.current) return;
    travado.current = true;
    const dados = new FormData(evento.currentTarget);
    startTransition(() => enviar(dados));
  }

  return (
    <ErrosContexto value={estado?.campos ?? {}}>
      <form onSubmit={aoEnviar} noValidate className={className ?? "flex flex-col gap-5"}>
        {children}
        {estado?.erro && <CaixaMensagem tipo="erro">{estado.erro}</CaixaMensagem>}
        {estado?.ok && estado.mensagem && <CaixaMensagem tipo="sucesso">{estado.mensagem}</CaixaMensagem>}
        <div className="flex flex-col gap-3">
          {acoesExtras}
          <BotaoEnviar enviando={enviando} rotulo={rotulo} rotuloEnviando={rotuloEnviando} variante={variante} />
        </div>
      </form>
    </ErrosContexto>
  );
}

/** Botao de envio: mantem o tamanho, troca o texto e avisa se a internet estiver lenta. */
export function BotaoEnviar({
  enviando,
  rotulo,
  rotuloEnviando = "Salvando…",
  variante = "primario",
  type = "submit",
  onClick,
  disabled,
}: {
  enviando: boolean;
  rotulo: string;
  rotuloEnviando?: string;
  variante?: VarianteBotao;
  type?: "submit" | "button";
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Botao type={type} variante={variante} disabled={enviando || disabled} aria-busy={enviando} onClick={onClick}>
        {enviando ? rotuloEnviando : rotulo}
      </Botao>
      {enviando && <AvisoLento key="lento" />}
    </div>
  );
}

function AvisoLento() {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      if (ref.current) ref.current.hidden = false;
    }, 3000);
    return () => clearTimeout(t);
  }, []);
  return (
    <p ref={ref} hidden role="status" className="text-sm text-alerta-texto">
      Internet lenta, ainda enviando. Não feche esta tela.
    </p>
  );
}

export function CaixaMensagem({ tipo, children }: { tipo: "erro" | "sucesso" | "alerta"; children: ReactNode }) {
  const cor =
    tipo === "erro" ? "border-erro text-erro-texto" : tipo === "sucesso" ? "border-sucesso text-sucesso-texto" : "border-alerta text-alerta-texto";
  const Icone = tipo === "sucesso" ? CircleCheck : CircleAlert;
  return (
    <div
      role={tipo === "erro" ? "alert" : "status"}
      className={`flex items-start gap-3 rounded-md border-l-4 bg-superficie p-3 ${cor}`}
    >
      <Icone size={22} strokeWidth={2.25} aria-hidden className="mt-0.5 shrink-0" />
      <p className="text-base font-bold text-texto">{children}</p>
    </div>
  );
}
