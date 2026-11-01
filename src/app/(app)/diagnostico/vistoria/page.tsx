import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Cabecalho } from "@/components/layout/cabecalho";
import { Pagina } from "@/components/ui/estados";
import { EH_PRODUCAO } from "@/lib/brand";
import { DiagnosticoVistoria } from "./diagnostico-vistoria";

export const metadata: Metadata = { title: "Diagnóstico da vistoria" };

/**
 * SÓ NO AMBIENTE DE TESTE (F4-B2): tamanho da assinatura, tempo de envio, navegador e se o
 * traço chegou inteiro (traços/pontos e o PNG baixado do Storage com o mesmo SHA-256),
 * para o Guilherme mandar print do iPhone. Em produção a rota não existe.
 */
export default function DiagnosticoVistoriaPage() {
  if (EH_PRODUCAO) notFound();
  return (
    <>
      <Cabecalho titulo="Diagnóstico da vistoria" voltar="/entrar" />
      <Pagina>
        <DiagnosticoVistoria />
      </Pagina>
    </>
  );
}
