import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatarDocumento, formatarPlaca, LADOS_AVARIA, normalizarPlaca, soDigitos, type LadoAvaria } from "@/lib/formato";
import { BUCKET_VISTORIAS } from "@/lib/fotos/regras";
import type { Database } from "@/lib/supabase/database.types";
import type { DadosPdfVistoria, FontesPdf, ImagemPdf } from "./pdf-layout";

/*
 * Dados do PDF da vistoria (F4-B6), lidos com o cliente do usuário (RLS): quem não vê a OS
 * não acha a vistoria (404), e as fotos saem do Storage pela mesma política de leitura.
 * Nunca usa service_role.
 */

type Cliente = SupabaseClient<Database>;

/**
 * Teto das imagens dentro do PDF. A resposta de uma função da Vercel tem limite de 4,5 MB e o
 * arquivo vai pelo WhatsApp: começa tudo com a miniatura (400 px) e troca pela foto inteira
 * (até 1600 px) na ordem da página enquanto couber.
 */
export const ORCAMENTO_FOTOS_BYTES = 2_500_000;
/** Downloads do Storage ao mesmo tempo. */
const DOWNLOADS_PARALELOS = 6;

export type ResultadoDadosPdf =
  | { ok: true; dados: DadosPdfVistoria; nomeArquivo: string; medicao: { dadosMs: number; fotosMs: number; bytesFotos: number } }
  | { ok: false; status: 404 | 409 | 500 | 502; erro: string };

const ehLado = (l: string | null | undefined): l is LadoAvaria => (LADOS_AVARIA as readonly string[]).includes(l ?? "");

export async function carregarDadosPdf(supabase: Cliente, vistoriaId: string): Promise<ResultadoDadosPdf> {
  const t0 = performance.now();
  const vR = await supabase.from("vw_vistorias").select("*").eq("id", vistoriaId).maybeSingle();
  if (vR.error) return { ok: false, status: 500, erro: "Não foi possível abrir a vistoria." };
  const v = vR.data;
  // RLS: outra oficina, ou mecânico que não vê a OS, simplesmente não acha.
  if (!v?.id || !v.os_id || !v.oficina_id || !v.tipo) return { ok: false, status: 404, erro: "Vistoria não encontrada." };
  if (v.status === "rascunho") return { ok: false, status: 409, erro: "A vistoria ainda não foi concluída." };

  const [osR, oficinaR, itensR, avR, fotosR, complR] = await Promise.all([
    supabase
      .from("vw_os")
      .select("numero, placa, cliente_nome, veiculo_marca, veiculo_modelo, veiculo_ano_modelo")
      .eq("id", v.os_id)
      .maybeSingle(),
    supabase.from("oficinas").select("nome, documento").eq("id", v.oficina_id).maybeSingle(),
    supabase.from("vistoria_itens").select("descricao, situacao, observacao").eq("vistoria_id", v.id).order("ordem"),
    supabase.from("vistoria_avarias").select("id, lado, descricao").eq("vistoria_id", v.id).order("criado_em"),
    supabase
      .from("vistoria_fotos")
      .select("id, tipo, avaria_id, complemento_id, caminho, caminho_miniatura, tamanho_bytes, tamanho_miniatura_bytes")
      .eq("vistoria_id", v.id)
      .not("enviada_em", "is", null)
      .order("criado_em"),
    supabase.from("vw_vistoria_complementos").select("id, texto, criado_em, criado_por_nome").eq("vistoria_id", v.id).order("criado_em"),
  ]);
  if (osR.error || oficinaR.error || itensR.error || avR.error || fotosR.error || complR.error) {
    return { ok: false, status: 500, erro: "Não foi possível ler a vistoria." };
  }
  const os = osR.data;
  if (!os) return { ok: false, status: 404, erro: "Vistoria não encontrada." };
  const dadosMs = performance.now() - t0;

  // ---------------- fotos: ordem da página (avarias → painel → complementos)
  const fotos = fotosR.data ?? [];
  const avarias = (avR.data ?? []).filter((a) => ehLado(a.lado));
  const complementos = (complR.data ?? []).filter((c) => c.id && c.criado_em);
  const ordem = [
    ...avarias.flatMap((a) => fotos.filter((f) => f.avaria_id === a.id && !f.complemento_id)),
    ...fotos.filter((f) => f.tipo === "painel" && !f.complemento_id),
    ...complementos.flatMap((c) => fotos.filter((f) => f.complemento_id === c.id)),
  ];
  let total = ordem.reduce((s, f) => s + f.tamanho_miniatura_bytes, 0);
  const caminhoDe = new Map<string, string>();
  for (const f of ordem) {
    const extra = f.tamanho_bytes - f.tamanho_miniatura_bytes;
    if (total + extra <= ORCAMENTO_FOTOS_BYTES) {
      total += extra;
      caminhoDe.set(f.id, f.caminho);
    } else {
      caminhoDe.set(f.id, f.caminho_miniatura);
    }
  }

  const t1 = performance.now();
  // Assinatura só de vistoria concluída (a anulada ainda em rascunho pode ter um PNG que nunca subiu).
  const assinaturaCaminho = v.concluida_em && !v.sem_assinatura_motivo ? v.assinatura_caminho : null;
  const caminhos = [...caminhoDe.values(), ...(assinaturaCaminho ? [assinaturaCaminho] : [])];
  const baixados = await baixarTodos(supabase, caminhos);
  if (!baixados) return { ok: false, status: 502, erro: "Não foi possível baixar as fotos da vistoria." };
  const fotosMs = performance.now() - t1;
  const bytesFotos = [...baixados.values()].reduce((s, b) => s + b.byteLength, 0);
  const img = (id: string): ImagemPdf => ({ bytes: baixados.get(caminhoDe.get(id)!)! });

  const placa = formatarPlaca(os.placa);
  const veiculo = [[os.veiculo_marca, os.veiculo_modelo].filter(Boolean).join(" "), os.veiculo_ano_modelo ? String(os.veiculo_ano_modelo) : ""]
    .filter(Boolean)
    .join(" · ");
  const doc = soDigitos(oficinaR.data?.documento);

  const dados: DadosPdfVistoria = {
    // Só CNPJ no cabeçalho: CPF do dono não vai para o cliente.
    oficina: { nome: oficinaR.data?.nome ?? "Oficina", cnpj: doc.length === 14 ? formatarDocumento(doc) : null },
    tipo: v.tipo,
    numeroOS: os.numero ?? v.os_numero ?? 0,
    placa,
    veiculo: veiculo || null,
    cliente: os.cliente_nome,
    concluidaEm: v.concluida_em,
    concluidaPor: v.concluida_por_nome,
    km: v.km,
    horimetro: v.horimetro,
    combustivel: v.combustivel,
    itens: (itensR.data ?? []).map((i) => ({ descricao: i.descricao, situacao: i.situacao, observacao: i.observacao })),
    semAvarias: Boolean(v.sem_avarias),
    avarias: avarias.map((a) => ({
      lado: a.lado as LadoAvaria,
      descricao: a.descricao,
      fotos: fotos.filter((f) => f.avaria_id === a.id && !f.complemento_id).map((f) => img(f.id)),
    })),
    painel: fotos.filter((f) => f.tipo === "painel" && !f.complemento_id).map((f) => img(f.id)),
    objetos: v.objetos,
    observacoes: v.observacoes,
    assinatura: v.sem_assinatura_motivo
      ? { tipo: "sem", motivo: v.sem_assinatura_motivo, nome: v.assinado_por_nome }
      : assinaturaCaminho
        ? {
            tipo: "assinada",
            imagem: baixados.has(assinaturaCaminho) ? { bytes: baixados.get(assinaturaCaminho)! } : null,
            nome: v.assinado_por_nome ?? "—",
            em: v.concluida_em,
          }
        : null,
    complementos: complementos.map((c) => ({
      texto: c.texto,
      criadoEm: c.criado_em!,
      criadoPor: c.criado_por_nome ?? "—",
      fotos: fotos.filter((f) => f.complemento_id === c.id).map((f) => img(f.id)),
    })),
    hash: v.hash_conteudo,
    anulada: v.status === "anulada" && v.anulada_em ? { em: v.anulada_em, por: v.anulada_por_nome ?? "o dono", motivo: v.motivo_anulacao ?? "" } : null,
  };

  const numero = dados.numeroOS;
  const nomeArquivo = `vistoria-OS${numero}-${normalizarPlaca(os.placa) || "sem-placa"}${dados.anulada ? "-ANULADA" : ""}.pdf`;
  return { ok: true, dados, nomeArquivo, medicao: { dadosMs, fotosMs, bytesFotos } };
}

