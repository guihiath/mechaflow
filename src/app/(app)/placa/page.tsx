import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Phone, Search, Truck } from "lucide-react";
import { Cabecalho } from "@/components/layout/cabecalho";
import { classesBotao } from "@/components/ui/botao";
import { Busca } from "@/components/ui/busca";
import { CaixaErro, Cartao, ChipPlaca, EstadoVazio, ListaCarregando, Pagina } from "@/components/ui/estados";
import { exigirContexto } from "@/lib/dal";
import {
  formatarPlaca,
  formatarTelefone,
  normalizarPlaca,
  param,
  placaValida,
  ROTULO_MODO,
  ROTULO_TIPO_VEICULO,
  soDigitos,
} from "@/lib/formato";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Buscar placa" };

/** Busca por placa: todos os papeis (o mecanico so le; ARQUITETURA D16). */
export default function PlacaPage({ searchParams }: PageProps<"/placa">) {
  return (
    <>
      <Cabecalho titulo="Buscar placa" />
      <Pagina>
        <Suspense fallback={<ListaCarregando linhas={1} />}>
          <Resultado searchParams={searchParams} />
        </Suspense>
      </Pagina>
    </>
  );
}

async function Resultado({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await exigirContexto();
  const placa = normalizarPlaca(param((await searchParams).placa));
  const podeEditar = ctx.papel !== "mecanico";

  const busca = <Busca acao="/placa" nome="placa" rotulo="Ex.: ABC1D23" rotuloVisivel="Placa" valor={placa ? formatarPlaca(placa) : ""} placa />;

  if (!placa) {
    return (
      <>
        {busca}
        <p className="flex items-center gap-2 text-base text-texto-suave">
          <Search size={22} aria-hidden /> Digite a placa com ou sem traço. Ex.: ABC1D23 ou ABC-1234.
        </p>
      </>
    );
  }

  const supabase = await createClient();
  // Placa normalizada so tem letras e numeros: segura para o ilike.
  const { data: veiculos, error } = await supabase
    .from("veiculos")
    .select("id, placa, tipo, marca, modelo, ano_modelo, km_atual, horimetro_atual, cliente:clientes(id, nome, telefone, modo_padrao)")
    .ilike("placa", placa.length === 7 ? placa : `%${placa}%`)
    .order("placa")
    .limit(20);

  if (error) return (<>{busca}<CaixaErro tentarDeNovo={`/placa?placa=${placa}`} /></>);

  return (
    <>
      {busca}
      {!veiculos.length ? (
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
      ) : (
        <ul className="flex flex-col gap-3">
          {veiculos.map((v) => (
            <li key={v.id}>
              <Cartao>
                <ChipPlaca placa={formatarPlaca(v.placa)} grande={veiculos.length === 1} />
                <p className="mt-3 text-xl font-bold">
                  {[v.marca, v.modelo, v.ano_modelo].filter(Boolean).join(" ") || ROTULO_TIPO_VEICULO[v.tipo]}
                </p>
                <dl className="mt-2 grid grid-cols-2 gap-3">
                  <div>
                    <dt className="text-sm font-bold text-texto-suave">Tipo</dt>
                    <dd className="text-lg">{ROTULO_TIPO_VEICULO[v.tipo]}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-bold text-texto-suave">KM atual</dt>
                    <dd className="font-mono text-lg">{v.km_atual?.toLocaleString("pt-BR") ?? "—"}</dd>
                  </div>
                  {v.cliente && (
                    <div className="col-span-2">
                      <dt className="text-sm font-bold text-texto-suave">Cliente</dt>
                      <dd className="text-lg">
                        {v.cliente.nome}

                      </dd>
                      <dd className="text-base text-texto-suave">{ROTULO_MODO[v.cliente.modo_padrao]}</dd>
                      {v.cliente.telefone && (
                        <dd>
                          <a
                            href={`tel:${soDigitos(v.cliente.telefone)}`}
                            className="inline-flex min-h-toque items-center gap-2 font-mono text-lg font-bold text-info-texto underline"
                          >
                            <Phone size={20} strokeWidth={2.25} aria-hidden />
                            {formatarTelefone(v.cliente.telefone)}
                          </a>
                        </dd>
                      )}
                    </div>
                  )}
                </dl>
                <p className="mt-3 text-base text-texto-suave">Histórico de serviços: chega com as OS (próxima fase).</p>
                {podeEditar && (
                  <Link href={`/veiculos/${v.id}`} className={classesBotao("secundario", "mt-3")}>
                    Abrir cadastro do veículo
                  </Link>
                )}
              </Cartao>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
