// Tipos do banco no formato do `supabase gen types typescript`.
// Escrito a mao a partir de supabase/migrations/20261028000001..4 (Fase 1).
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
