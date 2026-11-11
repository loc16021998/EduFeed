/**
 * Supabase database types — mirrors supabase/migrations/*.sql.
 * Once the project is linked, regenerate instead of editing by hand:
 *   npx supabase gen types typescript --linked > src/types/database.ts
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

// leads.status is text + CHECK (see 20261114090000_crm_automation.sql).
type LeadStatus = 'NEW' | 'CONTACTED' | 'CONFIRMED' | 'REMINDED_24H' | 'REMINDED_2H' | 'COMPLETED_TRIAL' | 'ENROLLED' | 'CANCELLED';

export type Database = {
  public: {
    Tables: {
      categories: {
        Row: { id: number; code: string; name: string; icon: string; color: string; sort_order: number };
        Insert: { code: string; name: string; icon: string; color?: string; sort_order?: number };
        Update: Partial<Database['public']['Tables']['categories']['Insert']>;
        Relationships: [];
      };
      branches: {
        Row: { code: string; short_code: string; name: string; short_address: string; address: string; maps_url: string };
        Insert: Database['public']['Tables']['branches']['Row'];
        Update: Partial<Database['public']['Tables']['branches']['Row']>;
        Relationships: [];
      };
      videos: {
        Row: {
          id: string;
          title: string;
          video_url: string;
          thumbnail_url: string;
          category_code: string;
          teacher_name: string;
          cta_text: string;
          created_at: string;
          teacher_avatar_url: string | null;
          tags: string[];
          cta_link: string | null;
          is_published: boolean;
          published_at: string;
          updated_at: string;
          share_slug: string;
          video_path: string | null;
          thumbnail_path: string | null;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          title: string;
          video_url: string;
          thumbnail_url: string;
          category_code: string;
          teacher_name: string;
          cta_text: string;
          teacher_avatar_url?: string | null;
          tags?: string[];
          cta_link?: string | null;
          is_published?: boolean;
          published_at?: string;
          video_path?: string | null;
          thumbnail_path?: string | null;
        };
        Update: Partial<Database['public']['Tables']['videos']['Insert']>;
        Relationships: [
          { foreignKeyName: 'videos_category_code_fkey'; columns: ['category_code']; isOneToOne: false; referencedRelation: 'categories'; referencedColumns: ['code'] },
        ];
      };
      portfolios: {
        Row: {
          id: string;
          student_name: string;
          course_code: string;
          branch_location: string;
          before_image_url: string;
          after_image_url: string;
          teacher_note: string;
          created_at: string;
          display_name: string;
          class_name: string;
          before_label: string;
          after_label: string;
          teacher_name: string;
          teacher_avatar_url: string | null;
          assessments: Json;
          duration_label: string;
          parent_consent: boolean;
          is_published: boolean;
          updated_at: string;
        };
        Insert: Omit<
          Database['public']['Tables']['portfolios']['Row'],
          'id' | 'created_at' | 'updated_at' | 'class_name' | 'before_label' | 'after_label' | 'assessments' | 'duration_label' | 'parent_consent' | 'is_published' | 'teacher_avatar_url'
        > &
          Partial<Database['public']['Tables']['portfolios']['Row']>;
        Update: Partial<Database['public']['Tables']['portfolios']['Row']>;
        Relationships: [
          { foreignKeyName: 'portfolios_course_code_fkey'; columns: ['course_code']; isOneToOne: false; referencedRelation: 'categories'; referencedColumns: ['code'] },
          { foreignKeyName: 'portfolios_branch_location_fkey'; columns: ['branch_location']; isOneToOne: false; referencedRelation: 'branches'; referencedColumns: ['code'] },
        ];
      };
      leads: {
        Row: {
          id: string;
          parent_name: string;
          phone_number: string;
          student_name: string;
          student_age: number;
          course_code: string;
          branch_location: string;
          quiz_summary: Json | null;
          status: LeadStatus;
          appointment_time: string | null;
          teacher_note: string | null;
          staff_note: string | null;
          trial_completed_at: string | null;
          trial_completed_by: string | null;
          created_at: string;
          code: string;
          preferred_date: string | null;
          preferred_slot: string | null;
          source: string;
          zalo_user_id: string | null;
          quiz_answers: Json | null;
          promo_code: string | null;
          source_ref: string | null;
          notified_at: string | null;
          notification_log: Json | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          parent_name: string;
          phone_number: string;
          student_name: string;
          student_age: number;
          course_code: string;
          branch_location: string;
          quiz_summary?: Json | null;
          preferred_date?: string | null;
          preferred_slot?: string | null;
          source?: string;
          zalo_user_id?: string | null;
          quiz_answers?: Json | null;
          promo_code?: string | null;
          source_ref?: string | null;
        };
        Update: Partial<Database['public']['Tables']['leads']['Row']>;
        Relationships: [
          { foreignKeyName: 'leads_course_code_fkey'; columns: ['course_code']; isOneToOne: false; referencedRelation: 'categories'; referencedColumns: ['code'] },
          { foreignKeyName: 'leads_branch_location_fkey'; columns: ['branch_location']; isOneToOne: false; referencedRelation: 'branches'; referencedColumns: ['code'] },
        ];
      };
      crm_logs: {
        Row: {
          id: string;
          lead_id: string;
          kind: 'CONFIRMATION' | 'REMINDER_24H' | 'REMINDER_2H' | 'POST_TRIAL';
          channel: 'ZNS' | 'OA' | 'SMS';
          status: 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED';
          attempt: number;
          provider_message_id: string | null;
          error: string | null;
          payload: Json | null;
          created_at: string;
          sent_at: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      trust_stats: {
        Row: {
          id: string;
          icon: string;
          headline: string | null;
          label: string;
          source_note: string;
          measured_on: string | null;
          sort_order: number;
          is_published: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: { icon: string; label: string; headline?: string | null; source_note?: string; measured_on?: string | null; sort_order?: number; is_published?: boolean };
        Update: Partial<Database['public']['Tables']['trust_stats']['Insert']>;
        Relationships: [];
      };
      testimonials: {
        Row: {
          id: string;
          kind: 'VIDEO' | 'LETTER' | 'NOTEBOOK';
          parent_label: string;
          course_code: string;
          branch_location: string | null;
          quote: string;
          media_url: string;
          thumbnail_url: string | null;
          duration_sec: number | null;
          recorded_on: string | null;
          consent_confirmed: boolean;
          is_published: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['testimonials']['Row']> &
          Pick<Database['public']['Tables']['testimonials']['Row'], 'kind' | 'parent_label' | 'course_code' | 'media_url'>;
        Update: Partial<Database['public']['Tables']['testimonials']['Row']>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      get_feed: {
        Args: { p_category_code?: string | null; p_limit?: number; p_before_ts?: string | null; p_before_id?: string | null };
        Returns: Database['public']['Tables']['videos']['Row'][];
      };
      submit_lead: { Args: { p: Json }; Returns: Json };
      is_staff: { Args: Record<PropertyKey, never>; Returns: boolean };
      crm_complete_trial: { Args: { p_lead_id: string; p_teacher_note: string }; Returns: Json };
      crm_set_status: { Args: { p_lead_id: string; p_status: string; p_note?: string | null }; Returns: Json };
      staff_video_stats: {
        Args: Record<PropertyKey, never>;
        Returns: { video_id: string; lead_count: number; last_lead_at: string | null }[];
      };
      recent_activity: {
        Args: { p_limit?: number };
        Returns: { actor_label: string; course_code: string; course_name: string; branch_code: string; branch_name: string; created_at: string }[];
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
