import { Suspense } from "react";
import { FotosOS, type FotoDaGrade } from "@/components/fotos/fotos-os";
import type { Papel } from "@/lib/contexto";
import { BUCKET_FOTOS, VALIDADE_URL_FOTO_S } from "@/lib/fotos/regras";
import { CATEGORIAS_FOTO, type CategoriaFoto } from "@/lib/formato";
import { createClient } from "@/lib/supabase/server";

type Props = { osId: string; numeroOS: number | null; usuarioId: string; papel: Papel; podeEnviar: boolean };

/**
 * Seção "Fotos" (DESIGN §11.5) com Suspense próprio: não segura o resto do detalhe.
 * Lê `vw_os_fotos` (só enviadas, RLS da OS) e assina as MINIATURAS com a sessão
 * do usuário: a política de SELECT do Storage decide quem consegue assinar.
 * Depois disso, a seção relê e renova as URLs pelo navegador (F3-B5).
 */
export function FotosDaOS(props: Props) {
  return (
    <Suspense fallback={<FotosCarregando />}>
      <Lista {...props} />
    </Suspense>
  );
}

async function Lista({ osId, ...resto }: Props) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vw_os_fotos")
    .select("id, categoria, legenda, caminho, caminho_miniatura, criado_por_nome, enviada_em, pode_apagar")
    .eq("os_id", osId)
    .order("enviada_em", { ascending: false });

  const linhas = (data ?? []).filter((f) => f.id && f.caminho && f.caminho_miniatura);
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
  // eslint-disable-next-line react-hooks/purity -- marca de quando as URLs foram assinadas (renovação no navegador)
  const assinadasEm = Date.now();

  const fotos: FotoDaGrade[] = linhas.map((f) => ({
    id: f.id!,
    categoria: (CATEGORIAS_FOTO as readonly string[]).includes(f.categoria ?? "") ? (f.categoria as CategoriaFoto) : "outro",
    legenda: f.legenda,
    caminho: f.caminho!,
    caminhoMiniatura: f.caminho_miniatura!,
    url: urls.get(f.caminho_miniatura!) ?? null,
    criadoPorNome: f.criado_por_nome,
    enviadaEm: f.enviada_em,
    podeApagar: Boolean(f.pode_apagar),
  }));

  return <FotosOS osId={osId} fotos={fotos} assinadasEm={assinadasEm} erroLista={Boolean(error)} {...resto} />;
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
