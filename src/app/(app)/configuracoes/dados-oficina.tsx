"use client";

import { salvarDadosOficina } from "@/acoes/configuracoes";
import { Campo, CampoTelefone } from "@/components/ui/campo";
import { Formulario } from "@/components/ui/formulario";

/**
 * "Dados da oficina" (DESIGN §13.18): nome e telefone, que o cliente vê no orçamento. Mudar aqui não
 * muda orçamento já enviado (a versão é congelada). Logo fica fora desta fase (PLANO 19.6).
 */
export function DadosOficina({ nome, telefone }: { nome: string; telefone: string | null }) {
  return (
    <Formulario acao={salvarDadosOficina} rotulo="Salvar dados da oficina">
      <Campo rotulo="Nome" name="nome" defaultValue={nome} maxLength={120} autoComplete="organization" />
      <CampoTelefone
        rotulo="Telefone da oficina"
        valorInicial={telefone ?? ""}
        ajuda="Aparece no orçamento enviado ao cliente. De preferência, com WhatsApp."
        autoComplete="off"
      />
    </Formulario>
  );
}
