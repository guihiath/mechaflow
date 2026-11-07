"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { Phone } from "lucide-react";
import { classesBotao, classesFantasma } from "@/components/ui/botao";
import { ChipPlaca } from "@/components/ui/estados";
import { ValorQuebravel } from "@/components/ui/valor-quebravel";
import { formatarCentavos, formatarPlaca, soDigitos } from "@/lib/formato";
import { ROTULO_FORMA_PAGAMENTO, type FormaPagamento } from "@/lib/os";
import { diasDesde, formatarDataCurta, textoClientes, textoDias, textoOS } from "@/lib/painel";

export type OSDevedor = {
  id: string;
  /** `/os/<id>` com a origem preservada (ex.: `?de=a-receber`). */
  href: string;
  numero: number;
  placa: string;
  /** ISO (UTC). */
  entregueEm: string;
  /** Dias de calendário em São Paulo desde a entrega, como vem de `contas_a_receber.dias`. Sem ele, a tela calcula. */
  dias?: number | null;
  totalCentavos: number;
  formaPagamento?: FormaPagamento | null;
};

export type DadosDevedor = {
  clienteId: string;
  nome: string;
  telefone?: string | null;
  /** Soma das OS do cliente, vinda da leitura (nunca da soma do que está na tela). */
  totalCentavos: number;
  /** `cliente_qtd_os` da leitura. Sem ele, conta as OS da lista. */
  quantidadeOS?: number | null;
  /** OS do cliente, da mais antiga para a mais nova (o servidor ordena). */
  os: OSDevedor[];
};

function diasDaOS(os: OSDevedor, hoje: string): number {
  return typeof os.dias === "number" ? os.dias : diasDesde(os.entregueEm, hoje);
}

const BOTAO_48 = "h-auto! min-h-toque py-2 text-base";

/** Até 3 OS por cliente; o resto expande no lugar (DESIGN §14.4). */
const VISIVEIS = 3;

/**
 * Cliente que deve (DESIGN §14.4, `CartaoDevedor`): nome, total, "3 OS · mais antiga há 42 dias",
 * "Ligar para o cliente" (some sem telefone) e as OS, com "Registrar pagamento" por OS.
 * O total do cliente nunca muda ao expandir. A área tocável da OS (número, placa e data) é um link;
 * o botão de pagamento fica fora dele, a 8 px ou mais.
 */
