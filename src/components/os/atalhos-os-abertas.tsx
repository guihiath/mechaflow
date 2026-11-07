import { CircleCheckBig, Clock, ThumbsUp, Wrench } from "lucide-react";
import { Cartao } from "@/components/ui/estados";

/** Contagem de OS abertas por status (de `/inicio` ou de `painel_hoje.abertas`). */
export type ContagemAbertas = {
  pronta: number;
  aguardando_orcamento: number;
  orcamento_enviado: number;
  aprovada: number;
  em_andamento: number;
};

/**
 * Os 4 atalhos de OS abertas do `/inicio` (Prontas para entregar, Em orçamento, Liberadas para
 * começar, Em andamento), cada um levando ao filtro de `/os`. O painel do dono usa os mesmos em
 * "OS abertas agora" (DESIGN §14.2).
 */
export function AtalhosOSAbertas({ contagem }: { contagem: ContagemAbertas }) {
  const atalhos = [
    { href: "/os?status=prontas", titulo: "Prontas para entregar", valor: contagem.pronta, icone: CircleCheckBig },
    { href: "/os?status=orcamento", titulo: "Em orçamento", valor: contagem.aguardando_orcamento + contagem.orcamento_enviado, icone: Clock },
    { href: "/os?status=aprovadas", titulo: "Liberadas para começar", valor: contagem.aprovada, icone: ThumbsUp },
    { href: "/os?status=em_andamento", titulo: "Em andamento", valor: contagem.em_andamento, icone: Wrench },
  ];
  return (
    <ul className="flex flex-col gap-3 lg:grid lg:grid-cols-2">
      {atalhos.map(({ href, titulo, valor, icone: Icone }) => (
        <li key={href}>
          <Cartao href={href} className="h-full">
            <div className="flex min-h-12 items-center gap-3">
              <Icone size={26} strokeWidth={2.25} aria-hidden className="shrink-0 text-texto-suave" />
              <p className="text-lg font-bold">
                {titulo} ({valor})
              </p>
            </div>
          </Cartao>
        </li>
      ))}
    </ul>
  );
}
