"use server";

import { refresh } from "next/cache";
import { contextoParaAcao } from "@/lib/dal";
import { erroCampos, temErros, texto, type EstadoAcao } from "@/lib/acao";
import { normalizarNomeItem, trocasParaMover, validarNomeItem, type ItemChecklist } from "@/lib/checklist";
import { traduzirErro } from "@/lib/erros";
import { soDigitos } from "@/lib/formato";
import { createClient } from "@/lib/supabase/server";

const SEM_PERMISSAO = "Você não tem permissão para isso.";
const SEM_INTERNET = "Não foi possível salvar. Confira a internet e tente de novo.";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Resposta das ações do editor: sempre devolve a lista do banco quando dá para ler. */
export type ResultadoChecklist = {
  ok?: boolean;
  erro?: string;
  /** Erro do campo "Nome do item". */
  erroCampo?: string;
  mensagem?: string;
  itens?: ItemChecklist[];
};

type Cliente = Awaited<ReturnType<typeof createClient>>;

/** "Dados da oficina" (DESIGN §13.18), só o dono. O que já foi enviado continua congelado. */
export async function salvarDadosOficina(_anterior: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const ctx = await contextoParaAcao(["dono"]);
  if (!ctx) return { erro: SEM_PERMISSAO };
  const nome = texto(dados, "nome");
  const telefone = soDigitos(texto(dados, "telefone"));
  const campos = {
    nome: nome.length < 2 ? "Informe o nome da oficina." : nome.length > 120 ? "Nome muito longo." : undefined,
    telefone: telefone && (telefone.length < 10 || telefone.length > 13) ? "Telefone com DDD. Ex.: (11) 98888-7777" : undefined,
  };
  if (temErros(campos)) return erroCampos(campos);
  const supabase = await createClient();
  const { data, error } = await supabase.from("oficinas").update({ nome, telefone: telefone || null }).eq("id", ctx.oficina_id).select("id");
  if (error) return { erro: traduzir(error) };
  if (!data?.length) return { erro: SEM_PERMISSAO };
  refresh();
  return { ok: true, mensagem: "Dados da oficina salvos." };
}

function traduzir(erro: Parameters<typeof traduzirErro>[0]): string {
  const t = traduzirErro(erro);
  return t === "Algo deu errado. Tente de novo." ? SEM_INTERNET : t;
}

/** Modelo padrão da oficina (a RLS já filtra pela oficina) + todos os itens na ordem. */
async function lerModelo(supabase: Cliente) {
  const { data: modelo, error } = await supabase.from("checklist_modelos").select("id").eq("padrao", true).maybeSingle();
  if (error || !modelo) return { erro: error ? traduzir(error) : "Checklist da oficina não encontrado." } as const;
  const { data: itens, error: e2 } = await supabase
    .from("checklist_modelo_itens")
    .select("id, descricao, ordem, ativo")
    .eq("modelo_id", modelo.id)
    .order("ordem")
    .order("id");
  if (e2 || !itens) return { erro: traduzir(e2) } as const;
  return { modeloId: modelo.id, itens } as const;
}

async function abrir() {
  if (!(await contextoParaAcao(["dono"]))) return null;
  return createClient();
}

/** "Vistoria obrigatória" (DESIGN §12.16 item 3; ARQUITETURA 12.5): grava `oficinas.vistoria_obrigatoria`. */
export async function salvarVistoriaObrigatoria(obrigatoria: boolean): Promise<EstadoAcao> {
  const ctx = await contextoParaAcao(["dono"]);
  if (!ctx || typeof obrigatoria !== "boolean") return { erro: SEM_PERMISSAO };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("oficinas")
    .update({ vistoria_obrigatoria: obrigatoria })
    .eq("id", ctx.oficina_id)
    .select("id, vistoria_obrigatoria");
  if (error) return { erro: traduzir(error) };
  if (!data?.length) return { erro: SEM_PERMISSAO };
  refresh();
  return { ok: true, mensagem: obrigatoria ? "Vistoria agora é obrigatória." : "Vistoria agora é opcional." };
}

