"use client";

import { useCallback, useRef } from "react";
import type { OSHistorico, PapelHistorico } from "@/components/historico/cartao-os-historico";
import { LinhaTempoPlaca } from "@/components/historico/linha-tempo-placa";
import { abrirOSHistorico, maisHistorico } from "@/acoes/historico";
import type { CursorHistorico } from "@/lib/historico";
import type { ParteListaHistorico } from "@/lib/painel-dados";

/**
 * Liga `LinhaTempoPlaca` às ações do servidor (F7-B7). Guarda o cursor de `historico_placa` e a
 * parte da lista de cada OS (já cortada por papel no servidor) para abrir o cartão.
 */
export function HistoricoPlaca({
  papel,
  placa,
  veiculo,
  resumo,
  inicial,
  partes,
  total,
  hoje,
  proximo,
}: {
  papel: PapelHistorico;
  placa: string;
  veiculo: string | null;
  resumo: string | null;
  inicial: OSHistorico[];
  partes: ParteListaHistorico[];
  total: number;
  hoje: string;
  proximo: CursorHistorico | null;
}) {
  const mapa = useRef(new Map(partes.map((p) => [p.id, p])));
  const cursor = useRef(proximo);

  const carregarDetalhe = useCallback(async (id: string) => {
    const parte = mapa.current.get(id);
    if (!parte) throw new Error("OS fora da lista");
    const detalhe = await abrirOSHistorico(parte);
    if (!detalhe) throw new Error("Não foi possível abrir esta OS.");
    return detalhe;
  }, []);

  const carregarMais = useCallback(async () => {
    if (!cursor.current) return [];
    const pagina = await maisHistorico(placa, cursor.current);
    if (!pagina) throw new Error("Não foi possível carregar mais OS.");
    for (const p of pagina.partes) mapa.current.set(p.id, p);
    cursor.current = pagina.proximo;
    return pagina.os;
  }, [placa]);

  return (
    <LinhaTempoPlaca
      papel={papel}
      placa={placa}
      veiculo={veiculo}
      resumo={resumo}
      inicial={inicial}
      total={total}
      hoje={hoje}
      carregarDetalhe={carregarDetalhe}
      carregarMais={carregarMais}
    />
  );
}
