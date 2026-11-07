"use client";

import { useState } from "react";
import { FotoTelaCheia, type FotoTelaCheiaDados } from "@/components/os/foto-tela-cheia";
import { GradeFotos } from "@/components/os/grade-fotos";
import {
  formatarDiaHora,
  formatarNumero,
  juntarContagens,
  ROTULO_COMBUSTIVEL_LONGO,
  ROTULO_LADO_AVARIA,
} from "@/lib/formato";
import type { HistoricoOS } from "@/lib/supabase/database.types";

type VistoriaContrato = HistoricoOS["vistorias"][number];

/**
 * Vistoria lida pelo mecânico no histórico (DESIGN §14.7). **Lista fechada**: só as chaves que a
 * leitura do mecânico traz (ARQUITETURA §14.6). Não há campo de assinatura, de quem assinou, de quem
 * concluiu, do motivo da anulação nem do nome de quem escreveu o complemento: o tipo não deixa passar.
 * As fotos chegam já com a URL assinada (o app assina só ao abrir, por 15 min).
 */
export type VistoriaMecanico = Pick<
  VistoriaContrato,
  "id" | "tipo" | "status" | "concluida_em" | "anulada_em" | "km" | "horimetro" | "combustivel" | "objetos" | "sem_avarias" | "observacoes" | "itens" | "avarias"
> & {
  complementos: { id: string; texto: string | null; criado_em: string }[];
  fotos?: FotoTelaCheiaDados[];
};

function Titulo({ children }: { children: string }) {
  return <h4 className="text-base font-bold">{children}</h4>;
}

/**
 * `VistoriaSemAssinatura` (DESIGN §14.14): o texto segue a ordem da leitura atual (§12.12) —
 * entrada, checklist, avarias, objetos, observações, fotos e o que foi acrescentado depois —
 * sem a parte da assinatura. Só leitura: fotos sem Editar e sem Apagar.
 */
export function VistoriaSemAssinatura({ vistoria }: { vistoria: VistoriaMecanico }) {
  const [foto, setFoto] = useState<number | null>(null);
  const fotos = vistoria.fotos ?? [];
  const entrada = [
    typeof vistoria.km === "number" ? `KM ${formatarNumero(vistoria.km)}` : null,
    typeof vistoria.horimetro === "number" ? `Horímetro ${formatarNumero(vistoria.horimetro)} h` : null,
    vistoria.combustivel ? `Combustível: ${ROTULO_COMBUSTIVEL_LONGO[vistoria.combustivel]}` : null,
  ].filter(Boolean);
  const marcados = vistoria.itens.filter((i) => i.situacao !== null);
  const contagem = juntarContagens([
    [marcados.filter((i) => i.situacao === "com_problema").length, "com problema"],
    [marcados.filter((i) => i.situacao === "ok").length, "ok"],
    [marcados.filter((i) => i.situacao === "nao_se_aplica").length, "não se aplica"],
  ]);
  const problemas = vistoria.itens.filter((i) => i.situacao === "com_problema");
  const objetos = (vistoria.objetos ?? []).filter((o) => o.trim());

  return (
    <div className="flex flex-col gap-3 rounded-md bg-superficie-2 p-3" data-teste="vistoria-sem-assinatura">
      {entrada.length > 0 && <p className="font-mono text-sm">{entrada.join(" · ")}</p>}

      {vistoria.itens.length > 0 && (
        <div className="flex flex-col gap-1">
          <Titulo>Checklist</Titulo>
          {contagem && <p className="text-sm text-texto-suave">{contagem}</p>}
          {problemas.length > 0 && (
            <ul className="flex flex-col gap-1">
              {problemas.map((i) => (
                <li key={i.descricao} className="text-base break-words">
                  <span className="font-bold">{i.descricao}</span>
                  {i.observacao?.trim() && `: ${i.observacao.trim()}`}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex flex-col gap-1">
        <Titulo>Avarias</Titulo>
        {vistoria.avarias.length === 0 ? (
          <p className="text-base">{vistoria.sem_avarias ? "Sem avarias." : "Nenhuma avaria registrada."}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {vistoria.avarias.map((a) => (
              <li key={a.id} className="text-base break-words">
                <span className="font-bold">{ROTULO_LADO_AVARIA[a.lado]}</span>
                {a.descricao?.trim() && `: ${a.descricao.trim()}`}
              </li>
            ))}
          </ul>
        )}
      </div>

      {objetos.length > 0 && (
        <div className="flex flex-col gap-1">
          <Titulo>Objetos no veículo</Titulo>
          <p className="text-base break-words">{objetos.join(" · ")}</p>
        </div>
      )}

      {vistoria.observacoes?.trim() && (
        <div className="flex flex-col gap-1">
          <Titulo>Observações gerais</Titulo>
          <p className="text-base break-words whitespace-pre-line">{vistoria.observacoes.trim()}</p>
        </div>
      )}

      {fotos.length > 0 && (
        <div className="flex flex-col gap-2">
          <Titulo>{`Fotos da vistoria (${fotos.length})`}</Titulo>
          <GradeFotos fotos={fotos} aoAbrir={(id) => setFoto(fotos.findIndex((f) => f.id === id))} />
          <FotoTelaCheia
            aberta={foto !== null && foto >= 0}
            aoFechar={() => setFoto(null)}
            fotos={fotos.map((f) => ({ ...f, podeEditar: false, podeApagar: false }))}
            indice={Math.max(0, foto ?? 0)}
            aoMudarIndice={setFoto}
          />
        </div>
      )}

      {vistoria.complementos.length > 0 && (
        <div className="flex flex-col gap-1">
          <Titulo>{`Acrescentado depois (${vistoria.complementos.length})`}</Titulo>
          <ul className="flex flex-col gap-2">
            {[...vistoria.complementos]
              .sort((a, b) => a.criado_em.localeCompare(b.criado_em))
              .map((c) => (
                <li key={c.id} className="flex flex-col">
                  {c.texto?.trim() && <span className="text-base break-words whitespace-pre-line">{c.texto.trim()}</span>}
                  {/* Sem o nome de quem escreveu (pode ser outro mecânico). */}
                  <span className="text-sm text-texto-suave">{formatarDiaHora(c.criado_em)}</span>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}
