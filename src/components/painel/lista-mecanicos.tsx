import Link from "next/link";
import { useId } from "react";
import { ChevronRight } from "lucide-react";
import { SemMecanico } from "@/components/os/badge-status";
import { CaixaErro } from "@/components/ui/estados";
import { ValorQuebravel } from "@/components/ui/valor-quebravel";
import { formatarCentavos } from "@/lib/formato";
import { TEXTO_PAINEL, nomeMesCurto, textoOS, type Mes } from "@/lib/painel";

export type ProducaoMecanico = {
  /** `null` = OS entregues sem mecânico. */
  mecanicoId: string | null;
  nome: string | null;
  quantidadeOS: number;
  /** Soma de `total_servicos_centavos` (sem peças). */
  servicosCentavos: number;
};

/**
 * Maior valor em serviços primeiro; empate por OS, depois nome. "Sem mecânico" sempre por último
 * e mecânico com zero OS some (DESIGN §14.9).
 */
export function ordenarMecanicos(lista: readonly ProducaoMecanico[]): ProducaoMecanico[] {
  return lista
    .filter((m) => m.quantidadeOS > 0)
    .sort((a, b) => {
      if ((a.mecanicoId === null) !== (b.mecanicoId === null)) return a.mecanicoId === null ? 1 : -1;
      return (
        b.servicosCentavos - a.servicosCentavos ||
        b.quantidadeOS - a.quantidadeOS ||
        (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR")
      );
    });
}

/**
 * Linha de mecânico (DESIGN §14.9, `LinhaMecanico`): mínimo 72 px, inteira tocável, nome 18 px/700
 * e "12 OS · R$ 18.450,00 em serviços" em mono, com o valor quebrando inteiro. Sem posição,
 * barra, média ou meta. `mecanicoId` nulo usa `SemMecanico`.
 */
export function LinhaMecanico({ producao, href }: { producao: ProducaoMecanico; href: string }) {
  const nome = producao.mecanicoId === null ? TEXTO_PAINEL.semMecanico : (producao.nome ?? "");
  return (
    <li className="border-b border-borda-sutil last:border-b-0">
      <Link
        href={href}
        aria-label={`${nome}: ${textoOS(producao.quantidadeOS)}, ${formatarCentavos(producao.servicosCentavos)} em serviços. Ver as OS.`}
        className="flex min-h-[72px] items-center gap-3 py-2 active:bg-superficie-2"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          {producao.mecanicoId === null ? (
            // Mesmo componente da lista de OS, no tamanho do nome da linha.
            <span className="[&>span]:text-lg [&>span]:leading-[1.625rem]">
              <SemMecanico />
            </span>
          ) : (
            <span className="text-lg font-bold break-words">{nome}</span>
          )}
          <span className="font-mono text-sm font-semibold text-texto-suave">
            {textoOS(producao.quantidadeOS)} · <ValorQuebravel centavos={producao.servicosCentavos} /> em serviços
          </span>
        </span>
        <ChevronRight size={24} strokeWidth={2.25} aria-hidden className="shrink-0 text-texto-suave" />
      </Link>
    </li>
  );
}

/** Seção "Produtividade por mecânico" (DESIGN §14.9), só no painel do dono. */
export function ListaMecanicos({
  mes,
  mecanicos,
  hrefMecanico,
  hrefSemMecanico,
  erro,
  tentarDeNovo,
}: {
  mes: Mes;
  mecanicos: readonly ProducaoMecanico[];
  hrefMecanico: (id: string) => string;
  hrefSemMecanico: string;
  erro?: boolean;
  tentarDeNovo?: string;
}) {
  const lista = ordenarMecanicos(mecanicos);
  const nomeMes = nomeMesCurto(mes);
  const idTitulo = useId();
  return (
    <section aria-labelledby={idTitulo} className="flex flex-col gap-2" data-teste="lista-mecanicos">
      <h2 id={idTitulo} className="text-2xl">
        Produtividade por mecânico
      </h2>
      {erro ? (
        <CaixaErro titulo="Não foi possível carregar a produtividade." tentarDeNovo={tentarDeNovo} />
      ) : lista.length === 0 ? (
        <p className="text-base text-texto-suave">Nenhuma OS entregue em {nomeMes}.</p>
      ) : (
        <>
          <p className="text-sm text-texto-suave">
            OS entregues em {nomeMes}. Cada OS conta inteira para o responsável na entrega. Valor só de serviços, sem peças.
          </p>
          <ul className="flex flex-col rounded-lg border border-borda-sutil bg-superficie px-4">
            {lista.map((m) => (
              <LinhaMecanico
                key={m.mecanicoId ?? "sem"}
                producao={m}
                href={m.mecanicoId === null ? hrefSemMecanico : hrefMecanico(m.mecanicoId)}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
