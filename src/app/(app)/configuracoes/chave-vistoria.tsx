"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Botao } from "@/components/ui/botao";
import { Escolha } from "@/components/ui/escolha";
import { AvisoLento, CaixaMensagem } from "@/components/ui/formulario";
import { salvarVistoriaObrigatoria } from "@/acoes/configuracoes";

type Valor = "opcional" | "obrigatoria";

const AJUDA: Record<Valor, string> = {
  opcional: "Quem quiser faz a vistoria. Nada é bloqueado.",
  obrigatoria:
    "Sem vistoria concluída, a OS não pode ser marcada como pronta nem entregue. A lista de OS mostra quais estão sem vistoria.",
};

/**
 * "A vistoria é…" Opcional / Obrigatória (DESIGN §12.16 item 3): 2 botões grandes, salva ao
 * tocar. Ligar com OS abertas sem vistoria pede confirmação inline antes de salvar.
 */
export function ChaveVistoria({ obrigatoria, osSemVistoria }: { obrigatoria: boolean; osSemVistoria: number }) {
  const [salvo, setSalvo] = useState<Valor>(obrigatoria ? "obrigatoria" : "opcional");
  const [confirmando, setConfirmando] = useState(false);
  const [mensagem, setMensagem] = useState<string>();
  const [erro, setErro] = useState<string>();
  const [enviando, iniciar] = useTransition();
  const caixaConfirmar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (confirmando) caixaConfirmar.current?.focus();
  }, [confirmando]);

  function salvar(novo: Valor) {
    setConfirmando(false);
    setErro(undefined);
    setMensagem(undefined);
    const anterior = salvo;
    setSalvo(novo);
    iniciar(async () => {
      try {
        const r = await salvarVistoriaObrigatoria(novo === "obrigatoria");
        if (r?.erro) {
          setSalvo(anterior);
          setErro(r.erro);
        } else setMensagem(r?.mensagem);
      } catch {
        setSalvo(anterior);
        setErro("Não foi possível salvar. Confira a internet e tente de novo.");
      }
    });
  }

  function escolher(novo: Valor) {
    if (enviando || novo === salvo) {
      setConfirmando(false);
      return;
    }
    if (novo === "obrigatoria" && osSemVistoria > 0) {
      setMensagem(undefined);
      setErro(undefined);
      setConfirmando(true);
      return;
    }
    salvar(novo);
  }

  return (
    <div className="flex flex-col gap-3">
      <Escolha<Valor>
        rotulo="A vistoria é…"
        name="vistoria_obrigatoria"
        valor={salvo}
        aoMudar={escolher}
        aoTocarMarcada={() => setConfirmando(false)}
        opcoes={[
          { valor: "opcional", rotulo: "Opcional", desabilitado: enviando },
          { valor: "obrigatoria", rotulo: "Obrigatória", desabilitado: enviando, pendente: confirmando },
        ]}
        ajuda={<span className="text-base">{AJUDA[salvo]}</span>}
      />
      {confirmando && (
        <div
          ref={caixaConfirmar}
          tabIndex={-1}
          role="group"
          aria-labelledby="confirmar-obrigatoria"
          className="flex flex-col gap-3 rounded-md border-l-4 border-alerta bg-superficie p-3 outline-none"
        >
          <p id="confirmar-obrigatoria" className="text-base font-bold">
            {osSemVistoria === 1
              ? "1 OS aberta está sem vistoria. Ela não vai poder ficar pronta até alguém fazer a vistoria."
              : `${osSemVistoria} OS abertas estão sem vistoria. Elas não vão poder ficar prontas até alguém fazer a vistoria.`}
          </p>
          <Botao variante="secundario" onClick={() => setConfirmando(false)}>
            Manter opcional
          </Botao>
          <Botao onClick={() => salvar("obrigatoria")}>Tornar obrigatória</Botao>
        </div>
      )}
      {enviando && <AvisoLento />}
      {erro && <CaixaMensagem tipo="erro">{erro}</CaixaMensagem>}
      {mensagem && !enviando && <CaixaMensagem tipo="sucesso">{mensagem}</CaixaMensagem>}
    </div>
  );
}
