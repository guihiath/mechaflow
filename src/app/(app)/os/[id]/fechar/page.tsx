import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Cabecalho } from "@/components/layout/cabecalho";
import { EsconderNavegacao } from "@/components/layout/marcador-pagina";
import { CaixaErro, ChipPlaca, FormularioCarregando, Pagina } from "@/components/ui/estados";
import { CaixaMensagem } from "@/components/ui/formulario";
import { exigirContexto } from "@/lib/dal";
import { formatarCentavos, formatarPlaca } from "@/lib/formato";
import { FormFechar } from "./form-fechar";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Fechar OS" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Fechar e entregar (DESIGN §10.8). Dono e atendente; so OS pronta. */
export default function FecharOsPage({ params }: PageProps<"/os/[id]/fechar">) {
  return (
    <>
      <EsconderNavegacao />
      <Suspense
        fallback={
          <>
            <Cabecalho titulo="Fechar OS" voltar="/os" />
            <Pagina>
              <FormularioCarregando />
            </Pagina>
          </>
        }
      >
        <Conteudo params={params} />
      </Suspense>
    </>
  );
}

async function Conteudo({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await exigirContexto(["dono", "atendente"]);
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const [{ data: os, error }, oficinaR] = await Promise.all([
    supabase
      .from("vw_os")
      .select(
        "id, numero, status, modo, placa, veiculo_marca, veiculo_modelo, cliente_nome, codigo_falha, causa_encontrada, solucao_aplicada, total_centavos, qtd_itens, itens_sem_preco, valor_aprovado_centavos, orcamento_aprovado_em, itens_apos_aprovacao, vistoria_entrada_status",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("oficinas").select("vistoria_obrigatoria").eq("id", ctx.oficina_id).maybeSingle(),
  ]);
  if (error) {
    return (
      <>
        <Cabecalho titulo="Fechar OS" voltar={`/os/${id}`} />
        <Pagina>
          <CaixaErro titulo="Não foi possível abrir a OS." tentarDeNovo={`/os/${id}/fechar`} />
        </Pagina>
      </>
    );
  }
  if (!os) notFound();
  if (os.status !== "pronta") redirect(`/os/${id}`);

  const placa = formatarPlaca(os.placa);
  const semPreco = os.itens_sem_preco ?? 0;
  // Vistoria obrigatória sem a de entrada concluída: o banco recusa a entrega (ARQUITETURA 12.5).
  const semVistoria = Boolean(oficinaR.data?.vistoria_obrigatoria) && os.vistoria_entrada_status !== "concluida";
  // Itens depois da aprovacao (DESIGN §11.9): so avisa, nao bloqueia (decisao nº 4).
  const total = os.total_centavos ?? 0;
  const aprovado = os.valor_aprovado_centavos;
  const apos = os.itens_apos_aprovacao ?? 0;
  const comAprovacao = os.modo === "com_orcamento" && os.orcamento_aprovado_em != null && aprovado != null;
  const diferenca = comAprovacao ? total - (aprovado ?? 0) : 0;
  const avisoApos = comAprovacao && apos > 0;

  return (
    <>
      <Cabecalho titulo={`Fechar OS #${os.numero}`} voltar={`/os/${id}`} />
      <Pagina>
        <div className="flex flex-col gap-2">
          <div>
            <ChipPlaca placa={placa} />
          </div>
          <p className="text-lg font-bold">{[[os.veiculo_marca, os.veiculo_modelo].filter(Boolean).join(" "), os.cliente_nome].filter(Boolean).join(" · ")}</p>
          <p className="font-mono text-[1.75rem] font-semibold">Total: {formatarCentavos(os.total_centavos ?? 0)}</p>
        </div>

        {semVistoria && (
          <div className="flex flex-col gap-1" data-teste="bloqueio-vistoria">
            <CaixaMensagem tipo="erro">Falta a vistoria de entrada. Ela é obrigatória nesta oficina.</CaixaMensagem>
            <Link
              href={`/os/${id}/vistoria`}
              className="inline-flex min-h-toque items-center self-start font-bold text-info-texto underline max-lg:hidden"
            >
              Fazer vistoria
            </Link>
          </div>
        )}
        {semPreco > 0 && (
          <div className="flex flex-col gap-1">
            {/* No celular o caminho é o primário "Definir preços (N)" da barra (M3 do F3-R1); no desktop a barra fica no fim do formulário. */}
            <CaixaMensagem tipo="erro">
              {semPreco === 1 ? "1 item está sem preço." : `${semPreco} itens estão sem preço.`} Defina o preço antes de fechar.
            </CaixaMensagem>
            <Link
              href={`/os/${id}?precificar=1`}
              className="inline-flex min-h-toque items-center self-start font-bold text-info-texto underline max-lg:hidden"
            >
              Definir preços
            </Link>
          </div>
        )}
        {avisoApos && (
          <CaixaMensagem tipo="alerta">
            {apos === 1 ? "1 item foi adicionado depois da aprovação." : `${apos} itens foram adicionados depois da aprovação.`}{" "}
            {/* Valores sem quebrar no meio e com tabular-nums na fonte do texto (M4 do F3-R1). */}
            <span className="whitespace-nowrap">
              Aprovado: <span className="tabular-nums">{formatarCentavos(aprovado)}</span>
            </span>{" "}
            ·{" "}
            <span className="whitespace-nowrap">
              Agora: <span className="tabular-nums">{formatarCentavos(total)}</span>
            </span>
            {diferenca !== 0 && (
              <>
                {" "}
                <span className="whitespace-nowrap tabular-nums">
                  ({diferenca > 0 ? "+" : "−"} {formatarCentavos(Math.abs(diferenca))})
                </span>
              </>
            )}
            . Confira se o cliente está sabendo.
          </CaixaMensagem>
        )}
        {(os.qtd_itens ?? 0) === 0 && (
          <CaixaMensagem tipo="alerta">Esta OS não tem nenhum item. O total vai ficar R$ 0,00.</CaixaMensagem>
        )}

        <FormFechar
          osId={id}
          numero={os.numero ?? 0}
          placa={placa}
          semPreco={semPreco}
          semVistoria={semVistoria}
          vistoriaEmAndamento={os.vistoria_entrada_status === "rascunho"}
          acimaDoAprovadoCentavos={comAprovacao && diferenca > 0 ? diferenca : 0}
          causa={os.causa_encontrada ?? ""}
          solucao={os.solucao_aplicada ?? ""}
          codigo={os.codigo_falha ?? ""}
        />
      </Pagina>
    </>
  );
}