/** Novo item: vai para o fim da lista (o trigger do banco calcula a ordem). */
export async function adicionarItemChecklist(nome: string): Promise<ResultadoChecklist> {
  const supabase = await abrir();
  if (!supabase) return { erro: SEM_PERMISSAO };
  const m = await lerModelo(supabase);
  if ("erro" in m) return { erro: m.erro };
  const descricao = normalizarNomeItem(String(nome ?? ""));
  const erroCampo = validarNomeItem(descricao, m.itens);
  if (erroCampo) return { erroCampo, itens: m.itens };
  const { error } = await supabase.from("checklist_modelo_itens").insert({ modelo_id: m.modeloId, descricao });
  if (error) return { erro: traduzir(error), itens: m.itens };
  const depois = await lerModelo(supabase);
  return { ok: true, mensagem: `“${descricao}” entrou no fim do checklist.`, itens: "erro" in depois ? undefined : depois.itens };
}

/** Renomear: só vale para as próximas vistorias (a vistoria guarda a cópia do nome). */
export async function renomearItemChecklist(id: string, nome: string): Promise<ResultadoChecklist> {
  if (!UUID.test(String(id))) return { erro: "Item não encontrado. Ele pode ter sido removido." };
  const supabase = await abrir();
  if (!supabase) return { erro: SEM_PERMISSAO };
  const m = await lerModelo(supabase);
  if ("erro" in m) return { erro: m.erro };
  const item = m.itens.find((i) => i.id === id);
  if (!item) return { erro: "Item não encontrado. Ele pode ter sido removido.", itens: m.itens };
  const descricao = normalizarNomeItem(String(nome ?? ""));
  if (descricao === item.descricao) return { ok: true, itens: m.itens };
  const erroCampo = validarNomeItem(descricao, m.itens, id);
  if (erroCampo) return { erroCampo, itens: m.itens };
  const { data, error } = await supabase.from("checklist_modelo_itens").update({ descricao }).eq("id", id).select("id");
  if (error) return { erro: traduzir(error), itens: m.itens };
  if (!data?.length) return { erro: SEM_PERMISSAO, itens: m.itens };
  const depois = await lerModelo(supabase);
  return { ok: true, mensagem: `Nome mudado para “${descricao}”.`, itens: "erro" in depois ? undefined : depois.itens };
}

/** Desativar / reativar (nunca apagar: DESIGN §12.16). Reativado volta ao lugar que tinha. */
export async function mudarAtivoItemChecklist(id: string, ativo: boolean): Promise<ResultadoChecklist> {
  if (!UUID.test(String(id)) || typeof ativo !== "boolean") return { erro: "Item não encontrado. Ele pode ter sido removido." };
  const supabase = await abrir();
  if (!supabase) return { erro: SEM_PERMISSAO };
  const { data, error } = await supabase
    .from("checklist_modelo_itens")
    .update({ ativo })
    .eq("id", id)
    .select("id, descricao");
  const depois = await lerModelo(supabase);
  const itens = "erro" in depois ? undefined : depois.itens;
  if (error) return { erro: traduzir(error), itens };
  if (!data?.length) return { erro: SEM_PERMISSAO, itens };
  return {
    ok: true,
    mensagem: ativo ? `“${data[0].descricao}” voltou ao checklist.` : `“${data[0].descricao}” foi desativado.`,
    itens,
  };
}

/**
 * Subir/Descer (RPC `mover_item_checklist`). A RPC troca com o vizinho imediato, inclusive
 * um desativado; aqui a troca se repete até passar o próximo ativo (ver `trocasParaMover`).
 */
export async function moverItemChecklist(id: string, direcao: "subir" | "descer"): Promise<ResultadoChecklist> {
  if (!UUID.test(String(id)) || (direcao !== "subir" && direcao !== "descer")) {
    return { erro: "Não foi possível mudar a ordem. Tente de novo." };
  }
  const supabase = await abrir();
  if (!supabase) return { erro: SEM_PERMISSAO };
  const m = await lerModelo(supabase);
  if ("erro" in m) return { erro: "Não foi possível mudar a ordem. Tente de novo." };
  const trocas = trocasParaMover(m.itens, id, direcao);
  for (let k = 0; k < trocas; k += 1) {
    const { error } = await supabase.rpc("mover_item_checklist", { p_item_id: id, p_direcao: direcao });
    if (error) {
      const depois = await lerModelo(supabase);
      const msg = traduzirErro(error);
      return {
        erro: msg === "Algo deu errado. Tente de novo." ? "Não foi possível mudar a ordem. Tente de novo." : msg,
        itens: "erro" in depois ? m.itens : depois.itens,
      };
    }
  }
  const depois = await lerModelo(supabase);
  return { ok: true, itens: "erro" in depois ? undefined : depois.itens };
}
