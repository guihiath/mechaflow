import { Suspense } from "react";
import { FotosOS, type FotoDaGrade } from "@/components/fotos/fotos-os";
import { BUCKET_FOTOS, VALIDADE_URL_FOTO_S } from "@/lib/fotos/regras";
import { CATEGORIAS_FOTO, type CategoriaFoto } from "@/lib/formato";
import { createClient } from "@/lib/supabase/server";

/**
 * Seção "Fotos" (DESIGN §11.5) com Suspense próprio: não segura o resto do detalhe.
 * Lê `vw_os_fotos` (só enviadas, RLS da OS) e assina as MINIATURAS com a sessão
 * do usuário: a política de SELECT do Storage decide quem consegue assinar.
 */
export function FotosDaOS(props: { osId: string; podeEnviar: boolean; ehMecanico?: boolean }) {
  return (
    <Suspense fallback={<FotosCarregando />}>
      <Lista {...props} />
    </Suspense>
  );
}

async function Lista({ osId, podeEnviar, ehMecanico }: { osId: string; podeEnviar: boolean; ehMecanico?: boolean }) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vw_os_fotos")
    .select("id, categoria, legenda, caminho_miniatura, criado_por_nome, enviada_em")
    .eq("os_id", osId)
    .order("enviada_em", { ascending: false });

  const linhas = (data ?? []).filter((f) => f.id && f.caminho_miniatura);
  const urls = new Map<string, string>();
  if (linhas.length) {
    const { data: assinadas } = await supabase.storage
      .from(BUCKET_FOTOS)
      .createSignedUrls(
        linhas.map((f) => f.caminho_miniatura!),
        VALIDADE_URL_FOTO_S,
      );
    for (const s of assinadas ?? []) if (s.path && s.signedUrl && !s.error) urls.set(s.path, s.signedUrl);
  }

  const fotos: FotoDaGrade[] = linhas.map((f) => ({
    id: f.id!,
    categoria: (CATEGORIAS_FOTO as readonly string[]).includes(f.categoria ?? "") ? (f.categoria as CategoriaFoto) : "outro",
    legenda: f.legenda,
    url: urls.get(f.caminho_miniatura!) ?? null,
    criadoPorNome: f.criado_por_nome,
    enviadaEm: f.enviada_em,
  }));

  return <FotosOS osId={osId} podeEnviar={podeEnviar} fotos={fotos} erroLista={Boolean(error)} ehMecanico={ehMecanico} />;
}

function FotosCarregando() {
  return (
    <section aria-label="Fotos" className="flex flex-col gap-3">
      <h2 className="text-2xl">Fotos</h2>
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="aspect-square animate-pulse rounded-md bg-superficie-2 motion-reduce:animate-none" />
        ))}
      </div>
      <span className="sr-only">Carregando as fotos…</span>
    </section>
  );
}
