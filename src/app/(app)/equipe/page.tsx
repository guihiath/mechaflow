import type { Metadata } from "next";
import { Suspense } from "react";
import { Users } from "lucide-react";
import { Cabecalho } from "@/components/layout/cabecalho";
import { ConfirmarAcao } from "@/components/ui/confirmar-acao";
import { CaixaErro, Cartao, Etiqueta, ListaCarregando, Pagina } from "@/components/ui/estados";
import { revogarConvite } from "@/acoes/equipe";
import { exigirContexto } from "@/lib/dal";
import { formatarDataHora, ROTULO_PAPEL } from "@/lib/formato";
import { createClient } from "@/lib/supabase/server";
import { AcoesMembro } from "./acoes-membro";
import { Convidar } from "./convidar";

export const metadata: Metadata = { title: "Equipe" };

export default function EquipePage() {
  return (
    <>
      <Cabecalho titulo="Equipe" voltar="/mais" voltarSoCelular />
      <Pagina>
        <Suspense fallback={<ListaCarregando />}>
          <Conteudo />
        </Suspense>
      </Pagina>
    </>
  );
}

type SituacaoConvite = "pendente" | "usado" | "expirado" | "revogado";

function situacaoConvite(c: { usado_em: string | null; revogado_em: string | null; expira_em: string }, agora: number): SituacaoConvite {
  if (c.revogado_em) return "revogado";
  if (c.usado_em) return "usado";
  if (new Date(c.expira_em).getTime() <= agora) return "expirado";
  return "pendente";
}

const ROTULO_SITUACAO: Record<SituacaoConvite, string> = {
  pendente: "Aguardando",
  usado: "Usado",
  expirado: "Expirado",
  revogado: "Cancelado",
};

async function Conteudo() {
  const ctx = await exigirContexto(["dono"]);
  const supabase = await createClient();
  const [{ data: membros, error }, { data: convites, error: erroConvites }] = await Promise.all([
    supabase.from("perfis").select("id, nome, email, telefone, papel, ativo").order("ativo", { ascending: false }).order("nome"),
    supabase
      .from("convites")
      .select("id, papel, nome_sugerido, criado_em, expira_em, usado_em, revogado_em")
      .order("criado_em", { ascending: false })
      .limit(30),
  ]);

  if (error || erroConvites) return <CaixaErro tentarDeNovo="/equipe" />;

  // Hora da requisicao: a situacao do convite e calculada no servidor a cada visita.
  // eslint-disable-next-line react-hooks/purity -- Server Component dinamico (le cookies); roda uma vez por requisicao
  const agora = Date.now();
  const comSituacao = convites.map((c) => ({ ...c, situacao: situacaoConvite(c, agora) }));
  const abertos = comSituacao.filter((c) => c.situacao === "pendente");
  const historico = comSituacao.filter((c) => c.situacao !== "pendente").slice(0, 10);

  return (
    <>
      <Convidar oficina={ctx.oficina_nome ?? "a oficina"} />

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl">Pessoas ({membros.length})</h2>
        <ul className="flex flex-col gap-3">
          {membros.map((m) => {
            const souEu = m.id === ctx.usuario_id;
            return (
              <li key={m.id}>
                <Cartao faixa={m.ativo ? undefined : "bg-borda"}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-lg font-bold">
                        {m.nome}
                        {souEu && <span className="font-medium text-texto-suave"> (você)</span>}
                      </p>
                      {m.email && <p className="break-all text-base text-texto-suave">{m.email}</p>}
                    </div>
                    <div className="flex gap-2">
                      <Etiqueta>{ROTULO_PAPEL[m.papel]}</Etiqueta>
                      {!m.ativo && <Etiqueta tom="erro">Desativado</Etiqueta>}
                    </div>
                  </div>
                  {!souEu && <AcoesMembro id={m.id} nome={m.nome} papel={m.papel} ativo={m.ativo} />}
                </Cartao>
              </li>
            );
          })}
        </ul>
        {membros.length === 1 && (
          <p className="flex items-center gap-2 text-base text-texto-suave">
            <Users size={22} aria-hidden /> Só você por enquanto. Convide o primeiro mecânico acima.
          </p>
        )}
      </section>

      {abertos.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-2xl">Convites aguardando ({abertos.length})</h2>
          <p className="text-base text-texto-suave">
            O link só aparece na hora de criar. Perdeu o link? Cancele e gere outro.
          </p>
          <ul className="flex flex-col gap-3">
            {abertos.map((c) => (
              <li key={c.id}>
                <Cartao faixa="bg-primaria">
                  <p className="text-lg font-bold">
                    {c.nome_sugerido || "Sem nome"} · {ROTULO_PAPEL[c.papel]}
                  </p>
                  <p className="text-base text-texto-suave">Vale até {formatarDataHora(c.expira_em)}</p>
                  <div className="mt-3">
                    <ConfirmarAcao
                      acao={revogarConvite.bind(null, c.id)}
                      rotulo="Cancelar convite"
                      pergunta={`Cancelar o convite ${c.nome_sugerido ? `de ${c.nome_sugerido}` : `de ${ROTULO_PAPEL[c.papel].toLowerCase()}`}? O link para de funcionar.`}
                      rotuloConfirmar="Cancelar convite"
                      rotuloEnviando="Cancelando…"
                    />
                  </div>
                </Cartao>
              </li>
            ))}
          </ul>
        </section>
      )}

      {historico.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-2xl">Convites anteriores</h2>
          <ul className="flex flex-col divide-y divide-borda-sutil rounded-lg border border-borda-sutil bg-superficie">
            {historico.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="text-base font-bold">
                    {c.nome_sugerido || "Sem nome"} · {ROTULO_PAPEL[c.papel]}
                  </p>
                  <p className="text-sm text-texto-suave">Criado em {formatarDataHora(c.criado_em)}</p>
                </div>
                <Etiqueta tom={c.situacao === "usado" ? "sucesso" : "neutro"}>{ROTULO_SITUACAO[c.situacao]}</Etiqueta>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
