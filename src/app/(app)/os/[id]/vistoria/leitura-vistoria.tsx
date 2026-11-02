"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { FilePlus2, Gauge, ImageOff, Paperclip, TriangleAlert, type LucideIcon } from "lucide-react";
import { anularVistoria } from "@/acoes/vistoria";
import { useFila } from "@/components/fotos/usar-fila";
import { BarraAcoesOS } from "@/components/os/barra-acoes-os";
import { FotoTelaCheia, type FotoTelaCheiaDados } from "@/components/os/foto-tela-cheia";
import { Botao } from "@/components/ui/botao";
import { ConfirmarComMotivo } from "@/components/ui/confirmar-acao";
import { Cartao } from "@/components/ui/estados";
import { CaixaMensagem } from "@/components/ui/formulario";
import { CartaoAvaria } from "@/components/vistoria/cartao-avaria";
import { LinhaChecklistLeitura, ordenarParaLeitura } from "@/components/vistoria/linha-checklist";
import { CombustivelLeitura } from "@/components/vistoria/marcador-combustivel";
import { BotaoBaixarPdf, BotaoEnviarPdf, MensagensPdf, usePdfVistoria } from "@/components/vistoria/pdf-vistoria";
import { BlocoVistoriaConcluida, type AssinaturaLeitura, type DadosComplemento } from "@/components/vistoria/vistoria-concluida";
import {
  formatarCodigoConferencia,
  formatarNumero,
  formatarNumeroOS,
  normalizarPlaca,
  ROTULO_LADO_AVARIA,
  type LadoAvaria,
  type NivelCombustivel,
  type SituacaoItemVistoria,
} from "@/lib/formato";
import { aoConfirmarFoto, iniciarFila, lerFila, tentarDeNovo } from "@/lib/fotos/fila";
import { BUCKET_VISTORIAS, VALIDADE_URL_FOTO_S } from "@/lib/fotos/regras";
import { createClient } from "@/lib/supabase/client";
import { FolhaComplemento } from "./complementar";

/** Foto enviada da vistoria: miniatura já assinada pelo servidor; a grande é assinada só ao abrir. */
export type FotoLeitura = {
  id: string;
  caminho: string;
  /** URL assinada da miniatura (15 min); null = não deu para assinar. */
  src: string | null;
  enviadoPor: string | null;
  enviadoEm: string | null;
};

export type AvariaLeitura = { id: string; lado: LadoAvaria; descricao: string | null; fotos: FotoLeitura[] };

export type ComplementoLeitura = { id: string; texto: string | null; criadoEm: string; criadoPor: string; fotos: FotoLeitura[] };

export type DadosLeitura = {
  id: string;
  osId: string;
  numeroOS: number;
  placa: string;
  concluidaEm: string | null;
  concluidaPor: string;
  km: number | null;
  horimetro: number | null;
  combustivel: NivelCombustivel | null;
  /** null = não informado; [] = nenhum objeto. */
  objetos: string[] | null;
  observacoes: string | null;
  semAvarias: boolean;
  hash: string | null;
  assinatura: AssinaturaLeitura | null;
  itens: { id: string; descricao: string; situacao: SituacaoItemVistoria | null; observacao: string | null }[];
  avarias: AvariaLeitura[];
  painel: FotoLeitura[];
  complementos: ComplementoLeitura[];
  /** Fotos de complemento que a vistoria já tem (enviadas ou pendentes; limite de 10). */
  fotosComplemento: number;
  anulada: { em: string; por: string; motivo: string } | null;
  /** Regras do banco para quem consulta (`vw_vistorias.pode_complementar` / `pode_anular`). */
  podeComplementar: boolean;
  podeAnular: boolean;
};

type FotoTela = FotoTelaCheiaDados & { caminho: string };

