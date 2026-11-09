import { Camera, ClipboardList, Send, Wallet, WifiOff, Wrench } from "lucide-react";
import { FaixaTeste } from "@/components/layout/cabecalho";
import { MarcaTopo } from "@/components/layout/marca-topo";
import { LinkWhatsApp } from "@/components/publico/link-whatsapp";
import { ListaVantagens, type Vantagem } from "@/components/publico/lista-vantagens";
import { RodapePublico } from "@/components/publico/rodape-publico";
import { ALTURA_FLEXIVEL, BotaoLink } from "@/components/ui/botao";
import { Etiqueta } from "@/components/ui/estados";

const VANTAGENS: Vantagem[] = [
  {
    icone: ClipboardList,
    titulo: "Ordem de serviço pela placa",
    texto: "Histórico do caminhão, sintoma, código de falha, serviços e peças.",
  },
  {
    icone: Camera,
    titulo: "Vistoria com fotos e assinatura",
    texto: "KM, combustível, checklist e avarias, com PDF para o cliente.",
  },
  { icone: Send, titulo: "Orçamento por link", texto: "O cliente aprova ou recusa pelo WhatsApp, sem instalar nada." },
  { icone: Wrench, titulo: "Mecânico sem ver preço", texto: "Dono, balcão e mecânico, cada um vê só o que precisa." },
  { icone: Wallet, titulo: "Painel do mês", texto: "OS entregues, dinheiro recebido e quem está devendo." },
  {
    icone: WifiOff,
    titulo: "Feito para o pátio",
    texto: "Botões e letras grandes. Foto tirada sem sinal espera a internet voltar e sobe sozinha.",
  },
];

const ROTULO_WHATSAPP = "Falar no WhatsApp (abre o WhatsApp)";

/**
 * Página inicial pública (DESIGN §15.2). Server Component, sem leitura do banco e sem JavaScript próprio.
 * Com sessão, o proxy desvia "/" para "/entrar" antes de chegar aqui (F5-E-3).
 * `whatsapp`: link pronto de `linkWhatsAppSuporte()`, ou null (os dois links somem).
 * `teste`: faixa e selo TESTE (fora de produção).
 */
export function PaginaInicial({ whatsapp, teste }: { whatsapp: string | null; teste: boolean }) {
  return (
    <div className="flex flex-1 flex-col">
      {teste && <FaixaTeste />}
      <div className="flex w-full max-w-[592px] flex-1 flex-col gap-8 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] lg:max-w-[688px] lg:px-16">
        <header>
          <MarcaTopo teste={teste} />
        </header>

        <main className="flex flex-col gap-8">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col items-start gap-3">
              <Etiqueta>Em lançamento</Etiqueta>
              <h1 className="text-4xl text-balance">Ordens de serviço para oficina diesel, do balcão ao pátio.</h1>
            </div>
            <p className="text-lg text-texto-suave">
              Abra a OS pela placa, faça a vistoria com fotos, mande o orçamento por link no WhatsApp e veja quem está
              devendo. Pelo celular, mesmo com internet fraca.
            </p>
            <div className="flex flex-col gap-3">
              <BotaoLink href="/cadastro" variante="secundario" className={ALTURA_FLEXIVEL}>
                Criar conta da oficina
              </BotaoLink>
              <BotaoLink href="/login" variante="primario" className={ALTURA_FLEXIVEL}>
                Entrar
              </BotaoLink>
              <LinkWhatsApp href={whatsapp} rotulo={ROTULO_WHATSAPP}>
                Falar no WhatsApp
              </LinkWhatsApp>
            </div>
            <p className="text-sm text-texto-suave">Funcionário não cria conta aqui: peça ao dono o link de convite.</p>
          </div>

          <section aria-labelledby="vantagens-t" className="flex flex-col gap-4">
            <h2 id="vantagens-t" className="text-3xl">
              O que dá para fazer
            </h2>
            <ListaVantagens itens={VANTAGENS} />
          </section>

          <section aria-labelledby="para-quem-t" className="flex flex-col gap-3">
            <h2 id="para-quem-t" className="text-3xl">
              Para quem é
            </h2>
            <p className="text-base">
              Oficinas pequenas e médias de caminhão, ônibus e máquinas a diesel que hoje controlam as OS no papel, no
              caderno ou na planilha.
            </p>
          </section>

          <section aria-labelledby="lancamento-t" className="flex flex-col gap-3">
            <h2 id="lancamento-t" className="text-3xl">
              Em lançamento
            </h2>
            <p className="text-base">
              {whatsapp
                ? "Estamos começando com poucas oficinas, acompanhadas de perto. Quer usar na sua? Crie a conta ou chame no WhatsApp."
                : "Estamos começando com poucas oficinas, acompanhadas de perto. Quer usar na sua? Crie a conta."}
            </p>
            <p className="text-base">
              Ainda não há preço publicado. Antes de qualquer cobrança, a oficina é avisada com antecedência e decide se
              continua.
            </p>
            <div className="flex flex-col gap-3">
              <BotaoLink href="/cadastro" variante="secundario" className={ALTURA_FLEXIVEL}>
                Criar conta da oficina
              </BotaoLink>
              <LinkWhatsApp href={whatsapp} rotulo={ROTULO_WHATSAPP}>
                Falar no WhatsApp
              </LinkWhatsApp>
            </div>
          </section>
        </main>

        <RodapePublico />
      </div>
    </div>
  );
}
