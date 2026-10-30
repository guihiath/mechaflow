import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Cabecalho } from "@/components/layout/cabecalho";
import { Pagina } from "@/components/ui/estados";
import { EH_PRODUCAO } from "@/lib/brand";
import { DiagnosticoFotos } from "./diagnostico-fotos";

export const metadata: Metadata = { title: "Diagnóstico das fotos" };

/**
 * SÓ NO AMBIENTE DE TESTE (F3-B2): mostra como este celular prepara a foto
 * (tamanho antes/depois, dimensões, tempo de cada etapa, navegador) e os
 * últimos envios feitos pela tela da OS, para o Guilherme mandar print.
 * Em produção (`NEXT_PUBLIC_AMBIENTE=producao`) a rota não existe.
 */
export default function DiagnosticoFotosPage() {
  if (EH_PRODUCAO) notFound();
  return (
    <>
      <Cabecalho titulo="Diagnóstico das fotos" voltar="/entrar" />
      <Pagina>
        <DiagnosticoFotos />
      </Pagina>
    </>
  );
}
