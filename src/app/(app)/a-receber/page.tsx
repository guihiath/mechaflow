import type { Metadata } from "next";
import { Suspense } from "react";
import { Cabecalho } from "@/components/layout/cabecalho";
import { DevedoresCarregando } from "@/components/painel/cartao-devedor";
import { CaixaErro, Pagina } from "@/components/ui/estados";
import { exigirContexto } from "@/lib/dal";
import { HREF_OS_DO_A_RECEBER } from "@/lib/origem-os";
import { diaEmSaoPaulo } from "@/lib/painel";
import { devedoresDeContas, type LinhaContaAReceber } from "@/lib/painel-dados";
import { createClient } from "@/lib/supabase/server";
import { AvisoSemInternet } from "../painel/cliente";
import { ListaAReceber } from "./lista";

export const metadata: Metadata = { title: "A receber" };

/**
 * Contas a receber (F7-B5; DESIGN §14.4 e §14.5, ARQUITETURA §14.5).
 * - Dono e atendente. Mecânico vai para a home dele (`exigirContexto`), antes de qualquer leitura.
 * - Uma leitura só, `contas_a_receber` (já na ordem: cliente com a dívida mais antiga primeiro e,
 *   dentro dele, a OS mais antiga), com a sessão do usuário. Nada em cache.
 * - A soma geral só vai para o dono: para o atendente o número nem sai do servidor (§14.5).
 */
export default function AReceberPage() {
  return (
    <Suspense
      fallback={
        <>
          <Cabecalho titulo="A receber" />
          <Pagina larga>
            <DevedoresCarregando />
          </Pagina>
        </>
      }
    >
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  const ctx = await exigirContexto(["dono", "atendente"]);
  const ehDono = ctx.papel === "dono";
  const voltar = ehDono ? "/painel" : "/mais";
  const hoje = diaEmSaoPaulo(new Date());

  const supabase = await createClient();
  const { data, error } = (await supabase.rpc("contas_a_receber")) as {
    data: LinhaContaAReceber[] | null;
    error: { message: string } | null;
  };

  const cabecalho = <Cabecalho titulo="A receber" voltar={voltar} voltarSoCelular={!ehDono} />;
  if (error || !data) {
    return (
      <>
        {cabecalho}
        <AvisoSemInternet />
        <Pagina larga>
          {/* Erro nunca vira "Nada a receber" nem R$ 0,00 (DESIGN §14.0, regra 4). */}
          <CaixaErro titulo="Não foi possível carregar quem deve." tentarDeNovo="/a-receber" />
        </Pagina>
      </>
    );
  }

  const devedores = devedoresDeContas(data, HREF_OS_DO_A_RECEBER);
  // Soma de inteiros em centavos, sobre a lista inteira (sem paginação), só para o dono.
  const total = ehDono ? data.reduce((s, l) => s + l.total_centavos, 0) : null;

  return (
    <>
      {cabecalho}
      <AvisoSemInternet />
      <Pagina larga>
        <ListaAReceber
          devedores={devedores}
          totalCentavos={total}
          quantidadeOS={data.length}
          quantidadeClientes={devedores.length}
          hoje={hoje}
          ehDono={ehDono}
        />
      </Pagina>
    </>
  );
}
