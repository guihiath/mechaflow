import Link from "next/link";
import { BlocoDefinicoes } from "@/components/legal/bloco-definicoes";
import { classesLinkLegal, type SecaoLegal } from "@/components/legal/documento-legal";
import { PRAZO_GUARDA_REDE } from "@/lib/orcamento";

/*
 * Textos de /termos e /privacidade (DESIGN §15.3; itens 1, 2 e 5 em Termos, 3 e 4 em Privacidade;
 * estrutura da Privacidade pelo mapa LGPD, ARQUITETURA §16).
 *
 * Dado que ainda falta (razão social, CNPJ, e-mail do encarregado, prazos a decidir) fica como
 * "(confirmar: …)" em DADOS_PENDENTES/PRAZOS abaixo. Enquanto houver algum, TEXTO_LEGAL_PENDENTE
 * é true, a página mostra o aviso de RASCUNHO e o scripts/conferir-producao.mjs falha.
 *
 * Mudou o texto? Trocar TERMOS_VERSAO (src/lib/termos.ts) + migração em private.versao_termos_vigente(),
 * para todos aceitarem de novo.
 */

/** Começo do marcador de dado a confirmar. O scripts/conferir-producao.mjs procura este texto. */
export const MARCADOR_CONFIRMAR = "(confirmar:";
const confirmar = (oque: string) => `${MARCADOR_CONFIRMAR} ${oque})`;

/** Quem opera o MechaFlow e como falar com o encarregado. Preencher antes do piloto. */
export const OPERADOR = {
  nome: confirmar("razão social de quem opera o MechaFlow"),
  cnpj: confirmar("CNPJ"),
  endereco: confirmar("endereço completo"),
  emailEncarregado: confirmar("e-mail do encarregado de dados"),
  nomeEncarregado: confirmar("nome do encarregado de dados"),
  foro: confirmar("cidade do foro"),
};

/** Prazos de guarda que dependem de decisão (e de plano dos fornecedores). */
export const PRAZOS = {
  aposEncerrar: confirmar("prazo, por exemplo 90 dias"),
  aceite: confirmar("prazo, por exemplo 5 anos depois do fim da conta"),
  registrosAcesso: confirmar("prazo, no mínimo 6 meses pelo Marco Civil, e onde ficam guardados"),
  copias: confirmar("prazo das cópias de segurança no plano contratado do Supabase"),
};

export const TEXTO_LEGAL_PENDENTE = [...Object.values(OPERADOR), ...Object.values(PRAZOS)].some((v) =>
  v.startsWith(MARCADOR_CONFIRMAR),
);