export function CartaoDevedor({
  devedor,
  hoje,
  aoRegistrar,
}: {
  devedor: DadosDevedor;
  /** "AAAA-MM-DD" em São Paulo (dias de calendário). */
  hoje: string;
  /** Abre a `FolhaPagamento` da OS. Sem ela, o botão não aparece. */
  aoRegistrar?: (os: OSDevedor) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const idLista = useId();
  const idNome = useId();
  const maisAntiga = devedor.os[0];
  const diasMaisAntiga = maisAntiga ? diasDaOS(maisAntiga, hoje) : 0;
  const qtd = devedor.quantidadeOS ?? devedor.os.length;
  const mostradas = aberto ? devedor.os : devedor.os.slice(0, VISIVEIS);
  const sobra = devedor.os.length - VISIVEIS;
  const tel = soDigitos(devedor.telefone);

  return (
    <section
      aria-labelledby={idNome}
      className="flex flex-col gap-3 rounded-lg border border-borda-sutil bg-superficie p-4"
      data-teste="cartao-devedor"
    >
      <div className="flex flex-col gap-0.5">
        <h3 id={idNome} className="font-sans text-xl font-bold break-words">
          {devedor.nome}
        </h3>
        <p className="font-mono text-2xl font-semibold">
          <ValorQuebravel centavos={devedor.totalCentavos} />
        </p>
        <p className="text-sm text-texto-suave">
          {textoOS(qtd)}
          {maisAntiga && ` · ${qtd === 1 ? "entregue" : "mais antiga"} ${textoDias(diasMaisAntiga)}`}
        </p>
      </div>

      {tel.length >= 10 && (
        <a href={`tel:${tel}`} className={classesBotao("secundario", `${BOTAO_48} sm:w-auto sm:self-start`)}>
          <Phone size={20} strokeWidth={2.25} aria-hidden />
          Ligar para o cliente
        </a>
      )}

      <ul id={idLista} className="flex flex-col">
        {mostradas.map((os) => (
          <LinhaOSDevedor key={os.id} os={os} hoje={hoje} aoRegistrar={aoRegistrar} />
        ))}
      </ul>

      {sobra > 0 && (
        <button
          type="button"
          aria-expanded={aberto}
          aria-controls={idLista}
          onClick={() => setAberto((v) => !v)}
          className={`${classesFantasma} self-start`}
        >
          {aberto ? "Mostrar menos" : sobra === 1 ? "Ver mais 1 OS" : `Ver mais ${sobra} OS`}
        </button>
      )}
    </section>
  );
}

function LinhaOSDevedor({ os, hoje, aoRegistrar }: { os: OSDevedor; hoje: string; aoRegistrar?: (os: OSDevedor) => void }) {
  const placa = formatarPlaca(os.placa);
  const dias = textoDias(diasDaOS(os, hoje));
  const data = formatarDataCurta(os.entregueEm, hoje);
  const forma = os.formaPagamento ? ROTULO_FORMA_PAGAMENTO[os.formaPagamento] : null;
  return (
    <li className="flex flex-col gap-2 border-t border-borda-sutil py-3 last:pb-0">
      <Link
        href={os.href}
        aria-label={`OS ${os.numero}, placa ${placa}, ${formatarCentavos(os.totalCentavos)}, entregue em ${data}, ${dias}. Abrir a OS.`}
        className="flex flex-col gap-1 rounded-md active:bg-superficie-2"
      >
        <span className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="font-mono text-base font-semibold">OS #{os.numero}</span>
          <span className="ml-auto text-right font-mono text-base font-semibold">
            <ValorQuebravel centavos={os.totalCentavos} />
          </span>
        </span>
        <span>
          <ChipPlaca placa={placa} />
        </span>
        <span className="text-sm text-texto-suave">
          Entregue em {data} · <span className="font-bold text-texto">{dias}</span>
        </span>
        {forma && <span className="text-sm text-texto-suave">Forma: {forma}</span>}
      </Link>
      {aoRegistrar && (
        <button
          type="button"
          onClick={() => aoRegistrar(os)}
          aria-label={`Registrar pagamento da OS ${os.numero}`}
          className={classesBotao("secundario", `${BOTAO_48} mt-1 sm:w-auto sm:self-start`)}
        >
          Registrar pagamento
        </button>
      )}
    </li>
  );
}

/**
 * Topo de `/a-receber` (DESIGN §14.4 e §14.5). Dono: R$ + "7 OS de 4 clientes".
 * Atendente: só a contagem, sem soma geral (passe `totalCentavos` só para o dono).
 */
export function ResumoAReceber({
  totalCentavos,
  quantidadeOS,
  quantidadeClientes,
}: {
  totalCentavos?: number | null;
  quantidadeOS: number;
  quantidadeClientes: number;
}) {
  return (
    <div className="flex flex-col gap-1" data-teste="resumo-a-receber">
      {typeof totalCentavos === "number" && (
        <p className="font-display text-3xl font-bold">
          <ValorQuebravel centavos={totalCentavos} />
        </p>
      )}
      <p className="text-base font-bold">
        {textoOS(quantidadeOS)} de {textoClientes(quantidadeClientes)}
      </p>
      <p className="text-sm text-texto-suave">Sem vencimento: os dias contam da entrega.</p>
    </div>
  );
}

/** 3 skeletons no formato do cartão de cliente (DESIGN §14.4). */
export function DevedoresCarregando({ quantidade = 3 }: { quantidade?: number }) {
  return (
    <div aria-busy="true" className="flex flex-col gap-3">
      {Array.from({ length: quantidade }, (_, i) => (
        <div key={i} aria-hidden className="flex animate-pulse flex-col gap-2 rounded-lg border border-borda-sutil bg-superficie p-4">
          <div className="h-6 w-44 rounded-sm bg-superficie-2" />
          <div className="h-7 w-32 rounded-sm bg-superficie-2" />
          <div className="h-4 w-48 rounded-sm bg-superficie-2" />
          <div className="mt-2 h-16 rounded-sm bg-superficie-2" />
        </div>
      ))}
      <span className="sr-only">Carregando…</span>
    </div>
  );
}
