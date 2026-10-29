import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Phone, Plus, Search, Truck } from "lucide-react";
import { Cabecalho } from "@/components/layout/cabecalho";
import { BotaoLink, classesBotao } from "@/components/ui/botao";
import { UltimasOS } from "@/components/os/ultimas-os";
import { Busca } from "@/components/ui/busca";
import { CaixaErro, Cartao, ChipPlaca, EstadoVazio, ListaCarregando, Pagina } from "@/components/ui/estados";
import { exigirContexto } from "@/lib/dal";
import {
  formatarNumero,
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

/** Busca por placa: todos os papeis (o mecanico so le e nao ve telefone; ARQUITETURA F2.6). */
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

  // Placa completa: dados_da_placa serve todos os papeis (o mecanico nao le mais "clientes";
  // ARQUITETURA F2.6). Parcial: so a lista de veiculos, para escolher.
  if (placa.length < 7) {
    const { data: parecidas, error } = await supabase
      .from("veiculos")
      .select("id, placa, tipo, marca, modelo")
      .ilike("placa", `%${placa}%`)
      .order("placa")
      .limit(20);
    if (error) return (<>{busca}<CaixaErro tentarDeNovo={`/placa?placa=${placa}`} /></>);
    return (
      <>
        {busca}
        {!parecidas.length ? (
          <NaoCadastrada placa={placa} podeEditar={podeEditar} />
        ) : (
          <ul className="flex flex-col gap-3">
            {parecidas.map((v) => (
              <li key={v.id}>
                <Cartao href={`/placa?placa=${v.placa}`}>
                  <ChipPlaca placa={formatarPlaca(v.placa)} />
                  <p className="mt-2 text-lg font-bold">{[v.marca, v.modelo].filter(Boolean).join(" ") || ROTULO_TIPO_VEICULO[v.tipo]}</p>
                </Cartao>
              </li>
            ))}
          </ul>
        )}
      </>
    );
  }

  const { data: v, error } = await supabase.rpc("dados_da_placa", { p_placa: placa }).maybeSingle();
  if (error) return (<>{busca}<CaixaErro tentarDeNovo={`/placa?placa=${placa}`} /></>);
  if (!v) return (<>{busca}<NaoCadastrada placa={placa} podeEditar={podeEditar} /></>);

  // Ultimas OS da placa (o mecanico so recebe as que ve; nenhuma coluna de valor).
  const { data: ultimas, error: erroUltimas } = await supabase
    .from("vw_os")
    .select("id, numero, status, criado_em, sintoma_relatado")
    .eq("veiculo_id", v.veiculo_id)
    .order("criado_em", { ascending: false })
    .limit(3);

  return (
    <>
      {busca}
      <Cartao>
        <ChipPlaca placa={formatarPlaca(v.placa)} grande />
        <p className="mt-3 text-xl font-bold">
          {[v.veiculo_marca, v.veiculo_modelo, v.veiculo_ano_modelo].filter(Boolean).join(" ") || ROTULO_TIPO_VEICULO[v.veiculo_tipo]}
        </p>
        <dl className="mt-2 grid grid-cols-2 gap-3">
          <div>
            <dt className="text-sm font-bold text-texto-suave">Tipo</dt>
            <dd className="text-lg">{ROTULO_TIPO_VEICULO[v.veiculo_tipo]}</dd>
          </div>
          <div>
            <dt className="text-sm font-bold text-texto-suave">Último KM</dt>
            <dd className="font-mono text-lg">{formatarNumero(v.ultimo_km) || "—"}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-sm font-bold text-texto-suave">Cliente</dt>
            <dd className="text-lg">{v.cliente_nome}</dd>
            {podeEditar && v.cliente_modo_padrao && <dd className="text-base text-texto-suave">{ROTULO_MODO[v.cliente_modo_padrao]}</dd>}
            {podeEditar && v.cliente_telefone && (
              <dd>
                <a
                  href={`tel:${soDigitos(v.cliente_telefone)}`}
                  className="inline-flex min-h-toque items-center gap-2 font-mono text-lg font-bold text-info-texto underline"
                >
                  <Phone size={20} strokeWidth={2.25} aria-hidden />
                  {formatarTelefone(v.cliente_telefone)}
                </a>
              </dd>
            )}
          </div>
        </dl>
        {podeEditar && (
          <div className="mt-4 flex flex-col gap-3">
            <BotaoLink href={`/os/nova?placa=${v.placa}`}>
              <Plus size={24} strokeWidth={2.25} aria-hidden />
              Abrir OS para {formatarPlaca(v.placa)}
            </BotaoLink>
            <Link href={`/veiculos/${v.veiculo_id}`} className={classesBotao("secundario")}>
              Abrir cadastro do veículo
            </Link>
          </div>
        )}
      </Cartao>

      {erroUltimas ? (
        <CaixaErro titulo="Não foi possível carregar as OS desta placa." tentarDeNovo={`/placa?placa=${placa}`} />
      ) : (
        <UltimasOS os={ultimas ?? []} verTodas={podeEditar ? `/os?q=${v.placa}` : undefined} />
      )}
    </>
  );
}

function NaoCadastrada({ placa, podeEditar }: { placa: string; podeEditar: boolean }) {
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