export function secoesTermos({ teste }: { teste: boolean }): SecaoLegal[] {
  const secoes: SecaoLegal[] = [
    {
      titulo: "O que é o MechaFlow",
      conteudo: (
        <>
          <p>
            O MechaFlow é um sistema na internet para oficinas organizarem ordens de serviço, clientes, veículos, fotos,
            vistorias, orçamentos e o catálogo de serviços e peças. Ele é oferecido por {OPERADOR.nome}, CNPJ{" "}
            {OPERADOR.cnpj}, com endereço em {OPERADOR.endereco} (aqui chamado de &quot;MechaFlow&quot;).
          </p>
          <p>
            Ao criar a conta ou entrar no app, você declara que leu e aceita estes termos e a{" "}
            <Link href="/privacidade" className={classesLinkLegal}>
              Política de privacidade
            </Link>
            . Se você usa o MechaFlow em nome de uma oficina, declara também que pode aceitá-los em nome dela.
          </p>
        </>
      ),
    },
    {
      titulo: "Conta e acesso",
      conteudo: (
        <p>
          Cada pessoa usa o próprio e-mail e senha e pertence a uma oficina. O dono da oficina convida a equipe, define o
          papel de cada um (dono, atendente ou mecânico) e pode desativar o acesso a qualquer momento. Não compartilhe sua
          senha. Se suspeitar que alguém usou sua conta, troque a senha e avise o suporte.
        </p>
      ),
    },
    {
      titulo: "Responsabilidades da oficina",
      conteudo: (
        <>
          <p>A oficina que cria a conta é a responsável pelo que cadastra e envia pelo MechaFlow. Cabe a ela:</p>
          <ul>
            <li>cadastrar dados corretos e só os necessários para o atendimento;</li>
            <li>informar os próprios clientes de que usa o MechaFlow para registrar o atendimento;</li>
            <li>tirar fotos só do veículo e do serviço, evitando pessoas, documentos e placas de outros veículos;</li>
            <li>mandar o link do orçamento só para o cliente certo, pois quem tiver o link consegue vê-lo;</li>
            <li>conferir preços, prazos e diagnósticos antes de passar ao cliente;</li>
            <li>desativar o acesso de quem sair da equipe.</li>
          </ul>
        </>
      ),
    },
    {
      titulo: "Uso permitido",
      conteudo: (
        <p>
          Não é permitido usar o MechaFlow para atividade ilegal, para guardar dados sem relação com o atendimento da
          oficina, para tentar acessar dados de outra oficina ou para atrapalhar o funcionamento do sistema. Nesses casos,
          podemos suspender o acesso, avisando a oficina sempre que possível.
        </p>
      ),
    },
    {
      titulo: "Diagnóstico e sugestões",
      conteudo: (
        <p>
          O MechaFlow organiza informações e pode mostrar sugestões, mas não faz diagnóstico nem garante o resultado de
          nenhum serviço. Quem decide o diagnóstico, o serviço, o preço e o prazo é sempre o profissional da oficina.
        </p>
      ),
    },
    {
      titulo: "Disponibilidade",
      conteudo: (
        <p>
          Trabalhamos para manter o sistema no ar e os dados protegidos, mas ele depende da internet e de serviços de
          terceiros e pode ficar fora do ar ou apresentar falhas. Avisaremos pelo app ou pelo WhatsApp sobre manutenções
          que interrompam o uso, sempre que possível. Durante o piloto, funções podem mudar, entrar ou sair, e as
          condições comerciais são combinadas à parte com cada oficina.
        </p>
      ),
    },
    {
      titulo: "Responsabilidade",
      conteudo: (
        <p>
          O MechaFlow não responde por decisões tomadas pela oficina, por dados cadastrados de forma errada, pelo envio de
          link ou documento à pessoa errada nem por falhas da internet ou do aparelho de quem usa. Nada nestes termos
          afasta direitos que a lei garante e que não podem ser renunciados.
        </p>
      ),
    },
    {
      titulo: "Dados pessoais",
      conteudo: (
        <p>
          Como tratamos os dados pessoais está na{" "}
          <Link href="/privacidade" className={classesLinkLegal}>
            Política de privacidade
          </Link>
          , que faz parte destes termos.
        </p>
      ),
    },
    {
      titulo: "Fim do uso",
      conteudo: (
        <p>
          A oficina pode parar de usar o MechaFlow quando quiser, pedindo o encerramento ao suporte. Antes de apagar os
          dados, a oficina pode pedir uma cópia deles. O que acontece com cada dado depois do encerramento está na
          Política de privacidade.
        </p>
      ),
    },
    {
      titulo: "Registro do aceite",
      conteudo: (
        <p>
          Guardamos a data, a versão destes termos, a sua escolha sobre o uso anonimizado e, quando disponível, o endereço
          IP e o navegador usados no aceite, como prova. Se os termos mudarem, a versão no topo muda e pediremos um novo
          aceite na próxima entrada no app.
        </p>
      ),
    },
    {
      titulo: "Lei e foro",
      conteudo: (
        <p>
          Estes termos seguem as leis do Brasil. Fica escolhido o foro de {OPERADOR.foro} para resolver qualquer
          questão, salvo quando a lei garantir outro foro a quem reclama.
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
          O MechaFlow é o sistema que a oficina usa para organizar ordens de serviço, clientes e veículos. Ele é oferecido
          por {OPERADOR.nome}, CNPJ {OPERADOR.cnpj}, com endereço em {OPERADOR.endereco}.
        </p>
        <p>Na Lei Geral de Proteção de Dados (LGPD, Lei 13.709/2018), os papéis são estes:</p>
        <ul>
          <li>
            <strong className="font-bold">A oficina é a controladora</strong> dos dados dos clientes dela e de quem
            responde um orçamento: é ela que decide o que cadastrar e para quê.
          </li>
          <li>
            <strong className="font-bold">O MechaFlow é o operador</strong> desses dados: guarda e processa conforme as
            instruções da oficina, só para o sistema funcionar.
          </li>
          <li>
            <strong className="font-bold">O MechaFlow é o controlador</strong> dos dados de quem usa o app (dono,
            atendente e mecânico) e do registro do aceite destes termos.
          </li>
        </ul>
      </>
    ),
  },
  {
    titulo: "Que dados guardamos",
    conteudo: (
      <>
        <p>
          Guardamos só o necessário para o sistema funcionar. Cada oficina vê apenas os próprios dados. Fotos e assinaturas
          ficam em armazenamento privado e só abrem por links temporários.
        </p>
        <ul>
          <li>
            <strong className="font-bold">De quem usa o app</strong> (dono, atendente, mecânico): e-mail, nome,
            telefone, papel na oficina e o registro do aceite destes termos (data, versão, IP e navegador).
          </li>
          <li>
            <strong className="font-bold">Dos clientes da oficina</strong>: o que a oficina cadastrar, como nome,
            documento, telefone, veículos e placas, ordens de serviço, fotos, assinaturas, vistorias e orçamentos.
          </li>
          <li>
            <strong className="font-bold">De quem responde um orçamento pelo link</strong>: a resposta, o nome
            informado, a data e a hora, o endereço IP e o navegador.
          </li>
        </ul>
        <p>
          Não pedimos dados sensíveis (como saúde, religião ou biometria). A oficina não deve cadastrá-los. O MechaFlow
          não é feito para menores de 18 anos usarem o app.
        </p>
      </>
    ),
  },
  {
    titulo: "Para que usamos",
    conteudo: (
      <BlocoDefinicoes
        legenda="Finalidades e bases legais"
        colunas={["Dado", "Para quê", "Base na LGPD"]}
        linhas={[
          [
            "Conta de quem usa o app",
            "Criar o acesso, entrar no app, recuperar a senha e dar suporte",
            "Execução do contrato (art. 7º, V)",
          ],
          [
            "Dados dos clientes da oficina",
            "Registrar o atendimento: ordem de serviço, vistoria, orçamento, PDF e histórico do veículo",
            "Definida pela oficina, como controladora; em geral, execução do contrato com o cliente (art. 7º, V)",
          ],
          [
            "IP e navegador da resposta ao orçamento",
            "Comprovar quem aprovou ou recusou o orçamento, e quando",
            "Exercício regular de direitos e legítimo interesse da oficina (art. 7º, VI e IX)",
          ],
          [
            "Registro do aceite dos termos",
            "Provar que os termos foram aceitos e em qual versão",
            "Exercício regular de direitos (art. 7º, VI)",
          ],
          [
            "Registros de acesso",
            "Segurança do sistema e cumprimento do Marco Civil da Internet",
            "Cumprimento de obrigação legal (art. 7º, II)",
          ],
          [
            "Dados para uso anonimizado",
            "Melhorar o MechaFlow (ver “Uso anonimizado”)",
            "Legítimo interesse (art. 7º, IX), com a sua autorização no aceite",
          ],
        ]}
      />
    ),
  },
  {
    titulo: "Com quem compartilhamos",
    conteudo: (
      <>
        <p>Não vendemos dados nem usamos para publicidade. Usamos estes serviços para o sistema funcionar:</p>
        <ul>
          <li>Supabase: banco de dados, login e arquivos, guardados em São Paulo.</li>
          <li>Vercel: hospedagem do app, com funções em São Paulo.</li>
          <li>Resend: envio dos e-mails do app, como o de recuperar a senha.</li>
          <li>WhatsApp: quando a oficina manda um orçamento, PDF ou convite, quem envia é a própria oficina, pelo WhatsApp dela.</li>
        </ul>
        <p>
          Alguns desses serviços são de empresas de fora do Brasil e podem tratar parte dos dados no exterior, como a rede
          de entrega das páginas, os registros técnicos de acesso, o suporte deles e o envio de e-mails. Essa transferência
          segue o que a LGPD permite (art. 33), com as garantias contratuais oferecidas por esses fornecedores.
        </p>
        <p>
          Também podemos fornecer dados quando a lei ou uma ordem de autoridade competente exigir, só no limite do que for
          pedido.
        </p>
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
            [
              "Dados da oficina e dos clientes dela",
              "Fazer o sistema funcionar",
              `Enquanto a oficina usar o MechaFlow e até ${PRAZOS.aposEncerrar} depois do encerramento`,
            ],
            ["Registro do aceite dos termos", "Prova do aceite", PRAZOS.aceite],
            [
              "IP e navegador da resposta ao orçamento",
              "Comprovante da resposta",
              `${PRAZO_GUARDA_REDE}; depois, o sistema apaga sozinho. A resposta (aprovou ou recusou, nome e data) continua no orçamento`,
            ],
            ["Registros de acesso", "Segurança e obrigação legal", PRAZOS.registrosAcesso],
            ["Cópias de segurança", "Recuperar o sistema em caso de falha", PRAZOS.copias],
          ]}
        />
        <p>
          Quando a oficina deixa de usar o MechaFlow, ela pode pedir uma cópia dos dados. Passado o prazo acima, os dados
          são apagados ou anonimizados, a não ser os que a lei mande guardar por mais tempo. Dados apagados somem das cópias
          de segurança quando elas vencem.
        </p>
      </>
    ),
  },
  {
    titulo: "Uso anonimizado",
    conteudo: (
      <>
        <p>
          Ao aceitar, você autoriza o uso de dados anonimizados (sem nome, documento, telefone, placa ou qualquer
          informação que identifique alguém), como sintomas, códigos de falha, causas e soluções, para melhorar o
          MechaFlow, inclusive futuras sugestões de diagnóstico. O sistema sugere; quem decide é sempre o profissional da
          oficina.
        </p>
        <p>
          Dado anonimizado não permite chegar à pessoa e, por isso, deixa de ser dado pessoal (LGPD, art. 12). Não
          vendemos nem publicamos esses dados de forma que identifique a oficina. A oficina pode pedir que os dados dela
          deixem de ser usados assim daqui para a frente, pelo canal abaixo.
        </p>
      </>
    ),
  },
  {
    titulo: "Segurança",
    conteudo: (
      <p>
        Usamos medidas técnicas e de organização para proteger os dados, como conexão criptografada, separação dos dados de
        cada oficina no banco, acesso por papel e armazenamento privado de fotos. Nenhum sistema é totalmente imune a
        falhas. Se houver um incidente que possa causar risco ou dano relevante, avisaremos a oficina, os titulares
        afetados e a Autoridade Nacional de Proteção de Dados (ANPD), como pede a lei.
      </p>
    ),
  },
  {
    titulo: "Seus direitos",
    conteudo: (
      <>
        <p>Pela LGPD (art. 18), o titular dos dados pode pedir:</p>
        <ul>
          <li>a confirmação de que tratamos dados seus e o acesso a eles;</li>
          <li>a correção de dados incompletos, errados ou desatualizados;</li>
          <li>a anonimização, o bloqueio ou a exclusão de dados desnecessários ou tratados fora da lei;</li>
          <li>a portabilidade dos dados a outro fornecedor;</li>
          <li>a exclusão dos dados tratados com base no consentimento;</li>
          <li>a informação sobre com quem compartilhamos os dados;</li>
          <li>a revisão de decisões tomadas só de forma automática;</li>
          <li>a revogação do consentimento, quando ele for a base do tratamento.</li>
        </ul>
        <p>
          Se você é cliente de uma oficina, o pedido sobre os dados do seu atendimento vai primeiro para a oficina, que é
          a controladora. Se pedir ao MechaFlow, encaminharemos à oficina e ajudaremos no que couber. Você também pode
          reclamar à ANPD.
        </p>
      </>
    ),
  },
  {
    titulo: "Como fazer um pedido",
    conteudo: (
      <>
        <p>
          Mande o pedido para o encarregado de dados, {OPERADOR.nomeEncarregado}, pelo e-mail{" "}
          <span className="[overflow-wrap:anywhere]">{OPERADOR.emailEncarregado}</span>, ou fale com o suporte pelo
          WhatsApp, no fim desta página. O WhatsApp serve para tirar dúvidas; o pedido formal fica registrado por e-mail.
        </p>
        <p>
          Para proteger os seus dados, podemos pedir que você confirme quem é, por exemplo escrevendo do e-mail da conta
          ou informando dados que só o titular conhece. Respondemos em até 15 dias, como prevê a LGPD (art. 19).
        </p>
      </>
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

/** Fim da Privacidade: canal escrito do encarregado (DESIGN §15.3; o WhatsApp não substitui o canal da LGPD). */
export const CONTATO_ENCARREGADO = (
  <p>
    Encarregado de dados: {OPERADOR.nomeEncarregado}, e-mail{" "}
    <span className="[overflow-wrap:anywhere]">{OPERADOR.emailEncarregado}</span>.
  </p>
);