/** Baixa do Storage (política de leitura do usuário), com 1 nova tentativa por arquivo. null = algum falhou. */
async function baixarTodos(supabase: Cliente, caminhos: string[]): Promise<Map<string, Uint8Array> | null> {
  const resultado = new Map<string, Uint8Array>();
  const fila = [...new Set(caminhos)];
  let falhou = false;
  const baixar = async (caminho: string) => {
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      const { data, error } = await supabase.storage.from(BUCKET_VISTORIAS).download(caminho);
      if (!error && data) {
        resultado.set(caminho, new Uint8Array(await data.arrayBuffer()));
        return;
      }
    }
    falhou = true;
  };
  const trabalhadores = Array.from({ length: Math.min(DOWNLOADS_PARALELOS, fila.length) }, async () => {
    for (let c = fila.shift(); c !== undefined && !falhou; c = fila.shift()) await baixar(c);
  });
  await Promise.all(trabalhadores);
  return falhou ? null : resultado;
}

// ---------------- fontes (OFL, em src/assets/fonts; incluídas no deploy pelo next.config.ts)

let fontes: Promise<FontesPdf> | null = null;

export function carregarFontesPdf(): Promise<FontesPdf> {
  if (!fontes) {
    const ler = (nome: string) => readFile(join(process.cwd(), "src", "assets", "fonts", nome)).then((b) => new Uint8Array(b));
    fontes = Promise.all([
      ler("Barlow-Medium.ttf"),
      ler("Barlow-Bold.ttf"),
      ler("BarlowCondensed-Bold.ttf"),
      ler("IBMPlexMono-SemiBold.ttf"),
    ]).then(([normal, negrito, condensada, mono]) => ({ normal, negrito, condensada, mono }));
    fontes.catch(() => {
      fontes = null; // tenta ler de novo na próxima requisição
    });
  }
  return fontes;
}
