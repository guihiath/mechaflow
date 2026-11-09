/**
 * Tabela do texto legal (DESIGN §15.3). Abaixo de 640 px, cada linha vira um bloco (`dl` num cartão),
 * com o rótulo da coluna em 15 px/700; a partir de 640 px, tabela com borda 1 px.
 * Nunca rolagem lateral (WCAG 1.4.10): o texto quebra, inclusive e-mail e URL.
 * A primeira coluna é o título do bloco ("Dado").
 */
export function BlocoDefinicoes({
  legenda,
  colunas,
  linhas,
}: {
  legenda: string;
  colunas: [string, ...string[]];
  linhas: string[][];
}) {
  const [primeira, ...resto] = colunas;
  return (
    <>
      <div className="flex flex-col gap-3 sm:hidden" role="group" aria-label={legenda}>
        {linhas.map((linha, i) => (
          <div key={i} className="rounded-lg border border-borda-sutil bg-superficie p-4 [overflow-wrap:anywhere]">
            <dl className="flex flex-col gap-2">
              <div>
                <dt className="sr-only">{primeira}</dt>
                <dd className="text-lg font-bold">{linha[0]}</dd>
              </div>
              {resto.map((col, j) => (
                <div key={col}>
                  <dt className="text-sm font-bold text-texto-suave">{col}</dt>
                  <dd>{linha[j + 1] ?? "—"}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
      <table className="hidden w-full table-fixed border-collapse border border-borda-sutil text-left sm:table [overflow-wrap:anywhere]">
        <caption className="sr-only">{legenda}</caption>
        <thead>
          <tr className="bg-superficie-2">
            {colunas.map((c) => (
              <th key={c} scope="col" className="border border-borda-sutil p-2 text-sm font-bold">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha, i) => (
            <tr key={i} className="bg-superficie align-top">
              {colunas.map((c, j) =>
                j === 0 ? (
                  <th key={c} scope="row" className="border border-borda-sutil p-2 font-bold">
                    {linha[0]}
                  </th>
                ) : (
                  <td key={c} className="border border-borda-sutil p-2">
                    {linha[j] ?? "—"}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
