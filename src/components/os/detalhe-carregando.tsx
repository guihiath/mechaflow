import { BarraAcoesOS } from "@/components/os/barra-acoes-os";
import { Botao } from "@/components/ui/botao";

/**
 * Skeleton do detalhe da OS (DESIGN §10.5): placa 44px, badge 32px, 2 cards de 120px,
 * 3 linhas de 64px e a barra de acoes ja desenhada, com os botoes desabilitados.
 * `comBarra={false}` para a versao do mecanico fora de `em_andamento`.
 */
export function DetalheCarregando({ comBarra = true }: { comBarra?: boolean }) {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <div className="flex animate-pulse flex-col gap-3">
        <div className="h-11 w-52 rounded-sm bg-superficie-2" />
        <div className="h-6 w-40 rounded-sm bg-superficie-2" />
        <div className="h-8 w-36 rounded-sm bg-superficie-2" />
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="h-30 animate-pulse rounded-lg border border-borda-sutil bg-superficie p-4">
          <div className="mb-3 h-5 w-32 rounded-sm bg-superficie-2" />
          <div className="mb-2 h-4 w-3/4 rounded-sm bg-superficie-2" />
          <div className="h-4 w-1/2 rounded-sm bg-superficie-2" />
        </div>
      ))}
      <div className="flex animate-pulse flex-col divide-y-2 divide-borda-sutil rounded-lg border border-borda-sutil bg-superficie">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex h-16 items-center gap-3 px-4">
            <div className="size-6 rounded-sm bg-superficie-2" />
            <div className="h-4 flex-1 rounded-sm bg-superficie-2" />
            <div className="h-4 w-20 rounded-sm bg-superficie-2" />
          </div>
        ))}
      </div>
      <span className="sr-only">Carregando…</span>
      {comBarra && (
        <BarraAcoesOS
          primario={
            <Botao disabled>
              Carregando…
            </Botao>
          }
        />
      )}
    </div>
  );
}
