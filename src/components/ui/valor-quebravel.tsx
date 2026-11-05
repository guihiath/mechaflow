import { Fragment } from "react";
import { formatarCentavos } from "@/lib/formato";

/**
 * Dinheiro que nunca se parte no meio dos dígitos (DESIGN §13.17: não reduz a fonte).
 * Ordem do que acontece quando falta espaço:
 * 1. o valor inteiro desce de linha;
 * 2. "R$" fica numa linha e o número na outra;
 * 3. só se o número sozinho não couber, ele quebra num ponto de milhar.
 * Os dois `inline-block` dão essa prioridade; o espaço normal e o `<wbr>` são as únicas quebras.
 */
export function ValorQuebravel({ centavos }: { centavos: number | null | undefined }) {
  const texto = formatarCentavos(centavos);
  const [simbolo, numero] = texto.split(/\s/u);
  if (!numero) return texto;
  const grupos = numero.split(".");
  return (
    <span className="inline-block">
      {simbolo}{" "}
      <span className="inline-block">
        {grupos.map((grupo, i) => (
          <Fragment key={i}>
            {grupo}
            {i < grupos.length - 1 && (
              <>
                .<wbr />
              </>
            )}
          </Fragment>
        ))}
      </span>
    </span>
  );
}
