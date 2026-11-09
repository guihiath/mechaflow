import { Etiqueta } from "@/components/ui/estados";
import { formatarTelefoneOficina, PRAZO_GUARDA_REDE } from "@/lib/orcamento";

/**
 * Aviso de privacidade (DESIGN §13.7). RASCUNHO: a etiqueta "Texto provisório" só sai depois
 * da revisão do advogado, antes do piloto. Nunca aparece nas telas sem acesso.
 */
export function AvisoPrivacidade({ oficina, telefone }: { oficina: string; telefone: string | null }) {
  const contato = formatarTelefoneOficina(telefone);
  return (
    <section aria-label="Aviso de privacidade" className="flex flex-col items-start gap-2 border-t border-borda-sutil pt-4">
      <Etiqueta>Texto provisório</Etiqueta>
      <p className="text-sm break-words text-texto-suave">
        <strong className="font-bold">Privacidade.</strong> Este orçamento é da {oficina}, que cuida dos seus dados. O
        sistema usado é o MechaFlow. Mostramos aqui só o necessário para você decidir. Ao responder, registramos a
        resposta, o nome informado, a data e a hora, o IP e o navegador, como comprovante. O IP e o navegador ficam
        guardados por {PRAZO_GUARDA_REDE}. Para falar sobre seus dados, chame a oficina{contato ? `: ${contato}.` : "."}
      </p>
      {/* DESIGN §15.3: só o link; o texto do aviso é do F8-C2. Outra aba, para não perder o orçamento. */}
      <a
        href="/privacidade"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-toque items-center text-sm font-bold text-info-texto underline underline-offset-4"
      >
        Ver a política de privacidade completa
      </a>
    </section>
  );
}
