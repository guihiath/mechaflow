// Tipos do banco no formato do `supabase gen types typescript`.
// Escrito a mao a partir de supabase/migrations/20261028000001..4 (Fase 1).
// Fase 4 (vistoria): migracoes 20261101000001..4.
// Fase 7 (painel, historico, PDF): migracoes 20261104000001..4; contratos JSON no fim do arquivo.
// Para regenerar: npx supabase gen types typescript --project-id qjzhzyzmifashtvffxdx > src/lib/supabase/database.types.ts

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      checklist_modelos: {
        // Modelo de checklist (1 padrao por oficina). Dono: update { nome }.
        Row: {
          atualizado_em: string
          criado_em: string
          id: string
          nome: string
          oficina_id: string
          padrao: boolean
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          id?: string
          nome: string
          oficina_id?: string
          padrao?: boolean
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          id?: string
          nome?: string
          oficina_id?: string
          padrao?: boolean
        }
        Relationships: []
      }
      checklist_modelo_itens: {
        // Dono: insert { modelo_id, descricao } (ordem = fim), update { descricao, ativo }; ordem: rpc mover_item_checklist. Sem delete.
        Row: {
          ativo: boolean
          atualizado_em: string
          criado_em: string
          descricao: string
          id: string
          modelo_id: string
          oficina_id: string
          ordem: number
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          descricao: string
          id?: string
          modelo_id: string
          oficina_id?: string
          ordem?: number
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          descricao?: string
          id?: string
          modelo_id?: string
          oficina_id?: string
          ordem?: number
        }
        Relationships: [
          {
            foreignKeyName: "checklist_modelo_itens_modelo_fk"
            columns: ["modelo_id", "oficina_id"]
            isOneToOne: false
            referencedRelation: "checklist_modelos"
            referencedColumns: ["id", "oficina_id"]
          },
        ]
      }
      vistorias: {
        // Escrita so pelas RPCs da vistoria. Concluida = imutavel (trigger). km/horimetro: copia da conclusao (em rascunho use vw_vistorias).
        Row: {
          anulada_em: string | null
          anulada_por: string | null
          assinado_por_nome: string | null
          assinatura_altura: number | null
          assinatura_caminho: string | null
          assinatura_id: string | null
          assinatura_largura: number | null
          assinatura_registrada_por: string | null
          assinatura_tamanho_bytes: number | null
          atualizado_em: string
          combustivel: Database["public"]["Enums"]["nivel_combustivel"] | null
          concluida_em: string | null
          concluida_por: string | null
          criado_em: string
          criado_por: string | null
          hash_conteudo: string | null
          horimetro: number | null
          id: string
          km: number | null
          motivo_anulacao: string | null
          objetos: string[] | null
          observacoes: string | null
          sem_avarias: boolean
          oficina_id: string
          os_id: string
          sem_assinatura_motivo: Database["public"]["Enums"]["motivo_sem_assinatura"] | null
          status: Database["public"]["Enums"]["status_vistoria"]
          tipo: Database["public"]["Enums"]["tipo_vistoria"]
          veiculo_id: string
        }
        Insert: {
          anulada_em?: string | null
          anulada_por?: string | null
          assinado_por_nome?: string | null
          assinatura_altura?: number | null
          assinatura_caminho?: string | null
          assinatura_id?: string | null
          assinatura_largura?: number | null
          assinatura_registrada_por?: string | null
          assinatura_tamanho_bytes?: number | null
          atualizado_em?: string
          combustivel?: Database["public"]["Enums"]["nivel_combustivel"] | null
          concluida_em?: string | null
          concluida_por?: string | null
          criado_em?: string
          criado_por?: string | null
          hash_conteudo?: string | null
          horimetro?: number | null
          id?: string
          km?: number | null
          motivo_anulacao?: string | null
          objetos?: string[] | null
          observacoes?: string | null
          sem_avarias?: boolean
          oficina_id: string
          os_id: string
          sem_assinatura_motivo?: Database["public"]["Enums"]["motivo_sem_assinatura"] | null
          status?: Database["public"]["Enums"]["status_vistoria"]
          tipo?: Database["public"]["Enums"]["tipo_vistoria"]
          veiculo_id: string
        }
        Update: {
          anulada_em?: string | null
          anulada_por?: string | null
          assinado_por_nome?: string | null
          assinatura_altura?: number | null
          assinatura_caminho?: string | null
          assinatura_id?: string | null
          assinatura_largura?: number | null
          assinatura_registrada_por?: string | null
          assinatura_tamanho_bytes?: number | null
          atualizado_em?: string
          combustivel?: Database["public"]["Enums"]["nivel_combustivel"] | null
          concluida_em?: string | null
          concluida_por?: string | null
          criado_em?: string
          criado_por?: string | null
          hash_conteudo?: string | null
          horimetro?: number | null
          id?: string
          km?: number | null
          motivo_anulacao?: string | null
          objetos?: string[] | null
          observacoes?: string | null
          sem_avarias?: boolean
          oficina_id?: string
          os_id?: string
          sem_assinatura_motivo?: Database["public"]["Enums"]["motivo_sem_assinatura"] | null
          status?: Database["public"]["Enums"]["status_vistoria"]
          tipo?: Database["public"]["Enums"]["tipo_vistoria"]
          veiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vistorias_os_fk"
            columns: ["os_id", "oficina_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id", "oficina_id"]
          },
          {
            foreignKeyName: "vistorias_veiculo_fk"
            columns: ["veiculo_id", "oficina_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id", "oficina_id"]
          },
        ]
      }
      vistoria_itens: {
        // Checklist COPIADO do modelo. Escrita: marcar_item_vistoria / marcar_itens_restantes_ok.
        Row: {
          descricao: string
          id: string
          marcado_em: string | null
          marcado_por: string | null
          modelo_item_id: string | null
          observacao: string | null
          oficina_id: string
          ordem: number
          situacao: Database["public"]["Enums"]["situacao_item_vistoria"] | null
          vistoria_id: string
        }
        Insert: {
          descricao: string
          id?: string
          marcado_em?: string | null
          marcado_por?: string | null
          modelo_item_id?: string | null
          observacao?: string | null
          oficina_id: string
          ordem: number
          situacao?: Database["public"]["Enums"]["situacao_item_vistoria"] | null
          vistoria_id: string
        }
        Update: {
          descricao?: string
          id?: string
          marcado_em?: string | null
          marcado_por?: string | null
          modelo_item_id?: string | null
          observacao?: string | null
          oficina_id?: string
          ordem?: number
          situacao?: Database["public"]["Enums"]["situacao_item_vistoria"] | null
          vistoria_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vistoria_itens_vistoria_fk"
            columns: ["vistoria_id", "oficina_id"]
            isOneToOne: false
            referencedRelation: "vistorias"
            referencedColumns: ["id", "oficina_id"]
          },
        ]
      }
      vistoria_avarias: {
        // Escrita: salvar_avaria / remover_avaria (id gerado no navegador).
        Row: {
          atualizado_em: string
          criado_em: string
          criado_por: string | null
          descricao: string | null
          id: string
          lado: Database["public"]["Enums"]["lado_avaria"]
          oficina_id: string
          vistoria_id: string
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          descricao?: string | null
          id: string
          lado: Database["public"]["Enums"]["lado_avaria"]
          oficina_id: string
          vistoria_id: string
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          lado?: Database["public"]["Enums"]["lado_avaria"]
          oficina_id?: string
          vistoria_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vistoria_avarias_vistoria_fk"
            columns: ["vistoria_id", "oficina_id"]
            isOneToOne: false
            referencedRelation: "vistorias"
            referencedColumns: ["id", "oficina_id"]
          },
        ]
      }
      vistoria_complementos: {
        // So insert, pela RPC complementar_vistoria. Nunca muda.
        Row: {
          criado_em: string
          criado_por: string | null
          id: string
          oficina_id: string
          texto: string | null
          vistoria_id: string
        }
        Insert: {
          criado_em?: string
          criado_por?: string | null
          id: string
          oficina_id: string
          texto?: string | null
          vistoria_id: string
        }
        Update: {
          criado_em?: string
          criado_por?: string | null
          id?: string
          oficina_id?: string
          texto?: string | null
          vistoria_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vistoria_complementos_vistoria_fk"
            columns: ["vistoria_id", "oficina_id"]
            isOneToOne: false
            referencedRelation: "vistorias"
            referencedColumns: ["id", "oficina_id"]
          },
        ]
      }
      vistoria_fotos: {
        // Bucket 'vistorias'. Escrita: registrar_foto_vistoria / confirmar_foto_vistoria / apagar_foto_vistoria.
        Row: {
          altura: number
          avaria_id: string | null
          caminho: string
          caminho_miniatura: string
          complemento_id: string | null
          criado_em: string
          criado_por: string | null
          enviada_em: string | null
          id: string
          largura: number
          legenda: string | null
          oficina_id: string
          os_id: string
          tamanho_bytes: number
          tamanho_miniatura_bytes: number
          tipo: Database["public"]["Enums"]["tipo_foto_vistoria"]
          vistoria_id: string
        }
        Insert: {
          altura: number
          avaria_id?: string | null
          caminho?: string
          caminho_miniatura?: string
          complemento_id?: string | null
          criado_em?: string
          criado_por?: string | null
          enviada_em?: string | null
          id: string
          largura: number
          legenda?: string | null
          oficina_id: string
          os_id: string
          tamanho_bytes: number
          tamanho_miniatura_bytes: number
          tipo: Database["public"]["Enums"]["tipo_foto_vistoria"]
          vistoria_id: string
        }
        Update: {
          altura?: number
          avaria_id?: string | null
          caminho?: string
          caminho_miniatura?: string
          complemento_id?: string | null
          criado_em?: string
          criado_por?: string | null
          enviada_em?: string | null
          id?: string
          largura?: number
          legenda?: string | null
          oficina_id?: string
          os_id?: string
          tamanho_bytes?: number
          tamanho_miniatura_bytes?: number
          tipo?: Database["public"]["Enums"]["tipo_foto_vistoria"]
          vistoria_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vistoria_fotos_vistoria_fk"
            columns: ["vistoria_id", "oficina_id"]
            isOneToOne: false
            referencedRelation: "vistorias"
            referencedColumns: ["id", "oficina_id"]
          },
          {
            foreignKeyName: "vistoria_fotos_avaria_fk"
            columns: ["avaria_id", "vistoria_id"]
            isOneToOne: false
            referencedRelation: "vistoria_avarias"
            referencedColumns: ["id", "vistoria_id"]
          },
          {
            foreignKeyName: "vistoria_fotos_complemento_fk"
            columns: ["complemento_id", "vistoria_id"]
            isOneToOne: false
            referencedRelation: "vistoria_complementos"
            referencedColumns: ["id", "vistoria_id"]
          },
        ]
      }
      catalogo_pecas: {
        Row: {
          ativo: boolean
          codigo: string | null
          criado_em: string
          criado_por: string | null
          fornecedor: string | null
          id: string
          nome: string
          oficina_id: string
          pendente_precificacao: boolean
          unidade: string
          atualizado_em: string
        }
        Insert: {
          ativo?: boolean
          codigo?: string | null
          criado_em?: string
          criado_por?: string | null
          fornecedor?: string | null
          id?: string
          nome: string
          oficina_id?: string
          pendente_precificacao?: boolean
          unidade?: string
          atualizado_em?: string
        }
        Update: {
          ativo?: boolean
          codigo?: string | null
          criado_em?: string
          criado_por?: string | null
          fornecedor?: string | null
          id?: string
          nome?: string
          oficina_id?: string
          pendente_precificacao?: boolean
          unidade?: string
          atualizado_em?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalogo_pecas_oficina_id_fkey"
            columns: ["oficina_id"]
            isOneToOne: false
            referencedRelation: "oficinas"
            referencedColumns: ["id"]
          },
        ]
      }
      catalogo_pecas_custos: {
        Row: {
          atualizado_em: string
          custo_centavos: number
          oficina_id: string
          peca_id: string
        }
        Insert: {
          atualizado_em?: string
          custo_centavos: number
          oficina_id?: string
          peca_id: string
        }
        Update: {
          atualizado_em?: string
          custo_centavos?: number
          oficina_id?: string
          peca_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalogo_pecas_custos_peca_fk"
            columns: ["peca_id", "oficina_id"]
            isOneToOne: true
            referencedRelation: "catalogo_pecas"
            referencedColumns: ["id", "oficina_id"]
          },
          {
            foreignKeyName: "catalogo_pecas_custos_peca_fk"
            columns: ["peca_id", "oficina_id"]
            isOneToOne: true
            referencedRelation: "vw_catalogo_pecas"
            referencedColumns: ["id", "oficina_id"]
          },
        ]
      }
      catalogo_pecas_precos: {
        Row: {
          atualizado_em: string
          oficina_id: string
          peca_id: string
          preco_venda_centavos: number
        }
        Insert: {
          atualizado_em?: string
          oficina_id?: string
          peca_id: string
          preco_venda_centavos: number
        }
        Update: {
          atualizado_em?: string
          oficina_id?: string
          peca_id?: string
          preco_venda_centavos?: number
        }
        Relationships: [
          {
            foreignKeyName: "catalogo_pecas_precos_peca_fk"
            columns: ["peca_id", "oficina_id"]
            isOneToOne: true
            referencedRelation: "catalogo_pecas"
            referencedColumns: ["id", "oficina_id"]
          },
          {
            foreignKeyName: "catalogo_pecas_precos_peca_fk"
            columns: ["peca_id", "oficina_id"]
            isOneToOne: true
            referencedRelation: "vw_catalogo_pecas"
            referencedColumns: ["id", "oficina_id"]
          },
        ]
      }
      catalogo_servicos: {
        Row: {
          ativo: boolean
          atualizado_em: string
          criado_em: string
          criado_por: string | null
          descricao: string | null
          id: string
          nome: string
          oficina_id: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          nome: string
          oficina_id?: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          nome?: string
          oficina_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalogo_servicos_oficina_id_fkey"
            columns: ["oficina_id"]
            isOneToOne: false
            referencedRelation: "oficinas"
            referencedColumns: ["id"]
          },
        ]
      }
      catalogo_servicos_precos: {
        Row: {
          atualizado_em: string
          oficina_id: string
          preco_padrao_centavos: number
          servico_id: string
        }
        Insert: {
          atualizado_em?: string
          oficina_id?: string
          preco_padrao_centavos: number
          servico_id: string
        }
        Update: {
          atualizado_em?: string
          oficina_id?: string
          preco_padrao_centavos?: number
          servico_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalogo_servicos_precos_servico_fk"
            columns: ["servico_id", "oficina_id"]
            isOneToOne: true
            referencedRelation: "catalogo_servicos"
            referencedColumns: ["id", "oficina_id"]
          },
          {
            foreignKeyName: "catalogo_servicos_precos_servico_fk"
            columns: ["servico_id", "oficina_id"]
            isOneToOne: true
            referencedRelation: "vw_catalogo_servicos"
            referencedColumns: ["id", "oficina_id"]
          },
        ]
      }
      clientes: {
        Row: {
          atualizado_em: string
          criado_em: string
          criado_por: string | null
          documento: string | null
          email: string | null
          id: string
          modo_padrao: Database["public"]["Enums"]["modo_atendimento_cliente"]
          nome: string
          observacoes: string | null
          oficina_id: string
          telefone: string | null
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          documento?: string | null
          email?: string | null
          id?: string
          modo_padrao?: Database["public"]["Enums"]["modo_atendimento_cliente"]
          nome: string
          observacoes?: string | null
          oficina_id?: string
          telefone?: string | null
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          documento?: string | null
          email?: string | null
          id?: string
          modo_padrao?: Database["public"]["Enums"]["modo_atendimento_cliente"]
          nome?: string
          observacoes?: string | null
          oficina_id?: string
          telefone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clientes_oficina_id_fkey"
            columns: ["oficina_id"]
            isOneToOne: false
            referencedRelation: "oficinas"
            referencedColumns: ["id"]
          },
        ]
      }
      convites: {
        Row: {
          criado_em: string
          criado_por: string | null
          expira_em: string
          id: string
          nome_sugerido: string | null
          oficina_id: string
          papel: Database["public"]["Enums"]["papel_usuario"]
          revogado_em: string | null
          token_hash: string
          usado_em: string | null
          usado_por: string | null
        }
        Insert: {
          criado_em?: string
          criado_por?: string | null
          expira_em: string
          id?: string
          nome_sugerido?: string | null
          oficina_id: string
          papel: Database["public"]["Enums"]["papel_usuario"]
          revogado_em?: string | null
          token_hash: string
          usado_em?: string | null
          usado_por?: string | null
        }
        Update: {
          criado_em?: string
          criado_por?: string | null
          expira_em?: string
          id?: string
          nome_sugerido?: string | null
          oficina_id?: string
          papel?: Database["public"]["Enums"]["papel_usuario"]
          revogado_em?: string | null
          token_hash?: string
          usado_em?: string | null
          usado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "convites_oficina_id_fkey"
            columns: ["oficina_id"]
            isOneToOne: false
            referencedRelation: "oficinas"
            referencedColumns: ["id"]
          },
        ]
      }
      oficinas: {
        Row: {
          atualizado_em: string
          criado_em: string
          criado_por: string | null
          documento: string | null
          fuso_horario: string
          id: string
          logo_path: string | null
          nome: string
          plano: string
          primeiros_passos_dispensado_em: string | null
          telefone: string | null
          vistoria_obrigatoria: boolean
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          documento?: string | null
          fuso_horario?: string
          id?: string
          logo_path?: string | null
          nome: string
          plano?: string
          primeiros_passos_dispensado_em?: string | null
          telefone?: string | null
          vistoria_obrigatoria?: boolean
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          documento?: string | null
          fuso_horario?: string
          id?: string
          logo_path?: string | null
          nome?: string
          plano?: string
          primeiros_passos_dispensado_em?: string | null
          telefone?: string | null
          vistoria_obrigatoria?: boolean
        }
        Relationships: []
      }
      ordens_servico: {
        Row: {
          atualizado_em: string
          autorizado_em: string | null
          cancelado_em: string | null
          cancelado_por: string | null
          causa_encontrada: string | null
          chave_idempotencia: string
          cliente_id: string
          codigo_falha: string | null
          criado_em: string
          criado_por: string | null
          entregue_em: string | null
          horimetro: number | null
          id: string
          iniciado_em: string | null
          km: number | null
          mecanico_id: string | null
          modo: Database["public"]["Enums"]["modo_os"]
          motivo_cancelamento: string | null
          numero: number
          oficina_id: string
          orcamento_aprovado_em: string | null
          orcamento_enviado_em: string | null
          pronta_em: string | null
          sintoma_relatado: string | null
          solucao_aplicada: string | null
          status: Database["public"]["Enums"]["status_os"]
          veiculo_id: string
        }
        // Sem INSERT direto (so a RPC abrir_os). Tipo mantido no formato do gen types.
        Insert: {
          atualizado_em?: string
          autorizado_em?: string | null
          cancelado_em?: string | null
          cancelado_por?: string | null
          causa_encontrada?: string | null
          chave_idempotencia: string
          cliente_id: string
          codigo_falha?: string | null
          criado_em?: string
          criado_por?: string | null
          entregue_em?: string | null
          horimetro?: number | null
          id?: string
          iniciado_em?: string | null
          km?: number | null
          mecanico_id?: string | null
          modo: Database["public"]["Enums"]["modo_os"]
          motivo_cancelamento?: string | null
          numero: number
          oficina_id?: string
          orcamento_aprovado_em?: string | null
          orcamento_enviado_em?: string | null
          pronta_em?: string | null
          sintoma_relatado?: string | null
          solucao_aplicada?: string | null
          status: Database["public"]["Enums"]["status_os"]
          veiculo_id: string
        }
        // UPDATE direto: so km, horimetro, sintoma_relatado, codigo_falha,
        // causa_encontrada, solucao_aplicada (dono/atendente). A observacao do
        // balcao saiu daqui (Fase 3, F3-A3): fica em os_comercial.observacoes.
        Update: {
          atualizado_em?: string
          autorizado_em?: string | null
          cancelado_em?: string | null
          cancelado_por?: string | null
          causa_encontrada?: string | null
          chave_idempotencia?: string
          cliente_id?: string
          codigo_falha?: string | null
          criado_em?: string
          criado_por?: string | null
          entregue_em?: string | null
          horimetro?: number | null
          id?: string
          iniciado_em?: string | null
          km?: number | null
          mecanico_id?: string | null
          modo?: Database["public"]["Enums"]["modo_os"]
          motivo_cancelamento?: string | null
          numero?: number
          oficina_id?: string
          orcamento_aprovado_em?: string | null
          orcamento_enviado_em?: string | null
          pronta_em?: string | null
          sintoma_relatado?: string | null
          solucao_aplicada?: string | null
          status?: Database["public"]["Enums"]["status_os"]
          veiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ordens_servico_cliente_fk"
            columns: ["cliente_id", "oficina_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id", "oficina_id"]
          },
          {
            foreignKeyName: "ordens_servico_mecanico_fk"
            columns: ["mecanico_id", "oficina_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id", "oficina_id"]
          },
          {
            foreignKeyName: "ordens_servico_oficina_id_fkey"
            columns: ["oficina_id"]
            isOneToOne: false
            referencedRelation: "oficinas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_servico_veiculo_fk"
            columns: ["veiculo_id", "oficina_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id", "oficina_id"]
          },
        ]
      }
      orcamento_versoes: {
        // Versao congelada (sem custo). So INSERT por RPC; imutavel por trigger. Mecanico: 0 linhas.
        Row: {
          conteudo: Json
          congelada_em: string
          congelada_por: string | null
          hash_conteudo: string
          id: string
          numero: number
          oficina_id: string
          origem: Database["public"]["Enums"]["origem_versao_orcamento"]
          os_id: string
          subtotal_pecas_centavos: number
          subtotal_servicos_centavos: number
          total_centavos: number
        }
        Insert: Record<string, never>
        Update: Record<string, never>
        Relationships: []
      }
      orcamento_links: {
        // token_hash fora do GRANT: nem o balcao le. So revogar muda a linha (trigger).
        Row: {
          chave_idempotencia: string
          criado_em: string
          criado_por: string | null
          expira_em: string
          id: string
          oficina_id: string
          os_id: string
          revogado_em: string | null
          revogado_motivo: Database["public"]["Enums"]["motivo_revogacao_link"] | null
          revogado_por: string | null
          versao_id: string
        }
        Insert: Record<string, never>
        Update: Record<string, never>
        Relationships: []
      }
      orcamento_respostas: {
        // Prova. So INSERT por RPC; a unica mudanca aceita e marcar desfeita uma vez.
        Row: {
          aprovou: boolean
          canal: Database["public"]["Enums"]["canal_resposta"]
          desfeita_em: string | null
          desfeita_por: string | null
          desfeita_por_nome: string | null
          hash_resposta: string
          hash_versao: string
          id: string
          link_id: string | null
          motivo: string | null
          oficina_id: string
          os_id: string
          registrada_por: string | null
          respondente_nome: string | null
          respondido_em: string
          valor_centavos: number
          versao_id: string
        }
        Insert: Record<string, never>
        Update: Record<string, never>
        Relationships: []
      }
      orcamento_resposta_rede: {
        // IP e navegador. Nao usar em tela (decisao do CEO). Some depois de apagar_em.
        Row: {
          apagar_em: string
          ip: string | null
          ip_fonte: string | null
          oficina_id: string
          resposta_id: string
          user_agent: string | null
        }
        Insert: Record<string, never>
        Update: Record<string, never>
        Relationships: []
      }
      os_comercial: {
        Row: {
          atualizado_em: string
          autorizacao_registrada_por: string | null
          autorizado_por_nome: string | null
          autorizado_por_telefone: string | null
          motivo_cancelamento_texto: string | null
          observacoes: string | null
          forma_pagamento: Database["public"]["Enums"]["forma_pagamento"] | null
          oficina_id: string
          orcamento_aprovacao_canal: Database["public"]["Enums"]["canal_resposta"] | null
          orcamento_aprovacao_registrada_por: string | null
          orcamento_aprovado_por_nome: string | null
          orcamento_versao_vigente_id: string | null
          os_id: string
          pagamento_registrado_por: string | null
          pago_em: string | null
          valor_aprovado_centavos: number | null
        }
        // Escrita so pelas RPCs; UPDATE direto so de observacoes (dono/atendente).
        Insert: {
          atualizado_em?: string
          autorizacao_registrada_por?: string | null
          autorizado_por_nome?: string | null
          autorizado_por_telefone?: string | null
          motivo_cancelamento_texto?: string | null
          observacoes?: string | null
          forma_pagamento?: Database["public"]["Enums"]["forma_pagamento"] | null
          oficina_id?: string
          orcamento_aprovacao_canal?: Database["public"]["Enums"]["canal_resposta"] | null
          orcamento_aprovacao_registrada_por?: string | null
          orcamento_aprovado_por_nome?: string | null
          os_id: string
          pagamento_registrado_por?: string | null
          pago_em?: string | null
          valor_aprovado_centavos?: number | null
        }
        Update: {
          atualizado_em?: string
          autorizacao_registrada_por?: string | null
          autorizado_por_nome?: string | null
          autorizado_por_telefone?: string | null
          motivo_cancelamento_texto?: string | null
          observacoes?: string | null
          forma_pagamento?: Database["public"]["Enums"]["forma_pagamento"] | null
          oficina_id?: string
          orcamento_aprovacao_canal?: Database["public"]["Enums"]["canal_resposta"] | null
          orcamento_aprovacao_registrada_por?: string | null
          orcamento_aprovado_por_nome?: string | null
          os_id?: string
          pagamento_registrado_por?: string | null
          pago_em?: string | null
          valor_aprovado_centavos?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "os_comercial_os_fk"
            columns: ["os_id", "oficina_id"]
            isOneToOne: true
            referencedRelation: "ordens_servico"
            referencedColumns: ["id", "oficina_id"]
          },
        ]
      }
      os_fotos: {
        Row: {
          altura: number
          caminho: string
          caminho_miniatura: string
          categoria: Database["public"]["Enums"]["categoria_foto"]
          criado_em: string
          criado_por: string | null
          enviada_em: string | null
          id: string
          largura: number
          legenda: string | null
          oficina_id: string
          os_id: string
          tamanho_bytes: number
          tamanho_miniatura_bytes: number
        }
        // Escrita so pelas RPCs registrar_foto / confirmar_foto / editar_foto / apagar_foto.
        Insert: {
          altura: number
          categoria?: Database["public"]["Enums"]["categoria_foto"]
          criado_em?: string
          criado_por?: string | null
          enviada_em?: string | null
          id: string
          largura: number
          legenda?: string | null
          oficina_id: string
          os_id: string
          tamanho_bytes: number
          tamanho_miniatura_bytes: number
        }
        Update: {
          altura?: number
          categoria?: Database["public"]["Enums"]["categoria_foto"]
          criado_em?: string
          criado_por?: string | null
          enviada_em?: string | null
          id?: string
          largura?: number
          legenda?: string | null
          oficina_id?: string
          os_id?: string
          tamanho_bytes?: number
          tamanho_miniatura_bytes?: number
        }
        Relationships: [
          {
            foreignKeyName: "os_fotos_os_fk"
            columns: ["os_id", "oficina_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id", "oficina_id"]
          },
        ]
      }
      os_historico: {
        Row: {
          de_status: Database["public"]["Enums"]["status_os"] | null
          em: string
          evento: string
          id: string
          observacao: string | null
          oficina_id: string
          os_id: string
          para_status: Database["public"]["Enums"]["status_os"] | null
          por: string | null
        }
        // Escrita so pelas RPCs.
        Insert: {
          de_status?: Database["public"]["Enums"]["status_os"] | null
          em?: string
          evento: string
          id?: string
          observacao?: string | null
          oficina_id: string
          os_id: string
          para_status?: Database["public"]["Enums"]["status_os"] | null
          por?: string | null
        }
        Update: {
          de_status?: Database["public"]["Enums"]["status_os"] | null
          em?: string
          evento?: string
          id?: string
          observacao?: string | null
          oficina_id?: string
          os_id?: string
          para_status?: Database["public"]["Enums"]["status_os"] | null
          por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "os_historico_os_fk"
            columns: ["os_id", "oficina_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id", "oficina_id"]
          },
        ]
      }
      os_historico_textos: {
        Row: {
          historico_id: string
          observacao: string
          oficina_id: string
        }
        // Escrita so pelas RPCs. So dono e atendente leem (texto livre do balcao).
        Insert: {
          historico_id: string
          observacao: string
          oficina_id: string
        }
        Update: {
          historico_id?: string
          observacao?: string
          oficina_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "os_historico_textos_historico_fk"
            columns: ["historico_id", "oficina_id"]
            isOneToOne: true
            referencedRelation: "os_historico"
            referencedColumns: ["id", "oficina_id"]
          },
        ]
      }
      os_itens: {
        Row: {
          atualizado_em: string
          chave_idempotencia: string | null
          criado_em: string
          descricao: string
          apos_aprovacao: boolean
          id: string
          lancado_pelo_mecanico: boolean
          lancado_por: string | null
          oficina_id: string
          os_id: string
          peca_id: string | null
          precificado_pelo_balcao_em: string | null
          quantidade: number
          servico_id: string | null
          tipo: Database["public"]["Enums"]["tipo_item_os"]
          unidade: string
        }
        Insert: {
          atualizado_em?: string
          chave_idempotencia?: string | null
          criado_em?: string
          descricao: string
          apos_aprovacao?: boolean
          id?: string
          lancado_pelo_mecanico?: boolean
          lancado_por?: string | null
          oficina_id?: string
          os_id: string
          peca_id?: string | null
          quantidade?: number
          servico_id?: string | null
          tipo: Database["public"]["Enums"]["tipo_item_os"]
          unidade?: string
        }
        // UPDATE direto: so descricao, quantidade e unidade (dono/atendente).
        // O mecanico usa as RPCs adicionar_item_os / alterar_item_mecanico / remover_item_mecanico.
        // lancado_pelo_mecanico, apos_aprovacao, precificado_pelo_balcao_em: gravados por trigger.
        Update: {
          apos_aprovacao?: boolean
          atualizado_em?: string
          chave_idempotencia?: string | null
          criado_em?: string
          descricao?: string
          id?: string
          lancado_pelo_mecanico?: boolean
          lancado_por?: string | null
          oficina_id?: string
          os_id?: string
          peca_id?: string | null
          quantidade?: number
          servico_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_item_os"]
          unidade?: string
        }
        Relationships: [
          {
            foreignKeyName: "os_itens_os_fk"
            columns: ["os_id", "oficina_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id", "oficina_id"]
          },
          {
            foreignKeyName: "os_itens_peca_fk"
            columns: ["peca_id", "oficina_id"]
            isOneToOne: false
            referencedRelation: "catalogo_pecas"
            referencedColumns: ["id", "oficina_id"]
          },
          {
            foreignKeyName: "os_itens_servico_fk"
            columns: ["servico_id", "oficina_id"]
            isOneToOne: false
            referencedRelation: "catalogo_servicos"
            referencedColumns: ["id", "oficina_id"]
          },
        ]
      }
      os_itens_custos: {
        Row: {
          atualizado_em: string
          custo_unitario_centavos: number
          item_id: string
          oficina_id: string
        }
        Insert: {
          atualizado_em?: string
          custo_unitario_centavos: number
          item_id: string
          oficina_id?: string
        }
        Update: {
          atualizado_em?: string
          custo_unitario_centavos?: number
          item_id?: string
          oficina_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "os_itens_custos_item_fk"
            columns: ["item_id", "oficina_id"]
            isOneToOne: true
            referencedRelation: "os_itens"
            referencedColumns: ["id", "oficina_id"]
          },
        ]
      }
      os_itens_precos: {
        Row: {
          atualizado_em: string
          item_id: string
          oficina_id: string
          preco_unitario_centavos: number
        }
        Insert: {
          atualizado_em?: string
          item_id: string
          oficina_id?: string
          preco_unitario_centavos: number
        }
        Update: {
          atualizado_em?: string
          item_id?: string
          oficina_id?: string
          preco_unitario_centavos?: number
        }
        Relationships: [
          {
            foreignKeyName: "os_itens_precos_item_fk"
            columns: ["item_id", "oficina_id"]
            isOneToOne: true
            referencedRelation: "os_itens"
            referencedColumns: ["id", "oficina_id"]
          },
        ]
      }
      perfis: {
        Row: {
          ativo: boolean
          atualizado_em: string
          criado_em: string
          email: string | null
          id: string
          nome: string
          oficina_id: string
          papel: Database["public"]["Enums"]["papel_usuario"]
          telefone: string | null
          ve_todas_os: boolean
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          email?: string | null
          id: string
          nome: string
          oficina_id: string
          papel: Database["public"]["Enums"]["papel_usuario"]
          telefone?: string | null
          ve_todas_os?: boolean
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          email?: string | null
          id?: string
          nome?: string
          oficina_id?: string
          papel?: Database["public"]["Enums"]["papel_usuario"]
          telefone?: string | null
          ve_todas_os?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "perfis_oficina_id_fkey"
            columns: ["oficina_id"]
            isOneToOne: false
            referencedRelation: "oficinas"
            referencedColumns: ["id"]
          },
        ]
      }
      termos_aceite: {
        Row: {
          aceito_em: string
          autoriza_uso_anonimizado: boolean
          id: string
          ip: string | null
          oficina_id: string
          user_agent: string | null
          usuario_id: string
          versao: string
        }
        Insert: {
          aceito_em?: string
          autoriza_uso_anonimizado: boolean
          id?: string
          ip?: string | null
          oficina_id: string
          user_agent?: string | null
          usuario_id: string
          versao: string
        }
        Update: {
          aceito_em?: string
          autoriza_uso_anonimizado?: boolean
          id?: string
          ip?: string | null
          oficina_id?: string
          user_agent?: string | null
          usuario_id?: string
          versao?: string
        }
        Relationships: [
          {
            foreignKeyName: "termos_aceite_oficina_id_fkey"
            columns: ["oficina_id"]
            isOneToOne: false
            referencedRelation: "oficinas"
            referencedColumns: ["id"]
          },
        ]
      }
      veiculos: {
        Row: {
          ano_fabricacao: number | null
          ano_modelo: number | null
          atualizado_em: string
          chassi: string | null
          cliente_id: string
          criado_em: string
          criado_por: string | null
          horimetro_atual: number | null
          id: string
          km_atual: number | null
          marca: string | null
          modelo: string | null
          observacoes: string | null
          oficina_id: string
          placa: string
          tipo: Database["public"]["Enums"]["tipo_veiculo"]
        }
        Insert: {
          ano_fabricacao?: number | null
          ano_modelo?: number | null
          atualizado_em?: string
          chassi?: string | null
          cliente_id: string
          criado_em?: string
          criado_por?: string | null
          horimetro_atual?: number | null
          id?: string
          km_atual?: number | null
          marca?: string | null
          modelo?: string | null
          observacoes?: string | null
          oficina_id?: string
          placa: string
          tipo?: Database["public"]["Enums"]["tipo_veiculo"]
        }
        Update: {
          ano_fabricacao?: number | null
          ano_modelo?: number | null
          atualizado_em?: string
          chassi?: string | null
          cliente_id?: string
          criado_em?: string
          criado_por?: string | null
          horimetro_atual?: number | null
          id?: string
          km_atual?: number | null
          marca?: string | null
          modelo?: string | null
          observacoes?: string | null
          oficina_id?: string
          placa?: string
          tipo?: Database["public"]["Enums"]["tipo_veiculo"]
        }
        Relationships: [
          {
            foreignKeyName: "veiculos_cliente_mesma_oficina_fk"
            columns: ["cliente_id", "oficina_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id", "oficina_id"]
          },
          {
            foreignKeyName: "veiculos_oficina_id_fkey"
            columns: ["oficina_id"]
            isOneToOne: false
            referencedRelation: "oficinas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      vw_orcamento_situacao: {
        // Situacao atual por OS que ja teve versao. Mecanico: 0 linhas. link_situacao: ver SituacaoLinkOrcamento.
        Row: {
          itens_travados: boolean | null
          link_criado_em: string | null
          link_criado_por_nome: string | null
          link_expira_em: string | null
          link_id: string | null
          link_revogado_em: string | null
          link_revogado_motivo: Database["public"]["Enums"]["motivo_revogacao_link"] | null
          link_revogado_por_nome: string | null
          link_situacao: SituacaoLinkOrcamento | null
          oficina_id: string | null
          os_id: string | null
          respondido: boolean | null
          respondido_em: string | null
          resposta_aprovou: boolean | null
          resposta_canal: Database["public"]["Enums"]["canal_resposta"] | null
          resposta_desfeita_em: string | null
          resposta_desfeita_por_nome: string | null
          resposta_id: string | null
          resposta_motivo: string | null
          resposta_nome: string | null
          versao_id: string | null
          versao_numero: number | null
          versao_total_centavos: number | null
        }
        Relationships: []
      }
      vw_orcamento_versoes: {
        // Consulta da versao pelo login, sem token. Mecanico: 0 linhas.
        Row: {
          codigo_conferencia: string | null
          congelada_em: string | null
          congelada_por_nome: string | null
          conteudo: Json | null
          hash_conteudo: string | null
          id: string | null
          numero: number | null
          oficina_id: string | null
          origem: Database["public"]["Enums"]["origem_versao_orcamento"] | null
          os_id: string | null
          subtotal_pecas_centavos: number | null
          subtotal_servicos_centavos: number | null
          total_centavos: number | null
        }
        Relationships: []
      }
      vw_orcamento_provas: {
        // Uma linha por resposta. Sem IP nem navegador. Mecanico: 0 linhas.
        Row: {
          aprovou: boolean | null
          canal: Database["public"]["Enums"]["canal_resposta"] | null
          codigo_conferencia: string | null
          desfeita_em: string | null
          desfeita_por_nome: string | null
          hash_resposta: string | null
          id: string | null
          motivo: string | null
          oficina_id: string | null
          os_id: string | null
          registrada_por_nome: string | null
          respondente_nome: string | null
          respondido_em: string | null
          valor_centavos: number | null
          versao_id: string | null
          versao_numero: number | null
        }
        Relationships: []
      }
      vw_vistorias: {
        // km/horimetro: da OS em rascunho, copia da conclusao depois. pode_*: regra de quem consulta.
        Row: {
          anulada_em: string | null
          anulada_por: string | null
          anulada_por_nome: string | null
          assinado_por_nome: string | null
          assinatura_caminho: string | null
          assinatura_id: string | null
          atualizado_em: string | null
          combustivel: Database["public"]["Enums"]["nivel_combustivel"] | null
          concluida_em: string | null
          concluida_por: string | null
          concluida_por_nome: string | null
          criado_em: string | null
          criado_por: string | null
          criado_por_nome: string | null
          fotos_pendentes: number | null
          hash_conteudo: string | null
          horimetro: number | null
          id: string | null
          itens_com_problema: number | null
          itens_marcados: number | null
          itens_total: number | null
          km: number | null
          motivo_anulacao: string | null
          objetos: string[] | null
          observacoes: string | null
          oficina_id: string | null
          os_id: string | null
          os_numero: number | null
          placa: string | null
          pode_anular: boolean | null
          pode_complementar: boolean | null
          pode_editar: boolean | null
          qtd_avarias: number | null
          qtd_complementos: number | null
          qtd_fotos: number | null
          sem_assinatura_motivo: Database["public"]["Enums"]["motivo_sem_assinatura"] | null
          sem_avarias: boolean | null
          status: Database["public"]["Enums"]["status_vistoria"] | null
          tipo: Database["public"]["Enums"]["tipo_vistoria"] | null
          veiculo_id: string | null
        }
        Relationships: []
      }
      vw_vistoria_fotos: {
        // Inclui pendentes (enviada_em null). Galeria: filtrar enviada_em.
        Row: {
          altura: number | null
          avaria_id: string | null
          caminho: string | null
          caminho_miniatura: string | null
          complemento_id: string | null
          criado_em: string | null
          criado_por: string | null
          criado_por_nome: string | null
          enviada_em: string | null
          id: string | null
          largura: number | null
          legenda: string | null
          oficina_id: string | null
          os_id: string | null
          pode_apagar: boolean | null
          tamanho_bytes: number | null
          tipo: Database["public"]["Enums"]["tipo_foto_vistoria"] | null
          vistoria_id: string | null
        }
        Relationships: []
      }
      vw_vistoria_complementos: {
        // Complementos com a contagem de fotos enviadas.
        Row: {
          criado_em: string | null
          criado_por: string | null
          criado_por_nome: string | null
          id: string | null
          oficina_id: string | null
          qtd_fotos: number | null
          texto: string | null
          vistoria_id: string | null
        }
        Relationships: []
      }
      vw_catalogo_mais_usados: {
        Row: {
          catalogo_id: string | null
          oficina_id: string | null
          tipo: Database["public"]["Enums"]["tipo_item_os"] | null
          ultimo_uso_em: string | null
          usos: number | null
        }
        Relationships: []
      }
      vw_os: {
        // Mecanico: cliente_telefone, autorizado_por_*, orcamento_aprovado_por_nome,
        // orcamento_aprovacao_canal, *_registrada_por_nome, valor_aprovado_centavos,
        // forma_pagamento, pago_em, totais, qtd/itens_sem_preco, itens_mecanico,
        // itens_apos_aprovacao e observacoes (Fase 3) vem NULL. qtd_fotos: todos.
        // Atendente: custo_total_centavos NULL.
        Row: {
          // Fase 6 (mecanico: NULL)
          orcamento_itens_travados: boolean | null
          orcamento_link_situacao: SituacaoLinkOrcamento | null
          orcamento_respondido: boolean | null
          orcamento_respondido_em: string | null
          // Fase 4: vistoria de entrada (NULL = "Sem vistoria")
          vistoria_entrada_id: string | null
          vistoria_entrada_status: Database["public"]["Enums"]["status_vistoria"] | null
          atualizado_em: string | null
          autorizacao_registrada_por_nome: string | null
          autorizado_em: string | null
          autorizado_por_nome: string | null
          autorizado_por_telefone: string | null
          cancelado_em: string | null
          cancelado_por_nome: string | null
          causa_encontrada: string | null
          cliente_id: string | null
          cliente_nome: string | null
          cliente_telefone: string | null
          codigo_falha: string | null
          criado_em: string | null
          criado_por: string | null
          criado_por_nome: string | null
          custo_total_centavos: number | null
          entregue_em: string | null
          forma_pagamento: Database["public"]["Enums"]["forma_pagamento"] | null
          horimetro: number | null
          id: string | null
          iniciado_em: string | null
          itens_apos_aprovacao: number | null
          itens_mecanico: number | null
          itens_sem_preco: number | null
          km: number | null
          mecanico_id: string | null
          mecanico_nome: string | null
          modo: Database["public"]["Enums"]["modo_os"] | null
          motivo_cancelamento: string | null
          numero: number | null
          observacoes: string | null
          oficina_id: string | null
          orcamento_aprovacao_canal: Database["public"]["Enums"]["canal_resposta"] | null
          orcamento_aprovacao_registrada_por_nome: string | null
          orcamento_aprovado_em: string | null
          orcamento_aprovado_por_nome: string | null
          orcamento_enviado_em: string | null
          pagamento_registrado_por_nome: string | null
          pago_em: string | null
          placa: string | null
          pronta_em: string | null
          qtd_fotos: number | null
          qtd_itens: number | null
          sintoma_relatado: string | null
          solucao_aplicada: string | null
          status: Database["public"]["Enums"]["status_os"] | null
          total_centavos: number | null
          total_pecas_centavos: number | null
          total_servicos_centavos: number | null
          valor_aprovado_centavos: number | null
          veiculo_ano_modelo: number | null
          veiculo_id: string | null
          veiculo_marca: string | null
          veiculo_modelo: string | null
          veiculo_tipo: Database["public"]["Enums"]["tipo_veiculo"] | null
        }
        Relationships: []
      }
      vw_os_fotos: {
        // So fotos enviadas (enviada_em preenchido). pode_apagar: regra de quem consulta.
        Row: {
          altura: number | null
          caminho: string | null
          caminho_miniatura: string | null
          categoria: Database["public"]["Enums"]["categoria_foto"] | null
          criado_em: string | null
          criado_por: string | null
          criado_por_nome: string | null
          enviada_em: string | null
          id: string | null
          largura: number | null
          legenda: string | null
          oficina_id: string | null
          os_id: string | null
          pode_apagar: boolean | null
          tamanho_bytes: number | null
        }
        Relationships: []
      }
      vw_os_historico: {
        Row: {
          de_status: Database["public"]["Enums"]["status_os"] | null
          em: string | null
          evento: string | null
          id: string | null
          observacao: string | null
          oficina_id: string | null
          os_id: string | null
          para_status: Database["public"]["Enums"]["status_os"] | null
          por: string | null
          por_nome: string | null
        }
        Relationships: []
      }
      vw_os_itens: {
        // Mecanico: preco_unitario_centavos, subtotal_centavos e custo_unitario_centavos NULL.
        // Atendente: custo_unitario_centavos NULL.
        // mecanico_pode_alterar: true so para o mecanico, nos itens que ele pode alterar/remover agora.
        Row: {
          apos_aprovacao: boolean | null
          atualizado_em: string | null
          criado_em: string | null
          custo_unitario_centavos: number | null
          descricao: string | null
          id: string | null
          lancado_pelo_mecanico: boolean | null
          lancado_por: string | null
          lancado_por_nome: string | null
          mecanico_pode_alterar: boolean | null
          oficina_id: string | null
          os_id: string | null
          peca_id: string | null
          peca_pendente_precificacao: boolean | null
          precificado_pelo_balcao_em: string | null
          preco_unitario_centavos: number | null
          quantidade: number | null
          servico_id: string | null
          subtotal_centavos: number | null
          tipo: Database["public"]["Enums"]["tipo_item_os"] | null
          unidade: string | null
        }
        Relationships: []
      }
      vw_os_totais: {
        // Mecanico: 0 linhas. custo_total_centavos/pecas_sem_custo: so dono.
        Row: {
          custo_total_centavos: number | null
          itens_apos_aprovacao: number | null
          itens_mecanico: number | null
          itens_sem_preco: number | null
          oficina_id: string | null
          os_id: string | null
          pecas_sem_custo: number | null
          qtd_itens: number | null
          total_centavos: number | null
          total_pecas_centavos: number | null
          total_servicos_centavos: number | null
        }
        Relationships: []
      }
      vw_catalogo_pecas: {
        Row: {
          ativo: boolean | null
          atualizado_em: string | null
          codigo: string | null
          criado_em: string | null
          criado_por: string | null
          custo_centavos: number | null
          fornecedor: string | null
          id: string | null
          nome: string | null
          oficina_id: string | null
          pendente_precificacao: boolean | null
          preco_venda_centavos: number | null
          unidade: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalogo_pecas_oficina_id_fkey"
            columns: ["oficina_id"]
            isOneToOne: false
            referencedRelation: "oficinas"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_catalogo_servicos: {
        Row: {
          ativo: boolean | null
          atualizado_em: string | null
          criado_em: string | null
          descricao: string | null
          id: string | null
          nome: string | null
          oficina_id: string | null
          preco_padrao_centavos: number | null
        }
        Relationships: [
          {
            foreignKeyName: "catalogo_servicos_oficina_id_fkey"
            columns: ["oficina_id"]
            isOneToOne: false
            referencedRelation: "oficinas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      // Fase 8A, primeiros passos (docs/ARQUITETURA.md, 15.15). So o dono; os outros recebem 42501.
      primeiros_passos: {
        Args: never
        Returns: Json // { dados_oficina, equipe, catalogo, primeira_os, dispensado }: boolean
      }
      dispensar_primeiros_passos: {
        Args: never
        Returns: undefined
      }
      desfazer_dispensar_primeiros_passos: {
        Args: never
        Returns: undefined
      }
      // Fase 7 (docs/ARQUITETURA.md, 14). Oficina sempre da sessao; nenhuma recebe oficina.
      painel_mes: {
        Args: { p_ano: number; p_mes: number }
        Returns: Json // PainelMes (so o dono)
      }
      painel_lista_os: {
        Args: { p_ano: number; p_mes: number; p_recorte: string; p_chave?: string | null }
        Returns: {
          os_id: string
          numero: number
          placa: string
          cliente_nome: string | null
          entregue_em: string | null
          pago_em: string | null
          forma_pagamento: Database["public"]["Enums"]["forma_pagamento"] | null
          valor_centavos: number
          detalhe: string | null // fora_catalogo: descricoes digitadas
        }[]
      }
      painel_hoje: {
        Args: Record<PropertyKey, never>
        Returns: Json // PainelHoje (so o dono)
      }
      contas_a_receber: {
        Args: Record<PropertyKey, never>
        Returns: {
          os_id: string
          numero: number
          cliente_id: string
          cliente_nome: string
          cliente_telefone: string | null
          placa: string
          entregue_em: string
          dias: number
          forma_pagamento: Database["public"]["Enums"]["forma_pagamento"] | null
          total_centavos: number
          cliente_total_centavos: number
          cliente_qtd_os: number
        }[]
      }
      historico_placa: {
        Args: {
          p_placa: string
          p_limite?: number
          p_antes_criado_em?: string | null
          p_antes_id?: string | null
        }
        Returns: Json // HistoricoPlaca (chaves por papel)
      }
      historico_os: {
        Args: { p_os_id: string }
        Returns: Json // HistoricoOS (chaves por papel)
      }
      dados_pdf_os: {
        Args: { p_os_id: string }
        Returns: Json // DadosPdfOS (dono e atendente)
      }
      alterar_orcamento: { Args: { p_os_id: string }; Returns: undefined }
      cancelar_link_orcamento: { Args: { p_os_id: string }; Returns: boolean }
      conferir_orcamento: { Args: { p_versao_id: string }; Returns: boolean }
      enviar_orcamento: {
        Args: {
          p_chave_idempotencia: string
          p_condicoes_pagamento?: string | null
          p_os_id: string
          p_prazo_estimado?: string | null
          p_total_conferido_centavos: number
        }
        Returns: {
          expira_em: string
          ja_existia: boolean
          token: string
          versao_numero: number
        }[]
      }
      previa_orcamento: {
        Args: {
          p_condicoes_pagamento?: string | null
          p_os_id: string
          p_prazo_estimado?: string | null
        }
        Returns: Json // PreviaOrcamento
      }
      reenviar_orcamento: {
        Args: { p_chave_idempotencia: string; p_os_id: string }
        Returns: {
          expira_em: string
          ja_existia: boolean
          token: string
          versao_numero: number
        }[]
      }
      // Publicas: so anon. Chamar com cliente SEM sessao.
      responder_orcamento: {
        Args: {
          p_aprovou: boolean
          p_motivo?: string | null
          p_nome?: string | null
          p_token: string
        }
        Returns: Json // RespostaOrcamentoPublica
      }
      ver_orcamento: {
        Args: { p_token: string }
        Returns: Json // OrcamentoPublico
      }
      anular_vistoria: {
        Args: {
          p_motivo: string
          p_vistoria_id: string
        }
        Returns: undefined
      }
      apagar_foto_vistoria: {
        Args: {
          p_id: string
        }
        Returns: boolean
      }
      complementar_vistoria: {
        Args: {
          p_id: string
          p_texto?: string | null
          p_vistoria_id: string
        }
        Returns: undefined
      }
      concluir_vistoria: {
        Args: {
          p_sem_assinatura_motivo?: Database["public"]["Enums"]["motivo_sem_assinatura"] | null
          p_vistoria_id: string
        }
        Returns: string
      }
      conferir_vistoria: {
        Args: {
          p_vistoria_id: string
        }
        Returns: boolean | null
      }
      confirmar_foto_vistoria: {
        Args: {
          p_id: string
        }
        Returns: undefined
      }
      iniciar_vistoria: {
        Args: {
          p_os_id: string
          p_tipo?: Database["public"]["Enums"]["tipo_vistoria"]
        }
        Returns: {
          ja_existia: boolean
          status: Database["public"]["Enums"]["status_vistoria"]
          vistoria_id: string
        }[]
      }
      marcar_item_vistoria: {
        Args: {
          p_item_id: string
          p_observacao?: string | null
          p_situacao: Database["public"]["Enums"]["situacao_item_vistoria"]
        }
        Returns: undefined
      }
      marcar_itens_restantes_ok: {
        Args: {
          p_vistoria_id: string
        }
        Returns: number
      }
      mover_item_checklist: {
        Args: {
          p_direcao: "subir" | "descer"
          p_item_id: string
        }
        Returns: undefined
      }
      registrar_assinatura_vistoria: {
        Args: {
          p_altura: number
          p_assinatura_id: string
          p_largura: number
          p_nome: string
          p_tamanho_bytes: number
          p_vistoria_id: string
        }
        Returns: string
      }
      registrar_foto_vistoria: {
        Args: {
          p_altura: number
          p_avaria_id?: string | null
          p_complemento_id?: string | null
          p_id: string
          p_largura: number
          p_legenda?: string | null
          p_tamanho_bytes: number
          p_tamanho_miniatura_bytes: number
          p_tipo: Database["public"]["Enums"]["tipo_foto_vistoria"]
          p_vistoria_id: string
        }
        Returns: {
          caminho: string
          caminho_miniatura: string
          enviada: boolean
          id: string
          ja_existia: boolean
        }[]
      }
      remover_avaria: {
        Args: {
          p_id: string
        }
        Returns: boolean
      }
      salvar_avaria: {
        Args: {
          p_descricao?: string | null
          p_id: string
          p_lado?: Database["public"]["Enums"]["lado_avaria"] | null
          p_vistoria_id: string
        }
        Returns: undefined
      }
      salvar_vistoria: {
        Args: {
          p_combustivel?: Database["public"]["Enums"]["nivel_combustivel"] | null
          p_horimetro?: number | null
          p_km?: number | null
          p_limpar_objetos?: boolean | null
          p_objetos?: string[] | null
          p_assinado_por_nome?: string | null
          p_observacoes?: string | null
          p_sem_avarias?: boolean | null
          p_vistoria_id: string
        }
        Returns: undefined
      }
      abrir_os: {
        Args: {
          p_autorizado_por_nome?: string
          p_autorizado_por_telefone?: string
          p_chave_idempotencia: string
          p_cliente_id?: string
          p_cliente_modo_padrao?: Database["public"]["Enums"]["modo_atendimento_cliente"]
          p_cliente_nome?: string
          p_cliente_telefone?: string
          p_codigo_falha?: string
          p_horimetro?: number
          p_km?: number
          p_mecanico_id?: string
          p_modo?: Database["public"]["Enums"]["modo_os"]
          p_observacoes?: string
          p_placa?: string
          p_sintoma_relatado?: string
          p_veiculo_id?: string
          p_veiculo_marca?: string
          p_veiculo_modelo?: string
          p_veiculo_tipo?: Database["public"]["Enums"]["tipo_veiculo"]
        }
        Returns: {
          ja_existia: boolean
          numero: number
          os_id: string
        }[]
      }
      adicionar_item_os: {
        Args: {
          p_chave_idempotencia: string
          p_custo_unitario_centavos?: number
          p_descricao?: string
          p_os_id: string
          p_peca_id?: string
          p_preco_unitario_centavos?: number
          p_quantidade?: number
          p_servico_id?: string
          p_tipo: Database["public"]["Enums"]["tipo_item_os"]
          p_unidade?: string
        }
        Returns: string
      }
      alterar_item_mecanico: {
        // So mecanico, item dele, OS dele em aguardando_orcamento/aprovada/em_andamento, antes do balcao precificar.
        Args: { p_descricao?: string; p_item_id: string; p_quantidade?: number; p_unidade?: string }
        Returns: undefined
      }
      apagar_foto: {
        // Apagar os arquivos no Storage ANTES. false = ja nao existia.
        Args: { p_id: string }
        Returns: boolean
      }
      atribuir_mecanico: {
        Args: { p_mecanico_id: string | null; p_os_id: string }
        Returns: undefined
      }
      confirmar_foto: {
        Args: { p_id: string }
        Returns: undefined
      }
      dados_da_placa: {
        Args: { p_placa: string }
        Returns: {
          cliente_id: string
          cliente_modo_padrao: Database["public"]["Enums"]["modo_atendimento_cliente"] | null
          cliente_nome: string | null
          cliente_telefone: string | null
          os_aberta_id: string | null
          os_aberta_numero: number | null
          os_aberta_status: Database["public"]["Enums"]["status_os"] | null
          placa: string
          ultima_os_entregue_em: string | null
          ultima_os_id: string | null
          ultima_os_numero: number | null
          ultimo_km: number | null
          ultimo_km_em: string | null
          ultimo_servico: string | null
          veiculo_ano_modelo: number | null
          veiculo_id: string
          veiculo_marca: string | null
          veiculo_modelo: string | null
          veiculo_tipo: Database["public"]["Enums"]["tipo_veiculo"]
        }[]
      }
      editar_foto: {
        // Mesma regra de apagar; so foto enviada. NULL = nao muda; legenda "" = apaga a legenda.
        Args: {
          p_categoria?: Database["public"]["Enums"]["categoria_foto"]
          p_id: string
          p_legenda?: string
        }
        Returns: undefined
      }
      entregar_os: {
        Args: {
          p_causa: string
          p_codigo_falha?: string
          p_forma_pagamento: Database["public"]["Enums"]["forma_pagamento"]
          p_os_id: string
          p_pago: boolean
          p_solucao: string
        }
        Returns: undefined
      }
      marcar_pronta: {
        Args: { p_causa?: string; p_os_id: string; p_solucao?: string }
        Returns: undefined
      }
      mudar_status_os: {
        Args: {
          p_de: Database["public"]["Enums"]["status_os"]
          p_motivo?: string
          p_os_id: string
          p_para: Database["public"]["Enums"]["status_os"]
        }
        Returns: undefined
      }
      registrar_foto: {
        Args: {
          p_altura: number
          p_categoria?: Database["public"]["Enums"]["categoria_foto"]
          p_id: string
          p_largura: number
          p_legenda?: string
          p_os_id: string
          p_tamanho_bytes: number
          p_tamanho_miniatura_bytes: number
        }
        Returns: {
          caminho: string
          caminho_miniatura: string
          enviada: boolean
          id: string
          ja_existia: boolean
        }[]
      }
      registrar_pagamento: {
        Args: {
          p_forma_pagamento: Database["public"]["Enums"]["forma_pagamento"]
          p_os_id: string
          p_pago_em?: string | null
          p_so_se_a_receber?: boolean // Fase 7: true recusa OS ja paga (pagamento_ja_registrado)
        }
        Returns: undefined
      }
      registrar_resposta_orcamento: {
        Args: {
          p_aprovou: boolean
          p_canal: Database["public"]["Enums"]["canal_resposta"]
          p_cancelar?: boolean
          p_de: Database["public"]["Enums"]["status_os"]
          p_motivo?: string
          p_os_id: string
          p_quem_respondeu?: string
        }
        Returns: undefined
      }
      remover_item_mecanico: {
        // false = o item ja nao existia (reenvio).
        Args: { p_item_id: string }
        Returns: boolean
      }
      trocar_modo_os: {
        Args: {
          p_autorizado_por_nome?: string
          p_autorizado_por_telefone?: string
          p_modo: Database["public"]["Enums"]["modo_os"]
          p_os_id: string
        }
        Returns: undefined
      }
      aceitar_convite: {
        Args: {
          p_autoriza_uso_anonimizado?: boolean
          p_nome: string
          p_token: string
          p_versao_termos: string
        }
        Returns: string
      }
      aceitar_termos: {
        Args: { p_autoriza_uso_anonimizado?: boolean; p_versao_termos: string }
        Returns: undefined
      }
      atualizar_membro: {
        Args: {
          p_ativo?: boolean
          p_papel?: Database["public"]["Enums"]["papel_usuario"]
          p_perfil_id: string
          p_ve_todas_os?: boolean
        }
        Returns: undefined
      }
      criar_convite: {
        Args: {
          p_nome_sugerido?: string
          p_papel: Database["public"]["Enums"]["papel_usuario"]
          p_validade_horas?: number
        }
        Returns: {
          convite_id: string
          expira_em: string
          token: string
        }[]
      }
      criar_oficina: {
        Args: {
          p_autoriza_uso_anonimizado?: boolean
          p_nome_dono: string
          p_nome_oficina: string
          p_telefone?: string
          p_versao_termos: string
        }
        Returns: string
      }
      meu_contexto: {
        Args: never
        Returns: {
          ativo: boolean | null
          email: string | null
          oficina_id: string | null
          oficina_nome: string | null
          papel: Database["public"]["Enums"]["papel_usuario"] | null
          perfil_nome: string | null
          termos_aceitos: boolean
          usuario_id: string
          ve_todas_os: boolean | null
          versao_termos_vigente: string
        }[]
      }
      normalizar_placa: { Args: { p_placa: string }; Returns: string }
      revogar_convite: { Args: { p_convite_id: string }; Returns: undefined }
      ver_convite: {
        Args: { p_token: string }
        Returns: {
          expira_em: string | null
          oficina_nome: string | null
          papel: Database["public"]["Enums"]["papel_usuario"] | null
          situacao: string
        }[]
      }
    }
    Enums: {
      motivo_revogacao_link:
        | "substituido"
        | "alterado"
        | "manual"
        | "cancelada"
        | "modo_direto"
        | "desfeito"
        | "resposta_manual"
      origem_versao_orcamento: "link" | "manual"
      lado_avaria: "frente" | "traseira" | "lateral_esquerda" | "lateral_direita" | "cabine" | "outro"
      motivo_sem_assinatura: "motorista_ausente" | "recusou"
      nivel_combustivel: "reserva" | "um_quarto" | "meio" | "tres_quartos" | "cheio"
      situacao_item_vistoria: "ok" | "com_problema" | "nao_se_aplica"
      status_vistoria: "rascunho" | "concluida" | "anulada"
      tipo_foto_vistoria: "avaria" | "painel" | "outro"
      tipo_vistoria: "entrada" | "saida"
      canal_resposta: "telefone" | "whatsapp" | "presencial" | "link"
      categoria_foto: "diagnostico" | "peca_defeituosa" | "peca_trocada" | "antes" | "depois" | "entrega" | "outro"
      forma_pagamento: "pix" | "dinheiro" | "cartao_debito" | "cartao_credito" | "boleto" | "faturado"
      modo_atendimento_cliente: "exige_orcamento" | "servico_direto"
      modo_os: "com_orcamento" | "direto"
      papel_usuario: "dono" | "atendente" | "mecanico"
      status_os:
        | "aguardando_orcamento"
        | "orcamento_enviado"
        | "aprovada"
        | "em_andamento"
        | "pronta"
        | "entregue"
        | "cancelada"
      tipo_item_os: "servico" | "peca"
      tipo_veiculo: "caminhao" | "carreta" | "onibus" | "utilitario" | "outro"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      motivo_revogacao_link: ["substituido", "alterado", "manual", "cancelada", "modo_direto", "desfeito", "resposta_manual"],
      origem_versao_orcamento: ["link", "manual"],
      lado_avaria: ["frente", "traseira", "lateral_esquerda", "lateral_direita", "cabine", "outro"],
      motivo_sem_assinatura: ["motorista_ausente", "recusou"],
      nivel_combustivel: ["reserva", "um_quarto", "meio", "tres_quartos", "cheio"],
      situacao_item_vistoria: ["ok", "com_problema", "nao_se_aplica"],
      status_vistoria: ["rascunho", "concluida", "anulada"],
      tipo_foto_vistoria: ["avaria", "painel", "outro"],
      tipo_vistoria: ["entrada", "saida"],
      canal_resposta: ["telefone", "whatsapp", "presencial", "link"],
      categoria_foto: ["diagnostico", "peca_defeituosa", "peca_trocada", "antes", "depois", "entrega", "outro"],
      forma_pagamento: ["pix", "dinheiro", "cartao_debito", "cartao_credito", "boleto", "faturado"],
      modo_atendimento_cliente: ["exige_orcamento", "servico_direto"],
      modo_os: ["com_orcamento", "direto"],
      papel_usuario: ["dono", "atendente", "mecanico"],
      status_os: [
        "aguardando_orcamento",
        "orcamento_enviado",
        "aprovada",
        "em_andamento",
        "pronta",
        "entregue",
        "cancelada",
      ],
      tipo_item_os: ["servico", "peca"],
      tipo_veiculo: ["caminhao", "carreta", "onibus", "utilitario", "outro"],
    },
  },
} as const

// Fase 6: contratos das RPCs que devolvem JSON (docs/ARQUITETURA.md, 13.6).
// Situacoes SEM acesso: a RPC devolve so { situacao }, nenhum outro campo.
export type SituacaoSemAcessoOrcamento =
  | "vencido"
  | "substituido"
  | "atualizado"
  | "encerrado"
  | "nao_encontrado"
  | "limite"

export type SituacaoLinkOrcamento = "aberto" | "aprovado" | "recusado" | SituacaoSemAcessoOrcamento

export type ItemDocumentoOrcamento = {
  tipo: "servico" | "peca"
  descricao: string
  quantidade: number
  unidade: string
  preco_unitario_centavos: number | null // null so na previa (item sem preco)
  subtotal_centavos: number | null
}

export type DocumentoOrcamento = {
  oficina_nome: string
  oficina_telefone: string | null // so digitos; vazio e caso valido
  os_numero: number
  veiculo_placa: string
  veiculo_marca: string | null
  veiculo_modelo: string | null
  cliente_nome: string | null
  itens: ItemDocumentoOrcamento[]
  subtotal_servicos_centavos: number
  subtotal_pecas_centavos: number
  total_centavos: number
  prazo_estimado: string | null
  condicoes_pagamento: string | null
}

export type RespostaPublica = {
  tipo: "aprovou" | "recusou"
  nome: string | null
  respondido_em: string
}

export type OrcamentoPublico =
  | { situacao: SituacaoSemAcessoOrcamento }
  | {
      situacao: "aberto" | "aprovado" | "recusado"
      expira_em: string
      documento: DocumentoOrcamento
      resposta: RespostaPublica | null
    }

export type ErroRespostaPublica =
  | "resposta_obrigatoria"
  | "nome_obrigatorio"
  | "nome_grande_demais"
  | "motivo_grande_demais"

export type RespostaOrcamentoPublica =
  | { situacao: SituacaoSemAcessoOrcamento }
  | { situacao: "aberto"; erro: ErroRespostaPublica }
  | { situacao: "aprovado" | "recusado"; aplicada: boolean; resposta: RespostaPublica }

export type PreviaOrcamento = { documento: DocumentoOrcamento; expira_em: string }

// Fase 7: contratos das RPCs que devolvem JSON (docs/ARQUITETURA.md, 14.5 a 14.8).
// Dinheiro sempre em centavos inteiros. Chave marcada "balcao" so vem para dono e
// atendente; "dono" so para o dono. Para o mecanico a chave NAO existe (nem null).
export type RecortePainel = "entregues" | "recebido" | "servico" | "fora_catalogo" | "mecanico" | "sem_mecanico"

export type PainelMes = {
  ano: number
  mes: number
  fuso: string
  inicio: string // inclusive, inicio do mes no fuso da oficina
  fim: string // exclusive
  entregues: { qtd_os: number; total_centavos: number; servicos_centavos: number; pecas_centavos: number }
  recebido: { qtd_os: number; total_centavos: number }
  servicos: { servico_id: string | null; nome: string; qtd_os: number }[] // null = "Fora do catálogo", sempre por ultimo
  produtividade: { mecanico_id: string | null; nome: string | null; qtd_os: number; servicos_centavos: number }[] // null = sem mecanico, por ultimo
}

export type PainelHoje = {
  hoje: string // AAAA-MM-DD no fuso da oficina
  ano: number
  mes: number
  fuso: string
  primeiro_registro_em: string | null // menor entre entregas e pagamentos; null = nunca entregou ("primeira vez")
  a_receber: { total_centavos: number; qtd_os: number; qtd_clientes: number; mais_antiga_em: string | null }
  abertas: {
    total: number
    aguardando_orcamento: number
    orcamento_enviado: number
    aprovada: number
    em_andamento: number
    pronta: number
  }
}

export type HistoricoPlacaOS = {
  id: string
  numero: number
  status: Database["public"]["Enums"]["status_os"]
  criado_em: string
  entregue_em: string | null
  cancelado_em: string | null
  km: number | null
  horimetro: number | null
  sintoma_relatado: string | null
  codigo_falha: string | null
  causa_encontrada: string | null
  solucao_aplicada: string | null
  abre_detalhe: boolean // false = o mecanico ve so o historico, sem abrir /os/[id]
  qtd_itens: number
  qtd_fotos: number
  qtd_vistorias: number
  // balcao
  mecanico_nome?: string | null
  motivo_cancelamento?: string | null // com o texto livre
  cliente_nome?: string | null
  observacoes?: string | null
  total_centavos?: number
  forma_pagamento?: Database["public"]["Enums"]["forma_pagamento"] | null
  pago_em?: string | null
  // dono
  custo_total_centavos?: number
}

export type HistoricoPlaca = {
  veiculo: {
    id: string
    placa: string
    tipo: Database["public"]["Enums"]["tipo_veiculo"] | null
    marca: string | null
    modelo: string | null
    ano_modelo: number | null
    km_atual: number | null
    horimetro_atual: number | null
    cliente_id?: string // balcao
    cliente_nome?: string | null // balcao
  } | null
  resumo: { qtd_os: number; qtd_vistorias: number; primeira_os_em: string | null } | null // do veiculo inteiro
  os: HistoricoPlacaOS[]
  proximo: { antes_criado_em: string; antes_id: string } | null
}

export type HistoricoOS = {
  os_id: string
  itens: {
    id: string
    tipo: Database["public"]["Enums"]["tipo_item_os"]
    descricao: string
    quantidade: number
    unidade: string
    preco_unitario_centavos?: number | null // balcao
    subtotal_centavos?: number | null // balcao
    custo_unitario_centavos?: number | null // dono
  }[]
  fotos: {
    id: string
    categoria: Database["public"]["Enums"]["categoria_foto"]
    legenda: string | null
    largura: number
    altura: number
    caminho: string
    caminho_miniatura: string
    criado_em: string
  }[]
  vistorias: {
    id: string
    tipo: Database["public"]["Enums"]["tipo_vistoria"]
    status: "concluida" | "anulada"
    concluida_em: string | null
    anulada_em: string | null
    km: number | null
    horimetro: number | null
    combustivel: Database["public"]["Enums"]["nivel_combustivel"] | null
    objetos: string[] | null
    sem_avarias: boolean
    observacoes: string | null // observacoes gerais da vistoria (o mecanico ja via na Fase 4)
    itens: { descricao: string; situacao: Database["public"]["Enums"]["situacao_item_vistoria"] | null; observacao: string | null }[]
    avarias: { id: string; lado: Database["public"]["Enums"]["lado_avaria"]; descricao: string | null }[]
    fotos: {
      id: string
      tipo: Database["public"]["Enums"]["tipo_foto_vistoria"]
      avaria_id: string | null
      complemento_id: string | null // null = foto original
      legenda: string | null
      largura: number
      altura: number
      caminho: string
      caminho_miniatura: string
    }[]
    complementos: { id: string; texto: string | null; criado_em: string; criado_por_nome?: string | null /* balcao */ }[]
    // balcao (o mecanico nao recebe a chave: nem assinatura, nem nomes, nem o motivo da anulacao)
    concluida_por_nome?: string | null
    motivo_anulacao?: string | null
    anulada_por_nome?: string | null
    assinado_por_nome?: string | null
    sem_assinatura_motivo?: Database["public"]["Enums"]["motivo_sem_assinatura"] | null
    assinatura_caminho?: string | null
  }[]
}

export type DadosPdfOS = {
  tipo_documento: "ordem_servico" | "resumo_final"
  oficina_nome: string
  oficina_telefone: string | null
  oficina_cnpj: string | null // so CNPJ (14 digitos); CPF da oficina nunca vem
  fuso: string
  os_numero: number
  status: Database["public"]["Enums"]["status_os"]
  criado_em: string
  entregue_em: string | null
  gerado_em: string
  cliente_nome: string | null
  veiculo_placa: string
  veiculo_marca: string | null
  veiculo_modelo: string | null
  veiculo_ano: number | null
  km: number | null
  causa_encontrada: string | null
  solucao_aplicada: string | null
  itens: {
    tipo: Database["public"]["Enums"]["tipo_item_os"]
    descricao: string
    quantidade: number
    unidade: string
    preco_unitario_centavos: number | null
    subtotal_centavos: number | null
  }[]
  subtotal_servicos_centavos: number
  subtotal_pecas_centavos: number
  total_centavos: number
  itens_sem_preco: number
  forma_pagamento: Database["public"]["Enums"]["forma_pagamento"] | null
  situacao_pagamento: "pago" | "a_receber" | null // null antes da entrega
  pago_em: string | null
}
