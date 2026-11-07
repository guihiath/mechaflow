import { Truck } from "lucide-react";
import { EstadoVazio } from "@/components/ui/estados";
import { formatarPlaca, placaValida } from "@/lib/formato";

/**
 * Placa que não está na oficina (`/placa` e `/placa/[placa]`). A placa de outra oficina recebe
 * exatamente esta mesma tela (DESIGN §14.6): nada diz que ela existe em outro lugar.
 */
export function PlacaNaoCadastrada({ placa, podeEditar }: { placa: string; podeEditar: boolean }) {
  return (
    <EstadoVazio
      icone={Truck}
      titulo={`${formatarPlaca(placa)} não está cadastrada na oficina.`}
      texto={podeEditar ? "Confira a placa ou cadastre o veículo." : "Confira a placa. Se o veículo é novo, avise o dono ou o atendente."}
      acao={
        podeEditar
          ? placaValida(placa)
            ? { href: `/veiculos/novo?placa=${placa}`, rotulo: `Cadastrar ${formatarPlaca(placa)}` }
            : { href: "/veiculos/novo", rotulo: "Cadastrar veículo" }
          : undefined
      }
    />
  );
}
