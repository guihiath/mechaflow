"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { fecharOS } from "@/acoes/os";
import { Botao, BotaoLink } from "@/components/ui/botao";
import { AreaTexto, Campo } from "@/components/ui/campo";
import { Escolha } from "@/components/ui/escolha";
import { BotaoEnviar, CaixaMensagem, focarPrimeiroErro } from "@/components/ui/formulario";
import type { EstadoAcao } from "@/lib/acao";
import { formatarCentavos } from "@/lib/formato";
import { FORMAS_PAGAMENTO, type FormaPagamento } from "@/lib/os";

const ERRO_FECHAR = "Não foi possível fechar a OS. Nada foi perdido: confira a internet e tente de novo.";

export function FormFechar({
  osId,
  numero,
  placa,
  semPreco,
  acimaDoAprovadoCentavos = 0,
  causa: causaInicial,
  solucao: solucaoInicial,
  codigo: codigoInicial,
}: {
  osId: string;
  numero: number;
  placa: string;
  /** Itens sem preço: com algum, a entrega fica bloqueada e o primário vira "Definir preços (N)" (M3 do F3-R1). */
  semPreco: number;
  /** Total atual acima do aprovado (so avisa na confirmacao, DESIGN §11.9). */
  acimaDoAprovadoCentavos?: number;
  causa: string;
  solucao: string;
  codigo: string;
}) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const [forma, setForma] = useState<FormaPagamento | "">("");
  const [pagamento, setPagamento] = useState<"pago" | "receber" | "">("");
  const [confirmando, setConfirmando] = useState(false);
  const [estado, setEstado] = useState<EstadoAcao>(null);
  const [enviando, iniciar] = useTransition();
  const [qual, setQual] = useState<"salvar" | "entregar" | null>(null);
  const travado = useRef(false);
  const campos = estado?.campos ?? {};
  const bloqueado = semPreco > 0;

  useEffect(() => {
    if (confirmando) caixa.current?.focus();
  }, [confirmando]);

  function enviar(acao: "salvar" | "entregar") {
    if (travado.current || !form.current) return;
    travado.current = true;
    setQual(acao);
    const fd = new FormData(form.current);
    fd.set("acao", acao);
    iniciar(async () => {
      try {
        const r = await fecharOS(null, fd);
        if (r?.ok && acao === "entregar") {
          router.replace(`/os/${osId}?entregue=1`);
          return;
        }
        setEstado(r);
        if (r?.campos || r?.dados?.semPreco) {
          setConfirmando(false);
          focarPrimeiroErro(form.current);
        }
      } catch {
        setEstado({ erro: ERRO_FECHAR });
      } finally {
        travado.current = false;
      }
    });
  }

  return (
    <form
      ref={form}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!bloqueado) setConfirmando(true);
      }}
      className="flex flex-col gap-6"
    >
      <input type="hidden" name="os_id" value={osId} />
      <AreaTexto
        rotulo="Causa encontrada"
        name="causa"
        defaultValue={causaInicial}
        maxLength={4000}
        ajuda="O que estava errado. Ex.: sensor de pressão do combustível com defeito."
        erro={campos.causa}
      />
      <AreaTexto
        rotulo="Solução aplicada"
        name="solucao"
        defaultValue={solucaoInicial}
        maxLength={4000}
        ajuda="O que foi feito para resolver."
        erro={campos.solucao}
      />
      <Campo
        rotulo="Código de falha"
        opcional
        name="codigo_falha"
        defaultValue={codigoInicial}
        maxLength={200}
        autoCapitalize="characters"
        autoComplete="off"
        className="font-mono uppercase"
        erro={campos.codigo_falha}
      />
      <Escolha
        rotulo="Forma de pagamento"
        name="forma_pagamento"
        valor={forma}
        colunas={2}
        aoMudar={(v) => {
          setForma(v);
          if (v === "faturado") setPagamento("receber");
        }}
        opcoes={FORMAS_PAGAMENTO}
        erro={campos.forma_pagamento}
      />
      <Escolha
        rotulo="Pagamento"
        name="pagamento"
        valor={pagamento}
        aoMudar={setPagamento}
        opcoes={[
          { valor: "pago", rotulo: "Pago agora" },
          { valor: "receber", rotulo: "Fica a receber" },
        ]}
        erro={campos.pagamento}
      />

      {estado?.erro && <CaixaMensagem tipo="erro">{estado.erro}</CaixaMensagem>}
      {estado?.dados?.semPreco === "1" && (
        <Link
          href={`/os/${osId}?precificar=1`}
          className="-mt-4 inline-flex min-h-toque items-center self-start font-bold text-info-texto underline"
        >
          Definir preços
        </Link>
      )}
      {estado?.ok && estado.mensagem && <CaixaMensagem tipo="sucesso">{estado.mensagem}</CaixaMensagem>}

      {confirmando ? (
        <div
          ref={caixa}
          tabIndex={-1}
          role="alertdialog"
          aria-labelledby="pergunta-entregar"
          className="flex flex-col gap-3 rounded-lg border-2 border-grafite bg-superficie p-4 outline-none focus-visible:outline-[3px] focus-visible:outline-foco"
        >
          <p id="pergunta-entregar" className="text-lg font-bold">
            Entregar {placa} e fechar a OS #{numero}? Depois disso os itens não podem mais ser mudados.
          </p>
          {acimaDoAprovadoCentavos > 0 && (
            <p className="text-base font-bold text-alerta-texto">
              O total está <span className="whitespace-nowrap tabular-nums">{formatarCentavos(acimaDoAprovadoCentavos)}</span> acima do aprovado.
            </p>
          )}
          <Botao variante="secundario" disabled={enviando} onClick={() => setConfirmando(false)}>
            Voltar sem entregar
          </Botao>
          <BotaoEnviar
            type="button"
            enviando={enviando && qual === "entregar"}
            disabled={enviando}
            rotulo="Entregar e fechar"
            rotuloEnviando="Fechando…"
            onClick={() => enviar("entregar")}
          />
        </div>
      ) : (
        <>
          <div aria-hidden className="h-28 lg:hidden" />
          <div className="fixed inset-x-0 bottom-0 z-50 flex flex-col gap-2 border-t-2 border-borda-sutil bg-superficie px-4 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-barra lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
            <BotaoEnviar
              type="button"
              variante="secundario"
              enviando={enviando && qual === "salvar"}
              disabled={enviando}
              rotulo="Salvar sem entregar"
              rotuloEnviando="Salvando…"
              onClick={() => enviar("salvar")}
            />
            {bloqueado ? (
              // Mesma regra do detalhe em "pronta": o primário leva ao que destrava a entrega.
              <BotaoLink href={`/os/${osId}?precificar=1`}>Definir preços ({semPreco})</BotaoLink>
            ) : (
              <Botao type="submit" disabled={enviando}>
                Entregar veículo
              </Botao>
            )}
          </div>
        </>
      )}
    </form>
  );
}
