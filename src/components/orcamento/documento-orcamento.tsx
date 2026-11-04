import type { ReactNode } from "react";
import { Phone } from "lucide-react";
import { AtalhoResposta } from "@/components/orcamento/atalho-resposta";
import { AvisoPrivacidade } from "@/components/orcamento/aviso-privacidade";
import { ResumoTotais } from "@/components/os/resumo-totais";
import { Cartao, ChipPlaca } from "@/components/ui/estados";
import { formatarCentavos, formatarData, formatarNumeroOS, formatarPlaca } from "@/lib/formato";
import {
  formatarQuantidadeUnidade,
  formatarTelefoneOficina,
  ITENS_PARA_ATALHO,
  linkLigarOficina,
  type DadosDocumentoOrcamento,
  type DadosItemOrcamento,
} from "@/lib/orcamento";

/**
 * Documento do orçamento (DESIGN §13.2). Só a lista fechada de campos: não há custo,
 * margem, documento ou telefone do cliente, mecânico, versão nem id.
 * Sempre claro: quem o usa fica dentro de `CascaOrcamentoPublico` ou de `.papel-claro`.
 */

/** Nome da oficina e telefone. Sem logo nesta fase; sem telefone, a linha não aparece. */
export function BlocoOficina({ nome, telefone }: { nome: string; telefone: string | null }) {
  const ligar = linkLigarOficina(telefone);
  return (
    <header className="flex flex-col gap-1 rounded-lg border border-borda-sutil bg-superficie p-4">
      <p className="font-display text-3xl font-bold break-words">{nome}</p>
      {ligar && (
        <a href={ligar} className="inline-flex min-h-toque items-center gap-2 self-start text-base font-bold text-texto underline underline-offset-4">
          <Phone size={20} strokeWidth={2.25} aria-hidden className="shrink-0" />
          {formatarTelefoneOficina(telefone)}
        </a>
      )}
    </header>
  );
}

function LinhaItem({ item }: { item: DadosItemOrcamento }) {
  const semPreco = item.preco_unitario_centavos === null;
  return (
    <li className="flex flex-col gap-1 border-b border-borda-sutil py-3 first:pt-0">
      <p className="text-base font-bold [overflow-wrap:anywhere]">{item.descricao}</p>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <span className="font-mono text-sm text-texto-suave">
          {formatarQuantidadeUnidade(item.quantidade, item.unidade)}
          {!semPreco && ` × ${formatarCentavos(item.preco_unitario_centavos)}`}
        </span>
        {semPreco ? (
          <span className="ml-auto text-base font-bold whitespace-nowrap text-alerta-texto">Sem preço</span>
        ) : (
          <span className="ml-auto font-mono text-base font-semibold whitespace-nowrap">{formatarCentavos(item.subtotal_centavos)}</span>
        )}
      </div>
    </li>
  );
}

function GrupoItens({
  titulo,
  rotuloSubtotal,
  itens,
  subtotal,
}: {
  titulo: string;
  rotuloSubtotal: string;
  itens: DadosItemOrcamento[];
  subtotal: number;
}) {
  if (itens.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl">
        {titulo} ({itens.length})
      </h2>
      <ul className="flex flex-col">
        {itens.map((item, i) => (
          <LinhaItem key={i} item={item} />
        ))}
      </ul>
      <p className="flex flex-wrap items-baseline justify-between gap-x-4 text-base font-bold">
        <span>{rotuloSubtotal}</span>
        <span className="ml-auto font-mono font-semibold whitespace-nowrap">{formatarCentavos(subtotal)}</span>
      </p>
    </section>
  );
}

