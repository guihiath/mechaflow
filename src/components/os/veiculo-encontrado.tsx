import { Phone } from "lucide-react";
import { Cartao, ChipPlaca } from "@/components/ui/estados";
import { formatarDiaMes, formatarNumero, formatarPlaca, formatarTelefone, soDigitos } from "@/lib/formato";

export type DadosVeiculoEncontrado = {
  placa: string;
  /** "Volvo FH 540 · 2019" */
  veiculo?: string | null;
  cliente: { nome: string; telefone?: string | null };
  ultimoKm?: number | null;
  /** Data (ISO) do ultimo KM registrado. */
  ultimoKmEm?: string | null;
  ultimoServico?: { numero: number; em: string; resumo?: string | null; href?: string } | null;
};

/**
 * Placa conhecida na abertura da OS (DESIGN §10.4, bloco 2a). Cartao sem link.
 * "Último serviço": no desktop e link (abre em nova aba); no celular e so texto,
 * para nao sair do fluxo de abertura.
 * `aoTrocarPlaca` mostra o link fantasma "Trocar placa" (so em componente cliente).
 */
export function VeiculoEncontrado({
  dados,
  aoTrocarPlaca,
}: {
  dados: DadosVeiculoEncontrado;
  aoTrocarPlaca?: () => void;
}) {
  const tel = formatarTelefone(dados.cliente.telefone);
  const km = formatarNumero(dados.ultimoKm);
  const servico = dados.ultimoServico;
  const textoServico = servico
    ? [`OS #${servico.numero}`, formatarDiaMes(servico.em), servico.resumo].filter(Boolean).join(" · ")
    : "";

  return (
    <div className="flex flex-col gap-2">
      <Cartao>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <ChipPlaca placa={formatarPlaca(dados.placa)} />
            {dados.veiculo && <span className="text-lg font-bold">{dados.veiculo}</span>}
          </div>
          <p className="text-lg font-bold">{dados.cliente.nome}</p>
          {tel && (
            <a
              href={`tel:${soDigitos(dados.cliente.telefone)}`}
              className="inline-flex min-h-toque items-center gap-2 self-start text-base font-bold text-info-texto underline underline-offset-4"
            >
              <Phone size={20} strokeWidth={2.25} aria-hidden />
              {tel}
            </a>
          )}
          {km && (
            <p className="text-base">
              <span className="text-texto-suave">Último KM: </span>
              <span className="font-mono font-semibold">{km}</span>
              {dados.ultimoKmEm && <span className="text-texto-suave"> ({formatarDiaMes(dados.ultimoKmEm)})</span>}
            </p>
          )}
          {servico && (
            <p className="text-base">
              <span className="text-texto-suave">Último serviço: </span>
              {servico.href ? (
                <>
                  <span className="lg:hidden">{textoServico}</span>
                  <a
                    href={servico.href}
                    target="_blank"
                    rel="noopener"
                    className="hidden font-bold text-info-texto underline underline-offset-4 lg:inline"
                  >
                    {textoServico}
                  </a>
                </>
              ) : (
                textoServico
              )}
            </p>
          )}
        </div>
      </Cartao>
      {aoTrocarPlaca && (
        <button
          type="button"
          onClick={aoTrocarPlaca}
          className="inline-flex min-h-toque items-center self-start text-base font-bold text-info-texto underline underline-offset-4"
        >
          Trocar placa
        </button>
      )}
    </div>
  );
}
