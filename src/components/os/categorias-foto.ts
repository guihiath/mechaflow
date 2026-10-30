import {
  Image as IconeImagem,
  PackageCheck,
  PackageX,
  StepBack,
  StepForward,
  Stethoscope,
  Truck,
  type LucideIcon,
} from "lucide-react";
import type { Database } from "@/lib/supabase/database.types";

/** Tipo (categoria) da foto da OS, igual ao enum `categoria_foto` do banco. */
export type CategoriaFoto = Database["public"]["Enums"]["categoria_foto"];

/**
 * Rotulos e icones dos tipos de foto (DESIGN §11.4), na ordem fixa da grade.
 * "Outro" fica por ultimo (largura total na ultima linha).
 */
export const CATEGORIAS_FOTO: readonly { valor: CategoriaFoto; rotulo: string; icone: LucideIcon }[] = [
  { valor: "diagnostico", rotulo: "Diagnóstico", icone: Stethoscope },
  { valor: "peca_defeituosa", rotulo: "Peça com defeito", icone: PackageX },
  { valor: "peca_trocada", rotulo: "Peça trocada", icone: PackageCheck },
  { valor: "antes", rotulo: "Antes", icone: StepBack },
  { valor: "depois", rotulo: "Depois", icone: StepForward },
  { valor: "entrega", rotulo: "Entrega", icone: Truck },
  { valor: "outro", rotulo: "Outro", icone: IconeImagem },
];

export function rotuloCategoriaFoto(valor: CategoriaFoto): string {
  return CATEGORIAS_FOTO.find((c) => c.valor === valor)?.rotulo ?? "Outro";
}

const FUSO = "America/Sao_Paulo";
const dia = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit" });
const hora = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" });

/** ISO (UTC) -> "29/10 às 14:32" em America/Sao_Paulo (alt das miniaturas e tela cheia). */
export function formatarDiaHoraFoto(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${dia.format(d)} às ${hora.format(d)}`;
}

/** "1 foto" / "3 fotos". */
export function fotos(n: number): string {
  return n === 1 ? "1 foto" : `${n} fotos`;
}
