"use client";

import { useState, useTransition } from "react";
import { ChevronRight, ClipboardCheck } from "lucide-react";
import { iniciarVistoria } from "@/acoes/vistoria";
import { Botao } from "@/components/ui/botao";
import { Cartao } from "@/components/ui/estados";
import { CaixaMensagem } from "@/components/ui/formulario";
import { EtiquetaVistoria } from "@/components/vistoria/etiquetas-vistoria";
import { ETIQUETA_SEM_ASSINATURA, formatarDiaHora, type MotivoSemAssinatura, type StatusVistoria } from "@/lib/formato";

export type ResumoVistoriaOS = {
  status: StatusVistoria;
  criadoEm: string | null;
  criadoPorNome: string | null;
  concluidaEm: string | null;
  concluidaPorNome: string | null;
  qtdAvarias: number;
  assinadoPorNome: string | null;
  semAssinaturaMotivo: MotivoSemAssinatura | null;
} | null;

/**
 * Cartão "Vistoria de entrada" no detalhe da OS (DESIGN §12.2 b), versão do F4-B2:
 * sem vistoria → "Fazer vistoria" (cria o rascunho e abre a tela); em andamento →
 * "Continuar vistoria"; feita → o cartão inteiro é link "Ver vistoria".
 * `podeFazer` segue a regra do banco (dono/atendente em OS aberta; mecânico só na dele).
 */
export function CartaoVistoriaOS({
  osId,
  vistoria,
  podeFazer,
  encerrada,
  obrigatoria = false,
  anuladas = [],
}: {
  osId: string;
  vistoria: ResumoVistoriaOS;
  podeFazer: boolean;
  encerrada: boolean;
  /** Oficina exige a vistoria (DESIGN §12.1: "Sem vistoria" em alerta, F4-B5). */
  obrigatoria?: boolean;
  /** Ids das vistorias anuladas desta OS, a mais nova primeiro (DESIGN §12.2 b: "1 vistoria anulada"). */
  anuladas?: string[];
}) {
  const [erro, setErro] = useState<string>();
  const [abrindo, iniciar] = useTransition();

  function fazer() {
    setErro(undefined);
    iniciar(async () => {
      const r = await iniciarVistoria(osId);
      if (r?.erro) setErro(r.erro);
    });
  }

  if (vistoria?.status === "concluida") {
    const avarias = vistoria.qtdAvarias === 0 ? "Sem avarias" : vistoria.qtdAvarias === 1 ? "1 avaria" : `${vistoria.qtdAvarias} avarias`;
    const assinatura = vistoria.semAssinaturaMotivo
      ? ETIQUETA_SEM_ASSINATURA[vistoria.semAssinaturaMotivo].toLowerCase()
      : vistoria.assinadoPorNome
        ? `assinada por ${vistoria.assinadoPorNome}`
        : "";
    return (
      <Cartao href={`/os/${osId}/vistoria`} rotulo={`Vistoria de entrada feita. ${avarias}. Ver vistoria`}>
        <div className="flex min-h-12 items-center gap-3">
          <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
            <h2 className="text-lg">Vistoria de entrada</h2>
            <EtiquetaVistoria estado="concluida" />
            <p className="text-sm text-texto-suave">
              {formatarDiaHora(vistoria.concluidaEm)}
              {vistoria.concluidaPorNome ? ` · ${vistoria.concluidaPorNome}` : ""}
            </p>
            <p className="text-sm text-texto-suave">{[avarias, assinatura].filter(Boolean).join(" · ")}</p>
          </div>
          <span className="flex shrink-0 items-center gap-1 text-base font-bold text-info-texto">
            Ver vistoria
            <ChevronRight size={22} strokeWidth={2.25} aria-hidden />
          </span>
        </div>
      </Cartao>
    );
  }

  const emAndamento = vistoria?.status === "rascunho";
  return (
    <Cartao>
      <div className="flex flex-col items-start gap-2" data-teste="cartao-vistoria">
        <h2 className="text-lg">Vistoria de entrada</h2>
        <EtiquetaVistoria estado={emAndamento ? "rascunho" : "sem"} obrigatoria={obrigatoria && !encerrada} />
        {emAndamento && (
          <p className="text-sm text-texto-suave">
            Começada{vistoria.criadoPorNome ? ` por ${vistoria.criadoPorNome}` : ""} em {formatarDiaHora(vistoria.criadoEm)}
          </p>
        )}
        {!emAndamento && obrigatoria && !encerrada && (
          <p className="text-sm text-alerta-texto">Esta oficina exige a vistoria: sem ela a OS não fica pronta nem é entregue.</p>
        )}
        {anuladas.length > 0 && (
          <a
            href={`/os/${osId}/vistoria?ver=${anuladas[0]}`}
            className="inline-flex min-h-toque items-center text-sm font-bold text-info-texto underline underline-offset-4"
          >
            {anuladas.length === 1 ? "1 vistoria anulada. Ver a anulada" : `${anuladas.length} vistorias anuladas. Ver a última`}
          </a>
        )}
        {erro && <CaixaMensagem tipo="erro">{erro}</CaixaMensagem>}
        {podeFazer ? (
          <Botao variante="secundario" onClick={fazer} disabled={abrindo} aria-busy={abrindo} className="mt-1 w-full">
            <ClipboardCheck size={22} strokeWidth={2.25} aria-hidden />
            {abrindo ? "Abrindo…" : emAndamento ? "Continuar vistoria" : "Fazer vistoria"}
          </Botao>
        ) : emAndamento ? (
          <a href={`/os/${osId}/vistoria`} className="inline-flex min-h-toque items-center text-base font-bold text-info-texto underline underline-offset-4">
            Ver o que já foi feito
          </a>
        ) : (
          !encerrada && <p className="text-base text-texto-suave">A vistoria é feita pelo balcão ou pelo mecânico da OS.</p>
        )}
      </div>
    </Cartao>
  );
}
