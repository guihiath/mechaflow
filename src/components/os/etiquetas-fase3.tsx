import type { ReactNode } from "react";
import { CloudUpload, FilePlus2, HardHat, Lock, TriangleAlert } from "lucide-react";
import { Etiqueta } from "@/components/ui/estados";
import { fotos } from "@/components/os/categorias-foto";

/**
 * Etiquetas da Fase 3 (DESIGN §11.1 e §11.10), montadas sobre o `Etiqueta` da Fase 2.
 * O tom "info" (borda e texto `info-texto`, sem fundo cheio) fica aqui para nao mexer no
 * `Etiqueta` enquanto outras telas usam o arquivo; mesmas medidas (32px, 15px/700).
 *
 * Quem ve o que:
 * - dono/atendente: LancadoPor, AposAprovacao, SemPrecoContagem, AcimaDoAprovado
 * - mecanico: VoceLancou, ConferidoPeloBalcao (nenhuma fala de valor)
 * - quem tem fila no aparelho: FotosNaoEnviadas
 */

const ICONE = { size: 18, strokeWidth: 2.25, "aria-hidden": true } as const;

function EtiquetaInfo({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-8 items-center gap-1.5 rounded-sm border-2 border-info-texto px-2.5 text-sm font-bold text-info-texto">
      {children}
    </span>
  );
}

/** Primeiro nome, para caber em 360px ("João Carlos" -> "João"). */
function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] || nome;
}

/** "Lançado por João" (dono/atendente; item que entrou pela RPC do mecanico). */
export function EtiquetaLancadoPor({ nome }: { nome: string }) {
  return (
    <Etiqueta>
      <HardHat {...ICONE} />
      Lançado por {primeiroNome(nome)}
    </Etiqueta>
  );
}

/** "Após a aprovação" (dono/atendente, so no modo com orcamento). */
export function EtiquetaAposAprovacao() {
  return (
    <EtiquetaInfo>
      <FilePlus2 {...ICONE} />
      Após a aprovação
    </EtiquetaInfo>
  );
}

/** "Você lançou" (mecanico, item dele que ainda pode mexer). */
export function EtiquetaVoceLancou() {
  return (
    <Etiqueta>
      <HardHat {...ICONE} />
      Você lançou
    </Etiqueta>
  );
}

/** "Conferido pelo balcão" (mecanico, item dele que o balcao ja editou; so leitura). */
export function EtiquetaConferido() {
  return (
    <Etiqueta>
      <Lock {...ICONE} />
      Conferido pelo balcão
    </Etiqueta>
  );
}

/** "2 sem preço" (cartao da OS, dono/atendente). 0 -> nada. */
export function EtiquetaSemPrecoContagem({ quantidade }: { quantidade: number }) {
  if (quantidade <= 0) return null;
  return (
    <Etiqueta tom="alerta">
      <TriangleAlert {...ICONE} />
      {quantidade} sem preço
    </Etiqueta>
  );
}

/** "Acima do aprovado" (cartao da OS, dono/atendente, diferenca > 0). */
export function EtiquetaAcimaDoAprovado() {
  return (
    <EtiquetaInfo>
      <FilePlus2 {...ICONE} />
      Acima do aprovado
    </EtiquetaInfo>
  );
}

/** "2 fotos não enviadas" (cartao da OS e topo do detalhe). 0 -> nada. */
export function EtiquetaFotosNaoEnviadas({ quantidade }: { quantidade: number }) {
  if (quantidade <= 0) return null;
  return (
    <Etiqueta tom="alerta">
      <CloudUpload {...ICONE} />
      {fotos(quantidade)} {quantidade === 1 ? "não enviada" : "não enviadas"}
    </Etiqueta>
  );
}

/** Linha de etiquetas abaixo da quantidade (ate 2, quebra se precisar; DESIGN §11.9). */
export function LinhaEtiquetas({ children }: { children: ReactNode }) {
  return <div className="mt-1.5 flex flex-wrap gap-1.5">{children}</div>;
}
