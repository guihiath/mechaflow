"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { RodapeExtra } from "@/components/layout/marcador-pagina";
import { Botao } from "@/components/ui/botao";
import { Campo } from "@/components/ui/campo";
import { Folha } from "@/components/ui/folha";
import { BotaoEnviar, CaixaMensagem } from "@/components/ui/formulario";
import {
  ListaEditorChecklist,
  moverNaLista,
  type Direcao,
  type ItemEditorChecklist,
} from "@/components/vistoria/editor-checklist";
import {
  adicionarItemChecklist,
  moverItemChecklist,
  mudarAtivoItemChecklist,
  renomearItemChecklist,
  type ResultadoChecklist,
} from "@/acoes/configuracoes";
import { MAX_NOME_ITEM, trocasParaMover, validarNomeItem, type ItemChecklist } from "@/lib/checklist";

const SEM_INTERNET = "Não foi possível salvar. Confira a internet e tente de novo.";
const ERRO_ORDEM = "Não foi possível mudar a ordem. Tente de novo.";

/** Mesma lista (ordem, nomes e ativo)? Evita trocar o array à toa (o foco fica onde está). */
function mesmaLista(a: ItemChecklist[], b: ItemChecklist[]) {
  return a.length === b.length && a.every((x, i) => x.id === b[i].id && x.descricao === b[i].descricao && x.ativo === b[i].ativo);
}

type FolhaAberta = { tipo: "novo" } | { tipo: "editar"; item: ItemEditorChecklist } | null;

/**
 * Editor do checklist padrão (DESIGN §12.16): Subir/Descer otimista (a linha troca na hora,
 * o banco confirma por trás), nome abre "Editar item", "Reativar" nos desativados e
 * "Adicionar item" fixo embaixo. Nunca apaga: só desativa.
 */
