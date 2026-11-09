import Link from "next/link";
import type { ReactNode } from "react";
import { FaixaTeste } from "@/components/layout/cabecalho";
import { MarcaTopo } from "@/components/layout/marca-topo";
import { LinkWhatsApp } from "@/components/publico/link-whatsapp";
import { classesFantasma } from "@/components/ui/botao";

/** Fantasma sem a cor padrão, para trocar a cor sem disputa de classes. */
const fantasmaSemCor = classesFantasma.replace(" text-texto ", " ");
import { CaixaMensagem } from "@/components/ui/formulario";

export type SecaoLegal = { titulo: string; conteudo: ReactNode };

/** id estável a partir do título, sem acento: "Seus direitos" → "seus-direitos". */
export function idSecao(titulo: string): string {
  return titulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** dd/mm/aaaa a partir de "aaaa-mm-dd" (data da versão, sem fuso). */
function dataBr(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

/** Link dentro do texto legal (DESIGN §15.3). */
export const classesLinkLegal = "font-bold text-info-texto underline underline-offset-2 [overflow-wrap:anywhere]";

/**
 * Página de texto legal (DESIGN §15.3): marca, h1, versão, aviso de RASCUNHO, índice "Nesta página"
 * (a partir de 4 seções), seções numeradas com id estável e o fim com suporte e links.
 * Server Component, sem JavaScript, sem acordeão. Sem cabeçalho do app nem "voltar":
 * abre em outra aba pelo aceite e pelo rodapé da página inicial.
 */
export function DocumentoLegal({
  titulo,
  versao,
  rascunho,
  secoes,
  perguntaFim,
  contatoEncarregado,
  whatsapp,
  outra,
  teste,
}: {
  titulo: string;
  /** "aaaa-mm-dd" (TERMOS_VERSAO). */
  versao: string;
  rascunho: boolean;
  secoes: SecaoLegal[];
  /** "Dúvidas sobre seus dados?" / "Dúvidas sobre os termos?" */
  perguntaFim: string;
  /** Canal do encarregado de dados, escrito (o WhatsApp não substitui o canal da LGPD). */
  contatoEncarregado?: ReactNode;
  /** Link de `linkWhatsAppSuporte()`, ou null (some). */
  whatsapp: string | null;
  /** A outra página legal. */
  outra: { href: string; rotulo: string };
  teste: boolean;
}) {
  const comIndice = secoes.length >= 4;
  const itens = secoes.map((s, i) => ({ ...s, id: idSecao(s.titulo), numero: i + 1 }));

  return (
    <div id="topo" className="flex flex-1 flex-col">
      {teste && (
        <div className="print:hidden">
          <FaixaTeste />
        </div>
      )}
      <main className="flex w-full max-w-[592px] flex-1 flex-col gap-6 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] lg:max-w-[688px] lg:px-16">
        <MarcaTopo link teste={teste} />

        <div className="flex flex-col gap-1">
          <h1 className="text-3xl">{titulo}</h1>
          <p className="text-lg text-texto-suave">Versão <span className="whitespace-nowrap">{versao}</span></p>
          <p className="text-lg text-texto-suave">Atualizada em {dataBr(versao)}</p>
        </div>

        {rascunho && (
          <CaixaMensagem tipo="alerta">
            <strong className="font-bold">RASCUNHO:</strong> texto provisório, ainda em revisão jurídica.
          </CaixaMensagem>
        )}

        {comIndice && (
          <nav aria-label="Nesta página" className="flex flex-col gap-1 print:hidden">
            <h2 className="font-sans text-xl font-bold">Nesta página</h2>
            <ol className="flex flex-col">
              {itens.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className="grid min-h-toque grid-cols-[2.25ch_1fr] items-center gap-x-1 py-1 text-base font-bold text-info-texto underline underline-offset-4"
                  >
                    <span aria-hidden>{s.numero}.</span>
                    <span>{s.titulo}</span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        )}

        <article className="flex max-w-[70ch] flex-col gap-8 break-words border-t border-borda-sutil pt-6 text-base leading-[1.625] text-texto">
          {itens.map((s) => (
            <section key={s.id} aria-labelledby={s.id} className="flex flex-col gap-3 [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-1 [&_ul]:pl-5">
              <h2 id={s.id} tabIndex={-1} className="scroll-mt-4 text-2xl">
                {s.numero}. {s.titulo}
              </h2>
              {s.conteudo}
            </section>
          ))}
        </article>

        <footer className="flex flex-col gap-3 border-t border-borda-sutil pt-6">
          <h2 className="font-sans text-xl font-bold">{perguntaFim}</h2>
          {contatoEncarregado && <div className="max-w-[70ch] text-base leading-[1.625]">{contatoEncarregado}</div>}
          <div className="flex flex-col gap-2 print:hidden">
            <LinkWhatsApp href={whatsapp} rotulo="Falar com o suporte pelo WhatsApp (abre o WhatsApp)">
              Falar com o suporte
            </LinkWhatsApp>
            <Link href={outra.href} className={`${fantasmaSemCor} self-start text-info-texto`}>
              {outra.rotulo}
            </Link>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <a href="#topo" className={classesFantasma}>
                Voltar ao topo
              </a>
              <Link href="/" className={classesFantasma}>
                Página inicial
              </Link>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
