"use client";

import { useCallback, useState } from "react";
import { Check, Copy, MessageCircle, UserPlus } from "lucide-react";
import { Botao, classesBotao } from "@/components/ui/botao";
import { Campo, OpcoesBotoes, Selecao } from "@/components/ui/campo";
import { CaixaMensagem, Formulario } from "@/components/ui/formulario";
import { criarConvite } from "@/acoes/equipe";
import type { EstadoAcao } from "@/lib/acao";
import { formatarDataHora } from "@/lib/formato";

type Gerado = { link: string; mensagem: string; expira: string; nome: string; papel: string };

/** Gerar convite + enviar por WhatsApp (wa.me) ou copiar (ARQUITETURA 8). */
export function Convidar({ oficina }: { oficina: string }) {
  const [aberto, setAberto] = useState(false);
  const [gerado, setGerado] = useState<Gerado | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [rodada, setRodada] = useState(0);

  const aoConcluir = useCallback(
    (estado: EstadoAcao) => {
      const d = estado?.dados;
      if (!d?.token) return;
      const link = `${window.location.origin}/convite/${d.token}`;
      const papel = d.papel === "mecanico" ? "mecânico" : "atendente";
      const expira = formatarDataHora(d.expira_em);
      const mensagem =
        `Olá${d.nome ? `, ${d.nome}` : ""}! Você foi convidado para a equipe da ${oficina} no MechaFlow como ${papel}. ` +
        `Abra o link para criar seu acesso (vale até ${expira}):\n${link}`;
      setGerado({ link, mensagem, expira, nome: d.nome, papel });
      setCopiado(false);
    },
    [oficina],
  );

  async function copiar() {
    if (!gerado) return;
    try {
      await navigator.clipboard.writeText(gerado.link);
      setCopiado(true);
    } catch {
      window.prompt("Copie o link:", gerado.link);
    }
  }

  if (gerado) {
    return (
      <section className="flex flex-col gap-3 rounded-lg border-2 border-grafite bg-superficie p-4">
        <h2 className="text-2xl">Convite pronto</h2>
        <p className="text-base">
          {gerado.nome ? `${gerado.nome}, ` : ""}
          {gerado.papel}. Vale até {gerado.expira}. Funciona uma vez só.
        </p>
        <p className="break-all rounded-md bg-superficie-2 p-3 font-mono text-sm">{gerado.link}</p>
        <Botao variante="secundario" onClick={copiar}>
          {copiado ? <Check size={24} strokeWidth={2.25} aria-hidden /> : <Copy size={24} strokeWidth={2.25} aria-hidden />}
          {copiado ? "Link copiado" : "Copiar link"}
        </Botao>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(gerado.mensagem)}`}
          target="_blank"
          rel="noopener noreferrer"
          className={classesBotao("primario")}
        >
          <MessageCircle size={24} strokeWidth={2.25} aria-hidden />
          Enviar por WhatsApp
        </a>
        <button
          type="button"
          onClick={() => {
            setGerado(null);
            setRodada((r) => r + 1);
          }}
          className="min-h-toque text-left text-base font-bold text-info-texto underline"
        >
          Gerar outro convite
        </button>
        {copiado && <CaixaMensagem tipo="sucesso">Link copiado. Cole na conversa com a pessoa.</CaixaMensagem>}
      </section>
    );
  }

  if (!aberto) {
    return (
      <Botao onClick={() => setAberto(true)}>
        <UserPlus size={24} strokeWidth={2.25} aria-hidden />
        Convidar pessoa
      </Botao>
    );
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-borda-sutil bg-superficie p-4">
      <h2 className="text-2xl">Convidar pessoa</h2>
      <Formulario
        key={rodada}
        acao={criarConvite}
        rotulo="Gerar link de convite"
        rotuloEnviando="Gerando…"
        aoConcluir={aoConcluir}
        acoesExtras={
          <Botao variante="secundario" onClick={() => setAberto(false)}>
            Voltar
          </Botao>
        }
      >
        <OpcoesBotoes
          rotulo="Papel"
          name="papel"
          valorInicial="mecanico"
          opcoes={[
            { valor: "mecanico", rotulo: "Mecânico" },
            { valor: "atendente", rotulo: "Atendente" },
          ]}
          ajuda="Mecânico não vê preços nem custos. Atendente vê preço, não vê custo."
        />
        <Campo rotulo="Nome da pessoa" name="nome_sugerido" opcional maxLength={80} autoComplete="off" />
        <Selecao
          rotulo="Validade do link"
          name="validade"
          defaultValue="72"
          opcoes={[
            { valor: "24", rotulo: "24 horas" },
            { valor: "72", rotulo: "3 dias" },
            { valor: "168", rotulo: "7 dias" },
          ]}
        />
      </Formulario>
    </section>
  );
}
