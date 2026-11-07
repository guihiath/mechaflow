import { ChevronRight, WifiOff } from "lucide-react";
import { Cartao } from "@/components/ui/estados";
import { ValorQuebravel } from "@/components/ui/valor-quebravel";
import { formatarCentavos } from "@/lib/formato";
import { textoOS } from "@/lib/painel";

/**
 * Cartão de número do painel (DESIGN §14.2): rótulo e seta na mesma linha, valor com a largura
 * toda (`ValorQuebravel`, nunca reduz a fonte) e a frase que diz o que entra e por qual data.
 * - Tocável só com OS na lista (`quantidadeOS > 0`). Com zero: "R$ 0,00", sem seta, sem link e
 *   `fraseZero` no lugar das frases. Valor zero com OS (OS de R$ 0,00 a receber) continua tocável.
 * - `tamanho`: "mes" = 44 px; "hoje" = 32 px (o "A receber" fica menor de propósito).
 * - Os centavos vêm do banco; aqui só formata. Erro de leitura NÃO usa este cartão: `CaixaErro`.
 */
export function CartaoNumero({
  rotulo,
  centavos,
  quantidadeOS,
  frases,
  fraseZero,
  href,
  tamanho = "mes",
  faixa,
}: {
  rotulo: string;
  centavos: number;
  quantidadeOS: number;
  /** Linhas de 15 px abaixo do valor (a primeira costuma trazer a contagem). */
  frases: string[];
  fraseZero: string;
  href: string;
  tamanho?: "mes" | "hoje";
  /** Classe da faixa esquerda (ex.: "bg-alerta" em "A receber"; sempre com texto). */
  faixa?: string;
}) {
  const tocavel = quantidadeOS > 0;
  const valorTexto = formatarCentavos(centavos);
  const rotuloLink = `${rotulo}: ${valorTexto}, ${textoOS(quantidadeOS)}. Ver as OS.`;

  return (
    <Cartao href={tocavel ? href : undefined} rotulo={tocavel ? rotuloLink : undefined} faixa={faixa} className="h-full">
      <div className="flex flex-col gap-1" data-teste="cartao-numero">
        <div className="flex items-start justify-between gap-2">
          <p className="text-base font-bold">{rotulo}</p>
          {tocavel && <ChevronRight size={24} strokeWidth={2.25} aria-hidden className="shrink-0 text-texto-suave" />}
        </div>
        <p className={`font-display font-bold ${tamanho === "mes" ? "text-4xl" : "text-3xl"}`}>
          <ValorQuebravel centavos={centavos} />
        </p>
        {(tocavel ? frases : [fraseZero]).map((f) => (
          <p key={f} className="text-sm text-texto-suave">
            {f}
          </p>
        ))}
      </div>
    </Cartao>
  );
}

/**
 * Contagem que leva a uma lista ("OS abertas (12)"), 64 px, 18 px/700 (DESIGN §14.2).
 * Com zero: sem seta e sem link.
 */
export function CartaoContagem({ rotulo, quantidade, href }: { rotulo: string; quantidade: number; href: string }) {
  const tocavel = quantidade > 0;
  return (
    <Cartao href={tocavel ? href : undefined} className="h-full">
      <div className="flex min-h-8 items-center justify-between gap-2">
        <p className="text-lg font-bold">
          {rotulo} ({quantidade})
        </p>
        {tocavel && <ChevronRight size={24} strokeWidth={2.25} aria-hidden className="shrink-0 text-texto-suave" />}
      </div>
    </Cartao>
  );
}

/** Skeleton no formato do cartão de número (DESIGN §14.2 e §5.9). O pulso some com reduced-motion. */
export function CartaoNumeroCarregando({ tamanho = "mes" }: { tamanho?: "mes" | "hoje" }) {
  return (
    <div aria-hidden className="flex animate-pulse flex-col gap-2 rounded-lg border border-borda-sutil bg-superficie p-4">
      <div className="h-5 w-40 rounded-sm bg-superficie-2" />
      <div className={`${tamanho === "mes" ? "h-11" : "h-8"} w-48 rounded-sm bg-superficie-2`} />
      <div className="h-4 w-3/4 rounded-sm bg-superficie-2" />
    </div>
  );
}

/** Bloco inteiro carregando (Hoje ou mês), com o aviso para leitor de tela. */
export function NumerosCarregando({ quantidade = 2, tamanho = "mes" }: { quantidade?: number; tamanho?: "mes" | "hoje" }) {
  return (
    <div aria-busy="true" className="flex flex-col gap-3 lg:grid lg:grid-cols-2">
      {Array.from({ length: quantidade }, (_, i) => (
        <CartaoNumeroCarregando key={i} tamanho={tamanho} />
      ))}
      <span className="sr-only">Carregando…</span>
    </div>
  );
}

/**
 * Faixa de conexão (DESIGN §5.9), 40 px, fundo alerta e texto branco. No painel, número velho sem
 * aviso é pior que nenhum: a página mostra esta faixa + `CaixaErro`, nunca R$ 0,00 (§14.2).
 */
export function FaixaSemInternet({ texto = "Sem internet. Os números aparecem quando a internet voltar." }: { texto?: string }) {
  return (
    <p role="status" className="flex min-h-10 items-center gap-2 bg-alerta px-4 py-2 text-base font-bold text-white">
      <WifiOff size={20} strokeWidth={2.25} aria-hidden className="shrink-0" />
      {texto}
    </p>
  );
}
