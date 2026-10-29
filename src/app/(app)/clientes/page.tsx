import type { Metadata } from "next";
import { Suspense } from "react";
import { Contact, Plus } from "lucide-react";
import { Cabecalho } from "@/components/layout/cabecalho";
import { BotaoLink } from "@/components/ui/botao";
import { Busca } from "@/components/ui/busca";
import { CaixaErro, Cartao, Etiqueta, EstadoVazio, ListaCarregando, Pagina } from "@/components/ui/estados";
import { exigirContexto } from "@/lib/dal";
import { formatarTelefone, padraoIlike, param, ROTULO_MODO, soDigitos } from "@/lib/formato";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Clientes" };

export default function ClientesPage({ searchParams }: PageProps<"/clientes">) {
  return (
    <>
      <Cabecalho titulo="Clientes" />
      <Pagina>
        <Suspense fallback={<ListaCarregando />}>
          <Lista searchParams={searchParams} />
        </Suspense>
      </Pagina>
    </>
  );
}

async function Lista({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigirContexto(["dono", "atendente"]);
  const q = param((await searchParams).q);
  const supabase = await createClient();

  let consulta = supabase
    .from("clientes")
    .select("id, nome, telefone, documento, modo_padrao")
    .order("nome")
    .limit(100);
  if (q) {
    const digitos = soDigitos(q);
    consulta =
      digitos.length >= 3 && digitos.length === q.replace(/[\s().\-/]/g, "").length
        ? consulta.or(`telefone.like.*${digitos}*,documento.like.*${digitos}*`)
        : consulta.ilike("nome", padraoIlike(q));
  }
  const { data: clientes, error } = await consulta;

  return (
    <>
      <div className="flex flex-col gap-3">
        <Busca acao="/clientes" rotulo="Buscar por nome, telefone ou CPF/CNPJ" valor={q} />
        <BotaoLink href="/clientes/novo">
          <Plus size={24} strokeWidth={2.25} aria-hidden />
          Novo cliente
        </BotaoLink>
      </div>

      {error ? (
        <CaixaErro tentarDeNovo={q ? `/clientes?q=${encodeURIComponent(q)}` : "/clientes"} />
      ) : !clientes.length ? (
        q ? (
          <EstadoVazio icone={Contact} titulo="Nenhum cliente encontrado." texto={`Nada com "${q}". Confira ou cadastre.`} />
        ) : (
          <EstadoVazio
            icone={Contact}
            titulo="Nenhum cliente ainda."
            texto="Cadastre o primeiro cliente da oficina."
            acao={{ href: "/clientes/novo", rotulo: "Cadastrar cliente" }}
          />
        )
      ) : (
        <ul className="flex flex-col gap-3">
          {clientes.map((c) => (
            <li key={c.id}>
              <Cartao href={`/clientes/${c.id}`}>
                <p className="text-lg font-bold">{c.nome}</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
                  {c.telefone && <span className="font-mono text-base">{formatarTelefone(c.telefone)}</span>}
                  <Etiqueta>{ROTULO_MODO[c.modo_padrao]}</Etiqueta>
                </div>
              </Cartao>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
