"use client";

import { AreaTexto, Campo, CampoDocumento, CampoTelefone, OpcoesBotoes } from "@/components/ui/campo";
import { Formulario } from "@/components/ui/formulario";
import { salvarCliente } from "@/acoes/clientes";
import { ROTULO_MODO } from "@/lib/formato";
import type { Tables } from "@/lib/supabase/database.types";

type Cliente = Pick<
  Tables<"clientes">,
  "id" | "nome" | "telefone" | "documento" | "email" | "modo_padrao" | "observacoes"
>;

export function FormCliente({ cliente }: { cliente?: Cliente }) {
  return (
    <Formulario acao={salvarCliente} rotulo={cliente ? "Salvar cliente" : "Cadastrar cliente"}>
      {cliente && <input type="hidden" name="id" value={cliente.id} />}
      <Campo rotulo="Nome ou razão social" name="nome" autoComplete="off" defaultValue={cliente?.nome} />
      <CampoTelefone rotulo="Telefone (WhatsApp)" opcional valorInicial={cliente?.telefone} />
      <OpcoesBotoes
        rotulo="Padrão de atendimento"
        name="modo_padrao"
        valorInicial={cliente?.modo_padrao ?? "exige_orcamento"}
        opcoes={[
          { valor: "exige_orcamento", rotulo: ROTULO_MODO.exige_orcamento },
          { valor: "servico_direto", rotulo: ROTULO_MODO.servico_direto },
        ]}
        ajuda="A OS deste cliente já abre neste modo (dá para trocar na hora)."
      />
      <CampoDocumento opcional valorInicial={cliente?.documento} />
      <Campo
        rotulo="E-mail"
        name="email"
        type="email"
        inputMode="email"
        autoCapitalize="none"
        opcional
        defaultValue={cliente?.email ?? ""}
      />
      <AreaTexto rotulo="Observações" name="observacoes" opcional defaultValue={cliente?.observacoes ?? ""} maxLength={2000} />
    </Formulario>
  );
}
