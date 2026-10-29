import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Cabecalho } from "@/components/layout/cabecalho";
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
      <span hidden data-esconde-navegacao />
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
  await exigirContexto(["dono", "atendente"]);
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const { data: os, error } = await supabase
    .from("vw_os")
    .select(
      "id, numero, status, placa, veiculo_marca, veiculo_modelo, cliente_nome, codigo_falha, causa_encontrada, solucao_aplicada, total_centavos, qtd_itens, itens_sem_preco",
    )
    .eq("id", id)
    .maybeSingle();
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

        {semPreco > 0 && (
          <div className="flex flex-col gap-1">
            <CaixaMensagem tipo="erro">
              {semPreco === 1 ? "1 item está sem preço." : `${semPreco} itens estão sem preço.`} Defina o preço antes de fechar.
            </CaixaMensagem>
            <Link href={`/os/${id}#titulo-itens`} className="inline-flex min-h-toque items-center self-start font-bold text-info-texto underline">
              Ver itens
            </Link>
          </div>
        )}
        {(os.qtd_itens ?? 0) === 0 && (
          <CaixaMensagem tipo="alerta">Esta OS não tem nenhum item. O total vai ficar R$ 0,00.</CaixaMensagem>
        )}

        <FormFechar
          osId={id}
          numero={os.numero ?? 0}
          placa={placa}
          bloqueado={semPreco > 0}
          causa={os.causa_encontrada ?? ""}
          solucao={os.solucao_aplicada ?? ""}
          codigo={os.codigo_falha ?? ""}
        />
      </Pagina>
    </>
  );
}
