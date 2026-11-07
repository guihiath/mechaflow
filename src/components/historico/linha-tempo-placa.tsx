"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CircleAlert } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { ChipPlaca } from "@/components/ui/estados";
import { formatarPlaca } from "@/lib/formato";
import { diaEmSaoPaulo } from "@/lib/painel";
import {
  CartaoOSHistorico,
  type DetalheOSHistorico,
  type OSHistorico,
  type PapelHistorico,
} from "@/components/historico/cartao-os-historico";

/** De 10 em 10 (B9). */
export const PAGINA_HISTORICO = 10;

/**
 * Histórico da placa (DESIGN §14.6 e §14.7, `LinhaTempoPlaca`): topo com a placa grande, veículo e
 * resumo; OS agrupadas por ano (h2), da mais nova para a mais antiga; "Mostrar mais" acrescenta sem
 * recarregar (as abertas continuam abertas) e põe o foco na primeira OS nova. Sem rolagem infinita.
 * A versão do mecânico vem do `papel`; a leitura dele já chega sem os campos proibidos.
 */
export function LinhaTempoPlaca({
  papel,
  placa,
  veiculo,
  resumo,
  inicial,
  total,
  hoje,
  carregarDetalhe,
  carregarMais,
}: {
  papel: PapelHistorico;
  placa: string;
  /** "Volvo FH 540 · 2019". */
  veiculo?: string | null;
  /** "12 OS · 9 vistorias · desde 2024" (só dono e atendente; corta se a leitura não trouxer). */
  resumo?: string | null;
  inicial: OSHistorico[];
  /** Total de OS da placa, da mesma leitura. */
  total: number;
  hoje: string;
  carregarDetalhe: (id: string) => Promise<DetalheOSHistorico>;
  /**
   * Próxima página. A leitura `historico_placa` pagina por cursor (`proximo`), então quem chama
   * guarda o cursor e devolve só as OS novas. Some quando `total` já está na tela.
   */
  carregarMais?: () => Promise<OSHistorico[]>;
}) {
  const [lista, setLista] = useState(inicial);
  const [carregando, setCarregando] = useState(false);
  const [erroMais, setErroMais] = useState(false);
  const [focarId, setFocarId] = useState<string | null>(null);
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const base = useId();

  useEffect(() => {
    if (!focarId) return;
    refs.current.get(focarId)?.focus();
  }, [focarId]);

  async function mostrarMais() {
    if (!carregarMais) return;
    setCarregando(true);
    setErroMais(false);
    try {
      const novas = await carregarMais();
      setLista((atual) => [...atual, ...novas.filter((n) => !atual.some((a) => a.id === n.id))]);
      setFocarId(novas[0]?.id ?? null);
    } catch {
      setErroMais(true);
    } finally {
      setCarregando(false);
    }
  }

  const anos: { ano: string; os: OSHistorico[] }[] = [];
  for (const os of lista) {
    const ano = diaEmSaoPaulo(os.abertaEm).slice(0, 4);
    const grupo = anos.at(-1);
    if (grupo?.ano === ano) grupo.os.push(os);
    else anos.push({ ano, os: [os] });
  }
  const faltam = Math.max(0, total - lista.length);

  return (
    <div className="flex flex-col gap-4" data-teste="linha-tempo-placa">
      <div className="flex flex-col gap-1">
        <span>
          <ChipPlaca placa={formatarPlaca(placa)} grande />
        </span>
        {veiculo && <p className="text-xl font-bold break-words">{veiculo}</p>}
        {papel !== "mecanico" && resumo && <p className="text-sm text-texto-suave">{resumo}</p>}
      </div>

      {anos.map(({ ano, os }) => (
        <section key={ano} aria-labelledby={`${base}-${ano}`} className="flex flex-col gap-3">
          <h2 id={`${base}-${ano}`} className="text-2xl">
            {ano}
          </h2>
          <ul className="flex flex-col gap-3">
            {os.map((o) => (
              <li key={o.id}>
                <CartaoOSHistorico
                  os={o}
                  papel={papel}
                  hoje={hoje}
                  carregarDetalhe={carregarDetalhe}
                  focoRef={(el) => {
                    if (el) refs.current.set(o.id, el);
                    else refs.current.delete(o.id);
                  }}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}

      {lista.length < total && (
        <p className="text-sm text-texto-suave">
          Mostrando {lista.length} de {total}.
        </p>
      )}
      {erroMais && (
        <p role="alert" className="flex items-start gap-2 rounded-md border-l-4 border-erro bg-superficie p-3 text-base font-bold">
          <CircleAlert size={22} strokeWidth={2.25} aria-hidden className="mt-0.5 shrink-0 text-erro-texto" />
          Não foi possível carregar mais OS.
        </p>
      )}
      {faltam > 0 && carregarMais && (
        <Botao variante="secundario" disabled={carregando} onClick={() => void mostrarMais()} className="h-auto! min-h-toque py-2 text-base">
          {carregando ? "Carregando…" : erroMais ? "Tentar de novo" : `Mostrar mais ${Math.min(PAGINA_HISTORICO, faltam)}`}
        </Botao>
      )}
    </div>
  );
}

/** 3 skeletons de cartão (DESIGN §14.6, "Carregando"). */
export function HistoricoCarregando() {
  return (
    <div aria-busy="true" className="flex flex-col gap-3">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} aria-hidden className="flex h-[168px] animate-pulse overflow-hidden rounded-lg border border-borda-sutil bg-superficie">
          <div className="w-1.5 bg-superficie-2" />
          <div className="flex flex-1 flex-col gap-2 p-4">
            <div className="h-5 w-28 rounded-sm bg-superficie-2" />
            <div className="h-4 w-1/2 rounded-sm bg-superficie-2" />
            <div className="h-4 w-3/4 rounded-sm bg-superficie-2" />
            <div className="h-8 w-32 rounded-sm bg-superficie-2" />
          </div>
        </div>
      ))}
      <span className="sr-only">Carregando o histórico…</span>
    </div>
  );
}
