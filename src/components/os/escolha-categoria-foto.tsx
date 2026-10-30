"use client";

import { useId, useState } from "react";
import { Check } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { Campo } from "@/components/ui/campo";
import { BotaoEnviar, CaixaMensagem } from "@/components/ui/formulario";
import { Folha } from "@/components/ui/folha";
import { CATEGORIAS_FOTO, type CategoriaFoto } from "@/components/os/categorias-foto";

/**
 * Grade de tipos de foto (DESIGN §11.4): 2 colunas, botoes de 56px (secundario, icone 24px
 * + texto 18px/700), ordem fixa, "Outro" com largura total na ultima linha.
 *
 * - `modo="enviar"` (padrao): tocar no tipo ja escolhe (o pai envia a foto). Mostra
 *   "Toque no tipo para enviar." acima da grade.
 * - `modo="selecionar"` (editar na tela cheia): tocar so marca (`aria-pressed`); quem salva
 *   e o primario "Salvar" do pai.
 */
export function EscolhaCategoriaFoto({
  aoEscolher,
  selecionada,
  modo = "enviar",
  desabilitado = false,
}: {
  aoEscolher: (categoria: CategoriaFoto) => void;
  selecionada?: CategoriaFoto | null;
  modo?: "enviar" | "selecionar";
  desabilitado?: boolean;
}) {
  const idTexto = useId();
  const selecionar = modo === "selecionar";
  return (
    <div className="flex flex-col gap-2">
      <p id={idTexto} className="text-sm text-texto-suave">
        {selecionar ? "Toque no tipo certo e depois em Salvar." : "Toque no tipo para enviar."}
      </p>
      <div role="group" aria-labelledby={idTexto} className="grid grid-cols-2 gap-2">
        {CATEGORIAS_FOTO.map(({ valor, rotulo, icone: Icone }) => {
          const ativo = selecionar && valor === selecionada;
          return (
            <button
              key={valor}
              type="button"
              disabled={desabilitado}
              aria-pressed={selecionar ? ativo : undefined}
              onClick={() => aoEscolher(valor)}
              className={`inline-flex min-h-toque-principal items-center justify-start gap-2 rounded-md border-2 px-3 py-1 text-left text-lg leading-tight font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                valor === "outro" ? "col-span-2" : ""
              } ${
                ativo
                  ? "border-grafite bg-primaria text-primaria-texto"
                  : "border-borda bg-superficie text-texto active:bg-superficie-2"
              }`}
            >
              {ativo ? (
                <Check size={24} strokeWidth={2.5} aria-hidden className="shrink-0" />
              ) : (
                <Icone size={24} strokeWidth={2.25} aria-hidden className="shrink-0" />
              )}
              <span className="min-w-0">{rotulo}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Folha "Editar tipo e legenda" (DESIGN §11.8), sobre a `Folha` da Fase 2.
 * Controlada pelo pai; `aoSalvar` faz a gravacao (RPC editar_foto) e devolve `{ erro }` se falhar.
 * Monte com `key` da foto para reiniciar o rascunho a cada abertura.
 */
export function FolhaEditarFoto({
  aberta,
  aoFechar,
  categoriaInicial,
  legendaInicial,
  aoSalvar,
  ajudaLegenda,
}: {
  aberta: boolean;
  aoFechar: () => void;
  categoriaInicial: CategoriaFoto;
  legendaInicial?: string | null;
  aoSalvar: (dados: { categoria: CategoriaFoto; legenda: string }) => Promise<{ erro?: string } | void>;
  /** Dono/atendente: "O mecânico também vê esta legenda." */
  ajudaLegenda?: string;
}) {
  const [categoria, setCategoria] = useState<CategoriaFoto>(categoriaInicial);
  const [legenda, setLegenda] = useState(legendaInicial ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string>();
  const sujo = categoria !== categoriaInicial || legenda !== (legendaInicial ?? "");

  async function salvar() {
    if (salvando) return;
    setErro(undefined);
    setSalvando(true);
    try {
      const r = await aoSalvar({ categoria, legenda: legenda.trim() });
      if (r && r.erro) setErro(r.erro);
      else aoFechar();
    } catch {
      setErro("Não foi possível salvar. Confira a internet e tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Folha
      aberta={aberta}
      aoFechar={aoFechar}
      titulo="Editar tipo e legenda"
      sujo={sujo && !salvando}
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar} disabled={salvando}>
            Voltar
          </Botao>
          <BotaoEnviar type="button" enviando={salvando} rotulo="Salvar" rotuloEnviando="Salvando…" onClick={salvar} />
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Campo
          rotulo="Legenda"
          opcional
          name="legenda"
          value={legenda}
          maxLength={120}
          onChange={(e) => setLegenda(e.target.value)}
          placeholder="Ex.: chicote rompido perto do sensor"
          ajuda={ajudaLegenda}
          autoComplete="off"
          enterKeyHint="done"
        />
        <EscolhaCategoriaFoto modo="selecionar" selecionada={categoria} aoEscolher={setCategoria} desabilitado={salvando} />
        {erro && <CaixaMensagem tipo="erro">{erro}</CaixaMensagem>}
      </div>
    </Folha>
  );
}
