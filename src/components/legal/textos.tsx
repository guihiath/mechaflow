import Link from "next/link";
import type { ReactNode } from "react";
import { BlocoDefinicoes } from "@/components/legal/bloco-definicoes";
import { classesLinkLegal, type SecaoLegal } from "@/components/legal/documento-legal";
import { PRAZO_GUARDA_REDE } from "@/lib/orcamento";

/*
 * TEXTOS PROVISÓRIOS (RASCUNHO). Base: o texto antigo de /termos, repartido como pede o DESIGN §15.3
 * (itens 1, 2 e 5 em Termos; 3 e 4 em Privacidade). A estrutura da Privacidade segue o mapa LGPD
 * (ARQUITETURA §16); onde o texto depende do advogado (F8-C2 / F8-G5), fica o marcador
 * "[texto do advogado]". O texto revisado entra no F8-B4, junto com a versão nova (TERMOS_VERSAO
 * em src/lib/termos.ts + migração em private.versao_termos_vigente()).
 */

/** Marcador visível do que ainda depende do advogado. */
export function TextoAdvogado({ children }: { children?: ReactNode }) {
  return (
    <p className="font-bold text-alerta-texto">
      [texto do advogado{children ? <>: {children}</> : null}]
    </p>
  );
}

export function secoesTermos({ teste }: { teste: boolean }): SecaoLegal[] {
  const secoes: SecaoLegal[] = [
    {
      titulo: "O que é o MechaFlow",
      conteudo: (
        <p>
          O MechaFlow é um sistema para oficinas organizarem ordens de serviço, clientes, veículos, catálogo de serviços
          e peças. A oficina que cria a conta é a responsável pelos dados que cadastra.
        </p>
      ),
    },
    {
      titulo: "Conta e acesso",
      conteudo: (
        <p>
          Cada pessoa usa o próprio e-mail e senha e pertence a uma oficina. O dono da oficina convida a equipe, define o
          papel de cada um (dono, atendente ou mecânico) e pode desativar o acesso a qualquer momento. Não compartilhe sua
          senha.
        </p>
      ),
    },
    {
      titulo: "Dados pessoais",
      conteudo: (
        <p>
          Como guardamos e usamos os dados pessoais está na{" "}
          <Link href="/privacidade" className={classesLinkLegal}>
            Política de privacidade
          </Link>
          .
        </p>
      ),
    },
    {
      titulo: "Registro do aceite",
      conteudo: (
        <p>
          Guardamos a data, a versão destes termos e, quando disponível, o endereço IP e o navegador usados no aceite,
          como prova. Se os termos mudarem, pediremos um novo aceite.
        </p>
      ),
    },
  ];
  if (teste) {
    secoes.push({
      titulo: "Ambiente de teste",
      conteudo: <p>Neste ambiente de teste use apenas dados fictícios. Os dados podem ser apagados a qualquer momento.</p>,
    });
  }
  return secoes;
}

