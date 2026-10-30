import { CaixaMensagem } from "@/components/ui/formulario";
import { formatarCentavos } from "@/lib/formato";

/**
 * Bloco "Aprovado pelo cliente × Agora × Diferença" (DESIGN §11.9). So dono/atendente, so OS
 * `com_orcamento` depois de aprovada; vai dentro do `ResumoTotais`, logo abaixo do Total.
 * Todos os valores chegam por prop, vindos do banco (o app nao calcula total oficial).
 *
 * - Diferenca > 0: "+ R$ 450,00" em alerta e o aviso "N itens entraram depois da aprovacao".
 * - Diferenca < 0 (item removido): "− R$ 200,00" em texto suave, sem aviso.
 * - Igual e sem item novo sem preco: nao renderiza.
 * - Nao bloqueia nada (decisao nº 4): e so informacao.
 */
export function AprovadoAgora({
  aprovadoCentavos,
  agoraCentavos,
  itensAposAprovacao = 0,
  itensAposSemPreco = 0,
}: {
  aprovadoCentavos: number;
  agoraCentavos: number;
  /** Quantos itens entraram depois da aprovacao. */
  itensAposAprovacao?: number;
  /** Desses, quantos ainda estao sem preco. */
  itensAposSemPreco?: number;
}) {
  const diferenca = agoraCentavos - aprovadoCentavos;
  if (diferenca === 0 && itensAposSemPreco <= 0) return null;

  const sinal = diferenca > 0 ? "+" : diferenca < 0 ? "−" : "";
  const textoDiferenca = `${sinal ? `${sinal} ` : ""}${formatarCentavos(Math.abs(diferenca))}`;
  const itens = itensAposAprovacao === 1 ? "1 item entrou" : `${itensAposAprovacao} itens entraram`;
  const avisar = itensAposAprovacao > 0 && (diferenca > 0 || itensAposSemPreco > 0);

  return (
    <div className="mt-1 flex flex-col gap-2 border-t-2 border-dashed border-borda-sutil pt-2">
      <dl className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-base text-texto-suave">Aprovado pelo cliente</dt>
          <dd className="text-right font-mono text-lg text-texto-suave">{formatarCentavos(aprovadoCentavos)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-base font-bold">Agora</dt>
          <dd className="text-right">
            <span className="font-mono text-lg font-semibold">{formatarCentavos(agoraCentavos)}</span>
            {itensAposSemPreco > 0 && (
              <span className="block text-sm font-bold text-alerta-texto">
                + {itensAposSemPreco === 1 ? "1 item sem preço" : `${itensAposSemPreco} itens sem preço`}
              </span>
            )}
          </dd>
        </div>
        {diferenca !== 0 && (
          <div className="flex items-baseline justify-between gap-4">
            <dt className={`text-base font-bold ${diferenca > 0 ? "text-alerta-texto" : "text-texto-suave"}`}>Diferença</dt>
            <dd
              className={`text-right font-mono text-lg font-semibold ${
                diferenca > 0 ? "text-alerta-texto" : "text-texto-suave"
              }`}
            >
              {textoDiferenca}
            </dd>
          </div>
        )}
      </dl>
      {avisar && (
        <CaixaMensagem tipo="alerta">
          {itensAposSemPreco > 0
            ? `${itens} depois da aprovação; ${itensAposSemPreco} ainda sem preço. Avise o cliente antes de entregar.`
            : `${itens} depois da aprovação (${textoDiferenca}). Avise o cliente antes de entregar.`}
        </CaixaMensagem>
      )}
    </div>
  );
}
