"use client";

import { useState, useTransition } from "react";
import { ConfirmarAcao } from "@/components/ui/confirmar-acao";
import { Selecao } from "@/components/ui/campo";
import { BotaoEnviar, CaixaMensagem } from "@/components/ui/formulario";
import { atualizarMembro } from "@/acoes/equipe";
import type { Papel } from "@/lib/contexto";
import { ROTULO_PAPEL } from "@/lib/formato";

export function AcoesMembro({ id, nome, papel, ativo }: { id: string; nome: string; papel: Papel; ativo: boolean }) {
  const [novoPapel, setNovoPapel] = useState<Papel>(papel);
  const [erro, setErro] = useState<string>();
  const [ok, setOk] = useState<string>();
  const [enviando, iniciar] = useTransition();
  const virandoDono = novoPapel === "dono" && papel !== "dono";

  function salvarPapel() {
    if (enviando || novoPapel === papel) return;
    setErro(undefined);
    setOk(undefined);
    iniciar(async () => {
      const r = await atualizarMembro(id, { papel: novoPapel });
      if (r?.erro) setErro(r.erro);
      else setOk(`${nome} agora é ${ROTULO_PAPEL[novoPapel].toLowerCase()}.`);
    });
  }

  return (
    <details className="group mt-3">
      <summary className="flex min-h-toque cursor-pointer items-center text-base font-bold text-info-texto underline">
        Gerenciar acesso
      </summary>
      <div className="mt-3 flex flex-col gap-4">
        {ativo && (
          <div className="flex flex-col gap-3">
            <Selecao
              rotulo="Papel"
              value={novoPapel}
              onChange={(e) => {
                setNovoPapel(e.target.value as Papel);
                setOk(undefined);
                setErro(undefined);
              }}
              opcoes={[
                { valor: "mecanico", rotulo: "Mecânico (não vê valores)" },
                { valor: "atendente", rotulo: "Atendente (vê preço, não vê custo)" },
                { valor: "dono", rotulo: "Dono (acesso total)" },
              ]}
            />
            {virandoDono ? (
              <>
                <CaixaMensagem tipo="alerta">
                  Dono vê custos e margem, mexe no catálogo e gerencia a equipe.
                </CaixaMensagem>
                <ConfirmarAcao
                  acao={async () => {
                    const r = await atualizarMembro(id, { papel: "dono" });
                    if (!r?.erro) setOk(`${nome} agora é dono.`);
                    return r;
                  }}
                  rotulo="Tornar dono"
                  pergunta={`Tornar ${nome} dono? Vai ver custos, margem e poder mexer na equipe.`}
                  rotuloConfirmar={`Tornar ${nome} dono`}
                  rotuloEnviando="Salvando…"
                />
              </>
            ) : (
              <BotaoEnviar
                type="button"
                variante="secundario"
                enviando={enviando}
                disabled={novoPapel === papel}
                rotulo="Salvar papel"
                rotuloEnviando="Salvando…"
                onClick={salvarPapel}
              />
            )}
            {erro && <CaixaMensagem tipo="erro">{erro}</CaixaMensagem>}
            {ok && <CaixaMensagem tipo="sucesso">{ok}</CaixaMensagem>}
          </div>
        )}
        {ativo ? (
          <ConfirmarAcao
            acao={() => atualizarMembro(id, { ativo: false })}
            rotulo="Desativar acesso"
            pergunta={`Desativar o acesso de ${nome}? A pessoa perde o acesso na hora.`}
            rotuloConfirmar={`Desativar ${nome}`}
            rotuloEnviando="Desativando…"
          />
        ) : (
          <ConfirmarAcao
            variante="primario"
            acao={() => atualizarMembro(id, { ativo: true })}
            rotulo="Reativar acesso"
            pergunta={`Reativar o acesso de ${nome}?`}
            rotuloConfirmar={`Reativar ${nome}`}
            rotuloEnviando="Reativando…"
          />
        )}
      </div>
    </details>
  );
}
