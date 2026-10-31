"use client";

import { useLayoutEffect } from "react";

/**
 * Marca no <html> que a pagina atual pede algo do layout (F3-B8, C1).
 *
 * Com `cacheComponents`, o Next guarda a pagina anterior escondida (React <Activity>)
 * e o DOM dela continua no documento: um `:has([data-...])` no CSS continuaria valendo
 * depois de voltar. O efeito, ao contrario, e desligado pelo React quando a pagina
 * fica escondida, entao o atributo no <html> some junto.
 *
 * O <span> continua so para o primeiro carregamento (antes do JavaScript), para a
 * barra nao piscar; depois que o efeito roda uma vez, `html[data-marcas-js]` desliga
 * as regras com `:has()` (globals.css).
 */
type Marca = "semNavegacao" | "rodapeExtra";

const contagem: Record<Marca, number> = { semNavegacao: 0, rodapeExtra: 0 };

function MarcadorPagina({ marca, atributo }: { marca: Marca; atributo: string }) {
  useLayoutEffect(() => {
    const html = document.documentElement;
    html.dataset.marcasJs = "1";
    contagem[marca] += 1;
    html.dataset[marca] = "1";
    return () => {
      contagem[marca] = Math.max(0, contagem[marca] - 1);
      if (contagem[marca] === 0) delete html.dataset[marca];
    };
  }, [marca]);
  return <span hidden {...{ [atributo]: "" }} />;
}

/** Tela com barra de acoes/rodape fixo: a barra de navegacao do celular some. */
export function EsconderNavegacao() {
  return <MarcadorPagina marca="semNavegacao" atributo="data-esconde-navegacao" />;
}

/** Tela com botao fixo acima da barra de navegacao (ex.: "Abrir OS" em /os). */
export function RodapeExtra() {
  return <MarcadorPagina marca="rodapeExtra" atributo="data-rodape-extra" />;
}
