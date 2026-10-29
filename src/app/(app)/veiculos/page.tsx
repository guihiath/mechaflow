import type { Metadata } from "next";
import { Suspense } from "react";
import { Plus, Truck } from "lucide-react";
import { Cabecalho } from "@/components/layout/cabecalho";
import { BotaoLink } from "@/components/ui/botao";
import { Busca } from "@/components/ui/busca";
import { CaixaErro, Cartao, ChipPlaca, EstadoVazio, ListaCarregando, Pagina } from "@/components/ui/estados";
import { exigirContexto } from "@/lib/dal";
import { formatarPlaca, normalizarPlaca, param, ROTULO_TIPO_VEICULO } from "@/lib/formato";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Veículos" };

export default function VeiculosPage({ searchParams }: PageProps<"/veiculos">) {
  return (
    <>
      <Cabecalho titulo="Veículos" />
      <Pagina>
        <Suspense fallback={<ListaCarregando />}>
          <Lista searchParams={searchParams} />
        </Suspense>
      </Pagina>
    </>
  );
}

async function Lista({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigirContexto(["dono", "atendente"]);
  const q = normalizarPlaca(param((await searchParams).placa));
  const supabase = await createClient();

  let consulta = supabase
    .from("veiculos")
    .select("id, placa, tipo, marca, modelo, ano_modelo, cliente:clientes(nome)")
    .order("placa")
    .limit(100);
  // q so tem letras e numeros (normalizado), seguro para o ilike.
  if (q) consulta = consulta.ilike("placa", `%${q}%`);
  const { data: veiculos, error } = await consulta;

  return (
    <>
      <div className="flex flex-col gap-3">
        <Busca acao="/veiculos" nome="placa" rotulo="Buscar pela placa" valor={q ? formatarPlaca(q) : ""} placa />
        <BotaoLink href="/veiculos/novo">
          <Plus size={24} strokeWidth={2.25} aria-hidden />
          Novo veículo
        </BotaoLink>
      </div>

      {error ? (
        <CaixaErro tentarDeNovo="/veiculos" />
      ) : !veiculos.length ? (
        q ? (
          <EstadoVazio
            icone={Truck}
            titulo="Nenhum veículo com essa placa."
            texto="Confira a placa ou cadastre o veículo."
            acao={{ href: "/veiculos/novo", rotulo: "Cadastrar veículo" }}
          />
        ) : (
          <EstadoVazio
            icone={Truck}
            titulo="Nenhum veículo ainda."
            texto="Cadastre o primeiro caminhão da oficina."
            acao={{ href: "/veiculos/novo", rotulo: "Cadastrar veículo" }}
          />
        )
      ) : (
        <ul className="flex flex-col gap-3">
          {veiculos.map((v) => (
            <li key={v.id}>
              <Cartao href={`/veiculos/${v.id}`}>
                <ChipPlaca placa={formatarPlaca(v.placa)} />
                <p className="mt-2 text-lg font-bold">
                  {[v.marca, v.modelo, v.ano_modelo].filter(Boolean).join(" ") || ROTULO_TIPO_VEICULO[v.tipo]}
                  {v.cliente?.nome && <span className="font-medium text-texto-suave"> · {v.cliente.nome}</span>}
                </p>
              </Cartao>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
