"use client";

import { AreaTexto, Campo, CampoPlaca, Selecao } from "@/components/ui/campo";
import { Formulario } from "@/components/ui/formulario";
import { salvarVeiculo } from "@/acoes/veiculos";
import { ROTULO_TIPO_VEICULO } from "@/lib/formato";
import { Constants, type Tables } from "@/lib/supabase/database.types";
import { EscolherCliente } from "./escolher-cliente";

type Veiculo = Omit<Tables<"veiculos">, "oficina_id" | "criado_em" | "criado_por" | "atualizado_em">;

const n = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));

export function FormVeiculo({
  veiculo,
  clientes,
  clienteInicial,
}: {
  veiculo?: Veiculo;
  clientes: { id: string; nome: string }[];
  clienteInicial?: string | null;
}) {
  return (
    <Formulario acao={salvarVeiculo} rotulo={veiculo ? "Salvar veículo" : "Cadastrar veículo"}>
      {veiculo && <input type="hidden" name="id" value={veiculo.id} />}
      <CampoPlaca valorInicial={veiculo?.placa} />
      <EscolherCliente clientes={clientes} inicial={veiculo?.cliente_id ?? clienteInicial} />
      <Selecao
        rotulo="Tipo"
        name="tipo"
        defaultValue={veiculo?.tipo ?? "caminhao"}
        opcoes={Constants.public.Enums.tipo_veiculo.map((t) => ({ valor: t, rotulo: ROTULO_TIPO_VEICULO[t] }))}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <Campo rotulo="Marca" name="marca" opcional defaultValue={veiculo?.marca ?? ""} placeholder="Ex.: Volvo" maxLength={60} />
        <Campo rotulo="Modelo" name="modelo" opcional defaultValue={veiculo?.modelo ?? ""} placeholder="Ex.: FH 540" maxLength={80} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Ano fabricação" name="ano_fabricacao" inputMode="numeric" maxLength={4} opcional defaultValue={n(veiculo?.ano_fabricacao)} />
        <Campo rotulo="Ano modelo" name="ano_modelo" inputMode="numeric" maxLength={4} opcional defaultValue={n(veiculo?.ano_modelo)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="KM atual" name="km_atual" inputMode="numeric" opcional defaultValue={n(veiculo?.km_atual)} className="font-mono" />
        <Campo rotulo="Horímetro" name="horimetro_atual" inputMode="numeric" opcional defaultValue={n(veiculo?.horimetro_atual)} className="font-mono" />
      </div>
      <Campo
        rotulo="Chassi"
        name="chassi"
        opcional
        autoCapitalize="characters"
        defaultValue={veiculo?.chassi ?? ""}
        className="font-mono uppercase"
        maxLength={25}
      />
      <AreaTexto rotulo="Observações" name="observacoes" opcional defaultValue={veiculo?.observacoes ?? ""} maxLength={2000} />
    </Formulario>
  );
}
