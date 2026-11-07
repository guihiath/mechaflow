"use client";

import { useEffect, useRef, useState } from "react";
import { HandCoins } from "lucide-react";
import { desfazerPagamentoOS } from "@/acoes/os";
import { FolhaPagamento } from "@/components/os/folha-pagamento";
import { CartaoDevedor, ResumoAReceber, type DadosDevedor, type OSDevedor } from "@/components/painel/cartao-devedor";
import { AvisoDesfazer } from "@/components/ui/aviso-desfazer";
import { EstadoVazio } from "@/components/ui/estados";
import { CaixaMensagem } from "@/components/ui/formulario";
import type { FormaPagamento } from "@/lib/os";

type Aberta = OSDevedor & { cliente: string };
type Desfazer = { chave: number; osId: string; numero: number; forma: FormaPagamento };

/**
 * Lista de quem deve com a folha de pagamento (DESIGN §14.4). Os dados vêm do servidor; depois de
 * registrar, a ação relê a página (`refresh`) e a OS sai da lista sem recarregar a tela, enquanto
 * o "Desfazer" fica 6 s embaixo.
 * Foco depois de registrar: a OS seguinte do cliente; se o cliente saiu, o próximo cliente; se a
 * lista acabou, o estado vazio.
 */
export function ListaAReceber({
  devedores,
  totalCentavos,
  quantidadeOS,
  quantidadeClientes,
  hoje,
  ehDono,
}: {
  devedores: DadosDevedor[];
  /** Só para o dono (DESIGN §14.5). */
  totalCentavos: number | null;
  quantidadeOS: number;
  quantidadeClientes: number;
  hoje: string;
  ehDono: boolean;
}) {
  const [aberta, setAberta] = useState<Aberta | null>(null);
  const [desfazer, setDesfazer] = useState<Desfazer | null>(null);
  const [recado, setRecado] = useState<{ tipo: "erro" | "info"; texto: string } | null>(null);
  const contador = useRef(0);
  const alvo = useRef<{ osId: string; href: string } | null>(null);
  const refVazio = useRef<HTMLDivElement>(null);

  // A lista nova chegou do servidor: põe o foco onde o DESIGN pede.
  useEffect(() => {
    const a = alvo.current;
    if (!a) return;
    if (devedores.some((d) => d.os.some((o) => o.id === a.osId))) return; // ainda é a lista antiga
    alvo.current = null;
    if (a.href === "") refVazio.current?.focus();
    else document.querySelector<HTMLAnchorElement>(`a[href="${CSS.escape(a.href)}"]`)?.focus();
  }, [devedores]);

  /** Para onde vai o foco depois que esta OS sair da lista. */
  function proximoAlvo(osId: string): string {
    const i = devedores.findIndex((d) => d.os.some((o) => o.id === osId));
    if (i < 0) return "";
    const d = devedores[i];
    const j = d.os.findIndex((o) => o.id === osId);
    const seguinte = d.os[j + 1] ?? d.os[j - 1] ?? devedores[i + 1]?.os[0] ?? devedores[i - 1]?.os[0];
    return seguinte?.href ?? "";
  }

  async function aoDesfazer(d: Desfazer) {
    const r = await desfazerPagamentoOS(d.osId, d.forma).catch(() => null);
    setDesfazer(null);
    if (!r?.ok) setRecado({ tipo: "erro", texto: r?.erro ?? "Não foi possível desfazer. Confira a internet e abra a OS para corrigir." });
  }

  return (
    <>
      {recado && <CaixaMensagem tipo={recado.tipo}>{recado.texto}</CaixaMensagem>}

      {devedores.length === 0 ? (
        <div ref={refVazio} tabIndex={-1} className="outline-none">
          <EstadoVazio
            icone={HandCoins}
            titulo="Nada a receber."
            texto="Quando uma OS for entregue sem pagamento, ela aparece aqui."
            acao={ehDono ? { href: "/painel", rotulo: "Voltar ao painel", variante: "secundario" } : { href: "/os", rotulo: "Ver OS", variante: "secundario" }}
          />
        </div>
      ) : (
        <>
          <ResumoAReceber totalCentavos={ehDono ? totalCentavos : null} quantidadeOS={quantidadeOS} quantidadeClientes={quantidadeClientes} />
          <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start">
            {devedores.map((d) => (
              <CartaoDevedor
                key={d.clienteId}
                devedor={d}
                hoje={hoje}
                aoRegistrar={(os) => {
                  setRecado(null);
                  setAberta({ ...os, cliente: d.nome });
                }}
              />
            ))}
          </div>
        </>
      )}

      {aberta && (
        <FolhaPagamento
          key={aberta.id}
          naLista
          os={{
            id: aberta.id,
            totalCentavos: aberta.totalCentavos,
            formaPagamento: aberta.formaPagamento ?? null,
            identificacao: { numero: aberta.numero, placa: aberta.placa, cliente: aberta.cliente },
          }}
          aoFechar={() => setAberta(null)}
          aoRegistrar={(forma) => {
            alvo.current = { osId: aberta.id, href: proximoAlvo(aberta.id) };
            setDesfazer({ chave: ++contador.current, osId: aberta.id, numero: aberta.numero, forma: aberta.formaPagamento ?? forma });
            setAberta(null);
          }}
          aoJaRegistrado={(texto) => {
            setAberta(null);
            setRecado({ tipo: "info", texto });
          }}
        />
      )}

      {desfazer && (
        <AvisoDesfazer
          key={desfazer.chave}
          mensagem={`Pagamento da OS #${desfazer.numero} registrado.`}
          aoDesfazer={() => aoDesfazer(desfazer)}
          aoSumir={() => setDesfazer(null)}
        />
      )}
    </>
  );
}
