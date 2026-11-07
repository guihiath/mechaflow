"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { registrarPagamentoOS } from "@/acoes/os";
import { Campo } from "@/components/ui/campo";
import { Escolha } from "@/components/ui/escolha";
import { Folha } from "@/components/ui/folha";
import { BotaoEnviar, CaixaMensagem, focarPrimeiroErro } from "@/components/ui/formulario";
import { ChipPlaca } from "@/components/ui/estados";
import type { EstadoAcao } from "@/lib/acao";
import { formatarCentavos, formatarPlaca } from "@/lib/formato";
import { FORMAS_PAGAMENTO, hojeEmSaoPaulo, type FormaPagamento } from "@/lib/os";

export type OSPagamento = {
  id: string;
  totalCentavos: number;
  /** Forma gravada na OS (a da entrega, ou a do pagamento já registrado). */
  formaPagamento?: FormaPagamento | null;
  /** Identificação da OS, só fora do detalhe (DESIGN §14.4): "OS #1031 · [ABC1D23] · Transportes Silva". */
  identificacao?: { numero: number; placa: string; cliente?: string | null };
  /** Pagamento já registrado (correção): aí a forma atual vem marcada. Sem ele, nenhuma vem. */
  pagoEm?: string | null;
};

/**
 * Folha "Registrar pagamento" (DESIGN §10 e §14.4), a mesma do detalhe da OS, agora fora do
 * `painel-os.tsx` para servir também a `/a-receber`. Campos, textos e ação não mudam: forma de
 * pagamento, "Recebido em" (hoje como padrão, sem data futura; data passada vira meio-dia de São
 * Paulo na ação) e `registrarPagamentoOS`, que chama `registrar_pagamento` com
 * `p_so_se_a_receber = true` (ARQUITETURA 14.5, decisão 5 do CEO).
 * - `aoRegistrar`: sucesso (a folha não fecha sozinha; quem chama decide).
 * - `aoJaRegistrado`: outra pessoa registrou antes (`dados.fechar`); sem ele, o recado fica na folha.
 */
export function FolhaPagamento({
  os,
  aoFechar,
  aoRegistrar,
  aoJaRegistrado,
  naLista = false,
}: {
  os: OSPagamento;
  aoFechar: () => void;
  aoRegistrar: (forma: FormaPagamento) => void;
  aoJaRegistrado?: (mensagem: string) => void;
  /** Na lista de quem deve: o recado de "já registrado" fala da lista, não da tela. */
  naLista?: boolean;
}) {
  // F7-B11 (M10): a forma da entrega (ex.: "Faturado") diz como foi cobrado, não como o dinheiro
  // entrou. Ao registrar, nenhuma vem marcada e o botão só ativa depois de escolher. Na correção
  // de um pagamento já registrado, mantém a forma atual.
  const [forma, setForma] = useState<FormaPagamento | "">(os.pagoEm ? (os.formaPagamento ?? "") : "");
  const [hoje] = useState(() => hojeEmSaoPaulo());
  const [estado, setEstado] = useState<EstadoAcao>(null);
  const [enviando, iniciar] = useTransition();
  const travado = useRef(false);
  const campos = estado?.campos ?? {};
  const idForm = `form-pagamento-${os.id}`;

  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (travado.current) return;
    travado.current = true;
    const form = e.currentTarget;
    const fd = new FormData(form);
    iniciar(async () => {
      try {
        const r = await registrarPagamentoOS(null, fd);
        setEstado(r);
        if (r?.ok) aoRegistrar(fd.get("forma_pagamento") as FormaPagamento);
        else if (r?.campos) focarPrimeiroErro(form);
        else if (r?.dados?.fechar && r.erro && aoJaRegistrado) aoJaRegistrado(r.erro);
      } catch {
        setEstado({ erro: "Não foi possível registrar o pagamento. Confira a internet e tente de novo." });
      } finally {
        travado.current = false;
      }
    });
  }

  const id = os.identificacao;
  return (
    <Folha
      aberta
      aoFechar={aoFechar}
      titulo="Registrar pagamento"
      rodape={
        <BotaoEnviar
          type="submit"
          form={idForm}
          enviando={enviando}
          rotulo="Registrar pagamento"
          rotuloEnviando="Registrando…"
          variante="primario"
          disabled={!forma}
        />
      }
    >
      <form id={idForm} onSubmit={enviar} noValidate className="flex flex-col gap-5">
        <input type="hidden" name="os_id" value={os.id} />
        {naLista && <input type="hidden" name="origem" value="lista" />}
        {id && (
          // Duas linhas (F7-B11, M4): "OS #4 [placa]" e o cliente embaixo. Sem "·": a moldura da placa
          // já separa, e com texto grande a placa desce sem deixar um ponto solto no fim da linha.
          <p className="flex flex-col gap-1 text-base">
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-mono font-semibold">OS #{id.numero}</span>
              <ChipPlaca placa={formatarPlaca(id.placa)} />
            </span>
            {id.cliente && <span className="block min-w-0 break-words">{id.cliente}</span>}
          </p>
        )}
        <p className="font-mono text-2xl">Total: {formatarCentavos(os.totalCentavos)}</p>
        <Escolha
          rotulo="Forma de pagamento"
          name="forma_pagamento"
          valor={forma}
          ajuda="Como o dinheiro chegou?"
          aoMudar={setForma}
          colunas={2}
          opcoes={FORMAS_PAGAMENTO}
          erro={campos.forma_pagamento}
        />
        <Campo rotulo="Recebido em" name="recebido_em" type="date" defaultValue={hoje} max={hoje} erro={campos.recebido_em} />
        {estado?.erro && <CaixaMensagem tipo="erro">{estado.erro}</CaixaMensagem>}
      </form>
    </Folha>
  );
}
