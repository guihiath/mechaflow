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
      modo_atendimento_cliente: "exige_orcamento" | "servico_direto"
      papel_usuario: "dono" | "atendente" | "mecanico"
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
      modo_atendimento_cliente: ["exige_orcamento", "servico_direto"],
      papel_usuario: ["dono", "atendente", "mecanico"],
      tipo_veiculo: ["caminhao", "carreta", "onibus", "utilitario", "outro"],
    },
  },
} as const
