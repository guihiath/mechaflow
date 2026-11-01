"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";
import { Folha } from "@/components/ui/folha";
import { ListaAvarias, type DadosAvaria } from "@/components/vistoria/cartao-avaria";
import { BlocoVistoriaConcluida, type AssinaturaLeitura } from "@/components/vistoria/vistoria-concluida";
import { ROTULO_LADO_AVARIA, type LadoAvaria } from "@/lib/formato";

export type AvariaLeitura = {
  id: string;
  lado: LadoAvaria;
  descricao: string | null;
  fotos: { id: string; src: string | null; srcGrande: string | null }[];
};

/**
 * Leitura da vistoria concluída (DESIGN §12.12, versão do F4-B2): assinatura primeiro,
 * depois avarias (tocar abre as fotos grandes numa folha, sem editar nem apagar) e o
 * resumo do checklist. Sem botões de mudar: concluída não muda.
 */
export function LeituraVistoria({
  numeroOS,
  concluidaEm,
  concluidaPor,
  assinatura,
  avarias,
  semAvarias,
  itensTotal,
  itensComProblema,
  hash,
}: {
  numeroOS: number;
  concluidaEm: string;
  concluidaPor: string;
  assinatura: AssinaturaLeitura;
  avarias: AvariaLeitura[];
  semAvarias: boolean;
  itensTotal: number;
  itensComProblema: number;
  hash: string | null;
}) {
  const [aberta, setAberta] = useState<AvariaLeitura | null>(null);
  const dados: DadosAvaria[] = avarias.map((a) => ({
    id: a.id,
    lado: a.lado,
    descricao: a.descricao,
    fotos: a.fotos.map((f) => ({ id: f.id, src: f.src, estado: "enviada" as const })),
  }));

  return (
    <div data-teste="leitura-vistoria">
      <BlocoVistoriaConcluida numeroOS={numeroOS} concluidaEm={concluidaEm} concluidaPor={concluidaPor} assinatura={assinatura} complementos={[]}>
        {semAvarias && avarias.length === 0 ? (
          <section className="flex flex-col gap-2">
            <h2 className="text-xl">Avarias (0)</h2>
            <p className="text-base">Nenhuma avaria.</p>
          </section>
        ) : (
          <ListaAvarias
            avarias={dados}
            leitura
            aoAbrir={(a) => setAberta(avarias.find((x) => x.id === a.id) ?? null)}
          />
        )}
        <section className="flex flex-col gap-2">
          <h2 className="text-xl">Checklist</h2>
          <p className="text-base">
            {itensTotal} itens: {itensTotal - itensComProblema} ok ou não se aplica
            {itensComProblema ? ` · ${itensComProblema} com problema` : ""}
          </p>
        </section>
        {hash && <p className="font-mono text-xs text-texto-suave">Código de conferência: {hash.slice(0, 12)}</p>}
      </BlocoVistoriaConcluida>

      {aberta && (
        <Folha aberta aoFechar={() => setAberta(null)} titulo={ROTULO_LADO_AVARIA[aberta.lado]}>
          <div className="flex flex-col gap-3">
            {aberta.descricao && <p className="text-lg">{aberta.descricao}</p>}
            {aberta.fotos.length === 0 && <p className="text-base text-texto-suave">Avaria registrada sem foto.</p>}
            {aberta.fotos.map((f, i) =>
              f.srcGrande ? (
                // URL assinada do Storage: sem otimizador do Next.
                // eslint-disable-next-line @next/next/no-img-element
                <img key={f.id} src={f.srcGrande} alt={`Foto ${i + 1} da avaria`} className="w-full rounded-md bg-superficie-2" data-teste="foto-grande" />
              ) : (
                <p key={f.id} className="flex items-center gap-2 text-base text-texto-suave">
                  <ImageOff size={22} aria-hidden /> Não foi possível carregar a foto.
                </p>
              ),
            )}
          </div>
        </Folha>
      )}
    </div>
  );
}