/** Do "Para: …" até as condições. Sem oficina, título e botões: quem chama decide. */
export function CorpoDocumento({
  documento,
  expiraEm,
  comAtalho = false,
}: {
  documento: DadosDocumentoOrcamento;
  /** null: versão marcada à mão, que nunca teve link nem validade. */
  expiraEm: string | null;
  /** Mostra "Ir para a resposta" quando há mais de 8 itens (só quando a resposta está na página). */
  comAtalho?: boolean;
}) {
  const servicos = documento.itens.filter((i) => i.tipo === "servico");
  const pecas = documento.itens.filter((i) => i.tipo === "peca");
  const veiculo = [documento.veiculo_marca, documento.veiculo_modelo].filter(Boolean).join(" ");
  const validade = expiraEm ? `Vale até ${formatarData(expiraEm)}` : null;

  return (
    <>
      <Cartao>
        <div className="flex flex-col gap-2">
          {documento.cliente_nome && <p className="text-base font-bold break-words">Para: {documento.cliente_nome}</p>}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <ChipPlaca placa={formatarPlaca(documento.veiculo_placa)} />
            {veiculo && <span className="text-base break-words">{veiculo}</span>}
          </div>
          <p className="font-mono text-base font-semibold">{formatarNumeroOS(documento.os_numero)}</p>
        </div>
      </Cartao>

      <section aria-label="Total do orçamento" className="flex flex-col gap-0.5">
        <p className="text-base font-bold">Total</p>
        <p className="font-mono text-3xl font-semibold break-words">{formatarCentavos(documento.total_centavos)}</p>
        {validade && <p className="text-base text-texto-suave">{validade}</p>}
      </section>

      {comAtalho && documento.itens.length > ITENS_PARA_ATALHO && <AtalhoResposta quantidadeItens={documento.itens.length} />}

      <GrupoItens titulo="Serviços" rotuloSubtotal="Subtotal de serviços" itens={servicos} subtotal={documento.subtotal_servicos_centavos} />
      <GrupoItens titulo="Peças" rotuloSubtotal="Subtotal de peças" itens={pecas} subtotal={documento.subtotal_pecas_centavos} />

      <ResumoTotais totalCentavos={documento.total_centavos} rotuloSecao="Total no fim do orçamento" />

      {(documento.prazo_estimado || documento.condicoes_pagamento) && (
        <div className="flex flex-col gap-3">
          <dl className="flex flex-col gap-3">
            {documento.prazo_estimado && (
              <div>
                <dt className="text-sm font-bold">Prazo estimado</dt>
                <dd className="text-base [overflow-wrap:anywhere]">{documento.prazo_estimado}</dd>
              </div>
            )}
            {documento.condicoes_pagamento && (
              <div>
                <dt className="text-sm font-bold">Condições de pagamento</dt>
                <dd className="text-base [overflow-wrap:anywhere]">{documento.condicoes_pagamento}</dd>
              </div>
            )}
          </dl>
          {validade && <p className="text-base text-texto-suave">{validade}</p>}
        </div>
      )}
    </>
  );
}

/**
 * Documento inteiro. `cliente` e `previa`: com título "para você aprovar", `resposta` e aviso de
 * privacidade. `consulta` (versão congelada no balcão, §13.12): sem título, sem resposta, sem aviso.
 */
export function DocumentoOrcamento({
  documento,
  expiraEm,
  variante = "cliente",
  resposta,
}: {
  documento: DadosDocumentoOrcamento;
  expiraEm: string | null;
  variante?: "cliente" | "previa" | "consulta";
  /** O bloco "Sua resposta". */
  resposta?: ReactNode;
}) {
  const paraResponder = variante !== "consulta";
  return (
    <>
      <BlocoOficina nome={documento.oficina_nome} telefone={documento.oficina_telefone} />
      {paraResponder && (
        <div className="flex flex-col gap-1">
          <h1 data-titulo-orcamento tabIndex={-1} className="text-2xl">
            Orçamento para você aprovar
          </h1>
          <p className="text-base">Confira os itens e responda no fim desta página.</p>
        </div>
      )}
      <CorpoDocumento documento={documento} expiraEm={expiraEm} comAtalho={paraResponder && !!resposta} />
      {paraResponder && resposta}
      {paraResponder && <AvisoPrivacidade oficina={documento.oficina_nome} telefone={documento.oficina_telefone} />}
    </>
  );
}
