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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_usage: {
        Row: {
          actor_type: string
          actual_cost_usd: number | null
          cost_basis: string
          created_at: string
          credits_charged: number
          credits_reserved: number
          environment: string
          error_code: string | null
          estimated_cost_usd: number | null
          id: string
          image_count: number
          input_tokens: number
          meta: Json
          model: string | null
          operation: string
          output_tokens: number
          provider: string | null
          request_id: string
          status: string
          subscription_period_end: string | null
          subscription_period_start: string | null
          total_tokens: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          actor_type: string
          actual_cost_usd?: number | null
          cost_basis?: string
          created_at?: string
          credits_charged?: number
          credits_reserved?: number
          environment?: string
          error_code?: string | null
          estimated_cost_usd?: number | null
          id?: string
          image_count?: number
          input_tokens?: number
          meta?: Json
          model?: string | null
          operation: string
          output_tokens?: number
          provider?: string | null
          request_id: string
          status?: string
          subscription_period_end?: string | null
          subscription_period_start?: string | null
          total_tokens?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          actor_type?: string
          actual_cost_usd?: number | null
          cost_basis?: string
          created_at?: string
          credits_charged?: number
          credits_reserved?: number
          environment?: string
          error_code?: string | null
          estimated_cost_usd?: number | null
          id?: string
          image_count?: number
          input_tokens?: number
          meta?: Json
          model?: string | null
          operation?: string
          output_tokens?: number
          provider?: string | null
          request_id?: string
          status?: string
          subscription_period_end?: string | null
          subscription_period_start?: string | null
          total_tokens?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      build_memory: {
        Row: {
          created_at: string
          key: string
          owner_id: string
          project_id: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          created_at?: string
          key: string
          owner_id: string
          project_id: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          created_at?: string
          key?: string
          owner_id?: string
          project_id?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      builds: {
        Row: {
          author_label: string | null
          byte_size: number
          client_id: string | null
          created_at: string
          html: string
          id: string
          is_cloud: boolean
          is_public: boolean
          library_code: string | null
          model: string | null
          project_json: Json | null
          project_name: string | null
          prompt: string
          published_at: string | null
          remix_count: number
          session_id: string | null
          share_slug: string | null
          surface: string | null
          title: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          author_label?: string | null
          byte_size?: number
          client_id?: string | null
          created_at?: string
          html: string
          id?: string
          is_cloud?: boolean
          is_public?: boolean
          library_code?: string | null
          model?: string | null
          project_json?: Json | null
          project_name?: string | null
          prompt?: string
          published_at?: string | null
          remix_count?: number
          session_id?: string | null
          share_slug?: string | null
          surface?: string | null
          title?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          author_label?: string | null
          byte_size?: number
          client_id?: string | null
          created_at?: string
          html?: string
          id?: string
          is_cloud?: boolean
          is_public?: boolean
          library_code?: string | null
          model?: string | null
          project_json?: Json | null
          project_name?: string | null
          prompt?: string
          published_at?: string | null
          remix_count?: number
          session_id?: string | null
          share_slug?: string | null
          surface?: string | null
          title?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      credit_usage: {
        Row: {
          committed_at: string | null
          created_at: string
          credits: number
          environment: string
          id: string
          operation: string
          request_id: string | null
          status: string
          user_id: string
        }
        Insert: {
          committed_at?: string | null
          created_at?: string
          credits: number
          environment?: string
          id?: string
          operation: string
          request_id?: string | null
          status?: string
          user_id: string
        }
        Update: {
          committed_at?: string | null
          created_at?: string
          credits?: number
          environment?: string
          id?: string
          operation?: string
          request_id?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      featured_demos: {
        Row: {
          category: string
          created_at: string
          id: string
          slug: string
          sort_order: number
          title: string
          url: string | null
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          slug: string
          sort_order?: number
          title: string
          url?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          slug?: string
          sort_order?: number
          title?: string
          url?: string | null
        }
        Relationships: []
      }
      feedback: {
        Row: {
          contact: string | null
          created_at: string
          handled: boolean
          id: string
          message: string
          path: string | null
          user_agent: string | null
        }
        Insert: {
          contact?: string | null
          created_at?: string
          handled?: boolean
          id?: string
          message: string
          path?: string | null
          user_agent?: string | null
        }
        Update: {
          contact?: string | null
          created_at?: string
          handled?: boolean
          id?: string
          message?: string
          path?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      free_build_ledger: {
        Row: {
          environment: string
          fingerprint: string
          ip_prefix: string | null
          used_at: string
        }
        Insert: {
          environment: string
          fingerprint: string
          ip_prefix?: string | null
          used_at?: string
        }
        Update: {
          environment?: string
          fingerprint?: string
          ip_prefix?: string | null
          used_at?: string
        }
        Relationships: []
      }
      one_time_purchases: {
        Row: {
          amount_paid: number
          build_id: string | null
          created_at: string | null
          currency: string
          environment: string
          id: string
          price_id: string
          stripe_customer_id: string | null
          stripe_session_id: string
          user_id: string
        }
        Insert: {
          amount_paid: number
          build_id?: string | null
          created_at?: string | null
          currency: string
          environment?: string
          id?: string
          price_id: string
          stripe_customer_id?: string | null
          stripe_session_id: string
          user_id: string
        }
        Update: {
          amount_paid?: number
          build_id?: string | null
          created_at?: string | null
          currency?: string
          environment?: string
          id?: string
          price_id?: string
          stripe_customer_id?: string | null
          stripe_session_id?: string
          user_id?: string
        }
        Relationships: []
      }
      owner_usage: {
        Row: {
          created_at: string
          credits: number
          id: string
          operation: string
          request_id: string | null
        }
        Insert: {
          created_at?: string
          credits?: number
          id?: string
          operation: string
          request_id?: string | null
        }
        Update: {
          created_at?: string
          credits?: number
          id?: string
          operation?: string
          request_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_sync: {
        Row: {
          cloud_memory: boolean
          created_at: string
          environment: string
          last_device: string | null
          live: boolean
          memory: Json
          project_id: string
          revision: number
          share_slug: string | null
          surface: string
          team_code_hash: string | null
          team_code_set_at: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cloud_memory?: boolean
          created_at?: string
          environment?: string
          last_device?: string | null
          live?: boolean
          memory?: Json
          project_id: string
          revision?: number
          share_slug?: string | null
          surface?: string
          team_code_hash?: string | null
          team_code_set_at?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cloud_memory?: boolean
          created_at?: string
          environment?: string
          last_device?: string | null
          live?: boolean
          memory?: Json
          project_id?: string
          revision?: number
          share_slug?: string | null
          surface?: string
          team_code_hash?: string | null
          team_code_set_at?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      saved_ideas: {
        Row: {
          ideas: Json
          library_code: string
          updated_at: string
        }
        Insert: {
          ideas?: Json
          library_code: string
          updated_at?: string
        }
        Update: {
          ideas?: Json
          library_code?: string
          updated_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          custom_amount_cents: number | null
          environment: string
          id: string
          plan_tier: string | null
          price_id: string
          product_id: string
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          custom_amount_cents?: number | null
          environment?: string
          id?: string
          plan_tier?: string | null
          price_id: string
          product_id: string
          status?: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          custom_amount_cents?: number | null
          environment?: string
          id?: string
          plan_tier?: string | null
          price_id?: string
          product_id?: string
          status?: string
          stripe_customer_id?: string
          stripe_subscription_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      trial_claims: {
        Row: {
          amount_paid: number
          created_at: string
          credit_applied: boolean
          credit_applied_at: string | null
          currency: string
          email: string | null
          environment: string
          expires_at: string | null
          id: string
          paid: boolean
          paid_at: string | null
          stripe_customer_id: string | null
          stripe_session_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount_paid?: number
          created_at?: string
          credit_applied?: boolean
          credit_applied_at?: string | null
          currency?: string
          email?: string | null
          environment?: string
          expires_at?: string | null
          id?: string
          paid?: boolean
          paid_at?: string | null
          stripe_customer_id?: string | null
          stripe_session_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount_paid?: number
          created_at?: string
          credit_applied?: boolean
          credit_applied_at?: string | null
          currency?: string
          email?: string | null
          environment?: string
          expires_at?: string | null
          id?: string
          paid?: boolean
          paid_at?: string | null
          stripe_customer_id?: string | null
          stripe_session_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      user_daily_builds: {
        Row: {
          build_date: string
          builds_count: number
          created_at: string
          environment: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          build_date: string
          builds_count?: number
          created_at?: string
          environment: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          build_date?: string
          builds_count?: number
          created_at?: string
          environment?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      waitlist_entries: {
        Row: {
          amount_paid: number | null
          company: string | null
          created_at: string
          currency: string | null
          email: string
          id: string
          intended_use: string
          interest_level: string
          name: string
          paid: boolean
          paid_at: string | null
          source: string | null
          stripe_session_id: string | null
          tier: string | null
        }
        Insert: {
          amount_paid?: number | null
          company?: string | null
          created_at?: string
          currency?: string | null
          email: string
          id?: string
          intended_use: string
          interest_level: string
          name: string
          paid?: boolean
          paid_at?: string | null
          source?: string | null
          stripe_session_id?: string | null
          tier?: string | null
        }
        Update: {
          amount_paid?: number | null
          company?: string | null
          created_at?: string
          currency?: string | null
          email?: string
          id?: string
          intended_use?: string
          interest_level?: string
          name?: string
          paid?: boolean
          paid_at?: string | null
          source?: string | null
          stripe_session_id?: string | null
          tier?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      build_memory_delete: {
        Args: { _key: string; _project_id: string }
        Returns: boolean
      }
      build_memory_list: {
        Args: { _project_id: string }
        Returns: {
          key: string
          updated_at: string
          updated_by: string
          value: Json
        }[]
      }
      build_memory_lookup: {
        Args: { _slug: string }
        Returns: {
          cloud_memory: boolean
          live: boolean
          owner_id: string
          project_id: string
          team_code_hash: string
          title: string
        }[]
      }
      build_memory_reset: {
        Args: { _project_id: string; _user_id: string }
        Returns: number
      }
      build_memory_stats: {
        Args: { _project_id: string; _user_id: string }
        Returns: {
          entries: number
          last_by: string
          last_update: string
        }[]
      }
      build_memory_upsert: {
        Args: {
          _key: string
          _owner_id: string
          _project_id: string
          _updated_by: string
          _value: Json
        }
        Returns: string
      }
      claim_free_build: {
        Args: { _date: string; _environment: string; _user_id: string }
        Returns: boolean
      }
      claim_free_demo: {
        Args: { _environment: string; _fingerprint: string; _ip_prefix: string }
        Returns: boolean
      }
      commit_credits: {
        Args: { _request_id?: string; _reservation_id: string }
        Returns: boolean
      }
      credit_balance: {
        Args: { _cap: number; _env: string; _user_id: string }
        Returns: {
          cap: number
          remaining: number
          used: number
        }[]
      }
      credit_balance_period: {
        Args: { _cap: number; _env: string; _user_id: string }
        Returns: {
          cap: number
          period_end: string
          period_start: string
          remaining: number
          reserved: number
          used: number
        }[]
      }
      delete_cloud_project: {
        Args: { _id: string; _user_id: string }
        Returns: boolean
      }
      finalize_credits: {
        Args: {
          _actual_credits: number
          _request_id: string
          _reservation_id: string
        }
        Returns: boolean
      }
      free_build_used: {
        Args: { _date: string; _environment: string; _user_id: string }
        Returns: boolean
      }
      free_demo_used: {
        Args: { _environment: string; _fingerprint: string }
        Returns: boolean
      }
      get_cloud_project: {
        Args: { _id: string; _user_id: string }
        Returns: {
          byte_size: number
          created_at: string
          html: string
          id: string
          model: string
          project_json: Json
          project_name: string
          prompt: string
          updated_at: string
        }[]
      }
      has_active_pro: {
        Args: { check_env?: string; user_uuid: string }
        Returns: boolean
      }
      list_cloud_projects: {
        Args: { _environment: string; _user_id: string }
        Returns: {
          byte_size: number
          created_at: string
          id: string
          model: string
          project_name: string
          prompt: string
          updated_at: string
        }[]
      }
      log_owner_usage: {
        Args: { _credits: number; _operation: string; _request_id: string }
        Returns: undefined
      }
      project_sync_get: {
        Args: { _project_id: string; _user_id: string }
        Returns: {
          last_device: string
          live: boolean
          memory: Json
          project_id: string
          revision: number
          share_slug: string
          surface: string
          title: string
          updated_at: string
        }[]
      }
      project_sync_set_cloud_memory: {
        Args: {
          _code_hash: string
          _enabled: boolean
          _project_id: string
          _user_id: string
        }
        Returns: {
          cloud_memory: boolean
          live: boolean
          share_slug: string
        }[]
      }
      project_sync_set_live: {
        Args: {
          _live: boolean
          _project_id: string
          _slug: string
          _user_id: string
        }
        Returns: {
          live: boolean
          share_slug: string
        }[]
      }
      project_sync_set_memory: {
        Args: { _memory: Json; _project_id: string; _user_id: string }
        Returns: boolean
      }
      project_sync_touch: {
        Args: {
          _device: string
          _environment: string
          _project_id: string
          _surface: string
          _title: string
          _user_id: string
        }
        Returns: {
          live: boolean
          revision: number
          share_slug: string
        }[]
      }
      refund_credits: { Args: { _reservation_id: string }; Returns: boolean }
      release_free_build: {
        Args: { _date: string; _environment: string; _user_id: string }
        Returns: undefined
      }
      release_free_demo: {
        Args: { _environment: string; _fingerprint: string }
        Returns: boolean
      }
      reserve_credits: {
        Args: {
          _amount: number
          _cap: number
          _env: string
          _operation: string
          _user_id: string
        }
        Returns: {
          remaining_after: number
          reservation_id: string
          used_before: number
        }[]
      }
      reserve_credits_v2: {
        Args: {
          _amount: number
          _cap: number
          _env: string
          _operation: string
          _request_id: string
          _user_id: string
        }
        Returns: {
          credits: number
          idempotent: boolean
          remaining_after: number
          reservation_id: string
          used_before: number
        }[]
      }
      upsert_cloud_project: {
        Args: {
          _environment: string
          _html: string
          _id: string
          _model: string
          _name: string
          _project_json: Json
          _prompt: string
          _user_id: string
        }
        Returns: string
      }
      usage_balance: {
        Args: { _cap: number; _env: string; _user_id: string }
        Returns: {
          active: boolean
          cap: number
          period_end: string
          period_start: string
          remaining: number
          reserved: number
          used: number
        }[]
      }
      usage_finalize: {
        Args: {
          _actual_cost_usd?: number
          _actual_credits: number
          _cap?: number
          _cost_basis?: string
          _error_code?: string
          _estimated_cost_usd?: number
          _image_count?: number
          _input_tokens?: number
          _meta?: Json
          _model?: string
          _output_tokens?: number
          _provider?: string
          _request_id: string
          _reservation_id: string
          _status?: string
          _total_tokens?: number
        }
        Returns: boolean
      }
      usage_refund: { Args: { _reservation_id: string }; Returns: boolean }
      usage_reserve: {
        Args: {
          _amount: number
          _cap: number
          _env: string
          _operation: string
          _request_id: string
          _user_id: string
        }
        Returns: {
          credits: number
          idempotent: boolean
          period_end: string
          period_start: string
          remaining_after: number
          reservation_id: string
          used_before: number
        }[]
      }
      waitlist_paid_count: { Args: never; Returns: number }
    }
    Enums: {
      [_ in never]: never
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

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
