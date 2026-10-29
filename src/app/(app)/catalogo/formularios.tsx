"use client";

import { AreaTexto, Campo, CampoDinheiro, Selecao } from "@/components/ui/campo";
import { Formulario } from "@/components/ui/formulario";
import { salvarPeca, salvarServico } from "@/acoes/catalogo";
import { centavosParaCampo, ROTULO_UNIDADE, UNIDADES_PECA } from "@/lib/formato";

type Servico = { id: string; nome: string; descricao: string | null; preco_padrao_centavos: number | null };

export function FormServico({ servico }: { servico?: Servico }) {
  return (
    <Formulario acao={salvarServico} rotulo={servico ? "Salvar serviço" : "Cadastrar serviço"}>
      {servico && <input type="hidden" name="id" value={servico.id} />}
      <Campo rotulo="Nome do serviço" name="nome" defaultValue={servico?.nome} maxLength={120} placeholder="Ex.: Troca de óleo do motor" />
      <CampoDinheiro
        rotulo="Preço padrão (R$)"
        name="preco"
        opcional
        valorInicial={centavosParaCampo(servico?.preco_padrao_centavos)}
        ajuda="Mão de obra. Dá para ajustar em cada OS."
      />
      <AreaTexto rotulo="Descrição" name="descricao" opcional defaultValue={servico?.descricao ?? ""} maxLength={1000} />
    </Formulario>
  );
}

type Peca = {
  id: string;
  nome: string;
  codigo: string | null;
  fornecedor: string | null;
  unidade: string;
  preco_venda_centavos: number | null;
  custo_centavos: number | null;
};

export function FormPeca({ peca }: { peca?: Peca }) {
  return (
    <Formulario acao={salvarPeca} rotulo={peca ? "Salvar peça" : "Cadastrar peça"}>
      {peca && <input type="hidden" name="id" value={peca.id} />}
      <Campo rotulo="Nome da peça" name="nome" defaultValue={peca?.nome} maxLength={120} placeholder="Ex.: Filtro de óleo" />
      <div className="grid grid-cols-2 gap-3">
        <CampoDinheiro
          rotulo="Custo (R$)"
          name="custo"
          opcional
          valorInicial={centavosParaCampo(peca?.custo_centavos)}
          ajuda="Só o dono vê."
        />
        <CampoDinheiro
          rotulo="Preço de venda (R$)"
          name="preco"
          opcional
          valorInicial={centavosParaCampo(peca?.preco_venda_centavos)}
          ajuda="Sem preço = pendente."
        />
      </div>
      <Campo rotulo="Código" name="codigo" opcional defaultValue={peca?.codigo ?? ""} maxLength={60} className="font-mono" />
      <Selecao
        rotulo="Unidade"
        name="unidade"
        defaultValue={peca?.unidade ?? "un"}
        opcoes={UNIDADES_PECA.map((u) => ({ valor: u, rotulo: ROTULO_UNIDADE[u] }))}
      />
      <Campo rotulo="Fornecedor" name="fornecedor" opcional defaultValue={peca?.fornecedor ?? ""} maxLength={120} />
    </Formulario>
  );
}
