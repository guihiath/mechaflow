import type { Metadata } from "next";
import { Suspense } from "react";
import { Cabecalho } from "@/components/layout/cabecalho";
import { CaixaErro, ListaCarregando, Pagina } from "@/components/ui/estados";
import { LinhaLinkChecklist } from "@/components/vistoria/editor-checklist";
import { exigirContexto } from "@/lib/dal";
import { STATUS_ABERTOS } from "@/lib/os-status";
import { createClient } from "@/lib/supabase/server";
import { ChaveVistoria } from "./chave-vistoria";

export const metadata: Metadata = { title: "Configurações" };

/** Configurações da oficina (DESIGN §12.16), só o dono. Atendente e mecânico vão para a home do papel. */
export default function ConfiguracoesPage() {
  return (
    <>
      <Cabecalho titulo="Configurações" voltar="/mais" voltarSoCelular />
      <Pagina>
        <Suspense fallback={<ListaCarregando linhas={2} />}>
          <Conteudo />
        </Suspense>
      </Pagina>
    </>
  );
}

async function Conteudo() {
  const ctx = await exigirContexto(["dono"]);
  const supabase = await createClient();
  const [oficinaR, semVistoriaR, modeloR] = await Promise.all([
    supabase.from("oficinas").select("vistoria_obrigatoria").eq("id", ctx.oficina_id).single(),
    supabase
      .from("vw_os")
      .select("id", { count: "exact", head: true })
      .in("status", [...STATUS_ABERTOS])
      .or("vistoria_entrada_status.is.null,vistoria_entrada_status.neq.concluida"),
    supabase.from("checklist_modelos").select("id").eq("padrao", true).maybeSingle(),
  ]);
  if (oficinaR.error || semVistoriaR.error || modeloR.error) return <CaixaErro tentarDeNovo="/configuracoes" />;

  let ativos = 0;
  if (modeloR.data) {
    const { count, error } = await supabase
      .from("checklist_modelo_itens")
      .select("id", { count: "exact", head: true })
      .eq("modelo_id", modeloR.data.id)
      .eq("ativo", true);
    if (error) return <CaixaErro tentarDeNovo="/configuracoes" />;
    ativos = count ?? 0;
  }

  return (
    <section aria-labelledby="titulo-vistoria" className="flex flex-col gap-4">
      <h2 id="titulo-vistoria" className="text-2xl">
        Vistoria de entrada
      </h2>
      <ChaveVistoria obrigatoria={oficinaR.data.vistoria_obrigatoria} osSemVistoria={semVistoriaR.count ?? 0} />
      <LinhaLinkChecklist ativos={ativos} href="/configuracoes/checklist" />
    </section>
  );
}
