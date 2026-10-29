import type { Metadata } from "next";
import { TelaSimples } from "@/components/layout/tela-simples";
import { CaixaMensagem } from "@/components/ui/formulario";
import { TERMOS_VERSAO } from "@/lib/termos";

export const metadata: Metadata = { title: "Termos de Uso e Política de Privacidade" };

/**
 * TEXTO PROVISORIO (RASCUNHO). Precisa de revisao juridica antes do piloto.
 * Mudou o texto? Trocar TERMOS_VERSAO (src/lib/termos.ts) + migracao nova em
 * private.versao_termos_vigente(), para todos aceitarem de novo.
 */
export default function TermosPage() {
  return (
    <TelaSimples titulo="Termos de Uso e Política de Privacidade" subtitulo={`Versão ${TERMOS_VERSAO}`}>
      <CaixaMensagem tipo="alerta">
        RASCUNHO: texto provisório, ainda sem revisão jurídica. Válido só para o ambiente de teste.
      </CaixaMensagem>

      <article className="flex max-w-[70ch] flex-col gap-4 text-base">
        <section className="flex flex-col gap-2">
          <h2 className="text-2xl">1. O que é o MechaFlow</h2>
          <p>
            O MechaFlow é um sistema para oficinas organizarem ordens de serviço, clientes, veículos, catálogo de serviços
            e peças. A oficina que cria a conta é a responsável pelos dados que cadastra.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-2xl">2. Conta e acesso</h2>
          <p>
            Cada pessoa usa o próprio e-mail e senha e pertence a uma oficina. O dono da oficina convida a equipe, define
            o papel de cada um (dono, atendente ou mecânico) e pode desativar o acesso a qualquer momento. Não compartilhe
            sua senha.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-2xl">3. Dados pessoais (LGPD)</h2>
          <p>
            Guardamos os dados que a oficina cadastra (por exemplo, nome, telefone e documento de clientes, placas de
            veículos, fotos e assinaturas) só para fazer o sistema funcionar. Cada oficina vê apenas os próprios dados.
            Fotos e assinaturas ficam em armazenamento privado.
          </p>
          <p>
            A oficina, como controladora, deve informar seus clientes sobre o uso desses dados. O titular pode pedir
            acesso, correção ou exclusão dos seus dados à oficina ou ao suporte do MechaFlow.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-2xl">4. Uso anonimizado para melhorar o sistema</h2>
          <p>
            Ao aceitar, você autoriza o uso de dados anonimizados (sem nome, documento, telefone ou placa que identifique
            alguém), como sintomas, códigos de falha, causas e soluções, para melhorar o MechaFlow, inclusive futuras
            sugestões de diagnóstico. O sistema sugere; quem decide é sempre o profissional da oficina.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-2xl">5. Registro do aceite</h2>
          <p>
            Guardamos a data, a versão destes termos e, quando disponível, o endereço IP e o navegador usados no aceite,
            como prova. Se os termos mudarem, pediremos um novo aceite.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-2xl">6. Ambiente de teste</h2>
          <p>Neste ambiente de teste use apenas dados fictícios. Os dados podem ser apagados a qualquer momento.</p>
        </section>
      </article>
    </TelaSimples>
  );
}
