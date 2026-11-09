"use client";

import { useState, useTransition } from "react";
import { Check, Copy, KeyRound, MessageCircle } from "lucide-react";
import { Botao, classesBotao, classesFantasma } from "@/components/ui/botao";
import { CaixaMensagem } from "@/components/ui/formulario";
import { gerarLinkSenhaMembro } from "@/acoes/equipe";
import { formatarDataHora, linkWhatsApp } from "@/lib/formato";

/** Fantasma sem a cor padrão, para trocar a cor sem disputa de classes. */
const fantasmaSemCor = classesFantasma.replace(" text-texto ", " ");

type Gerado = { link: string; validoAte: string; nome: string; telefone: string };

/**
 * F8-P3 (ARQUITETURA 15.12): o dono gera o link para o funcionário criar uma senha nova e manda
 * pelo WhatsApp. O link só fica nesta tela (estado do componente): nada é guardado.
 */
export function LinkSenha({ id, nome }: { id: string; nome: string }) {
  const [gerado, setGerado] = useState<Gerado | null>(null);
  const [erro, setErro] = useState<string>();
  const [copiado, setCopiado] = useState(false);
  const [enviando, iniciar] = useTransition();

  function gerar() {
    if (enviando) return;
    setErro(undefined);
    setCopiado(false);
    iniciar(async () => {
      const r = await gerarLinkSenhaMembro(id);
      const d = r?.dados;
      if (r?.erro || !d?.link) {
        setGerado(null);
        setErro(r?.erro ?? "Não foi possível gerar o link agora. Tente de novo em instantes.");
        return;
      }
      setGerado({ link: d.link, validoAte: d.validoAte, nome: d.nome, telefone: d.telefone });
    });
  }

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
    const valido = formatarDataHora(gerado.validoAte);
    const mensagem =
      `Olá, ${gerado.nome}! Este é o link para você criar uma senha nova no MechaFlow ` +
      `(vale até ${valido}, uma vez só). Abra, toque em Continuar e crie a senha:\n${gerado.link}`;
    const whatsapp = linkWhatsApp(gerado.telefone, mensagem) ?? `https://wa.me/?text=${encodeURIComponent(mensagem)}`;
    return (
      <div className="mt-3 flex flex-col gap-3 rounded-lg border-2 border-grafite bg-superficie p-4">
        <h3 className="text-xl">Link de senha de {gerado.nome}</h3>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-base">
          <li>Vale por 1 hora (até {valido}) e funciona uma vez só.</li>
          <li>Gerar de novo cancela este link.</li>
          <li>Mande só para a própria pessoa: quem abrir entra na conta dela.</li>
        </ul>
        <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={classesBotao("primario")}>
          <MessageCircle size={24} strokeWidth={2.25} aria-hidden />
          Enviar pelo WhatsApp
        </a>
        <Botao variante="secundario" onClick={copiar}>
          {copiado ? <Check size={24} strokeWidth={2.25} aria-hidden /> : <Copy size={24} strokeWidth={2.25} aria-hidden />}
          {copiado ? "Link copiado" : "Copiar link"}
        </Botao>
        {copiado && <CaixaMensagem tipo="sucesso">Link copiado. Cole na conversa com {gerado.nome}.</CaixaMensagem>}
        <details>
          <summary className="flex min-h-toque cursor-pointer items-center text-base font-bold text-info-texto underline">
            Ver o link
          </summary>
          <p className="mt-2 break-all rounded-md bg-superficie-2 p-3 font-mono text-sm">{gerado.link}</p>
        </details>
        <button
          type="button"
          onClick={() => {
            setGerado(null);
            setCopiado(false);
          }}
          className="min-h-toque text-left text-base font-bold text-info-texto underline"
        >
          Fechar
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      <button
        type="button"
        onClick={gerar}
        disabled={enviando}
        aria-label={`Gerar link de senha para ${nome}`}
        className={`${fantasmaSemCor} self-start text-info-texto disabled:opacity-60`}
      >
        <KeyRound size="1.25em" strokeWidth={2.25} aria-hidden className="shrink-0" />
        {enviando ? "Gerando…" : "Esqueceu a senha? Gerar link"}
      </button>
      {erro && <CaixaMensagem tipo="erro">{erro}</CaixaMensagem>}
    </div>
  );
}
