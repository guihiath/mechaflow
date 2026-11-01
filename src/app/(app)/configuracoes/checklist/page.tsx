import type { Metadata } from "next";
import { Suspense } from "react";
import { Cabecalho } from "@/components/layout/cabecalho";
import { CaixaErro, ListaCarregando, Pagina } from "@/components/ui/estados";
import { exigirContexto } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { EditorChecklist } from "./editor";

export const metadata: Metadata = { title: "Checklist da vistoria" };

/** Editor do checklist padrão da oficina (DESIGN §12.16), só o dono. */
export default function ChecklistPage() {
  return (
    <>
      <Cabecalho titulo="Checklist da vistoria" voltar="/configuracoes" />
      <Pagina>
        <p className="text-base text-texto-suave">
          Vale para as próximas vistorias. As já feitas ficam como estavam.
        </p>
        <Suspense fallback={<ListaCarregando linhas={6} />}>
          <Conteudo />
        </Suspense>
      </Pagina>
    </>
  );
}

async function Conteudo() {
  await exigirContexto(["dono"]);
  const supabase = await createClient();
  const { data: modelo, error } = await supabase.from("checklist_modelos").select("id").eq("padrao", true).maybeSingle();
  if (error) return <CaixaErro tentarDeNovo="/configuracoes/checklist" />;
  if (!modelo) return <CaixaErro titulo="Checklist da oficina não encontrado." tentarDeNovo="/configuracoes/checklist" />;
  const { data: itens, error: e2 } = await supabase
    .from("checklist_modelo_itens")
    .select("id, descricao, ordem, ativo")
    .eq("modelo_id", modelo.id)
    .order("ordem")
    .order("id");
  if (e2 || !itens) return <CaixaErro tentarDeNovo="/configuracoes/checklist" />;
  return <EditorChecklist itensIniciais={itens} />;
}
