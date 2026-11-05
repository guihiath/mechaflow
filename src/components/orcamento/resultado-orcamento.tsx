import { MessageCircle, Phone, ThumbsDown, ThumbsUp } from "lucide-react";
import { AvisoPrivacidade } from "@/components/orcamento/aviso-privacidade";
import { BlocoOficina, CorpoDocumento } from "@/components/orcamento/documento-orcamento";
import { ALTURA_FLEXIVEL, classesBotao, classesFantasma } from "@/components/ui/botao";
import { CaixaMensagem } from "@/components/ui/formulario";
import { ValorQuebravel } from "@/components/ui/valor-quebravel";
import {
  formatarDataEHora,
  linkAvisarOficina,
  linkLigarOficina,
  type DadosDocumentoOrcamento,
  type DadosRespostaCliente,
} from "@/lib/orcamento";

/**
 * Aprovado e recusado (DESIGN §13.6): a resposta que vale e o documento abaixo, sem botões.
 * O motivo da recusa não volta à tela. Sem telefone da oficina: sem "Avisar" e sem "Ligar".
 */
export function ResultadoOrcamento({
  documento,
  expiraEm,
  resposta,
  jaRespondido = false,
}: {
  documento: DadosDocumentoOrcamento;
  expiraEm: string;
  resposta: DadosRespostaCliente;
  /** Havia outra resposta gravada antes desta tentativa (§13.4). */
  jaRespondido?: boolean;
}) {
  const aprovou = resposta.tipo === "aprovou";
  const avisar = linkAvisarOficina(documento, resposta);
  const ligar = linkLigarOficina(documento.oficina_telefone);
  const quando = formatarDataEHora(resposta.respondido_em);
  const Icone = aprovou ? ThumbsUp : ThumbsDown;
  const titulo = aprovou ? "Orçamento aprovado" : "Orçamento recusado";

  return (
    <>
      <BlocoOficina nome={documento.oficina_nome} telefone={documento.oficina_telefone} />

      {jaRespondido && <CaixaMensagem tipo="info">Este orçamento já tinha sido respondido. Vale a resposta abaixo.</CaixaMensagem>}

      <section className={`flex flex-col gap-1 rounded-md border-l-4 bg-superficie p-4 ${aprovou ? "border-sucesso" : "border-borda"}`}>
        <h1 data-titulo-orcamento tabIndex={-1} className="flex items-center gap-2 text-2xl">
          <Icone size={26} strokeWidth={2.25} aria-hidden className={`shrink-0 ${aprovou ? "text-sucesso-texto" : "text-texto-suave"}`} />
          {titulo}
        </h1>
        {aprovou ? (
          <>
            <p className="text-base break-words">
              Aprovado{resposta.nome ? ` por ${resposta.nome}` : ""} em {quando}.
            </p>
            <p className="font-mono text-base font-semibold">
              Total aprovado: <ValorQuebravel centavos={documento.total_centavos} />
            </p>
          </>
        ) : (
          <>
            <p className="text-base">Sua resposta foi registrada em {quando}.</p>
            <p className="text-base">Se mudar de ideia ou quiser negociar, fale com a oficina.</p>
          </>
        )}
      </section>

      <div className="flex flex-col gap-3">
        <p className="text-base">
          Sua resposta já aparece no sistema da oficina.{avisar ? " Para agilizar, avise por lá:" : ""}
        </p>
        {avisar && (
          <a href={avisar} target="_blank" rel="noopener noreferrer" className={classesBotao("primario", `${ALTURA_FLEXIVEL} text-center`)}>
            <MessageCircle size={24} strokeWidth={2.25} aria-hidden className="shrink-0" />
            Avisar a oficina no WhatsApp
          </a>
        )}
        {ligar && (
          <a href={ligar} className={`${classesFantasma} self-start`}>
            <Phone size={20} strokeWidth={2.25} aria-hidden className="shrink-0" />
            Ligar para a oficina
          </a>
        )}
        {aprovou && <p className="text-sm text-texto-suave">Para guardar, tire um print desta tela.</p>}
      </div>

      <h2 className="text-xl">{titulo}</h2>
      <CorpoDocumento documento={documento} expiraEm={expiraEm} />
      <AvisoPrivacidade oficina={documento.oficina_nome} telefone={documento.oficina_telefone} />
    </>
  );
}
