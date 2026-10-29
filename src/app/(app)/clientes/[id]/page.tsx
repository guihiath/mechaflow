import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { MessageCircle, Plus, Truck } from "lucide-react";
import { Cabecalho } from "@/components/layout/cabecalho";
import { BotaoLink, classesBotao } from "@/components/ui/botao";
import { ConfirmarAcao } from "@/components/ui/confirmar-acao";
import { CaixaErro, Cartao, ChipPlaca, FormularioCarregando, Pagina } from "@/components/ui/estados";
import { CaixaMensagem } from "@/components/ui/formulario";
import { LimparUrl } from "@/components/ui/limpar-url";
import { excluirCliente } from "@/acoes/clientes";
import { exigirContexto } from "@/lib/dal";
import { formatarPlaca, linkWhatsApp, param, ROTULO_TIPO_VEICULO } from "@/lib/formato";
import { createClient } from "@/lib/supabase/server";
import { FormCliente } from "../form-cliente";

export const metadata: Metadata = { title: "Cliente" };

export default function ClientePage({ params, searchParams }: PageProps<"/clientes/[id]">) {
  return (
    <>
      <Cabecalho titulo="Cliente" voltar="/clientes" />
      <Pagina>
        <Suspense fallback={<FormularioCarregando />}>
          <Conteudo params={params} searchParams={searchParams} />
        </Suspense>
      </Pagina>
    </>
  );
}

async function Conteudo({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await exigirContexto(["dono", "atendente"]);
  const { id } = await params;
  const salvo = param((await searchParams).salvo) === "1";
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const [{ data: cliente, error }, { data: veiculos }] = await Promise.all([
    supabase
      .from("clientes")
      .select("id, nome, telefone, documento, email, modo_padrao, observacoes")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("veiculos").select("id, placa, tipo, marca, modelo, ano_modelo").eq("cliente_id", id).order("placa"),
  ]);

  if (error) return <CaixaErro tentarDeNovo={`/clientes/${id}`} />;
  if (!cliente) notFound();

  const whats = linkWhatsApp(cliente.telefone);

  return (
    <>
      {salvo && <CaixaMensagem tipo="sucesso">Cliente cadastrado.</CaixaMensagem>}
      {salvo && <LimparUrl />}
      <h2 className="text-3xl">{cliente.nome}</h2>
      {whats && (
        <a href={whats} target="_blank" rel="noopener noreferrer" className={classesBotao("secundario")}>
          <MessageCircle size={24} strokeWidth={2.25} aria-hidden />
          Chamar no WhatsApp
        </a>
      )}

      <section className="flex flex-col gap-3">
        <h3 className="text-2xl">Veículos</h3>
        {veiculos?.length ? (
          <ul className="flex flex-col gap-3">
            {veiculos.map((v) => (
              <li key={v.id}>
                <Cartao href={`/veiculos/${v.id}`}>
                  <ChipPlaca placa={formatarPlaca(v.placa)} />
                  <p className="mt-2 text-lg font-bold">
                    {[v.marca, v.modelo, v.ano_modelo].filter(Boolean).join(" ") || ROTULO_TIPO_VEICULO[v.tipo]}
                  </p>
                </Cartao>
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex items-center gap-2 text-base text-texto-suave">
            <Truck size={22} aria-hidden /> Nenhum veículo deste cliente.
          </p>
        )}
        <BotaoLink href={`/veiculos/novo?cliente=${cliente.id}`} variante="secundario">
          <Plus size={24} strokeWidth={2.25} aria-hidden />
          Adicionar veículo
        </BotaoLink>
      </section>

      <section className="flex flex-col gap-4">
        <h3 className="text-2xl">Dados do cliente</h3>
        <FormCliente cliente={cliente} />
      </section>

      {ctx.papel === "dono" && (
        <section className="flex flex-col gap-3 border-t border-borda-sutil pt-6">
          <ConfirmarAcao
            acao={excluirCliente.bind(null, cliente.id)}
            rotulo="Excluir cliente"
            pergunta={`Excluir o cliente ${cliente.nome}? Isso não pode ser desfeito.`}
            rotuloConfirmar={`Excluir ${cliente.nome}`}
            rotuloEnviando="Excluindo…"
          />
        </section>
      )}
    </>
  );
}