export const SECOES_PRIVACIDADE: SecaoLegal[] = [
  {
    titulo: "Quem somos",
    conteudo: (
      <>
        <p>
          O MechaFlow é o sistema que a oficina usa para organizar ordens de serviço, clientes e veículos. A oficina que
          cria a conta é a responsável pelos dados que cadastra.
        </p>
        <TextoAdvogado>quem opera o MechaFlow (pessoa ou empresa), papéis de controlador e operador</TextoAdvogado>
      </>
    ),
  },
  {
    titulo: "Que dados guardamos",
    conteudo: (
      <>
        <p>
          Guardamos os dados que a oficina cadastra (por exemplo, nome, telefone e documento de clientes, placas de
          veículos, fotos e assinaturas) só para fazer o sistema funcionar. Cada oficina vê apenas os próprios dados.
          Fotos e assinaturas ficam em armazenamento privado.
        </p>
        <ul>
          <li>
            <strong className="font-bold">De quem usa o app</strong> (dono, atendente, mecânico): e-mail, nome,
            telefone, papel na oficina e o registro do aceite destes termos.
          </li>
          <li>
            <strong className="font-bold">Dos clientes da oficina</strong>: o que a oficina cadastrar, como nome,
            documento, telefone, veículos, ordens de serviço, fotos, vistorias e orçamentos.
          </li>
          <li>
            <strong className="font-bold">De quem responde um orçamento pelo link</strong>: a resposta, o nome
            informado, a data e a hora, o IP e o navegador.
          </li>
        </ul>
        <TextoAdvogado />
      </>
    ),
  },
  {
    titulo: "Para que usamos",
    conteudo: <TextoAdvogado>finalidades e bases legais de cada grupo de dados</TextoAdvogado>,
  },
  {
    titulo: "Com quem compartilhamos",
    conteudo: (
      <>
        <p>Não vendemos dados. Usamos estes serviços para o sistema funcionar:</p>
        <ul>
          <li>Supabase: banco de dados, login e arquivos, em São Paulo.</li>
          <li>Vercel: hospedagem do app, com funções em São Paulo.</li>
          <li>Resend: envio dos e-mails do app, como o de recuperar a senha.</li>
          <li>WhatsApp: quando a oficina manda um orçamento, PDF ou convite, quem envia é a própria oficina.</li>
        </ul>
        <TextoAdvogado>transferência internacional (rede de entrega, registros de acesso e suporte desses serviços)</TextoAdvogado>
      </>
    ),
  },
  {
    titulo: "Por quanto tempo guardamos",
    conteudo: (
      <>
        <BlocoDefinicoes
          legenda="Prazos de guarda"
          colunas={["Dado", "Para quê", "Por quanto tempo"]}
          linhas={[
            ["Dados da oficina e dos clientes dela", "Fazer o sistema funcionar", "[texto do advogado]"],
            ["Registro do aceite dos termos", "Prova do aceite", "[texto do advogado]"],
            ["IP e navegador da resposta ao orçamento", "Comprovante da resposta", PRAZO_GUARDA_REDE],
            ["Registros de acesso", "Segurança e obrigação legal", "[texto do advogado]"],
            ["Cópias de segurança", "Recuperar o sistema em caso de falha", "[texto do advogado]"],
          ]}
        />
        <TextoAdvogado>o que acontece com os dados quando a oficina deixa de usar o MechaFlow</TextoAdvogado>
      </>
    ),
  },
  {
    titulo: "Uso anonimizado",
    conteudo: (
      <>
        <p>
          Ao aceitar, você autoriza o uso de dados anonimizados (sem nome, documento, telefone ou placa que identifique
          alguém), como sintomas, códigos de falha, causas e soluções, para melhorar o MechaFlow, inclusive futuras
          sugestões de diagnóstico. O sistema sugere; quem decide é sempre o profissional da oficina.
        </p>
        <TextoAdvogado />
      </>
    ),
  },
  {
    titulo: "Seus direitos",
    conteudo: (
      <>
        <p>
          A oficina, como controladora, deve informar seus clientes sobre o uso desses dados. O titular pode pedir acesso,
          correção ou exclusão dos seus dados à oficina ou ao suporte do MechaFlow.
        </p>
        <TextoAdvogado>lista dos direitos da LGPD</TextoAdvogado>
      </>
    ),
  },
  {
    titulo: "Como fazer um pedido",
    conteudo: (
      <TextoAdvogado>canal do pedido (WhatsApp e e-mail), como confirmamos quem pede e o prazo de resposta</TextoAdvogado>
    ),
  },
  {
    titulo: "Cookies",
    conteudo: (
      <p>
        O app usa só os cookies necessários para manter você conectado. Não usamos cookie de publicidade, pixel nem
        ferramenta de análise de terceiros.
      </p>
    ),
  },
  {
    titulo: "Mudanças nesta política",
    conteudo: (
      <p>
        Se esta política mudar, a versão e a data no topo mudam e pediremos um novo aceite na próxima entrada no app.
      </p>
    ),
  },
];

/** Fim da Privacidade: lugar reservado para o canal do encarregado (DESIGN §15.3). */
export const CONTATO_ENCARREGADO_RASCUNHO = <TextoAdvogado>e-mail do encarregado de dados</TextoAdvogado>;
