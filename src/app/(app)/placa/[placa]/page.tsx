import type { Metadata } from "next";
import { Suspense } from "react";
import { HistoricoCarregando } from "@/components/historico/linha-tempo-placa";
import type { PapelHistorico } from "@/components/historico/cartao-os-historico";
import { Cabecalho } from "@/components/layout/cabecalho";
import { PlacaNaoCadastrada } from "@/components/os/placa-nao-cadastrada";
import { CaixaErro, EstadoVazio, Pagina } from "@/components/ui/estados";
import { exigirContexto } from "@/lib/dal";
import { formatarPlaca, normalizarPlaca, ROTULO_TIPO_VEICULO } from "@/lib/formato";
import { lerPaginaHistorico } from "@/lib/historico";
import { diaEmSaoPaulo } from "@/lib/painel";
import { textoResumoHistorico, textoVeiculoHistorico } from "@/lib/painel-dados";
import { createClient } from "@/lib/supabase/server";
import { HistoricoPlaca } from "./historico";

export const metadata: Metadata = { title: "Histórico da placa" };

/**
 * Histórico da placa (F7-B7; DESIGN §14.6 e §14.7, ARQUITETURA §14.4 e §14.6), para os 3 papéis.
 * - Leitura pela RPC `historico_placa` com a sessão do usuário: a oficina vem da sessão no banco e
 *   a lista de chaves já sai cortada por papel. Placa de outra oficina = mesma tela de não cadastrada.
 * - O que vai ao navegador passa por `osDoHistorico`/`parteListaDoHistorico` (cópia chave a chave):
 *   o mecânico não recebe valor, cliente nem telefone, nem no HTML nem no payload.
 * - Itens, fotos e vistorias só ao abrir o cartão (`abrirOSHistorico`), com URL assinada de 15 min.
 * - Sem cache: nada aqui tem `"use cache"`.
 */
export default function HistoricoPlacaPage({ params }: PageProps<"/placa/[placa]">) {
  return (
    <Suspense
      fallback={
        <>
          <Cabecalho titulo="Histórico da placa" voltar="/placa" />
          <Pagina>
            <HistoricoCarregando />
          </Pagina>
        </>
      }
    >
      <Conteudo params={params} />
    </Suspense>
  );
}

async function Conteudo({ params }: { params: Promise<{ placa: string }> }) {
  const ctx = await exigirContexto();
  const papel = ctx.papel as PapelHistorico;
  const bruta = (await params).placa;
  let decodificada = bruta;
  try {
    decodificada = decodeURIComponent(bruta);
  } catch {
    // placa com "%" solto: segue como veio e cai em "não cadastrada"
  }
  const placa = normalizarPlaca(decodificada).slice(0, 8);
  const voltar = placa ? `/placa?placa=${placa}` : "/placa";
  const podeEditar = papel !== "mecanico";

  const cabecalho = <Cabecalho titulo="Histórico da placa" voltar={voltar} />;
  if (!placa) {
    return (
      <>
        {cabecalho}
        <Pagina>
          <PlacaNaoCadastrada placa={decodificada} podeEditar={podeEditar} />
        </Pagina>
      </>
    );
  }

  const supabase = await createClient();
  const r = await lerPaginaHistorico(supabase, papel, placa, null);
  const hoje = diaEmSaoPaulo(new Date());

  let corpo: React.ReactNode;
  if (!r) {
    corpo = (
      <CaixaErro titulo="Não foi possível carregar o histórico desta placa." tentarDeNovo={`/placa/${placa}`} />
    );
  } else if (!r.dados.veiculo) {
    corpo = <PlacaNaoCadastrada placa={placa} podeEditar={podeEditar} />;
  } else {
    const v = r.dados.veiculo;
    const total = r.dados.resumo?.qtd_os ?? r.pagina.os.length;
    corpo = (
      <>
        <HistoricoPlaca
          papel={papel}
          placa={v.placa}
          veiculo={textoVeiculoHistorico(v) || (v.tipo ? ROTULO_TIPO_VEICULO[v.tipo] : null)}
          resumo={papel !== "mecanico" && r.dados.resumo ? textoResumoHistorico(r.dados.resumo) : null}
          inicial={r.pagina.os}
          partes={r.pagina.partes}
          total={total}
          hoje={hoje}
          proximo={r.pagina.proximo}
        />
        {r.pagina.os.length === 0 &&
          (podeEditar ? (
            <EstadoVazio
              titulo="Nenhuma OS para esta placa."
              texto="Comece abrindo uma OS."
              acao={{ href: `/os/nova?placa=${v.placa}`, rotulo: `Abrir OS para ${formatarPlaca(v.placa)}` }}
            />
          ) : (
            <EstadoVazio
              titulo="Nenhuma OS para esta placa."
              texto="Quando abrirem uma OS para este caminhão, ela aparece aqui."
            />
          ))}
      </>
    );
  }

  return (
    <>
      {cabecalho}
      <Pagina>{corpo}</Pagina>
    </>
  );
}