export function EditorChecklist({ itensIniciais }: { itensIniciais: ItemChecklist[] }) {
  const [itens, setItens] = useState(itensIniciais);
  const confirmados = useRef(itensIniciais);
  const movendo = useRef(0);
  const [erroLista, setErroLista] = useState<string>();
  const [aviso, setAviso] = useState<string>();
  const [folha, setFolha] = useState<FolhaAberta>(null);
  // Rascunhos das folhas (a Folha só existe aberta: o texto mora aqui).
  const [nomeNovo, setNomeNovo] = useState("");
  const [nomeEditado, setNomeEditado] = useState("");
  const [erroCampo, setErroCampo] = useState<string>();
  const [erroFolha, setErroFolha] = useState<string>();
  const [sucessoFolha, setSucessoFolha] = useState<string>();
  const [enviando, iniciar] = useTransition();
  const campoNovo = useRef<HTMLInputElement>(null);

  const ativos = itens.filter((i) => i.ativo);
  const desativados = itens.filter((i) => !i.ativo);

  useEffect(() => {
    if (sucessoFolha) campoNovo.current?.focus();
  }, [sucessoFolha]);

  function aplicarDoServidor(lista: ItemChecklist[] | undefined) {
    if (!lista) return;
    confirmados.current = lista;
    setItens((atual) => (mesmaLista(atual, lista) ? atual : lista));
  }

  function limparMensagens() {
    setErroLista(undefined);
    setAviso(undefined);
  }

  async function mover(id: string, direcao: Direcao) {
    limparMensagens();
    // Otimista: as mesmas trocas que a ação fará no banco (passa os desativados do caminho).
    setItens((atual) => {
      let nova = atual;
      for (let k = trocasParaMover(atual, id, direcao); k > 0; k -= 1) nova = moverNaLista(nova, id, direcao);
      return nova;
    });
    movendo.current += 1;
    let r: ResultadoChecklist;
    try {
      r = await moverItemChecklist(id, direcao);
    } catch {
      r = { erro: ERRO_ORDEM };
    }
    movendo.current -= 1;
    if (r.erro) {
      setErroLista(r.erro);
      if (r.itens) confirmados.current = r.itens;
      setItens(confirmados.current);
      return;
    }
    if (r.itens) confirmados.current = r.itens;
    // Só a última resposta da sequência vale para a tela (as do meio estão "atrasadas").
    if (movendo.current === 0) aplicarDoServidor(r.itens);
  }

  function reativar(item: ItemEditorChecklist) {
    limparMensagens();
    iniciar(async () => {
      try {
        const r = await mudarAtivoItemChecklist(item.id, true);
        aplicarDoServidor(r.itens);
        if (r.erro) setErroLista(r.erro);
        else setAviso(r.mensagem);
      } catch {
        setErroLista(SEM_INTERNET);
      }
    });
  }

  function abrirNovo() {
    limparMensagens();
    setErroCampo(undefined);
    setErroFolha(undefined);
    setSucessoFolha(undefined);
    setFolha({ tipo: "novo" });
  }

  function abrirEditar(item: ItemEditorChecklist) {
    limparMensagens();
    setErroCampo(undefined);
    setErroFolha(undefined);
    setSucessoFolha(undefined);
    setNomeEditado(item.descricao);
    setFolha({ tipo: "editar", item });
  }

  function fechar() {
    setFolha(null);
    setErroCampo(undefined);
    setErroFolha(undefined);
    setSucessoFolha(undefined);
  }

  function enviarNovo(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setSucessoFolha(undefined);
    setErroFolha(undefined);
    const erro = validarNomeItem(nomeNovo, itens);
    setErroCampo(erro);
    if (erro) {
      campoNovo.current?.focus();
      return;
    }
    iniciar(async () => {
      try {
        const r = await adicionarItemChecklist(nomeNovo);
        aplicarDoServidor(r.itens);
        if (r.erroCampo) setErroCampo(r.erroCampo);
        else if (r.erro) setErroFolha(r.erro);
        else {
          setNomeNovo("");
          setSucessoFolha(r.mensagem);
        }
      } catch {
        setErroFolha(SEM_INTERNET);
      }
    });
  }

  function enviarNome(e: FormEvent) {
    e.preventDefault();
    if (enviando || folha?.tipo !== "editar") return;
    const item = folha.item;
    setErroFolha(undefined);
    const erro = validarNomeItem(nomeEditado, itens, item.id);
    setErroCampo(erro);
    if (erro) return;
    iniciar(async () => {
      try {
        const r = await renomearItemChecklist(item.id, nomeEditado);
        aplicarDoServidor(r.itens);
        if (r.erroCampo) setErroCampo(r.erroCampo);
        else if (r.erro) setErroFolha(r.erro);
        else {
          fechar();
          setAviso(r.mensagem);
        }
      } catch {
        setErroFolha(SEM_INTERNET);
      }
    });
  }

  function desativar() {
    if (enviando || folha?.tipo !== "editar") return;
    const item = folha.item;
    setErroFolha(undefined);
    iniciar(async () => {
      try {
        const r = await mudarAtivoItemChecklist(item.id, false);
        aplicarDoServidor(r.itens);
        if (r.erro) setErroFolha(r.erro);
        else {
          fechar();
          setAviso(r.mensagem);
        }
      } catch {
        setErroFolha(SEM_INTERNET);
      }
    });
  }

  return (
    <>
      {aviso && <CaixaMensagem tipo="sucesso">{aviso}</CaixaMensagem>}
      <ListaEditorChecklist
        ativos={ativos}
        desativados={desativados}
        aoMover={mover}
        aoEditar={abrirEditar}
        aoReativar={reativar}
        erro={erroLista}
      />

      {/* Celular: "Adicionar item" fixo acima da barra inferior; o espaço evita cobrir a última linha. */}
      <RodapeExtra />
      <div aria-hidden className="h-20 lg:hidden" />
      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 px-4 pb-2 lg:static lg:p-0">
        <Botao onClick={abrirNovo} className="shadow-barra lg:w-auto lg:shadow-none">
          <Plus size={24} strokeWidth={2.25} aria-hidden />
          Adicionar item
        </Botao>
      </div>

      {folha?.tipo === "novo" && (
        <Folha
          aberta
          aoFechar={fechar}
          titulo="Novo item"
          sujo={nomeNovo.trim() !== ""}
          aoDescartar={() => setNomeNovo("")}
          rodape={
            <>
              {sucessoFolha && (
                <Botao variante="secundario" onClick={fechar}>
                  Concluir
                </Botao>
              )}
              <BotaoEnviar
                form="form-novo-item"
                enviando={enviando}
                rotulo="Adicionar ao checklist"
                rotuloEnviando="Adicionando…"
              />
            </>
          }
        >
          <form id="form-novo-item" noValidate onSubmit={enviarNovo} className="flex flex-col gap-4">
            {sucessoFolha && <CaixaMensagem tipo="sucesso">{sucessoFolha} Pode escrever o próximo.</CaixaMensagem>}
            <Campo
              ref={campoNovo}
              rotulo="Nome do item"
              name="descricao"
              placeholder="Ex.: Lona da carroceria"
              autoComplete="off"
              enterKeyHint="done"
              maxLength={MAX_NOME_ITEM}
              value={nomeNovo}
              onChange={(e) => {
                setNomeNovo(e.target.value);
                setErroCampo(undefined);
              }}
              erro={erroCampo}
              ajuda="Entra no fim da lista. Depois dá para subir."
            />
            {erroFolha && <CaixaMensagem tipo="erro">{erroFolha}</CaixaMensagem>}
          </form>
        </Folha>
      )}

      {folha?.tipo === "editar" && (
        <Folha
          aberta
          aoFechar={fechar}
          titulo="Editar item"
          rodape={
            <>
              <Botao variante="secundario" onClick={desativar} disabled={enviando}>
                Desativar item
              </Botao>
              <BotaoEnviar form="form-editar-item" enviando={enviando} rotulo="Salvar nome" />
            </>
          }
        >
          <form id="form-editar-item" noValidate onSubmit={enviarNome} className="flex flex-col gap-4">
            <Campo
              rotulo="Nome do item"
              name="descricao"
              autoComplete="off"
              enterKeyHint="done"
              maxLength={MAX_NOME_ITEM}
              value={nomeEditado}
              onChange={(e) => {
                setNomeEditado(e.target.value);
                setErroCampo(undefined);
              }}
              erro={erroCampo}
              ajuda="Vistorias já feitas continuam com o nome antigo."
            />
            <p className="text-base text-texto-suave">
              Desativar tira o item das próximas vistorias. Dá para reativar depois, na lista.
            </p>
            {erroFolha && <CaixaMensagem tipo="erro">{erroFolha}</CaixaMensagem>}
          </form>
        </Folha>
      )}
    </>
  );
}
