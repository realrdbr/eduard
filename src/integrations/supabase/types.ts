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
      announcements: {
        Row: {
          author: string
          content: string
          created_at: string | null
          created_by: string | null
          id: string
          priority: string | null
          target_class: string | null
          target_permission_level: number | null
          title: string
          updated_at: string | null
        }
        Insert: {
          author: string
          content: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          priority?: string | null
          target_class?: string | null
          target_permission_level?: number | null
          title: string
          updated_at?: string | null
        }
        Update: {
          author?: string
          content?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          priority?: string | null
          target_class?: string | null
          target_permission_level?: number | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      audio_announcements: {
        Row: {
          audio_file_path: string | null
          created_at: string
          created_by: string | null
          description: string | null
          duration_seconds: number | null
          id: string
          is_active: boolean
          is_tts: boolean
          played_at: string | null
          schedule_date: string | null
          title: string
          tts_text: string | null
          updated_at: string
          voice_id: string | null
        }
        Insert: {
          audio_file_path?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_seconds?: number | null
          id?: string
          is_active?: boolean
          is_tts?: boolean
          played_at?: string | null
          schedule_date?: string | null
          title: string
          tts_text?: string | null
          updated_at?: string
          voice_id?: string | null
        }
        Update: {
          audio_file_path?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_seconds?: number | null
          id?: string
          is_active?: boolean
          is_tts?: boolean
          played_at?: string | null
          schedule_date?: string | null
          title?: string
          tts_text?: string | null
          updated_at?: string
          voice_id?: string | null
        }
        Relationships: []
      }
      books: {
        Row: {
          author: string
          available_copies: number
          cover_image_url: string | null
          created_at: string
          description: string | null
          genre: string | null
          id: string
          isbn: string | null
          publication_year: number | null
          publisher: string | null
          title: string
          total_copies: number
          updated_at: string
        }
        Insert: {
          author: string
          available_copies?: number
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          genre?: string | null
          id?: string
          isbn?: string | null
          publication_year?: number | null
          publisher?: string | null
          title: string
          total_copies?: number
          updated_at?: string
        }
        Update: {
          author?: string
          available_copies?: number
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          genre?: string | null
          id?: string
          isbn?: string | null
          publication_year?: number | null
          publisher?: string | null
          title?: string
          total_copies?: number
          updated_at?: string
        }
        Relationships: []
      }
      chat_conversations: {
        Row: {
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      document_analysis: {
        Row: {
          analysis_result: Json | null
          content_summary: string | null
          created_at: string
          file_name: string
          file_path: string
          file_type: string
          grade_level: string | null
          id: string
          subject: string | null
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          analysis_result?: Json | null
          content_summary?: string | null
          created_at?: string
          file_name: string
          file_path: string
          file_type: string
          grade_level?: string | null
          id?: string
          subject?: string | null
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          analysis_result?: Json | null
          content_summary?: string | null
          created_at?: string
          file_name?: string
          file_path?: string
          file_type?: string
          grade_level?: string | null
          id?: string
          subject?: string | null
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: []
      }
      Klassen: {
        Row: {
          name: string
        }
        Insert: {
          name: string
        }
        Update: {
          name?: string
        }
        Relationships: []
      }
      level_permissions: {
        Row: {
          allowed: boolean
          created_at: string
          level: number
          permission_id: string
          updated_at: string
        }
        Insert: {
          allowed?: boolean
          created_at?: string
          level: number
          permission_id: string
          updated_at?: string
        }
        Update: {
          allowed?: boolean
          created_at?: string
          level?: number
          permission_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "level_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permission_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      loans: {
        Row: {
          book_id: string
          created_at: string
          due_date: string
          id: string
          is_returned: boolean
          keycard_number: string | null
          librarian_id: number | null
          loan_date: string
          notes: string | null
          return_date: string | null
          updated_at: string
          user_id: number
        }
        Insert: {
          book_id: string
          created_at?: string
          due_date?: string
          id?: string
          is_returned?: boolean
          keycard_number?: string | null
          librarian_id?: number | null
          loan_date?: string
          notes?: string | null
          return_date?: string | null
          updated_at?: string
          user_id: number
        }
        Update: {
          book_id?: string
          created_at?: string
          due_date?: string
          id?: string
          is_returned?: boolean
          keycard_number?: string | null
          librarian_id?: number | null
          loan_date?: string
          notes?: string | null
          return_date?: string | null
          updated_at?: string
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "loans_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_librarian_id_fkey"
            columns: ["librarian_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_librarian_id_fkey"
            columns: ["librarian_id"]
            isOneToOne: false
            referencedRelation: "user_public_info_secure"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_public_info_secure"
            referencedColumns: ["id"]
          },
        ]
      }
      login_attempts: {
        Row: {
          attempted_at: string | null
          id: string
          ip_address: unknown
          success: boolean | null
          user_agent: string | null
          username: string
        }
        Insert: {
          attempted_at?: string | null
          id?: string
          ip_address?: unknown
          success?: boolean | null
          user_agent?: string | null
          username: string
        }
        Update: {
          attempted_at?: string | null
          id?: string
          ip_address?: unknown
          success?: boolean | null
          user_agent?: string | null
          username?: string
        }
        Relationships: []
      }
      permission_definitions: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          requires_level: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id: string
          name: string
          requires_level?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          requires_level?: number
        }
        Relationships: []
      }
      permissions: {
        Row: {
          created_at: string
          id: number
          keycard_active: boolean | null
          keycard_number: string | null
          must_change_password: boolean | null
          name: string
          password: string
          permission_lvl: number | null
          user_class: string | null
          username: string
        }
        Insert: {
          created_at?: string
          id?: number
          keycard_active?: boolean | null
          keycard_number?: string | null
          must_change_password?: boolean | null
          name: string
          password?: string
          permission_lvl?: number | null
          user_class?: string | null
          username?: string
        }
        Update: {
          created_at?: string
          id?: number
          keycard_active?: boolean | null
          keycard_number?: string | null
          must_change_password?: boolean | null
          name?: string
          password?: string
          permission_lvl?: number | null
          user_class?: string | null
          username?: string
        }
        Relationships: []
      }
      private_conversations: {
        Row: {
          created_at: string
          id: string
          updated_at: string
          user1_id: number
          user2_id: number
        }
        Insert: {
          created_at?: string
          id?: string
          updated_at?: string
          user1_id: number
          user2_id: number
        }
        Update: {
          created_at?: string
          id?: string
          updated_at?: string
          user1_id?: number
          user2_id?: number
        }
        Relationships: []
      }
      private_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          is_read: boolean
          sender_id: number
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          is_read?: boolean
          sender_id: number
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          is_read?: boolean
          sender_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "private_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "private_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: number
          permission_id: string | null
          updated_at: string | null
          user_id: string | null
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: never
          permission_id?: string | null
          updated_at?: string | null
          user_id?: string | null
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: never
          permission_id?: string | null
          updated_at?: string | null
          user_id?: string | null
          username?: string | null
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          action: string
          attempts: number
          created_at: string
          id: string
          identifier: string
          window_start: string
        }
        Insert: {
          action: string
          attempts?: number
          created_at?: string
          id?: string
          identifier: string
          window_start?: string
        }
        Update: {
          action?: string
          attempts?: number
          created_at?: string
          id?: string
          identifier?: string
          window_start?: string
        }
        Relationships: []
      }
      room_displays: {
        Row: {
          additional_info: string | null
          created_at: string | null
          display_mode: string
          display_name: string | null
          id: string
          info_mode_content: string | null
          is_active: boolean | null
          last_seen: string | null
          primary_subject: string | null
          room_name: string
          update_schedule_id: number | null
          updated_at: string | null
        }
        Insert: {
          additional_info?: string | null
          created_at?: string | null
          display_mode?: string
          display_name?: string | null
          id?: string
          info_mode_content?: string | null
          is_active?: boolean | null
          last_seen?: string | null
          primary_subject?: string | null
          room_name: string
          update_schedule_id?: number | null
          updated_at?: string | null
        }
        Update: {
          additional_info?: string | null
          created_at?: string | null
          display_mode?: string
          display_name?: string | null
          id?: string
          info_mode_content?: string | null
          is_active?: boolean | null
          last_seen?: string | null
          primary_subject?: string | null
          room_name?: string
          update_schedule_id?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_update_schedule"
            columns: ["update_schedule_id"]
            isOneToOne: false
            referencedRelation: "update_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      room_schedule: {
        Row: {
          class_name: string
          created_at: string | null
          day_of_week: string
          id: number
          period: number
          room_name: string
          subject: string
          teacher_shortened: string | null
          updated_at: string | null
        }
        Insert: {
          class_name: string
          created_at?: string | null
          day_of_week: string
          id?: never
          period: number
          room_name: string
          subject: string
          teacher_shortened?: string | null
          updated_at?: string | null
        }
        Update: {
          class_name?: string
          created_at?: string | null
          day_of_week?: string
          id?: never
          period?: number
          room_name?: string
          subject?: string
          teacher_shortened?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "room_schedule_teacher_fkey"
            columns: ["teacher_shortened"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["shortened"]
          },
        ]
      }
      security_audit_log: {
        Row: {
          created_at: string | null
          event_details: Json | null
          event_type: string
          id: string
          ip_address: unknown
          user_agent: string | null
          user_id: number | null
        }
        Insert: {
          created_at?: string | null
          event_details?: Json | null
          event_type: string
          id?: string
          ip_address?: unknown
          user_agent?: string | null
          user_id?: number | null
        }
        Update: {
          created_at?: string | null
          event_details?: Json | null
          event_type?: string
          id?: string
          ip_address?: unknown
          user_agent?: string | null
          user_id?: number | null
        }
        Relationships: []
      }
      Stundenplan_10b_A: {
        Row: {
          friday: string | null
          monday: string | null
          Stunde: number
          thursday: string | null
          tuesday: string | null
          wednesday: string | null
        }
        Insert: {
          friday?: string | null
          monday?: string | null
          Stunde?: number
          thursday?: string | null
          tuesday?: string | null
          wednesday?: string | null
        }
        Update: {
          friday?: string | null
          monday?: string | null
          Stunde?: number
          thursday?: string | null
          tuesday?: string | null
          wednesday?: string | null
        }
        Relationships: []
      }
      Stundenplan_10c_A: {
        Row: {
          friday: string | null
          monday: string | null
          Stunde: number
          thursday: string | null
          tuesday: string | null
          wednesday: string | null
        }
        Insert: {
          friday?: string | null
          monday?: string | null
          Stunde?: number
          thursday?: string | null
          tuesday?: string | null
          wednesday?: string | null
        }
        Update: {
          friday?: string | null
          monday?: string | null
          Stunde?: number
          thursday?: string | null
          tuesday?: string | null
          wednesday?: string | null
        }
        Relationships: []
      }
      teachers: {
        Row: {
          fav_rooms: string | null
          "first name": string
          "last name": string
          salutation: string | null
          shortened: string
          subjects: string
        }
        Insert: {
          fav_rooms?: string | null
          "first name"?: string
          "last name"?: string
          salutation?: string | null
          shortened: string
          subjects: string
        }
        Update: {
          fav_rooms?: string | null
          "first name"?: string
          "last name"?: string
          salutation?: string | null
          shortened?: string
          subjects?: string
        }
        Relationships: []
      }
      update_schedules: {
        Row: {
          description: string | null
          enable_weekend_mode: boolean | null
          id: number
          name: string
          schedule_data: Json
        }
        Insert: {
          description?: string | null
          enable_weekend_mode?: boolean | null
          id?: never
          name: string
          schedule_data: Json
        }
        Update: {
          description?: string | null
          enable_weekend_mode?: boolean | null
          id?: never
          name?: string
          schedule_data?: Json
        }
        Relationships: []
      }
      user_contacts: {
        Row: {
          added_at: string
          contact_user_id: number
          id: string
          status: string
          user_id: number
        }
        Insert: {
          added_at?: string
          contact_user_id: number
          id?: string
          status?: string
          user_id: number
        }
        Update: {
          added_at?: string
          contact_user_id?: number
          id?: string
          status?: string
          user_id?: number
        }
        Relationships: []
      }
      user_permissions: {
        Row: {
          allowed: boolean
          created_at: string
          permission_id: string
          updated_at: string
          user_id: number
        }
        Insert: {
          allowed?: boolean
          created_at?: string
          permission_id: string
          updated_at?: string
          user_id: number
        }
        Update: {
          allowed?: boolean
          created_at?: string
          permission_id?: string
          updated_at?: string
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "user_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permission_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_public_info_secure"
            referencedColumns: ["id"]
          },
        ]
      }
      user_sessions: {
        Row: {
          created_at: string | null
          device_info: string | null
          id: string
          is_active: boolean | null
          is_primary: boolean | null
          last_route: string | null
          session_token: string | null
          updated_at: string | null
          user_id: number | null
        }
        Insert: {
          created_at?: string | null
          device_info?: string | null
          id?: string
          is_active?: boolean | null
          is_primary?: boolean | null
          last_route?: string | null
          session_token?: string | null
          updated_at?: string | null
          user_id?: number | null
        }
        Update: {
          created_at?: string | null
          device_info?: string | null
          id?: string
          is_active?: boolean | null
          is_primary?: boolean | null
          last_route?: string | null
          session_token?: string | null
          updated_at?: string | null
          user_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "user_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_public_info_secure"
            referencedColumns: ["id"]
          },
        ]
      }
      user_themes: {
        Row: {
          colors: Json
          created_at: string
          id: string
          is_active: boolean
          is_preset: boolean
          name: string
          updated_at: string
          user_id: number
        }
        Insert: {
          colors?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          is_preset?: boolean
          name?: string
          updated_at?: string
          user_id: number
        }
        Update: {
          colors?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          is_preset?: boolean
          name?: string
          updated_at?: string
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "user_themes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_themes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_public_info_secure"
            referencedColumns: ["id"]
          },
        ]
      }
      vertretungsplan: {
        Row: {
          class_name: string
          created_at: string | null
          created_by: string | null
          date: string
          id: string
          note: string | null
          original_room: string
          original_subject: string
          original_teacher: string
          period: number
          substitute_room: string | null
          substitute_subject: string | null
          substitute_teacher: string | null
          updated_at: string | null
        }
        Insert: {
          class_name: string
          created_at?: string | null
          created_by?: string | null
          date: string
          id?: string
          note?: string | null
          original_room: string
          original_subject: string
          original_teacher: string
          period: number
          substitute_room?: string | null
          substitute_subject?: string | null
          substitute_teacher?: string | null
          updated_at?: string | null
        }
        Update: {
          class_name?: string
          created_at?: string | null
          created_by?: string | null
          date?: string
          id?: string
          note?: string | null
          original_room?: string
          original_subject?: string
          original_teacher?: string
          period?: number
          substitute_room?: string | null
          substitute_subject?: string | null
          substitute_teacher?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      user_public_info_secure: {
        Row: {
          created_at: string | null
          id: number | null
          name: string | null
          permission_lvl: number | null
          user_class: string | null
          username: string | null
        }
        Insert: {
          created_at?: string | null
          id?: number | null
          name?: string | null
          permission_lvl?: number | null
          user_class?: string | null
          username?: string | null
        }
        Update: {
          created_at?: string | null
          id?: number | null
          name?: string | null
          permission_lvl?: number | null
          user_class?: string | null
          username?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_book_session: {
        Args: {
          b_author: string
          b_description?: string
          b_genre?: string
          b_isbn?: string
          b_publication_year?: number
          b_publisher?: string
          b_title: string
          b_total_copies?: number
          v_session_id?: string
        }
        Returns: Json
      }
      add_contact_session: {
        Args: { contact_user_id_param: number; v_session_id?: string }
        Returns: Json
      }
      admin_change_user_password: {
        Args: {
          admin_user_id: number
          new_password: string
          target_user_id: number
        }
        Returns: Json
      }
      admin_change_user_password_secure: {
        Args: {
          new_password: string
          target_user_id: number
          v_session_id: string
        }
        Returns: Json
      }
      auto_assign_primary_session: {
        Args: { target_user_id: number }
        Returns: string
      }
      change_user_password: {
        Args: {
          new_password: string
          old_password: string
          user_id_input: number
        }
        Returns: Json
      }
      change_user_password_forced_secure: {
        Args: { new_password: string; user_id_input: number }
        Returns: Json
      }
      change_user_password_secure: {
        Args: {
          new_password: string
          old_password: string
          user_id_input: number
        }
        Returns: Json
      }
      check_brute_force_protection: {
        Args: { ip_address_input?: unknown; username_input: string }
        Returns: boolean
      }
      check_user_permission: {
        Args: { permission_id_param: string; user_id_param: number }
        Returns: boolean
      }
      cleanup_expired_sessions: { Args: never; Returns: undefined }
      cleanup_old_conversations: { Args: never; Returns: undefined }
      count_unread_messages_session: {
        Args: { conversation_id_param: string; v_session_id?: string }
        Returns: number
      }
      create_audio_announcement_session: {
        Args: {
          v_audio_file_path?: string
          v_description?: string
          v_duration_seconds?: number
          v_is_tts?: boolean
          v_schedule_date?: string
          v_session_id: string
          v_title: string
          v_tts_text?: string
          v_voice_id?: string
        }
        Returns: Json
      }
      create_school_user: {
        Args: {
          creator_user_id: number
          full_name_input: string
          password_input: string
          permission_level_input: number
          username_input: string
        }
        Returns: Json
      }
      create_school_user_secure:
        | {
            Args: {
              creator_user_id: number
              full_name_input: string
              password_input: string
              permission_level_input: number
              username_input: string
            }
            Returns: Json
          }
        | {
            Args: {
              creator_user_id: number
              full_name_input: string
              keycard_active_input?: boolean
              keycard_number_input?: string
              password_input: string
              permission_level_input: number
              username_input: string
            }
            Returns: Json
          }
      create_user_session: { Args: { user_id_param: number }; Returns: string }
      create_user_theme_secure: {
        Args: {
          password_input: string
          theme_colors: Json
          theme_name: string
          username_input: string
        }
        Returns: Json
      }
      create_user_theme_session: {
        Args: { theme_colors: Json; theme_name: string }
        Returns: Json
      }
      create_vertretung_secure: {
        Args: {
          password_input: string
          username_input: string
          v_class_name: string
          v_date: string
          v_note: string
          v_original_room: string
          v_original_subject: string
          v_original_teacher: string
          v_period: number
          v_substitute_room: string
          v_substitute_subject: string
          v_substitute_teacher: string
        }
        Returns: Json
      }
      create_vertretung_session: {
        Args: {
          v_class_name: string
          v_date: string
          v_note: string
          v_original_room: string
          v_original_subject: string
          v_original_teacher: string
          v_period: number
          v_session_id?: string
          v_substitute_room: string
          v_substitute_subject: string
          v_substitute_teacher: string
        }
        Returns: Json
      }
      current_user_has_permission_level: {
        Args: { required_level: number }
        Returns: boolean
      }
      current_user_owns_resource: {
        Args: { resource_user_id: number }
        Returns: boolean
      }
      delete_audio_announcement_session: {
        Args: { v_announcement_id: string; v_session_id: string }
        Returns: Json
      }
      delete_book_session: {
        Args: { b_id: string; v_session_id?: string }
        Returns: Json
      }
      delete_user_theme_secure: {
        Args: {
          password_input: string
          theme_id: string
          username_input: string
        }
        Returns: Json
      }
      delete_user_theme_session: { Args: { theme_id: string }; Returns: Json }
      delete_vertretung_secure: {
        Args: { password_input: string; username_input: string; v_id: string }
        Returns: Json
      }
      delete_vertretung_session: {
        Args: { v_id: string; v_session_id?: string }
        Returns: Json
      }
      get_actor_from_session_secure: {
        Args: { v_session_id: string }
        Returns: {
          id: number
          keycard_active: boolean
          keycard_number: string
          name: string
          permission_lvl: number
          user_class: string
          username: string
        }[]
      }
      get_current_user_from_session: { Args: never; Returns: number }
      get_current_user_id: { Args: never; Returns: string }
      get_current_user_permission_level: { Args: never; Returns: number }
      get_or_create_conversation: {
        Args: { other_user_id: number }
        Returns: string
      }
      get_or_create_conversation_session: {
        Args: { other_user_id: number; v_session_id?: string }
        Returns: string
      }
      get_schedule_for_room_display: {
        Args: { p_room_display_id: string }
        Returns: {
          class_name: string
          created_at: string
          day_of_week: string
          period: number
          preview_id: string
          room_name: string
          subject_name: string
          subject_raw: string
          teacher_short: string
        }[]
      }
      get_user_contacts: {
        Args: { user_id_param: number }
        Returns: {
          added_at: string
          contact_id: string
          contact_name: string
          contact_permission_lvl: number
          contact_user_id: number
          contact_username: string
        }[]
      }
      get_user_public_info: {
        Args: { user_id_param: number }
        Returns: {
          id: number
          name: string
          permission_lvl: number
          username: string
        }[]
      }
      has_active_sessions: {
        Args: { target_user_id: number }
        Returns: boolean
      }
      hash_password: { Args: { password_input: string }; Returns: string }
      invalidate_user_sessions: {
        Args: { keep_session_id?: string; target_user_id: number }
        Returns: undefined
      }
      is_current_user_admin: { Args: never; Returns: boolean }
      is_current_user_admin_safe: { Args: never; Returns: boolean }
      is_current_user_admin_secure: { Args: never; Returns: boolean }
      is_custom_user_authenticated: { Args: never; Returns: boolean }
      is_session_valid: { Args: { session_id_param: string }; Returns: boolean }
      list_private_conversations_session: {
        Args: { v_session_id?: string }
        Returns: {
          id: string
          updated_at: string
          user1_id: number
          user2_id: number
        }[]
      }
      list_private_last_message_session: {
        Args: { conversation_id_param: string; v_session_id?: string }
        Returns: {
          content: string
          created_at: string
          sender_id: number
        }[]
      }
      list_private_messages_session: {
        Args: { conversation_id_param: string; v_session_id?: string }
        Returns: {
          content: string
          created_at: string
          id: string
          is_read: boolean
          sender_id: number
        }[]
      }
      log_login_attempt: {
        Args: {
          ip_address_input?: unknown
          success_input: boolean
          user_agent_input?: string
          username_input: string
        }
        Returns: undefined
      }
      mark_messages_as_read: {
        Args: { conversation_id_param: string }
        Returns: undefined
      }
      mark_messages_as_read_session: {
        Args: { conversation_id_param: string; v_session_id?: string }
        Returns: undefined
      }
      populate_master_schedule: { Args: never; Returns: undefined }
      populate_room_schedule_from_class_plans: {
        Args: never
        Returns: undefined
      }
      release_primary_session: {
        Args: { target_user_id: number }
        Returns: undefined
      }
      remove_contact_session: {
        Args: { contact_id_param: string; v_session_id?: string }
        Returns: Json
      }
      resolve_current_user_from_session: {
        Args: { v_session_id: string }
        Returns: number
      }
      resolve_keycards_to_names: {
        Args: { keycards: string[]; v_session_id?: string }
        Returns: {
          keycard_number: string
          name: string
        }[]
      }
      rotate_session_token: {
        Args: { old_session_token: string }
        Returns: string
      }
      search_user_directory: {
        Args: { current_user_id?: number; search_term: string }
        Returns: {
          id: number
          name: string
          permission_lvl: number
          username: string
        }[]
      }
      send_private_message_session: {
        Args: {
          content_param: string
          conversation_id_param: string
          v_session_id?: string
        }
        Returns: Json
      }
      session_has_admin_rights: {
        Args: { session_id_param: string }
        Returns: boolean
      }
      set_primary_session: {
        Args: { session_id_param: string; target_user_id: number }
        Returns: undefined
      }
      set_session_context: {
        Args: { session_id_param: string }
        Returns: undefined
      }
      toggle_audio_announcement_session: {
        Args: {
          v_announcement_id: string
          v_is_active: boolean
          v_session_id: string
        }
        Returns: Json
      }
      update_book_session: {
        Args: {
          b_author: string
          b_description?: string
          b_genre?: string
          b_id: string
          b_isbn?: string
          b_publication_year?: number
          b_publisher?: string
          b_title: string
          b_total_copies?: number
          v_session_id?: string
        }
        Returns: Json
      }
      update_user_theme_secure: {
        Args: {
          password_input: string
          theme_colors: Json
          theme_id: string
          username_input: string
        }
        Returns: Json
      }
      update_user_theme_session: {
        Args: { theme_colors: Json; theme_id: string }
        Returns: Json
      }
      update_vertretung_secure: {
        Args: {
          password_input: string
          username_input: string
          v_id: string
          v_note: string
          v_substitute_room: string
          v_substitute_subject: string
          v_substitute_teacher: string
        }
        Returns: Json
      }
      update_vertretung_session: {
        Args: {
          v_id: string
          v_note: string
          v_session_id?: string
          v_substitute_room: string
          v_substitute_subject: string
          v_substitute_teacher: string
        }
        Returns: Json
      }
      validate_session_ownership: {
        Args: { expected_user_id: number; v_session_id: string }
        Returns: boolean
      }
      validate_session_security: {
        Args: { session_id_param: string }
        Returns: boolean
      }
      verify_password: {
        Args: { password_hash: string; password_input: string }
        Returns: boolean
      }
      verify_user_login: {
        Args: { password_input: string; username_input: string }
        Returns: {
          full_name: string
          must_change_password: boolean
          permission_level: number
          profile_id: number
          user_id: number
        }[]
      }
      verify_user_login_secure:
        | {
            Args: { password_input: string; username_input: string }
            Returns: {
              full_name: string
              must_change_password: boolean
              permission_level: number
              profile_id: number
              user_id: number
            }[]
          }
        | {
            Args: {
              ip_address_input?: unknown
              password_input: string
              user_agent_input?: string
              username_input: string
            }
            Returns: {
              error_message: string
              full_name: string
              must_change_password: boolean
              permission_level: number
              profile_id: number
              user_id: number
            }[]
          }
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
