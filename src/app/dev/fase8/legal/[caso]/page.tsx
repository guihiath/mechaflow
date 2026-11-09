import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlocoDefinicoes } from "@/components/legal/bloco-definicoes";
import { classesLinkLegal, DocumentoLegal, type SecaoLegal } from "@/components/legal/documento-legal";
import { CONTATO_ENCARREGADO_RASCUNHO, SECOES_PRIVACIDADE, secoesTermos } from "@/components/legal/textos";
import { EH_PRODUCAO } from "@/lib/brand";
import { linkWhatsAppSuporte } from "@/lib/suporte";
import { TERMOS_VERSAO } from "@/lib/termos";
import { CASOS_LEGAL, NUMERO_FICTICIO, type CasoLegal } from "../../casos";

export const metadata: Metadata = {
  title: "Vitrine Fase 8 · texto legal",
  robots: { index: false, follow: false },
};

export function generateStaticParams() {
  return Object.keys(CASOS_LEGAL).map((caso) => ({ caso }));
}

const EMAIL_LONGO = "encarregado.de.dados.pessoais.do.sistema.mechaflow@exemplo-de-dominio-bem-comprido.com.br";

const SECOES_TABELA: SecaoLegal[] = [
  {
    titulo: "Por quanto tempo guardamos",
    conteudo: (
      <BlocoDefinicoes
        legenda="Prazos de guarda (exemplo)"
        colunas={["Dado", "Para quê", "Por quanto tempo"]}
        linhas={[
          ["Dados da oficina e dos clientes dela", "Fazer o sistema funcionar", "Enquanto a oficina usar o MechaFlow"],
          ["Registro do aceite dos termos (com IP)", "Prova do aceite", "5 anos depois do fim da conta"],
          ["IP e navegador da resposta ao orçamento", "Comprovante da resposta", "12 meses"],
          ["Registros de acesso", "Segurança e obrigação legal", "Pelo menos 6 meses"],
          ["Cópias de segurança", "Recuperar o sistema em caso de falha", "7 dias, em rodízio"],
        ]}
      />
    ),
  },
  {
    titulo: "Como fazer um pedido",
    conteudo: (
      <p>
        Mande o pedido para{" "}
        <a href={`mailto:${EMAIL_LONGO}`} className={classesLinkLegal}>
          {EMAIL_LONGO}
        </a>{" "}
        ou veja https://www.exemplo-de-dominio-bem-comprido.com.br/privacidade/pedidos-do-titular-dos-dados. Respondemos em
        até 15 dias.
      </p>
    ),
  },
  { titulo: "Seus direitos", conteudo: <p>Texto de exemplo, só para a vitrine.</p> },
  { titulo: "Cookies", conteudo: <p>Texto de exemplo, só para a vitrine.</p> },
];

/** Termos e Privacidade em tela inteira, com casos extremos. Dados fictícios. Em produção: 404. */
export default async function VitrineLegal({ params }: { params: Promise<{ caso: string }> }) {
  const { caso } = await params;
  if (EH_PRODUCAO || !(caso in CASOS_LEGAL)) notFound();
  const c = caso as CasoLegal;
  const whatsapp = c === "sem-whatsapp" ? null : linkWhatsAppSuporte("Olá! Tenho uma dúvida: ", NUMERO_FICTICIO);

  if (c === "termos" || c === "termos-producao" || c === "curto") {
    const secoes = secoesTermos({ teste: c === "termos" });
    return (
      <DocumentoLegal
        titulo="Termos de uso"
        versao={TERMOS_VERSAO}
        rascunho
        secoes={c === "curto" ? secoes.slice(0, 3) : secoes}
        perguntaFim="Dúvidas sobre os termos?"
        whatsapp={whatsapp}
        outra={{ href: "/privacidade", rotulo: "Política de privacidade" }}
        teste={c !== "termos-producao"}
      />
    );
  }
  return (
    <DocumentoLegal
      titulo="Política de privacidade"
      versao={TERMOS_VERSAO}
      rascunho
      secoes={c === "tabela-email" ? SECOES_TABELA : SECOES_PRIVACIDADE}
      perguntaFim="Dúvidas sobre seus dados?"
      contatoEncarregado={
        c === "tabela-email" ? (
          <p>
            Encarregado de dados:{" "}
            <a href={`mailto:${EMAIL_LONGO}`} className={classesLinkLegal}>
              {EMAIL_LONGO}
            </a>
          </p>
        ) : (
          CONTATO_ENCARREGADO_RASCUNHO
        )
      }
      whatsapp={whatsapp}
      outra={{ href: "/termos", rotulo: "Termos de uso" }}
      teste
    />
  );
}
