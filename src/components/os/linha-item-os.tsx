import type { ReactNode } from "react";
import { ChevronRight, Package, Wrench } from "lucide-react";
import { EtiquetaSemPreco } from "@/components/os/badge-status";
import { formatarCentavos, formatarQuantidade } from "@/lib/formato";
import type { TipoItemOS } from "@/lib/os-status";

export type DadosItemOS = {
  tipo: TipoItemOS;
  descricao: string;
  quantidade: number;
  /** Texto da unidade na versao sem valores ("un.", "litros"). Padrao: "un." -> "2 un." */
  unidade?: string | null;
  /** Preco unitario em centavos. null = "Sem preço". Ausente na versao do mecanico. */
  precoUnitarioCentavos?: number | null;
  /** Subtotal vindo do banco. Se faltar, calcula quantidade x preco so para exibir. */
  subtotalCentavos?: number | null;
  /** Custo unitario (so dono, so peca). */
  custoUnitarioCentavos?: number | null;
};

/** Lista agrupada dos itens (card com divisorias). Os filhos sao `LinhaItemOS`. */
export function ListaItensOS({ children, rotulo }: { children: ReactNode; rotulo?: string }) {
  return (
    <ul
      aria-label={rotulo}
      className="divide-y-2 divide-borda-sutil overflow-hidden rounded-lg border border-borda-sutil bg-superficie"
    >
      {children}
    </ul>
  );
}

/**
 * Linha de servico/peca da OS (DESIGN §10.5 e §10.10).
 * - Com `aoTocar`, a linha inteira vira botao (min. 64px) que abre a folha de edicao
 *   (so funciona dentro de componente cliente). Sem `aoTocar`, e so leitura.
 * - `semValores` (mecanico): icone + descricao + "2 un.", nenhum R$ e nenhuma etiqueta "Sem preço".
 * - `mostrarCusto` (dono): "Custo R$ 90,00" abaixo da quantidade, so em peca com custo.
 */
export function LinhaItemOS({
  item,
  semValores,
  mostrarCusto,
  aoTocar,
  etiquetas,
}: {
  item: DadosItemOS;
  semValores?: boolean;
  mostrarCusto?: boolean;
  aoTocar?: () => void;
  /** Ate 2 etiquetas na linha de baixo (DESIGN §11.13), ex.: "Você lançou". */
  etiquetas?: ReactNode;
}) {
  const Icone = item.tipo === "servico" ? Wrench : Package;
  const qtd = formatarQuantidade(item.quantidade);
  const preco = item.precoUnitarioCentavos;
  const temPreco = typeof preco === "number";
  const subtotal =
    typeof item.subtotalCentavos === "number"
      ? item.subtotalCentavos
      : temPreco
        ? Math.round(item.quantidade * preco)
        : null;
  const custo = item.custoUnitarioCentavos;
  const verCusto = !semValores && mostrarCusto && item.tipo === "peca" && typeof custo === "number";

  const detalhe = semValores
    ? `${qtd} ${item.unidade || "un."}`
    : `${qtd} × ${temPreco ? formatarCentavos(preco) : "—"}${verCusto ? ` · Custo ${formatarCentavos(custo)}` : ""}`;

  const topo = (
    <>
      <Icone size={22} strokeWidth={2.25} aria-hidden className="mt-0.5 shrink-0 text-texto-suave" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        {/* Nome inteiro, sem "…": o balcão precisa ler o que o mecânico digitou para dar o preço (F3-B8, I3). */}
        <span className="text-lg font-bold break-words hyphens-auto">
          <span className="sr-only">{item.tipo === "servico" ? "Serviço: " : "Peça: "}</span>
          {item.descricao}
        </span>
        <span className="font-mono text-sm text-texto-suave">{detalhe}</span>
      </span>
      {!semValores && (
        <span className="shrink-0 text-right">
          {subtotal !== null ? (
            <span className="font-mono text-lg font-semibold">{formatarCentavos(subtotal)}</span>
          ) : (
            <EtiquetaSemPreco />
          )}
        </span>
      )}
      {aoTocar && <ChevronRight size={22} strokeWidth={2.25} aria-hidden className="mt-0.5 shrink-0 text-texto-suave" />}
    </>
  );
  // Etiquetas numa linha propria, com a largura toda (alinhada ao texto, depois do icone):
  // em 360px a coluna do texto fica estreita ao lado do "Sem preço" e a etiqueta quebraria.
  const corpo = (
    <>
      <span className="flex w-full items-start gap-3">{topo}</span>
      {etiquetas && (
        <span className="mt-1.5 flex flex-wrap gap-1.5 pl-[34px] whitespace-nowrap">{etiquetas}</span>
      )}
    </>
  );

  const classe = "flex min-h-16 w-full flex-col px-4 py-3 text-left";

  return (
    <li>
      {aoTocar ? (
        <button type="button" onClick={aoTocar} className={`${classe} transition-colors active:bg-superficie-2`}>
          {corpo}
        </button>
      ) : (
        <div className={classe}>{corpo}</div>
      )}
    </li>
  );
}
