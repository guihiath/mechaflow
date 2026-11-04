import { Reply } from "lucide-react";
import { Cartao } from "@/components/ui/estados";

type Resposta = { numero: number | null; status: string | null };

const verbo = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * Cartão "2 clientes responderam" do /inicio (DESIGN §13.13). Conta só a resposta pelo link que
 * espera o balcão (`vw_os.orcamento_respondido`) e sai sozinho quando a ação acontece.
 */
export function CartaoRespondidos({ respostas }: { respostas: Resposta[] }) {
  if (respostas.length === 0) return null;
  const aprovou = respostas.filter((r) => r.status === "aprovada").length;
  const recusou = respostas.length - aprovou;
  const um = respostas.length === 1;
  const titulo = um ? "Um cliente respondeu" : `${respostas.length} clientes responderam`;
  const texto = um
    ? `${aprovou ? "Aprovou" : "Recusou"} o orçamento da OS #${respostas[0].numero}.`
    : `${[aprovou && verbo(aprovou, "aprovou", "aprovaram"), recusou && verbo(recusou, "recusou", "recusaram")].filter(Boolean).join(" e ")}. Toque para ver.`;
  return (
    <Cartao href="/os?status=respondidos" faixa="bg-info">
      <div className="flex items-center gap-3">
        <Reply size={28} strokeWidth={2.25} aria-hidden className="shrink-0 text-info-texto" />
        <div>
          <p className="text-lg font-bold">{titulo}</p>
          <p className="text-base text-texto-suave">{texto}</p>
        </div>
      </div>
    </Cartao>
  );
}