/**
 * Leitura da vistoria concluída ou anulada (DESIGN §12.12 e §12.13, F4-B5): assinatura primeiro,
 * entrada (KM, horímetro, combustível), checklist inteiro (problemas primeiro), avarias, painel,
 * objetos, observações, complementos e o código de conferência. Nada aqui muda o original:
 * "Complementar" só acrescenta; "Anular vistoria" (só dono) guarda a anulada.
 * Fotos: miniatura assinada pelo servidor; a grande só é assinada (e baixada) ao abrir a tela cheia,
 * com Anterior/Próxima entre todas as fotos da vistoria, sem editar nem apagar.
 * Nenhum valor em dinheiro: o mecânico lê a mesma tela.
 */
export function LeituraVistoria({ dados, usuarioId, ehMecanico }: { dados: DadosLeitura; usuarioId: string; ehMecanico: boolean }) {
  const router = useRouter();
  const fila = useFila();
  const idObjetos = useId();
  const [complementando, setComplementando] = useState(false);
  const [recado, setRecado] = useState<string | null>(null);
  const [tela, setTela] = useState({ aberta: false, indice: 0 });
  const [grandes, setGrandes] = useState<Record<string, { url: string; vence: number }>>({});
  // PDF (F4-B6): o guardado na memória deixa de valer quando entra complemento.
  const pdf = usePdfVistoria({
    vistoriaId: dados.id,
    chave: String(dados.complementos.length),
    nomeReserva: `vistoria-OS${dados.numeroOS}-${normalizarPlaca(dados.placa)}${dados.anulada ? "-ANULADA" : ""}.pdf`,
  });
  const grandesRef = useRef(grandes);
  useEffect(() => {
    grandesRef.current = grandes;
  }, [grandes]);

  useEffect(() => {
    void iniciarFila(usuarioId);
  }, [usuarioId]);

  // Foto de complemento confirmada pelo banco: a leitura recarrega para mostrar a do servidor.
  useEffect(
    () =>
      aoConfirmarFoto((_os, id) => {
        const i = lerFila().itens.find((x) => x.id === id);
        if (i?.vistoria?.vistoriaId === dados.id) router.refresh();
      }),
    [router, dados.id],
  );

  // Fotos de complemento desta vistoria ainda no aparelho (outra sessão ou folha fechada no meio).
  const pendentes = fila.itens.filter((i) => i.vistoria?.vistoriaId === dados.id && i.vistoria.complementoId && i.estado !== "confirmada");
  const pendentesFalhas = pendentes.filter((i) => i.estado === "falhou");

  // Todas as fotos da vistoria na ordem da página (avarias → painel → complementos).
  const fotosTela = useMemo<FotoTela[]>(() => {
    const lista: FotoTela[] = [];
    const add = (f: FotoLeitura, rotuloTipo: string, icone: LucideIcon | null, legenda: string | null) =>
      lista.push({
        id: f.id,
        caminho: f.caminho,
        src: f.src,
        categoria: "outro",
        estado: "enviada",
        rotuloTipo,
        iconeTipo: icone,
        legenda,
        enviadoPor: f.enviadoPor,
        enviadoEm: f.enviadoEm,
      });
    for (const a of dados.avarias) for (const f of a.fotos) add(f, `Avaria: ${ROTULO_LADO_AVARIA[a.lado]}`, TriangleAlert, a.descricao?.trim() || null);
    for (const f of dados.painel) add(f, "Painel", Gauge, "Foto do painel ligado");
    for (const c of dados.complementos) for (const f of c.fotos) add(f, "Acrescentado depois", FilePlus2, c.texto?.trim() || null);
    return lista;
  }, [dados.avarias, dados.painel, dados.complementos]);

  const abrirFoto = useCallback(
    (id: string) => {
      const indice = fotosTela.findIndex((f) => f.id === id);
      if (indice >= 0) setTela({ aberta: true, indice });
    },
    [fotosTela],
  );

  // A foto grande só é assinada ao abrir (ou ao trocar de foto na tela cheia).
  const atual = tela.aberta ? fotosTela[Math.min(tela.indice, fotosTela.length - 1)] : undefined;
  const idAtual = atual?.id;
  const caminhoAtual = atual?.caminho;
  const urlAtual = idAtual ? grandes[idAtual]?.url : undefined;
  useEffect(() => {
    if (!idAtual || !caminhoAtual) return;
    const ja = grandesRef.current[idAtual];
    if (ja && ja.vence > Date.now() + 5_000) return;
    let vivo = true;
    void createClient()
      .storage.from(BUCKET_VISTORIAS)
      .createSignedUrl(caminhoAtual, VALIDADE_URL_FOTO_S)
      .then(({ data }) => {
        if (!vivo || !data?.signedUrl) return;
        const vence = Date.now() + (VALIDADE_URL_FOTO_S - 60) * 1000;
        setGrandes((g) => ({ ...g, [idAtual]: { url: data.signedUrl, vence } }));
      });
    return () => {
      vivo = false;
    };
  }, [idAtual, caminhoAtual, urlAtual]);

  const fotosComGrande = fotosTela.map((f) => ({ ...f, srcGrande: grandes[f.id]?.url ?? null }));

  const itens = ordenarParaLeitura(dados.itens);
  const conta = (s: SituacaoItemVistoria) => dados.itens.filter((i) => i.situacao === s).length;
  const complementos: DadosComplemento[] = dados.complementos.map((c) => ({
    id: c.id,
    texto: c.texto,
    criadoEm: c.criadoEm,
    criadoPor: c.criadoPor,
    fotos: c.fotos.map((f, i) => ({ id: f.id, src: f.src, alt: `Foto ${i + 1} acrescentada. Ver foto` })),
  }));
  const podeComplementar = dados.podeComplementar && !dados.anulada;
  // Barra (DESIGN §12.12): balcão = "Enviar ao cliente (PDF)" + "Complementar"; mecânico = só
  // "Complementar" (na OS dele; o PDF ele baixa pela página). Anulada: sem barra.
  const enviarNaBarra = !ehMecanico && !dados.anulada;
  const temBarra = enviarNaBarra || podeComplementar;
  const titulo = `${formatarNumeroOS(dados.numeroOS)} (${dados.placa})`;

  return (
    <div data-teste="leitura-vistoria" className="flex flex-col gap-6">
      {recado && <CaixaMensagem tipo="sucesso">{recado}</CaixaMensagem>}

      <BlocoVistoriaConcluida
        numeroOS={dados.numeroOS}
        concluidaEm={dados.concluidaEm}
        concluidaPor={dados.concluidaPor}
        assinatura={dados.assinatura}
        complementos={complementos}
        anulada={dados.anulada}
        aoAbrirFotoComplemento={(c, i) => {
          const f = dados.complementos.find((x) => x.id === c.id)?.fotos[i];
          if (f) abrirFoto(f.id);
        }}
      >
        <section aria-labelledby={`${idObjetos}-entrada`} className="flex flex-col gap-2">
          <h2 id={`${idObjetos}-entrada`} className="text-xl">
            Entrada
          </h2>
          <Cartao>
            <dl className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-sm font-bold text-texto-suave">KM</dt>
                <dd className="font-mono text-lg">{formatarNumero(dados.km) || "Não informado"}</dd>
              </div>
              {dados.horimetro != null && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-sm font-bold text-texto-suave">Horímetro</dt>
                  <dd className="font-mono text-lg">{formatarNumero(dados.horimetro)} h</dd>
                </div>
              )}
              <div className="flex items-center justify-between gap-3">
                <dt className="text-sm font-bold text-texto-suave">Combustível</dt>
                <dd className="text-lg">
                  <CombustivelLeitura nivel={dados.combustivel} />
                </dd>
              </div>
            </dl>
          </Cartao>
        </section>

        <section aria-labelledby={`${idObjetos}-checklist`} className="flex flex-col gap-2">
          <h2 id={`${idObjetos}-checklist`} className="text-xl">
            Checklist ({dados.itens.length})
          </h2>
          <p className="text-base text-texto-suave">
            {conta("com_problema")} com problema · {conta("ok")} ok · {conta("nao_se_aplica")} não se aplica
          </p>
          {itens.length > 0 ? (
            <Cartao>
              <ul data-teste="checklist-leitura">
                {itens.map((i) => (
                  <LinhaChecklistLeitura key={i.id} descricao={i.descricao} situacao={i.situacao} observacao={i.observacao} />
                ))}
              </ul>
            </Cartao>
          ) : (
            <p className="text-base">Nenhum item no checklist.</p>
          )}
        </section>

        <section aria-labelledby={`${idObjetos}-avarias`} className="flex flex-col gap-3">
          <h2 id={`${idObjetos}-avarias`} className="text-xl">
            Avarias ({dados.avarias.length})
          </h2>
          {dados.avarias.length === 0 ? (
            <p className="text-base">{dados.semAvarias ? "Nenhuma avaria." : "Não informado."}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {dados.avarias.map((a) => (
                <li key={a.id}>
                  <CartaoAvaria
                    leitura
                    avaria={{ id: a.id, lado: a.lado, descricao: a.descricao, fotos: a.fotos.map((f) => ({ id: f.id, src: f.src, estado: "enviada" })) }}
                    aoAbrir={a.fotos.length ? () => abrirFoto(a.fotos[0].id) : undefined}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby={`${idObjetos}-painel`} className="flex flex-col gap-2">
          <h2 id={`${idObjetos}-painel`} className="text-xl">
            Painel
          </h2>
          {dados.painel.length ? (
            <ul className="grid grid-cols-3 gap-2">
              {dados.painel.map((f, i) => (
                <li key={f.id}>
                  <MiniaturaLeitura foto={f} rotulo={`Foto ${i + 1} do painel. Ver foto`} aoAbrir={() => abrirFoto(f.id)} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-base text-texto-suave">Sem foto do painel.</p>
          )}
        </section>

        <section aria-labelledby={`${idObjetos}-objetos`} className="flex flex-col gap-2">
          <h2 id={`${idObjetos}-objetos`} className="text-xl">
            Objetos no veículo
          </h2>
          {dados.objetos === null ? (
            <p className="text-base text-texto-suave">Não informado.</p>
          ) : dados.objetos.length === 0 ? (
            <p className="text-base">Nenhum objeto.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {dados.objetos.map((o) => (
                <li key={o} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-borda-sutil bg-superficie px-3 text-base font-bold">
                  <Paperclip size={16} strokeWidth={2.25} aria-hidden className="text-texto-suave" />
                  {o}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby={`${idObjetos}-obs`} className="flex flex-col gap-2">
          <h2 id={`${idObjetos}-obs`} className="text-xl">
            Observações
          </h2>
          {dados.observacoes?.trim() ? (
            <p className="text-base break-words whitespace-pre-line">{dados.observacoes.trim()}</p>
          ) : (
            <p className="text-base text-texto-suave">Nenhuma observação.</p>
          )}
        </section>

        {dados.hash && (
          <p className="font-mono text-xs text-texto-suave" data-teste="hash-vistoria">
            Código de conferência: {formatarCodigoConferencia(dados.hash)}
          </p>
        )}
      </BlocoVistoriaConcluida>

      <section aria-label="PDF da vistoria" className="flex flex-col gap-2">
        <BotaoBaixarPdf pdf={pdf} />
        {!temBarra && <MensagensPdf pdf={pdf} />}
      </section>

      {pendentes.length > 0 && (
        <div className="flex flex-col gap-2" data-teste="complemento-pendente">
          <CaixaMensagem tipo={pendentesFalhas.length ? "erro" : "info"}>
            {pendentes.length === 1
              ? "1 foto acrescentada ainda não subiu. Ela está guardada no celular."
              : `${pendentes.length} fotos acrescentadas ainda não subiram. Elas estão guardadas no celular.`}
          </CaixaMensagem>
          {pendentesFalhas.length > 0 && (
            <Botao variante="secundario" onClick={() => tentarDeNovo(pendentesFalhas.map((i) => i.id))}>
              Tentar de novo
            </Botao>
          )}
        </div>
      )}

      {/* Zona de perigo (só dono, DESIGN §12.13) */}
      {dados.podeAnular && !dados.anulada && (
        <div className="mt-6">
          <ConfirmarComMotivo
            acao={(motivo) => anularVistoria(dados.osId, dados.id, `Feita na OS errada: ${motivo}`)}
            rotulo="Anular vistoria"
            pergunta={`Anular a vistoria da ${titulo}?`}
            texto="Use só se ela foi feita na OS errada. Ela fica guardada como anulada e outra vistoria pode ser feita."
            motivos={["Feita na OS errada"]}
            motivoInicial="Feita na OS errada"
            rotuloOutro="Explique o que aconteceu"
            ajudaOutro="Ex.: era o caminhão da OS #1044."
            erroSemMotivo="Escolha o motivo."
            erroSemTexto="Explique o que aconteceu."
            rotuloConfirmar="Anular vistoria"
            rotuloEnviando="Anulando…"
            rotuloVoltar="Voltar sem anular"
          />
        </div>
      )}

      {temBarra && (
        <BarraAcoesOS
          acima={<MensagensPdf pdf={pdf} />}
          primario={
            enviarNaBarra ? (
              <BotaoEnviarPdf pdf={pdf} />
            ) : (
              <Botao onClick={() => setComplementando(true)} data-teste="complementar">
                <FilePlus2 size={24} strokeWidth={2.25} aria-hidden />
                Complementar
              </Botao>
            )
          }
          secundario={
            enviarNaBarra && podeComplementar ? (
              <Botao variante="secundario" onClick={() => setComplementando(true)} data-teste="complementar">
                <FilePlus2 size={24} strokeWidth={2.25} aria-hidden />
                Complementar
              </Botao>
            ) : undefined
          }
          proximoPasso={
            podeComplementar
              ? "A vistoria não muda mais. Envie o PDF ao cliente ou acrescente texto ou foto."
              : "A vistoria não muda mais. Envie o PDF ao cliente."
          }
        />
      )}

      {complementando && (
        <FolhaComplemento
          aberta
          aoFechar={() => setComplementando(false)}
          aoConcluir={(mensagem) => {
            setComplementando(false);
            setRecado(mensagem);
            router.refresh();
          }}
          vistoriaId={dados.id}
          osId={dados.osId}
          numeroOS={dados.numeroOS}
          usuarioId={usuarioId}
          fotosUsadas={dados.fotosComplemento}
        />
      )}

      <FotoTelaCheia
        aberta={tela.aberta && fotosComGrande.length > 0}
        aoFechar={() => setTela((t) => ({ ...t, aberta: false }))}
        fotos={fotosComGrande}
        indice={tela.indice}
        aoMudarIndice={(indice) => setTela((t) => ({ ...t, indice }))}
        aoRecarregar={(f) => setGrandes((g) => Object.fromEntries(Object.entries(g).filter(([k]) => k !== f.id)))}
      />
    </div>
  );
}

function MiniaturaLeitura({ foto, rotulo, aoAbrir }: { foto: FotoLeitura; rotulo: string; aoAbrir: () => void }) {
  const [falhou, setFalhou] = useState(false);
  return (
    <button
      type="button"
      onClick={aoAbrir}
      aria-label={rotulo}
      className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-md bg-superficie-2"
    >
      {foto.src && !falhou ? (
        // URL assinada do Storage: sem otimizador do Next.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={foto.src} alt="" className="h-full w-full object-cover" draggable={false} onError={() => setFalhou(true)} />
      ) : (
        <ImageOff size={28} strokeWidth={2} aria-hidden className="text-texto-suave" />
      )}
    </button>
  );
}
