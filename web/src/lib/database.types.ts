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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      anon_development: {
        Row: {
          anon_id: string
          category: string | null
          club_id: string
          criterion: string | null
          id: string
          measure_code: string | null
          measure_value: number | null
          scores: Json | null
          season: string | null
          source: string
          status: string | null
        }
        Insert: {
          anon_id: string
          category?: string | null
          club_id: string
          criterion?: string | null
          id?: string
          measure_code?: string | null
          measure_value?: number | null
          scores?: Json | null
          season?: string | null
          source: string
          status?: string | null
        }
        Update: {
          anon_id?: string
          category?: string | null
          club_id?: string
          criterion?: string | null
          id?: string
          measure_code?: string | null
          measure_value?: number | null
          scores?: Json | null
          season?: string | null
          source?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "anon_development_anon_id_fkey"
            columns: ["anon_id"]
            isOneToOne: false
            referencedRelation: "anon_swimmers"
            referencedColumns: ["anon_id"]
          },
        ]
      }
      anon_swim_results: {
        Row: {
          age_at_swim: number | null
          anon_id: string
          club_id: string
          converted_time: string | null
          course: string | null
          event: string
          id: string
          is_pb: boolean | null
          level: number | null
          season: string | null
          swim_time: string | null
        }
        Insert: {
          age_at_swim?: number | null
          anon_id: string
          club_id: string
          converted_time?: string | null
          course?: string | null
          event: string
          id?: string
          is_pb?: boolean | null
          level?: number | null
          season?: string | null
          swim_time?: string | null
        }
        Update: {
          age_at_swim?: number | null
          anon_id?: string
          club_id?: string
          converted_time?: string | null
          course?: string | null
          event?: string
          id?: string
          is_pb?: boolean | null
          level?: number | null
          season?: string | null
          swim_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "anon_swim_results_anon_id_fkey"
            columns: ["anon_id"]
            isOneToOne: false
            referencedRelation: "anon_swimmers"
            referencedColumns: ["anon_id"]
          },
        ]
      }
      anon_swimmers: {
        Row: {
          anon_id: string
          archived_season: string
          club_id: string
          created_at: string
          gender: string | null
          years_at_club: number | null
        }
        Insert: {
          anon_id?: string
          archived_season: string
          club_id: string
          created_at?: string
          gender?: string | null
          years_at_club?: number | null
        }
        Update: {
          anon_id?: string
          archived_season?: string
          club_id?: string
          created_at?: string
          gender?: string | null
          years_at_club?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "anon_swimmers_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      anon_test_results: {
        Row: {
          age: number | null
          age_level: number | null
          anon_id: string
          club_id: string
          id: string
          level: number | null
          level_key: string | null
          points: number | null
          protocol_id: string | null
          reps_done: number | null
          reps_total: number | null
          score: number | null
          season: string | null
          set_completed: boolean | null
          source: string
          test_month: string | null
          test_name: string | null
          value: number | null
        }
        Insert: {
          age?: number | null
          age_level?: number | null
          anon_id: string
          club_id: string
          id?: string
          level?: number | null
          level_key?: string | null
          points?: number | null
          protocol_id?: string | null
          reps_done?: number | null
          reps_total?: number | null
          score?: number | null
          season?: string | null
          set_completed?: boolean | null
          source: string
          test_month?: string | null
          test_name?: string | null
          value?: number | null
        }
        Update: {
          age?: number | null
          age_level?: number | null
          anon_id?: string
          club_id?: string
          id?: string
          level?: number | null
          level_key?: string | null
          points?: number | null
          protocol_id?: string | null
          reps_done?: number | null
          reps_total?: number | null
          score?: number | null
          season?: string | null
          set_completed?: boolean | null
          source?: string
          test_month?: string | null
          test_name?: string | null
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "anon_test_results_anon_id_fkey"
            columns: ["anon_id"]
            isOneToOne: false
            referencedRelation: "anon_swimmers"
            referencedColumns: ["anon_id"]
          },
        ]
      }
      app_dev_specs: {
        Row: {
          content: string
          id: string
          title: string
          updated_at: string
        }
        Insert: {
          content: string
          id: string
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      app_dev_tasks: {
        Row: {
          area: string
          created_at: string
          due_on: string | null
          evidence: string | null
          gate: boolean
          id: string
          milestone: string
          notes: string | null
          owner_role: string | null
          priority: string
          status: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          area: string
          created_at?: string
          due_on?: string | null
          evidence?: string | null
          gate?: boolean
          id: string
          milestone: string
          notes?: string | null
          owner_role?: string | null
          priority?: string
          status?: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          area?: string
          created_at?: string
          due_on?: string | null
          evidence?: string | null
          gate?: boolean
          id?: string
          milestone?: string
          notes?: string | null
          owner_role?: string | null
          priority?: string
          status?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      app_events: {
        Row: {
          club: string | null
          club_id: string | null
          created_at: string
          detail: Json | null
          event_name: string
          event_type: string
          id: string
          user_id: string | null
        }
        Insert: {
          club?: string | null
          club_id?: string | null
          created_at?: string
          detail?: Json | null
          event_name: string
          event_type: string
          id?: string
          user_id?: string | null
        }
        Update: {
          club?: string | null
          club_id?: string | null
          created_at?: string
          detail?: Json | null
          event_name?: string
          event_type?: string
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_events_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      app_features: {
        Row: {
          created_at: string
          description: string | null
          key: string
          name: string
          tier: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          key: string
          name: string
          tier?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          key?: string
          name?: string
          tier?: string | null
        }
        Relationships: []
      }
      app_feedback: {
        Row: {
          club_id: string | null
          created_at: string
          id: string
          message: string
          page: string | null
          user_id: string | null
        }
        Insert: {
          club_id?: string | null
          created_at?: string
          id?: string
          message: string
          page?: string | null
          user_id?: string | null
        }
        Update: {
          club_id?: string | null
          created_at?: string
          id?: string
          message?: string
          page?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_feedback_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      app_users: {
        Row: {
          email: string
          full_name: string | null
          invited_at: string
          invited_by: string | null
          last_link_at: string | null
          user_id: string
        }
        Insert: {
          email: string
          full_name?: string | null
          invited_at?: string
          invited_by?: string | null
          last_link_at?: string | null
          user_id: string
        }
        Update: {
          email?: string
          full_name?: string | null
          invited_at?: string
          invited_by?: string | null
          last_link_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      assessments: {
        Row: {
          assessed_at: string
          club_id: string
          coach_email: string
          created_at: string
          group: string
          id: string
          notes: string | null
          scores: Json
          swimmer_id: string
          swimmer_name: string
        }
        Insert: {
          assessed_at?: string
          club_id: string
          coach_email: string
          created_at?: string
          group: string
          id?: string
          notes?: string | null
          scores?: Json
          swimmer_id: string
          swimmer_name: string
        }
        Update: {
          assessed_at?: string
          club_id?: string
          coach_email?: string
          created_at?: string
          group?: string
          id?: string
          notes?: string | null
          scores?: Json
          swimmer_id?: string
          swimmer_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessments_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_swimmer_id_fkey"
            columns: ["swimmer_id"]
            isOneToOne: false
            referencedRelation: "swimmers"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_records: {
        Row: {
          club_id: string
          coach: string | null
          distance_m: number | null
          id: string
          lane: number | null
          marked_at: string
          minutes_attended: number | null
          note: string | null
          pool_size: string
          present: boolean
          session_date: string
          session_end_time: string | null
          session_minutes: number | null
          session_plan_id: string | null
          session_time: string
          status: string | null
          swimmer_id: string
          timetable_session_id: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          club_id: string
          coach?: string | null
          distance_m?: number | null
          id?: string
          lane?: number | null
          marked_at?: string
          minutes_attended?: number | null
          note?: string | null
          pool_size: string
          present?: boolean
          session_date: string
          session_end_time?: string | null
          session_minutes?: number | null
          session_plan_id?: string | null
          session_time: string
          status?: string | null
          swimmer_id: string
          timetable_session_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          club_id?: string
          coach?: string | null
          distance_m?: number | null
          id?: string
          lane?: number | null
          marked_at?: string
          minutes_attended?: number | null
          note?: string | null
          pool_size?: string
          present?: boolean
          session_date?: string
          session_end_time?: string | null
          session_minutes?: number | null
          session_plan_id?: string | null
          session_time?: string
          status?: string | null
          swimmer_id?: string
          timetable_session_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_session_plan_id_fkey"
            columns: ["session_plan_id"]
            isOneToOne: false
            referencedRelation: "session_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_swimmer_id_fkey"
            columns: ["swimmer_id"]
            isOneToOne: false
            referencedRelation: "swimmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_timetable_session_id_fkey"
            columns: ["timetable_session_id"]
            isOneToOne: false
            referencedRelation: "timetable_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      club_codes: {
        Row: {
          club_code: string
          club_name: string
          county_code: string
          created_at: string
          district_code: string
          meet_name: string | null
          source: string | null
          updated_at: string
        }
        Insert: {
          club_code: string
          club_name: string
          county_code: string
          created_at?: string
          district_code: string
          meet_name?: string | null
          source?: string | null
          updated_at?: string
        }
        Update: {
          club_code?: string
          club_name?: string
          county_code?: string
          created_at?: string
          district_code?: string
          meet_name?: string | null
          source?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      club_competition_standards: {
        Row: {
          age_at: string | null
          cct_gala_id: string | null
          cct_time_type: string | null
          club_id: string
          confirmed_at: string
          confirmed_by: string | null
          county: string
          cqt_gala_id: string
          cqt_time_type: string
          id: string
          season_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          age_at?: string | null
          cct_gala_id?: string | null
          cct_time_type?: string | null
          club_id: string
          confirmed_at?: string
          confirmed_by?: string | null
          county: string
          cqt_gala_id: string
          cqt_time_type: string
          id?: string
          season_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          age_at?: string | null
          cct_gala_id?: string | null
          cct_time_type?: string | null
          club_id?: string
          confirmed_at?: string
          confirmed_by?: string | null
          county?: string
          cqt_gala_id?: string
          cqt_time_type?: string
          id?: string
          season_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "club_competition_standards_cct_gala_id_fkey"
            columns: ["cct_gala_id"]
            isOneToOne: false
            referencedRelation: "galas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_competition_standards_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_competition_standards_cqt_gala_id_fkey"
            columns: ["cqt_gala_id"]
            isOneToOne: false
            referencedRelation: "galas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_competition_standards_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: true
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      club_events: {
        Row: {
          club_id: string
          created_at: string
          created_by: string | null
          ends_on: string
          id: string
          is_active: boolean
          kind: string
          location: string | null
          note: string | null
          season_id: string
          squad_ids: string[] | null
          starts_on: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          club_id: string
          created_at?: string
          created_by?: string | null
          ends_on: string
          id?: string
          is_active?: boolean
          kind?: string
          location?: string | null
          note?: string | null
          season_id: string
          squad_ids?: string[] | null
          starts_on: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          club_id?: string
          created_at?: string
          created_by?: string | null
          ends_on?: string
          id?: string
          is_active?: boolean
          kind?: string
          location?: string | null
          note?: string | null
          season_id?: string
          squad_ids?: string[] | null
          starts_on?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "club_events_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_events_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      club_award_levels: {
        Row: {
          award: number
          colour: string
          icon: string
          title: string
        }
        Insert: {
          award: number
          colour: string
          icon?: string
          title: string
        }
        Update: {
          award?: number
          colour?: string
          icon?: string
          title?: string
        }
        Relationships: [

        ]
      }
      club_award_outcomes: {
        Row: {
          area: string
          award: number
          outcome: string
          outcome_id: string
          outcome_no: number
        }
        Insert: {
          area: string
          award: number
          outcome: string
          outcome_id: string
          outcome_no: number
        }
        Update: {
          area?: string
          award?: number
          outcome?: string
          outcome_id?: string
          outcome_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "club_award_outcomes_award_fkey"
            columns: ["award"]
            isOneToOne: false
            referencedRelation: "club_award_levels"
            referencedColumns: ["award"]
          }
        ]
      }
      swimmer_award_outcomes: {
        Row: {
          assessed_by: string | null
          assessed_on: string
          award: number
          club_id: string
          notes: string | null
          outcome_id: string
          score: number
          swimmer_id: string
          updated_at: string
        }
        Insert: {
          assessed_by?: string | null
          assessed_on?: string
          award?: number
          club_id?: string
          notes?: string | null
          outcome_id: string
          score: number
          swimmer_id: string
          updated_at?: string
        }
        Update: {
          assessed_by?: string | null
          assessed_on?: string
          award?: number
          club_id?: string
          notes?: string | null
          outcome_id?: string
          score?: number
          swimmer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "swimmer_award_outcomes_outcome_id_fkey"
            columns: ["outcome_id"]
            isOneToOne: false
            referencedRelation: "club_award_outcomes"
            referencedColumns: ["outcome_id"]
          },
          {
            foreignKeyName: "swimmer_award_outcomes_swimmer_id_fkey"
            columns: ["swimmer_id"]
            isOneToOne: false
            referencedRelation: "swimmers"
            referencedColumns: ["id"]
          }
        ]
      }
      swimmer_club_awards: {
        Row: {
          achieved_on: string | null
          activated_by: string | null
          activated_on: string
          award: number
          club_id: string
          signed_off_by: string | null
          swimmer_id: string
          updated_at: string
        }
        Insert: {
          achieved_on?: string | null
          activated_by?: string | null
          activated_on?: string
          award: number
          club_id?: string
          signed_off_by?: string | null
          swimmer_id: string
          updated_at?: string
        }
        Update: {
          achieved_on?: string | null
          activated_by?: string | null
          activated_on?: string
          award?: number
          club_id?: string
          signed_off_by?: string | null
          swimmer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "swimmer_club_awards_swimmer_id_fkey"
            columns: ["swimmer_id"]
            isOneToOne: false
            referencedRelation: "swimmers"
            referencedColumns: ["id"]
          }
        ]
      }
      club_features: {
        Row: {
          club_id: string
          created_at: string
          enabled: boolean
          ends_on: string | null
          feature: string
          note: string | null
          source: string
          starts_on: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          club_id: string
          created_at?: string
          enabled?: boolean
          ends_on?: string | null
          feature: string
          note?: string | null
          source?: string
          starts_on?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          club_id?: string
          created_at?: string
          enabled?: boolean
          ends_on?: string | null
          feature?: string
          note?: string | null
          source?: string
          starts_on?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "club_features_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_features_feature_fkey"
            columns: ["feature"]
            isOneToOne: false
            referencedRelation: "app_features"
            referencedColumns: ["key"]
          },
        ]
      }
      clubs: {
        Row: {
          club_code: string | null
          created_at: string
          id: string
          is_coaching: boolean
          name: string
          short_name: string | null
        }
        Insert: {
          club_code?: string | null
          created_at?: string
          id?: string
          is_coaching?: boolean
          name: string
          short_name?: string | null
        }
        Update: {
          club_code?: string | null
          created_at?: string
          id?: string
          is_coaching?: boolean
          name?: string
          short_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clubs_club_code_fkey"
            columns: ["club_code"]
            isOneToOne: true
            referencedRelation: "club_codes"
            referencedColumns: ["club_code"]
          },
        ]
      }
      coaches: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          name?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string | null
        }
        Relationships: []
      }
      competition_events: {
        Row: {
          course: string
          created_at: string
          event_name: string
          event_no: number
          id: string
          is_active: boolean
          programme_event_no: string | null
          season_competition_id: string
          session: string | null
          updated_at: string
        }
        Insert: {
          course: string
          created_at?: string
          event_name: string
          event_no: number
          id?: string
          is_active?: boolean
          programme_event_no?: string | null
          season_competition_id: string
          session?: string | null
          updated_at?: string
        }
        Update: {
          course?: string
          created_at?: string
          event_name?: string
          event_no?: number
          id?: string
          is_active?: boolean
          programme_event_no?: string | null
          season_competition_id?: string
          session?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "competition_events_season_competition_id_fkey"
            columns: ["season_competition_id"]
            isOneToOne: false
            referencedRelation: "season_competitions"
            referencedColumns: ["id"]
          },
        ]
      }
      competition_files: {
        Row: {
          competition_id: string
          discovered_at: string
          file_ext: string | null
          file_kind: string
          file_name: string
          id: string
          mime_type: string | null
          mirrored_at: string | null
          public_url: string | null
          sha256: string | null
          size_bytes: number | null
          source_url: string
          status: string
          status_note: string | null
          storage_path: string | null
        }
        Insert: {
          competition_id: string
          discovered_at?: string
          file_ext?: string | null
          file_kind?: string
          file_name: string
          id?: string
          mime_type?: string | null
          mirrored_at?: string | null
          public_url?: string | null
          sha256?: string | null
          size_bytes?: number | null
          source_url: string
          status?: string
          status_note?: string | null
          storage_path?: string | null
        }
        Update: {
          competition_id?: string
          discovered_at?: string
          file_ext?: string | null
          file_kind?: string
          file_name?: string
          id?: string
          mime_type?: string | null
          mirrored_at?: string | null
          public_url?: string | null
          sha256?: string | null
          size_bytes?: number | null
          source_url?: string
          status?: string
          status_note?: string | null
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "competition_files_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_files_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions_with_files"
            referencedColumns: ["id"]
          },
        ]
      }
      competition_registrations: {
        Row: {
          club_id: string
          created_at: string
          id: string
          recorded_by: string | null
          season_competition_id: string
          status: string
          swimmer_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          club_id: string
          created_at?: string
          id?: string
          recorded_by?: string | null
          season_competition_id: string
          status?: string
          swimmer_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          club_id?: string
          created_at?: string
          id?: string
          recorded_by?: string | null
          season_competition_id?: string
          status?: string
          swimmer_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "competition_registrations_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_registrations_season_competition_id_fkey"
            columns: ["season_competition_id"]
            isOneToOne: false
            referencedRelation: "season_competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_registrations_swimmer_id_fkey"
            columns: ["swimmer_id"]
            isOneToOne: false
            referencedRelation: "swimmers"
            referencedColumns: ["id"]
          },
        ]
      }
      competitions: {
        Row: {
          course: string
          created_at: string
          date_end: string | null
          date_start: string
          files_scanned_at: string | null
          gala_id: string | null
          id: string
          level: number
          license_number: string | null
          link_candidates: Json | null
          link_searched_at: string | null
          link_status: string
          meet_id: number
          meet_type: string | null
          name: string
          pool_length_m: number | null
          region: string
          scraped_at: string | null
          source_url: string | null
          town_city: string | null
          updated_at: string
          website_confidence: string | null
          website_url: string | null
          year: number | null
        }
        Insert: {
          course: string
          created_at?: string
          date_end?: string | null
          date_start: string
          files_scanned_at?: string | null
          gala_id?: string | null
          id?: string
          level: number
          license_number?: string | null
          link_candidates?: Json | null
          link_searched_at?: string | null
          link_status?: string
          meet_id: number
          meet_type?: string | null
          name: string
          pool_length_m?: number | null
          region?: string
          scraped_at?: string | null
          source_url?: string | null
          town_city?: string | null
          updated_at?: string
          website_confidence?: string | null
          website_url?: string | null
          year?: number | null
        }
        Update: {
          course?: string
          created_at?: string
          date_end?: string | null
          date_start?: string
          files_scanned_at?: string | null
          gala_id?: string | null
          id?: string
          level?: number
          license_number?: string | null
          link_candidates?: Json | null
          link_searched_at?: string | null
          link_status?: string
          meet_id?: number
          meet_type?: string | null
          name?: string
          pool_length_m?: number | null
          region?: string
          scraped_at?: string | null
          source_url?: string | null
          town_city?: string | null
          updated_at?: string
          website_confidence?: string | null
          website_url?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "competitions_gala_id_fkey"
            columns: ["gala_id"]
            isOneToOne: false
            referencedRelation: "galas"
            referencedColumns: ["id"]
          },
        ]
      }
      conversion_factors: {
        Row: {
          computed_on: string | null
          confidence: string | null
          event: string
          lc_to_sc_factor: number | null
          lc_to_sc_ratio_median: number | null
          matched_swimmer_pairs_n: number
          method: string | null
          ratio_max: number | null
          ratio_min: number | null
          sc_to_lc_factor: number | null
          source: string | null
        }
        Insert: {
          computed_on?: string | null
          confidence?: string | null
          event: string
          lc_to_sc_factor?: number | null
          lc_to_sc_ratio_median?: number | null
          matched_swimmer_pairs_n?: number
          method?: string | null
          ratio_max?: number | null
          ratio_min?: number | null
          sc_to_lc_factor?: number | null
          source?: string | null
        }
        Update: {
          computed_on?: string | null
          confidence?: string | null
          event?: string
          lc_to_sc_factor?: number | null
          lc_to_sc_ratio_median?: number | null
          matched_swimmer_pairs_n?: number
          method?: string | null
          ratio_max?: number | null
          ratio_min?: number | null
          sc_to_lc_factor?: number | null
          source?: string | null
        }
        Relationships: []
      }
      development_targets: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          oadf_domain: string | null
          oadf_levels: string[] | null
          sort_order: number
          source: string | null
          target_group: string
          work_tag: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          oadf_domain?: string | null
          oadf_levels?: string[] | null
          sort_order?: number
          source?: string | null
          target_group: string
          work_tag?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          oadf_domain?: string | null
          oadf_levels?: string[] | null
          sort_order?: number
          source?: string | null
          target_group?: string
          work_tag?: string | null
        }
        Relationships: []
      }
      drill_periodisation: {
        Row: {
          created_at: string
          distance_m: number | null
          drill_id: string
          id: string
          meso: string
          phase_type: string
          session_plan_placement: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          distance_m?: number | null
          drill_id: string
          id?: string
          meso: string
          phase_type: string
          session_plan_placement?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          distance_m?: number | null
          drill_id?: string
          id?: string
          meso?: string
          phase_type?: string
          session_plan_placement?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "drill_periodisation_drill_id_fkey"
            columns: ["drill_id"]
            isOneToOne: false
            referencedRelation: "drills_library"
            referencedColumns: ["id"]
          },
        ]
      }
      drill_set_line_archive: {
        Row: {
          coach: string | null
          created_at: string
          drill_id: string
          id: string
          meso: string | null
          phase_type: string | null
          session_plan_id: string | null
          set_line_text: string
          updated_at: string
          variation_label: string | null
        }
        Insert: {
          coach?: string | null
          created_at?: string
          drill_id: string
          id?: string
          meso?: string | null
          phase_type?: string | null
          session_plan_id?: string | null
          set_line_text: string
          updated_at?: string
          variation_label?: string | null
        }
        Update: {
          coach?: string | null
          created_at?: string
          drill_id?: string
          id?: string
          meso?: string | null
          phase_type?: string | null
          session_plan_id?: string | null
          set_line_text?: string
          updated_at?: string
          variation_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drill_set_line_archive_drill_id_fkey"
            columns: ["drill_id"]
            isOneToOne: false
            referencedRelation: "drills_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drill_set_line_archive_session_plan_id_fkey"
            columns: ["session_plan_id"]
            isOneToOne: false
            referencedRelation: "session_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      drills_library: {
        Row: {
          biomechanical: string | null
          blabt: string | null
          club_id: string | null
          coach: string | null
          created_at: string
          drill_name: string
          equipment: string | null
          id: string
          primary_purpose: string | null
          progression: string | null
          pseudonyms: string[] | null
          regression: string | null
          stroke: string | null
          updated_at: string
        }
        Insert: {
          biomechanical?: string | null
          blabt?: string | null
          club_id?: string | null
          coach?: string | null
          created_at?: string
          drill_name: string
          equipment?: string | null
          id?: string
          primary_purpose?: string | null
          progression?: string | null
          pseudonyms?: string[] | null
          regression?: string | null
          stroke?: string | null
          updated_at?: string
        }
        Update: {
          biomechanical?: string | null
          blabt?: string | null
          club_id?: string | null
          coach?: string | null
          created_at?: string
          drill_name?: string
          equipment?: string | null
          id?: string
          primary_purpose?: string | null
          progression?: string | null
          pseudonyms?: string[] | null
          regression?: string | null
          stroke?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "drills_library_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      erasure_log: {
        Row: {
          club_id: string
          completed_at: string
          completed_by: string | null
          counts: Json
          id: string
          reason: string | null
          requested_on: string | null
        }
        Insert: {
          club_id: string
          completed_at?: string
          completed_by?: string | null
          counts: Json
          id?: string
          reason?: string | null
          requested_on?: string | null
        }
        Update: {
          club_id?: string
          completed_at?: string
          completed_by?: string | null
          counts?: Json
          id?: string
          reason?: string | null
          requested_on?: string | null
        }
        Relationships: []
      }
      galas: {
        Row: {
          age_date_rule: string | null
          created_at: string
          date_end: string | null
          date_start: string | null
          entries_close: string | null
          entries_open: string | null
          format: string | null
          gala_code: string
          id: string
          is_home_meet: boolean | null
          level: string | null
          license_number: string | null
          min_age_rules: string | null
          name: string
          notes: string | null
          pool_course: string | null
          pool_length: string | null
          promoter: string | null
          qt_type: string | null
          season: string | null
          source_document: string | null
          status: string | null
          updated_at: string
          venue: string | null
        }
        Insert: {
          age_date_rule?: string | null
          created_at?: string
          date_end?: string | null
          date_start?: string | null
          entries_close?: string | null
          entries_open?: string | null
          format?: string | null
          gala_code: string
          id?: string
          is_home_meet?: boolean | null
          level?: string | null
          license_number?: string | null
          min_age_rules?: string | null
          name: string
          notes?: string | null
          pool_course?: string | null
          pool_length?: string | null
          promoter?: string | null
          qt_type?: string | null
          season?: string | null
          source_document?: string | null
          status?: string | null
          updated_at?: string
          venue?: string | null
        }
        Update: {
          age_date_rule?: string | null
          created_at?: string
          date_end?: string | null
          date_start?: string | null
          entries_close?: string | null
          entries_open?: string | null
          format?: string | null
          gala_code?: string
          id?: string
          is_home_meet?: boolean | null
          level?: string | null
          license_number?: string | null
          min_age_rules?: string | null
          name?: string
          notes?: string | null
          pool_course?: string | null
          pool_length?: string | null
          promoter?: string | null
          qt_type?: string | null
          season?: string | null
          source_document?: string | null
          status?: string | null
          updated_at?: string
          venue?: string | null
        }
        Relationships: []
      }
      macro_competitions: {
        Row: {
          created_at: string
          designation: string
          id: string
          is_active: boolean
          macro_id: string
          season_competition_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          designation: string
          id?: string
          is_active?: boolean
          macro_id: string
          season_competition_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          designation?: string
          id?: string
          is_active?: boolean
          macro_id?: string
          season_competition_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "macro_competitions_macro_id_fkey"
            columns: ["macro_id"]
            isOneToOne: false
            referencedRelation: "macros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "macro_competitions_season_competition_id_fkey"
            columns: ["season_competition_id"]
            isOneToOne: false
            referencedRelation: "season_competitions"
            referencedColumns: ["id"]
          },
        ]
      }
      macro_squads: {
        Row: {
          created_at: string
          is_active: boolean
          macro_id: string
          squad_id: string
        }
        Insert: {
          created_at?: string
          is_active?: boolean
          macro_id: string
          squad_id: string
        }
        Update: {
          created_at?: string
          is_active?: boolean
          macro_id?: string
          squad_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "macro_squads_macro_id_fkey"
            columns: ["macro_id"]
            isOneToOne: false
            referencedRelation: "macros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "macro_squads_squad_id_fkey"
            columns: ["squad_id"]
            isOneToOne: false
            referencedRelation: "squads"
            referencedColumns: ["id"]
          },
        ]
      }
      macros: {
        Row: {
          colour: string | null
          created_at: string
          disabled_at: string | null
          head_coach_note: string | null
          id: string
          is_active: boolean
          micro_count: number
          season_id: string
          title: string
          updated_at: string
        }
        Insert: {
          colour?: string | null
          created_at?: string
          disabled_at?: string | null
          head_coach_note?: string | null
          id?: string
          is_active?: boolean
          micro_count?: number
          season_id: string
          title: string
          updated_at?: string
        }
        Update: {
          colour?: string | null
          created_at?: string
          disabled_at?: string | null
          head_coach_note?: string | null
          id?: string
          is_active?: boolean
          micro_count?: number
          season_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "macros_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      member_accounts: {
        Row: {
          account_ref: string | null
          address_line1: string | null
          address_line2: string | null
          applied_on: string | null
          club_id: string
          club_roles: string[]
          county: string | null
          created_at: string
          created_by: string | null
          email: string | null
          first_name: string
          id: string
          joined_on: string | null
          last_name: string
          notes: string | null
          phone_mobile: string | null
          phone_other: string | null
          postcode: string | null
          resigned_on: string | null
          status: string
          status_changed_on: string
          title: string | null
          town: string | null
          updated_at: string
          updated_by: string | null
          user_id: string | null
        }
        Insert: {
          account_ref?: string | null
          address_line1?: string | null
          address_line2?: string | null
          applied_on?: string | null
          club_id: string
          club_roles?: string[]
          county?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          first_name: string
          id?: string
          joined_on?: string | null
          last_name: string
          notes?: string | null
          phone_mobile?: string | null
          phone_other?: string | null
          postcode?: string | null
          resigned_on?: string | null
          status?: string
          status_changed_on?: string
          title?: string | null
          town?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
        }
        Update: {
          account_ref?: string | null
          address_line1?: string | null
          address_line2?: string | null
          applied_on?: string | null
          club_id?: string
          club_roles?: string[]
          county?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          first_name?: string
          id?: string
          joined_on?: string | null
          last_name?: string
          notes?: string | null
          phone_mobile?: string | null
          phone_other?: string | null
          postcode?: string | null
          resigned_on?: string | null
          status?: string
          status_changed_on?: string
          title?: string | null
          town?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "member_accounts_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      member_audit: {
        Row: {
          action: string
          changed_at: string
          changed_by: string | null
          club_id: string | null
          fields: string[] | null
          id: number
          row_id: string
          table_name: string
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by?: string | null
          club_id?: string | null
          fields?: string[] | null
          id?: never
          row_id: string
          table_name: string
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string | null
          club_id?: string | null
          fields?: string[] | null
          id?: never
          row_id?: string
          table_name?: string
        }
        Relationships: []
      }
      member_fees: {
        Row: {
          account_id: string
          amount: number
          club_id: string
          created_at: string
          created_by: string | null
          description: string | null
          due_on: string | null
          fee_type: string
          id: string
          method: string | null
          notes: string | null
          paid_on: string | null
          period_end: string | null
          period_start: string | null
          status: string
          swimmer_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          account_id: string
          amount: number
          club_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_on?: string | null
          fee_type: string
          id?: string
          method?: string | null
          notes?: string | null
          paid_on?: string | null
          period_end?: string | null
          period_start?: string | null
          status?: string
          swimmer_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          account_id?: string
          amount?: number
          club_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_on?: string | null
          fee_type?: string
          id?: string
          method?: string | null
          notes?: string | null
          paid_on?: string | null
          period_end?: string | null
          period_start?: string | null
          status?: string
          swimmer_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "member_fees_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "member_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_fees_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_fees_swimmer_id_fkey"
            columns: ["swimmer_id"]
            isOneToOne: false
            referencedRelation: "swimmers"
            referencedColumns: ["id"]
          },
        ]
      }
      member_guardians: {
        Row: {
          account_id: string
          club_id: string
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_primary: boolean
          phone: string | null
          relationship: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          account_id: string
          club_id: string
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          is_primary?: boolean
          phone?: string | null
          relationship?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          account_id?: string
          club_id?: string
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_primary?: boolean
          phone?: string | null
          relationship?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "member_guardians_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "member_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_guardians_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      micro_sessions: {
        Row: {
          created_at: string
          end_time: string | null
          id: string
          is_active: boolean
          micro_id: string
          outline: string | null
          session_date: string
          squad_id: string
          start_time: string | null
          stroke_focus: string | null
          timetable_session_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_time?: string | null
          id?: string
          is_active?: boolean
          micro_id: string
          outline?: string | null
          session_date: string
          squad_id: string
          start_time?: string | null
          stroke_focus?: string | null
          timetable_session_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_time?: string | null
          id?: string
          is_active?: boolean
          micro_id?: string
          outline?: string | null
          session_date?: string
          squad_id?: string
          start_time?: string | null
          stroke_focus?: string | null
          timetable_session_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "micro_sessions_micro_id_fkey"
            columns: ["micro_id"]
            isOneToOne: false
            referencedRelation: "micros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "micro_sessions_squad_id_fkey"
            columns: ["squad_id"]
            isOneToOne: false
            referencedRelation: "squads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "micro_sessions_timetable_session_id_fkey"
            columns: ["timetable_session_id"]
            isOneToOne: false
            referencedRelation: "timetable_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      micros: {
        Row: {
          break_days: number[]
          created_at: string
          id: string
          is_active: boolean
          macro_id: string
          meso: number | null
          planned_volume_m: number | null
          qes_focus: string | null
          technical_focus: number | null
          updated_at: string
          week_commencing: string | null
          week_no: number
        }
        Insert: {
          break_days?: number[]
          created_at?: string
          id?: string
          is_active?: boolean
          macro_id: string
          meso?: number | null
          planned_volume_m?: number | null
          qes_focus?: string | null
          technical_focus?: number | null
          updated_at?: string
          week_commencing?: string | null
          week_no: number
        }
        Update: {
          break_days?: number[]
          created_at?: string
          id?: string
          is_active?: boolean
          macro_id?: string
          meso?: number | null
          planned_volume_m?: number | null
          qes_focus?: string | null
          technical_focus?: number | null
          updated_at?: string
          week_commencing?: string | null
          week_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "micros_macro_id_fkey"
            columns: ["macro_id"]
            isOneToOne: false
            referencedRelation: "macros"
            referencedColumns: ["id"]
          },
        ]
      }
      mm_determinants: {
        Row: {
          code: string
          name: string
          sort: number
        }
        Insert: {
          code: string
          name: string
          sort?: number
        }
        Update: {
          code?: string
          name?: string
          sort?: number
        }
        Relationships: []
      }
      mm_protocol_versions: {
        Row: {
          club_id: string
          created_at: string
          created_by: string | null
          id: string
          intended_cycle: string | null
          levels: Json
          major: number
          measure: Json
          min_gap_days: number
          minor: number
          notes: string | null
          protocol_id: string
          published_at: string | null
          published_by: string | null
          sheet: Json
          updated_at: string
        }
        Insert: {
          club_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          intended_cycle?: string | null
          levels?: Json
          major?: number
          measure?: Json
          min_gap_days?: number
          minor?: number
          notes?: string | null
          protocol_id: string
          published_at?: string | null
          published_by?: string | null
          sheet?: Json
          updated_at?: string
        }
        Update: {
          club_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          intended_cycle?: string | null
          levels?: Json
          major?: number
          measure?: Json
          min_gap_days?: number
          minor?: number
          notes?: string | null
          protocol_id?: string
          published_at?: string | null
          published_by?: string | null
          sheet?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mm_protocol_versions_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mm_protocol_versions_protocol_id_fkey"
            columns: ["protocol_id"]
            isOneToOne: false
            referencedRelation: "mm_protocols"
            referencedColumns: ["id"]
          },
        ]
      }
      mm_protocols: {
        Row: {
          better: string
          club_id: string
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          determinant: string
          fixed_date_only: boolean
          id: string
          kind: string
          name: string
          question_ids: string[]
          status: string
          updated_at: string
        }
        Insert: {
          better: string
          club_id: string
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          determinant: string
          fixed_date_only?: boolean
          id?: string
          kind: string
          name: string
          question_ids?: string[]
          status?: string
          updated_at?: string
        }
        Update: {
          better?: string
          club_id?: string
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          determinant?: string
          fixed_date_only?: boolean
          id?: string
          kind?: string
          name?: string
          question_ids?: string[]
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mm_protocols_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mm_protocols_determinant_fkey"
            columns: ["determinant"]
            isOneToOne: false
            referencedRelation: "mm_determinants"
            referencedColumns: ["code"]
          },
        ]
      }
      mm_questions: {
        Row: {
          active: boolean
          club_id: string
          created_at: string
          id: string
          sort: number
          text: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          club_id: string
          created_at?: string
          id?: string
          sort?: number
          text: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          club_id?: string
          created_at?: string
          id?: string
          sort?: number
          text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mm_questions_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      mm_reliability: {
        Row: {
          club_id: string
          created_at: string
          cv_pct: number | null
          decision: string | null
          icc: number | null
          id: string
          level_key: string
          n: number | null
          notes: string | null
          studied_on: string | null
          swc: number | null
          te: number
          updated_at: string
          version_id: string
        }
        Insert: {
          club_id: string
          created_at?: string
          cv_pct?: number | null
          decision?: string | null
          icc?: number | null
          id?: string
          level_key: string
          n?: number | null
          notes?: string | null
          studied_on?: string | null
          swc?: number | null
          te: number
          updated_at?: string
          version_id: string
        }
        Update: {
          club_id?: string
          created_at?: string
          cv_pct?: number | null
          decision?: string | null
          icc?: number | null
          id?: string
          level_key?: string
          n?: number | null
          notes?: string | null
          studied_on?: string | null
          swc?: number | null
          te?: number
          updated_at?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mm_reliability_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mm_reliability_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "mm_protocol_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      mm_results: {
        Row: {
          age: number | null
          age_level: number | null
          baseline_id: string | null
          caution: string[]
          change_base: number | null
          change_prev: number | null
          club_id: string | null
          conditions: Json
          created_at: string
          days_since_base: number | null
          days_since_prev: number | null
          exposure: Json | null
          flag: string | null
          id: string
          is_baseline: boolean
          legal: boolean | null
          level_key: string
          major: number | null
          not_tested_reason: string | null
          note: string | null
          points: number | null
          points_per_age: number | null
          previous_id: string | null
          protocol_id: string | null
          raw: Json
          rebaseline_reason: string | null
          recorded_by: string | null
          scored_age: number | null
          session_date: string | null
          session_id: string
          set_completed: boolean | null
          squad_id: string | null
          status: string
          swimmer_id: string
          updated_at: string
          value: number | null
          version_id: string | null
          vs_age: string | null
          year_of_birth: number | null
        }
        Insert: {
          age?: number | null
          age_level?: number | null
          baseline_id?: string | null
          caution?: string[]
          change_base?: number | null
          change_prev?: number | null
          club_id?: string | null
          conditions?: Json
          created_at?: string
          days_since_base?: number | null
          days_since_prev?: number | null
          exposure?: Json | null
          flag?: string | null
          id?: string
          is_baseline?: boolean
          legal?: boolean | null
          level_key: string
          major?: number | null
          not_tested_reason?: string | null
          note?: string | null
          points?: number | null
          points_per_age?: number | null
          previous_id?: string | null
          protocol_id?: string | null
          raw?: Json
          rebaseline_reason?: string | null
          recorded_by?: string | null
          scored_age?: number | null
          session_date?: string | null
          session_id: string
          set_completed?: boolean | null
          squad_id?: string | null
          status?: string
          swimmer_id: string
          updated_at?: string
          value?: number | null
          version_id?: string | null
          vs_age?: string | null
          year_of_birth?: number | null
        }
        Update: {
          age?: number | null
          age_level?: number | null
          baseline_id?: string | null
          caution?: string[]
          change_base?: number | null
          change_prev?: number | null
          club_id?: string | null
          conditions?: Json
          created_at?: string
          days_since_base?: number | null
          days_since_prev?: number | null
          exposure?: Json | null
          flag?: string | null
          id?: string
          is_baseline?: boolean
          legal?: boolean | null
          level_key?: string
          major?: number | null
          not_tested_reason?: string | null
          note?: string | null
          points?: number | null
          points_per_age?: number | null
          previous_id?: string | null
          protocol_id?: string | null
          raw?: Json
          rebaseline_reason?: string | null
          recorded_by?: string | null
          scored_age?: number | null
          session_date?: string | null
          session_id?: string
          set_completed?: boolean | null
          squad_id?: string | null
          status?: string
          swimmer_id?: string
          updated_at?: string
          value?: number | null
          version_id?: string | null
          vs_age?: string | null
          year_of_birth?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "mm_results_baseline_id_fkey"
            columns: ["baseline_id"]
            isOneToOne: false
            referencedRelation: "mm_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mm_results_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mm_results_previous_id_fkey"
            columns: ["previous_id"]
            isOneToOne: false
            referencedRelation: "mm_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mm_results_protocol_id_fkey"
            columns: ["protocol_id"]
            isOneToOne: false
            referencedRelation: "mm_protocols"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mm_results_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "mm_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mm_results_squad_id_fkey"
            columns: ["squad_id"]
            isOneToOne: false
            referencedRelation: "squads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mm_results_swimmer_id_fkey"
            columns: ["swimmer_id"]
            isOneToOne: false
            referencedRelation: "swimmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mm_results_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "mm_protocol_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      mm_sessions: {
        Row: {
          as_protocol: boolean
          clock_started_at: string | null
          closed_at: string | null
          club_id: string | null
          course: string | null
          created_at: string
          created_by: string | null
          cycle_focus: string | null
          cycle_week_no: number | null
          group_type: string
          id: string
          notes: string | null
          on_cycle: boolean | null
          pool: string | null
          protocol_id: string | null
          session_date: string
          squad_id: string | null
          status: string
          swimmer_ids: string[]
          tester: string | null
          version_id: string
          window_id: string | null
        }
        Insert: {
          as_protocol?: boolean
          clock_started_at?: string | null
          closed_at?: string | null
          club_id?: string | null
          course?: string | null
          created_at?: string
          created_by?: string | null
          cycle_focus?: string | null
          cycle_week_no?: number | null
          group_type: string
          id?: string
          notes?: string | null
          on_cycle?: boolean | null
          pool?: string | null
          protocol_id?: string | null
          session_date?: string
          squad_id?: string | null
          status?: string
          swimmer_ids?: string[]
          tester?: string | null
          version_id: string
          window_id?: string | null
        }
        Update: {
          as_protocol?: boolean
          clock_started_at?: string | null
          closed_at?: string | null
          club_id?: string | null
          course?: string | null
          created_at?: string
          created_by?: string | null
          cycle_focus?: string | null
          cycle_week_no?: number | null
          group_type?: string
          id?: string
          notes?: string | null
          on_cycle?: boolean | null
          pool?: string | null
          protocol_id?: string | null
          session_date?: string
          squad_id?: string | null
          status?: string
          swimmer_ids?: string[]
          tester?: string | null
          version_id?: string
          window_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mm_sessions_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mm_sessions_protocol_id_fkey"
            columns: ["protocol_id"]
            isOneToOne: false
            referencedRelation: "mm_protocols"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mm_sessions_squad_id_fkey"
            columns: ["squad_id"]
            isOneToOne: false
            referencedRelation: "squads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mm_sessions_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "mm_protocol_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mm_sessions_window_id_fkey"
            columns: ["window_id"]
            isOneToOne: false
            referencedRelation: "season_windows"
            referencedColumns: ["id"]
          },
        ]
      }
      mm_trials: {
        Row: {
          created_at: string
          distance_m: number | null
          id: string
          illegal_reason: string | null
          legal: boolean
          order_no: number | null
          result_id: string
          session_id: string
          splits: Json
          stroke_count: number | null
          swimmer_id: string
          time_s: number | null
          trial_no: number
          updated_at: string
          variant: string
        }
        Insert: {
          created_at?: string
          distance_m?: number | null
          id?: string
          illegal_reason?: string | null
          legal?: boolean
          order_no?: number | null
          result_id: string
          session_id: string
          splits?: Json
          stroke_count?: number | null
          swimmer_id: string
          time_s?: number | null
          trial_no: number
          updated_at?: string
          variant?: string
        }
        Update: {
          created_at?: string
          distance_m?: number | null
          id?: string
          illegal_reason?: string | null
          legal?: boolean
          order_no?: number | null
          result_id?: string
          session_id?: string
          splits?: Json
          stroke_count?: number | null
          swimmer_id?: string
          time_s?: number | null
          trial_no?: number
          updated_at?: string
          variant?: string
        }
        Relationships: [
          {
            foreignKeyName: "mm_trials_result_id_fkey"
            columns: ["result_id"]
            isOneToOne: false
            referencedRelation: "mm_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mm_trials_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "mm_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mm_trials_swimmer_id_fkey"
            columns: ["swimmer_id"]
            isOneToOne: false
            referencedRelation: "swimmers"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_line_usage: {
        Row: {
          club_id: string
          created_at: string
          distance_m: number | null
          id: string
          intensity: string | null
          interval_text: string | null
          line_no: number | null
          line_text: string | null
          matched_text: string | null
          plan_date: string | null
          reps: number | null
          session_plan_id: string | null
          source: string
          squad_id: string | null
          term_id: string | null
          total_m: number | null
        }
        Insert: {
          club_id: string
          created_at?: string
          distance_m?: number | null
          id?: string
          intensity?: string | null
          interval_text?: string | null
          line_no?: number | null
          line_text?: string | null
          matched_text?: string | null
          plan_date?: string | null
          reps?: number | null
          session_plan_id?: string | null
          source?: string
          squad_id?: string | null
          term_id?: string | null
          total_m?: number | null
        }
        Update: {
          club_id?: string
          created_at?: string
          distance_m?: number | null
          id?: string
          intensity?: string | null
          interval_text?: string | null
          line_no?: number | null
          line_text?: string | null
          matched_text?: string | null
          plan_date?: string | null
          reps?: number | null
          session_plan_id?: string | null
          source?: string
          squad_id?: string | null
          term_id?: string | null
          total_m?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_line_usage_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_line_usage_session_plan_id_fkey"
            columns: ["session_plan_id"]
            isOneToOne: false
            referencedRelation: "session_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_line_usage_squad_id_fkey"
            columns: ["squad_id"]
            isOneToOne: false
            referencedRelation: "squads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_line_usage_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "vocabulary_review_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_line_usage_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "vocabulary_terms"
            referencedColumns: ["id"]
          },
        ]
      }
      planner_glossary: {
        Row: {
          club_id: string
          coach: string | null
          created_at: string
          created_by: string | null
          drill_id: string | null
          id: string
          meaning: string
          term: string
          updated_at: string
        }
        Insert: {
          club_id: string
          coach?: string | null
          created_at?: string
          created_by?: string | null
          drill_id?: string | null
          id?: string
          meaning: string
          term: string
          updated_at?: string
        }
        Update: {
          club_id?: string
          coach?: string | null
          created_at?: string
          created_by?: string | null
          drill_id?: string | null
          id?: string
          meaning?: string
          term?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "planner_glossary_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planner_glossary_drill_id_fkey"
            columns: ["drill_id"]
            isOneToOne: false
            referencedRelation: "drills_library"
            referencedColumns: ["id"]
          },
        ]
      }
      qualifying_times: {
        Row: {
          age_group: string
          conversion_source: string | null
          converted_time: string | null
          converted_time_course: string | null
          converted_time_display: string | null
          course: string
          course_variant: string | null
          created_at: string
          event: string
          gala_id: string
          gender: string
          has_standard: boolean
          id: string
          notes: string | null
          reference_age_type: string | null
          source_document: string | null
          swim_time: string | null
          swim_time_display: string | null
          time_type: string
        }
        Insert: {
          age_group: string
          conversion_source?: string | null
          converted_time?: string | null
          converted_time_course?: string | null
          converted_time_display?: string | null
          course: string
          course_variant?: string | null
          created_at?: string
          event: string
          gala_id: string
          gender: string
          has_standard?: boolean
          id?: string
          notes?: string | null
          reference_age_type?: string | null
          source_document?: string | null
          swim_time?: string | null
          swim_time_display?: string | null
          time_type: string
        }
        Update: {
          age_group?: string
          conversion_source?: string | null
          converted_time?: string | null
          converted_time_course?: string | null
          converted_time_display?: string | null
          course?: string
          course_variant?: string | null
          created_at?: string
          event?: string
          gala_id?: string
          gender?: string
          has_standard?: boolean
          id?: string
          notes?: string | null
          reference_age_type?: string | null
          source_document?: string | null
          swim_time?: string | null
          swim_time_display?: string | null
          time_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "qualifying_times_gala_id_fkey"
            columns: ["gala_id"]
            isOneToOne: false
            referencedRelation: "galas"
            referencedColumns: ["id"]
          },
        ]
      }
      role_test_mode: {
        Row: {
          club_id: string | null
          expires_at: string
          role: string
          squad_ids: string[]
          started_at: string
          swimmer_ids: string[]
          user_id: string
        }
        Insert: {
          club_id?: string | null
          expires_at?: string
          role: string
          squad_ids?: string[]
          started_at?: string
          swimmer_ids?: string[]
          user_id?: string
        }
        Update: {
          club_id?: string | null
          expires_at?: string
          role?: string
          squad_ids?: string[]
          started_at?: string
          swimmer_ids?: string[]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_test_mode_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      season_breaks: {
        Row: {
          break_end: string
          break_start: string
          created_at: string
          id: string
          is_active: boolean
          season_id: string
          updated_at: string
        }
        Insert: {
          break_end: string
          break_start: string
          created_at?: string
          id?: string
          is_active?: boolean
          season_id: string
          updated_at?: string
        }
        Update: {
          break_end?: string
          break_start?: string
          created_at?: string
          id?: string
          is_active?: boolean
          season_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "season_breaks_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      season_competition_docs: {
        Row: {
          club_id: string
          created_at: string
          created_by: string | null
          file_name: string
          id: string
          is_active: boolean
          mime_type: string | null
          season_competition_id: string
          size_bytes: number | null
          storage_path: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          club_id: string
          created_at?: string
          created_by?: string | null
          file_name: string
          id?: string
          is_active?: boolean
          mime_type?: string | null
          season_competition_id: string
          size_bytes?: number | null
          storage_path: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          club_id?: string
          created_at?: string
          created_by?: string | null
          file_name?: string
          id?: string
          is_active?: boolean
          mime_type?: string | null
          season_competition_id?: string
          size_bytes?: number | null
          storage_path?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "season_competition_docs_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "season_competition_docs_season_competition_id_fkey"
            columns: ["season_competition_id"]
            isOneToOne: false
            referencedRelation: "season_competitions"
            referencedColumns: ["id"]
          },
        ]
      }
      season_competition_squads: {
        Row: {
          club_id: string
          created_at: string
          is_active: boolean
          note: string | null
          season_competition_id: string
          squad_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          club_id: string
          created_at?: string
          is_active?: boolean
          note?: string | null
          season_competition_id: string
          squad_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          club_id?: string
          created_at?: string
          is_active?: boolean
          note?: string | null
          season_competition_id?: string
          squad_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "season_competition_squads_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "season_competition_squads_season_competition_id_fkey"
            columns: ["season_competition_id"]
            isOneToOne: false
            referencedRelation: "season_competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "season_competition_squads_squad_id_fkey"
            columns: ["squad_id"]
            isOneToOne: false
            referencedRelation: "squads"
            referencedColumns: ["id"]
          },
        ]
      }
      season_competitions: {
        Row: {
          competition_id: string | null
          course: string
          created_at: string
          date_from: string
          date_to: string
          disabled_at: string | null
          id: string
          is_active: boolean
          level: number | null
          name: string
          notes: string | null
          season_id: string
          total_days: number | null
          updated_at: string
          venue_name: string | null
          venue_url: string | null
        }
        Insert: {
          competition_id?: string | null
          course: string
          created_at?: string
          date_from: string
          date_to: string
          disabled_at?: string | null
          id?: string
          is_active?: boolean
          level?: number | null
          name: string
          notes?: string | null
          season_id: string
          total_days?: number | null
          updated_at?: string
          venue_name?: string | null
          venue_url?: string | null
        }
        Update: {
          competition_id?: string | null
          course?: string
          created_at?: string
          date_from?: string
          date_to?: string
          disabled_at?: string | null
          id?: string
          is_active?: boolean
          level?: number | null
          name?: string
          notes?: string | null
          season_id?: string
          total_days?: number | null
          updated_at?: string
          venue_name?: string | null
          venue_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "season_competitions_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "season_competitions_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions_with_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "season_competitions_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      season_squads: {
        Row: {
          club_id: string
          created_at: string
          created_by: string | null
          season_id: string
          squad_id: string
        }
        Insert: {
          club_id: string
          created_at?: string
          created_by?: string | null
          season_id: string
          squad_id: string
        }
        Update: {
          club_id?: string
          created_at?: string
          created_by?: string | null
          season_id?: string
          squad_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "season_squads_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "season_squads_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "season_squads_squad_id_fkey"
            columns: ["squad_id"]
            isOneToOne: false
            referencedRelation: "squads"
            referencedColumns: ["id"]
          },
        ]
      }
      season_windows: {
        Row: {
          club_id: string
          created_at: string
          created_by: string | null
          ends_on: string
          id: string
          is_active: boolean
          kind: string
          note: string | null
          protocol_ids: string[]
          season_id: string
          squad_id: string | null
          squad_ids: string[] | null
          starts_on: string
          test_kind: string | null
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          club_id: string
          created_at?: string
          created_by?: string | null
          ends_on: string
          id?: string
          is_active?: boolean
          kind: string
          note?: string | null
          protocol_ids?: string[]
          season_id: string
          squad_id?: string | null
          squad_ids?: string[] | null
          starts_on: string
          test_kind?: string | null
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          club_id?: string
          created_at?: string
          created_by?: string | null
          ends_on?: string
          id?: string
          is_active?: boolean
          kind?: string
          note?: string | null
          protocol_ids?: string[]
          season_id?: string
          squad_id?: string | null
          squad_ids?: string[] | null
          starts_on?: string
          test_kind?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "season_windows_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "season_windows_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "season_windows_squad_id_fkey"
            columns: ["squad_id"]
            isOneToOne: false
            referencedRelation: "squads"
            referencedColumns: ["id"]
          },
        ]
      }
      seasons: {
        Row: {
          club_id: string | null
          created_at: string
          disabled_at: string | null
          finish_date: string
          id: string
          is_active: boolean
          start_date: string
          title: string
          updated_at: string
        }
        Insert: {
          club_id?: string | null
          created_at?: string
          disabled_at?: string | null
          finish_date: string
          id?: string
          is_active?: boolean
          start_date: string
          title: string
          updated_at?: string
        }
        Update: {
          club_id?: string | null
          created_at?: string
          disabled_at?: string | null
          finish_date?: string
          id?: string
          is_active?: boolean
          start_date?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seasons_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      session_plan_sets: {
        Row: {
          club_id: string | null
          created_at: string
          description: string | null
          distance_m: number | null
          drill_id: string | null
          drill_name: string | null
          effort: string | null
          equipment: string[] | null
          group_label: string | null
          group_reps: number
          id: string
          interval_s: number | null
          interval_text: string | null
          kind: string | null
          reps: number | null
          rest_s: number | null
          section: string | null
          session_plan_id: string
          set_order: number
          stroke: string | null
          target_text: string | null
          total_m: number | null
        }
        Insert: {
          club_id?: string | null
          created_at?: string
          description?: string | null
          distance_m?: number | null
          drill_id?: string | null
          drill_name?: string | null
          effort?: string | null
          equipment?: string[] | null
          group_label?: string | null
          group_reps?: number
          id?: string
          interval_s?: number | null
          interval_text?: string | null
          kind?: string | null
          reps?: number | null
          rest_s?: number | null
          section?: string | null
          session_plan_id: string
          set_order: number
          stroke?: string | null
          target_text?: string | null
          total_m?: number | null
        }
        Update: {
          club_id?: string | null
          created_at?: string
          description?: string | null
          distance_m?: number | null
          drill_id?: string | null
          drill_name?: string | null
          effort?: string | null
          equipment?: string[] | null
          group_label?: string | null
          group_reps?: number
          id?: string
          interval_s?: number | null
          interval_text?: string | null
          kind?: string | null
          reps?: number | null
          rest_s?: number | null
          section?: string | null
          session_plan_id?: string
          set_order?: number
          stroke?: string | null
          target_text?: string | null
          total_m?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "session_plan_sets_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_plan_sets_drill_id_fkey"
            columns: ["drill_id"]
            isOneToOne: false
            referencedRelation: "drills_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_plan_sets_session_plan_id_fkey"
            columns: ["session_plan_id"]
            isOneToOne: false
            referencedRelation: "session_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      session_plans: {
        Row: {
          block_model: string | null
          club_id: string | null
          coach: string | null
          content: Json
          created_at: string
          created_by: string | null
          distance_by_stroke: Json | null
          distance_by_type: Json | null
          distance_by_zone: Json | null
          flags: Json | null
          id: string
          intended_date: string | null
          macro: string | null
          main_set: string | null
          meso: string | null
          micro_id: string | null
          micro_session_id: string | null
          notes: string | null
          parsed_at: string | null
          parser_version: string | null
          pool_size: string | null
          raw_text: string | null
          session_focus: string | null
          source: string | null
          squad_id: string | null
          squad_scope: string | null
          stroke_skills: string[]
          title: string
          total_distance_m: number | null
          training_zone: string | null
          updated_at: string
        }
        Insert: {
          block_model?: string | null
          club_id?: string | null
          coach?: string | null
          content?: Json
          created_at?: string
          created_by?: string | null
          distance_by_stroke?: Json | null
          distance_by_type?: Json | null
          distance_by_zone?: Json | null
          flags?: Json | null
          id?: string
          intended_date?: string | null
          macro?: string | null
          main_set?: string | null
          meso?: string | null
          micro_id?: string | null
          micro_session_id?: string | null
          notes?: string | null
          parsed_at?: string | null
          parser_version?: string | null
          pool_size?: string | null
          raw_text?: string | null
          session_focus?: string | null
          source?: string | null
          squad_id?: string | null
          squad_scope?: string | null
          stroke_skills?: string[]
          title: string
          total_distance_m?: number | null
          training_zone?: string | null
          updated_at?: string
        }
        Update: {
          block_model?: string | null
          club_id?: string | null
          coach?: string | null
          content?: Json
          created_at?: string
          created_by?: string | null
          distance_by_stroke?: Json | null
          distance_by_type?: Json | null
          distance_by_zone?: Json | null
          flags?: Json | null
          id?: string
          intended_date?: string | null
          macro?: string | null
          main_set?: string | null
          meso?: string | null
          micro_id?: string | null
          micro_session_id?: string | null
          notes?: string | null
          parsed_at?: string | null
          parser_version?: string | null
          pool_size?: string | null
          raw_text?: string | null
          session_focus?: string | null
          source?: string | null
          squad_id?: string | null
          squad_scope?: string | null
          stroke_skills?: string[]
          title?: string
          total_distance_m?: number | null
          training_zone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_plans_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_plans_micro_id_fkey"
            columns: ["micro_id"]
            isOneToOne: false
            referencedRelation: "micros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_plans_micro_session_id_fkey"
            columns: ["micro_session_id"]
            isOneToOne: false
            referencedRelation: "micro_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_plans_squad_id_fkey"
            columns: ["squad_id"]
            isOneToOne: false
            referencedRelation: "squads"
            referencedColumns: ["id"]
          },
        ]
      }
      squad_drill_weeks: {
        Row: {
          club_id: string | null
          created_at: string
          drill_id: string
          id: string
          is_active: boolean
          micro_id: string
          squad_feedback_id: string
          squad_id: string
        }
        Insert: {
          club_id?: string | null
          created_at?: string
          drill_id: string
          id?: string
          is_active?: boolean
          micro_id: string
          squad_feedback_id: string
          squad_id: string
        }
        Update: {
          club_id?: string | null
          created_at?: string
          drill_id?: string
          id?: string
          is_active?: boolean
          micro_id?: string
          squad_feedback_id?: string
          squad_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "squad_drill_weeks_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "squad_drill_weeks_drill_id_fkey"
            columns: ["drill_id"]
            isOneToOne: false
            referencedRelation: "drills_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "squad_drill_weeks_micro_id_fkey"
            columns: ["micro_id"]
            isOneToOne: false
            referencedRelation: "micros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "squad_drill_weeks_squad_feedback_id_fkey"
            columns: ["squad_feedback_id"]
            isOneToOne: false
            referencedRelation: "squad_feedback"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "squad_drill_weeks_squad_id_fkey"
            columns: ["squad_id"]
            isOneToOne: false
            referencedRelation: "squads"
            referencedColumns: ["id"]
          },
        ]
      }
      squad_feedback: {
        Row: {
          category: string
          club_id: string | null
          coach: string | null
          created_at: string
          criterion: string | null
          drill_id: string | null
          entry_type: string
          id: string
          is_active: boolean
          note: string | null
          observation: string
          remedial_action: string | null
          remedial_drill_ids: string[]
          session_date: string
          session_plan_id: string | null
          squad_id: string
          status: string | null
          thread_id: string
        }
        Insert: {
          category: string
          club_id?: string | null
          coach?: string | null
          created_at?: string
          criterion?: string | null
          drill_id?: string | null
          entry_type?: string
          id?: string
          is_active?: boolean
          note?: string | null
          observation: string
          remedial_action?: string | null
          remedial_drill_ids?: string[]
          session_date?: string
          session_plan_id?: string | null
          squad_id: string
          status?: string | null
          thread_id?: string
        }
        Update: {
          category?: string
          club_id?: string | null
          coach?: string | null
          created_at?: string
          criterion?: string | null
          drill_id?: string | null
          entry_type?: string
          id?: string
          is_active?: boolean
          note?: string | null
          observation?: string
          remedial_action?: string | null
          remedial_drill_ids?: string[]
          session_date?: string
          session_plan_id?: string | null
          squad_id?: string
          status?: string | null
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "squad_feedback_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "squad_feedback_drill_id_fkey"
            columns: ["drill_id"]
            isOneToOne: false
            referencedRelation: "drills_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "squad_feedback_session_plan_id_fkey"
            columns: ["session_plan_id"]
            isOneToOne: false
            referencedRelation: "session_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "squad_feedback_squad_id_fkey"
            columns: ["squad_id"]
            isOneToOne: false
            referencedRelation: "squads"
            referencedColumns: ["id"]
          },
        ]
      }
      squad_memberships: {
        Row: {
          club_id: string
          coach: string | null
          created_at: string
          ended_on: string | null
          id: string
          joined_squad_on: string
          squad_id: string
          swimmer_id: string
        }
        Insert: {
          club_id: string
          coach?: string | null
          created_at?: string
          ended_on?: string | null
          id?: string
          joined_squad_on?: string
          squad_id: string
          swimmer_id: string
        }
        Update: {
          club_id?: string
          coach?: string | null
          created_at?: string
          ended_on?: string | null
          id?: string
          joined_squad_on?: string
          squad_id?: string
          swimmer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "squad_memberships_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "squad_memberships_squad_id_fkey"
            columns: ["squad_id"]
            isOneToOne: false
            referencedRelation: "squads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "squad_memberships_swimmer_id_fkey"
            columns: ["swimmer_id"]
            isOneToOne: false
            referencedRelation: "swimmers"
            referencedColumns: ["id"]
          },
        ]
      }
      squad_month_snapshots: {
        Row: {
          club_id: string
          generated_at: string
          metrics: Json
          month: string
          squad_id: string
        }
        Insert: {
          club_id: string
          generated_at?: string
          metrics: Json
          month: string
          squad_id: string
        }
        Update: {
          club_id?: string
          generated_at?: string
          metrics?: Json
          month?: string
          squad_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "squad_month_snapshots_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "squad_month_snapshots_squad_id_fkey"
            columns: ["squad_id"]
            isOneToOne: false
            referencedRelation: "squads"
            referencedColumns: ["id"]
          },
        ]
      }
      squads: {
        Row: {
          club_id: string | null
          created_at: string
          id: string
          club_awards: boolean
          name: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          club_id?: string | null
          created_at?: string
          id?: string
          club_awards?: boolean
          name: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          club_id?: string | null
          created_at?: string
          id?: string
          club_awards?: boolean
          name?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "squads_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      stopwatch_times: {
        Row: {
          club_id: string
          course: string | null
          created_at: string
          distance_m: number
          id: string
          note: string | null
          recorded_at: string
          rep_count: number | null
          rep_number: number | null
          session_date: string
          squad_id: string | null
          stroke: string
          swimmer_id: string
          time_display: string
          time_ms: number
          time_type: string
        }
        Insert: {
          club_id: string
          course?: string | null
          created_at?: string
          distance_m: number
          id?: string
          note?: string | null
          recorded_at?: string
          rep_count?: number | null
          rep_number?: number | null
          session_date?: string
          squad_id?: string | null
          stroke: string
          swimmer_id: string
          time_display: string
          time_ms: number
          time_type?: string
        }
        Update: {
          club_id?: string
          course?: string | null
          created_at?: string
          distance_m?: number
          id?: string
          note?: string | null
          recorded_at?: string
          rep_count?: number | null
          rep_number?: number | null
          session_date?: string
          squad_id?: string | null
          stroke?: string
          swimmer_id?: string
          time_display?: string
          time_ms?: number
          time_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "stopwatch_times_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stopwatch_times_squad_id_fkey"
            columns: ["squad_id"]
            isOneToOne: false
            referencedRelation: "squads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stopwatch_times_swimmer_id_fkey"
            columns: ["swimmer_id"]
            isOneToOne: false
            referencedRelation: "swimmers"
            referencedColumns: ["id"]
          },
        ]
      }
      swim_england_registrations: {
        Row: {
          category: string
          club_id: string
          expires_on: string | null
          id: string
          notes: string | null
          reg_year: number
          registered_on: string | null
          status: string
          swimmer_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          category: string
          club_id: string
          expires_on?: string | null
          id?: string
          notes?: string | null
          reg_year: number
          registered_on?: string | null
          status?: string
          swimmer_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          category?: string
          club_id?: string
          expires_on?: string | null
          id?: string
          notes?: string | null
          reg_year?: number
          registered_on?: string | null
          status?: string
          swimmer_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "swim_england_registrations_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swim_england_registrations_swimmer_id_fkey"
            columns: ["swimmer_id"]
            isOneToOne: false
            referencedRelation: "swimmers"
            referencedColumns: ["id"]
          },
        ]
      }
      swim_results: {
        Row: {
          age_at_swim: number | null
          club_id: string | null
          converted_time: string | null
          converted_time_display: string | null
          course: string
          created_at: string | null
          event: string
          fina_points: number | null
          id: string
          is_pb: boolean | null
          level: number | null
          meet_date: string
          meet_name: string | null
          ranked_as: string | null
          source_document: string | null
          swim_time: string
          swim_time_display: string | null
          swimmer_id: string
          venue: string | null
        }
        Insert: {
          age_at_swim?: number | null
          club_id?: string | null
          converted_time?: string | null
          converted_time_display?: string | null
          course: string
          created_at?: string | null
          event: string
          fina_points?: number | null
          id?: string
          is_pb?: boolean | null
          level?: number | null
          meet_date: string
          meet_name?: string | null
          ranked_as?: string | null
          source_document?: string | null
          swim_time: string
          swim_time_display?: string | null
          swimmer_id: string
          venue?: string | null
        }
        Update: {
          age_at_swim?: number | null
          club_id?: string | null
          converted_time?: string | null
          converted_time_display?: string | null
          course?: string
          created_at?: string | null
          event?: string
          fina_points?: number | null
          id?: string
          is_pb?: boolean | null
          level?: number | null
          meet_date?: string
          meet_name?: string | null
          ranked_as?: string | null
          source_document?: string | null
          swim_time?: string
          swim_time_display?: string | null
          swimmer_id?: string
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "swim_results_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swim_results_swimmer_id_fkey"
            columns: ["swimmer_id"]
            isOneToOne: false
            referencedRelation: "swimmers"
            referencedColumns: ["id"]
          },
        ]
      }
      swimmer_archive: {
        Row: {
          account_links: Json
          club: string | null
          club_id: string | null
          date_of_birth: string | null
          deactivated_at: string
          deactivated_by: string | null
          deactivated_on: string
          full_name: string
          joined_club_on: string | null
          parent_email: string | null
          parent_name: string | null
          parent_phone: string | null
          reason: string | null
          result_sources: Json
          squad: string | null
          squad_id: string | null
          swim_england_id: string | null
          swimmer_id: string
        }
        Insert: {
          account_links?: Json
          club?: string | null
          club_id?: string | null
          date_of_birth?: string | null
          deactivated_at?: string
          deactivated_by?: string | null
          deactivated_on?: string
          full_name: string
          joined_club_on?: string | null
          parent_email?: string | null
          parent_name?: string | null
          parent_phone?: string | null
          reason?: string | null
          result_sources?: Json
          squad?: string | null
          squad_id?: string | null
          swim_england_id?: string | null
          swimmer_id: string
        }
        Update: {
          account_links?: Json
          club?: string | null
          club_id?: string | null
          date_of_birth?: string | null
          deactivated_at?: string
          deactivated_by?: string | null
          deactivated_on?: string
          full_name?: string
          joined_club_on?: string | null
          parent_email?: string | null
          parent_name?: string | null
          parent_phone?: string | null
          reason?: string | null
          result_sources?: Json
          squad?: string | null
          squad_id?: string | null
          swim_england_id?: string | null
          swimmer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "swimmer_archive_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swimmer_archive_swimmer_id_fkey"
            columns: ["swimmer_id"]
            isOneToOne: true
            referencedRelation: "swimmers"
            referencedColumns: ["id"]
          },
        ]
      }
      swimmer_emergency_contacts: {
        Row: {
          club_id: string
          full_name: string
          id: string
          phone: string
          phone_alt: string | null
          priority: number
          relationship: string | null
          swimmer_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          club_id: string
          full_name: string
          id?: string
          phone: string
          phone_alt?: string | null
          priority?: number
          relationship?: string | null
          swimmer_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          club_id?: string
          full_name?: string
          id?: string
          phone?: string
          phone_alt?: string | null
          priority?: number
          relationship?: string | null
          swimmer_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "swimmer_emergency_contacts_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swimmer_emergency_contacts_swimmer_id_fkey"
            columns: ["swimmer_id"]
            isOneToOne: false
            referencedRelation: "swimmers"
            referencedColumns: ["id"]
          },
        ]
      }
      swimmer_feedback: {
        Row: {
          category: string
          club_id: string | null
          coach: string | null
          created_at: string
          criterion: string | null
          entry_type: string
          id: string
          measure_code: string | null
          measure_context: string | null
          measure_value: number | null
          media: Json
          note: string | null
          observation: string | null
          remedial_action: string | null
          remedial_drill_ids: string[]
          session_date: string
          session_plan_id: string | null
          status: string | null
          swimmer_id: string
          thread_id: string
        }
        Insert: {
          category: string
          club_id?: string | null
          coach?: string | null
          created_at?: string
          criterion?: string | null
          entry_type: string
          id?: string
          measure_code?: string | null
          measure_context?: string | null
          measure_value?: number | null
          media?: Json
          note?: string | null
          observation?: string | null
          remedial_action?: string | null
          remedial_drill_ids?: string[]
          session_date: string
          session_plan_id?: string | null
          status?: string | null
          swimmer_id: string
          thread_id: string
        }
        Update: {
          category?: string
          club_id?: string | null
          coach?: string | null
          created_at?: string
          criterion?: string | null
          entry_type?: string
          id?: string
          measure_code?: string | null
          measure_context?: string | null
          measure_value?: number | null
          media?: Json
          note?: string | null
          observation?: string | null
          remedial_action?: string | null
          remedial_drill_ids?: string[]
          session_date?: string
          session_plan_id?: string | null
          status?: string | null
          swimmer_id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "swimmer_feedback_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swimmer_feedback_session_plan_id_fkey"
            columns: ["session_plan_id"]
            isOneToOne: false
            referencedRelation: "session_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swimmer_feedback_swimmer_id_fkey"
            columns: ["swimmer_id"]
            isOneToOne: false
            referencedRelation: "swimmers"
            referencedColumns: ["id"]
          },
        ]
      }
      swimmer_medical: {
        Row: {
          allergies: string | null
          club_id: string
          conditions: string | null
          consent_emergency_treatment: boolean | null
          gp_name: string | null
          gp_phone: string | null
          medication: string | null
          other_notes: string | null
          reviewed_on: string | null
          swimmer_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allergies?: string | null
          club_id: string
          conditions?: string | null
          consent_emergency_treatment?: boolean | null
          gp_name?: string | null
          gp_phone?: string | null
          medication?: string | null
          other_notes?: string | null
          reviewed_on?: string | null
          swimmer_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allergies?: string | null
          club_id?: string
          conditions?: string | null
          consent_emergency_treatment?: boolean | null
          gp_name?: string | null
          gp_phone?: string | null
          medication?: string | null
          other_notes?: string | null
          reviewed_on?: string | null
          swimmer_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "swimmer_medical_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swimmer_medical_swimmer_id_fkey"
            columns: ["swimmer_id"]
            isOneToOne: true
            referencedRelation: "swimmers"
            referencedColumns: ["id"]
          },
        ]
      }
      swimmers: {
        Row: {
          account_id: string | null
          active: boolean | null
          club_id: string | null
          created_at: string | null
          date_of_birth: string | null
          full_name: string
          gender: string | null
          id: string
          joined_club_on: string | null
          parent_email: string | null
          parent_name: string | null
          parent_phone: string | null
          squad_id: string | null
          swim_england_id: string | null
          updated_at: string | null
          year_of_birth: number | null
        }
        Insert: {
          account_id?: string | null
          active?: boolean | null
          club_id?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          full_name: string
          gender?: string | null
          id?: string
          joined_club_on?: string | null
          parent_email?: string | null
          parent_name?: string | null
          parent_phone?: string | null
          squad_id?: string | null
          swim_england_id?: string | null
          updated_at?: string | null
          year_of_birth?: number | null
        }
        Update: {
          account_id?: string | null
          active?: boolean | null
          club_id?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          full_name?: string
          gender?: string | null
          id?: string
          joined_club_on?: string | null
          parent_email?: string | null
          parent_name?: string | null
          parent_phone?: string | null
          squad_id?: string | null
          swim_england_id?: string | null
          updated_at?: string | null
          year_of_birth?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "swimmers_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "member_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swimmers_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swimmers_squad_id_fkey"
            columns: ["squad_id"]
            isOneToOne: false
            referencedRelation: "squads"
            referencedColumns: ["id"]
          },
        ]
      }
      term_targets: {
        Row: {
          confirmed: boolean
          created_at: string
          suggested_by: string
          target_id: string
          term_id: string
          weight: string
        }
        Insert: {
          confirmed?: boolean
          created_at?: string
          suggested_by?: string
          target_id: string
          term_id: string
          weight?: string
        }
        Update: {
          confirmed?: boolean
          created_at?: string
          suggested_by?: string
          target_id?: string
          term_id?: string
          weight?: string
        }
        Relationships: [
          {
            foreignKeyName: "term_targets_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "development_targets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "term_targets_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "vocabulary_review_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "term_targets_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "vocabulary_terms"
            referencedColumns: ["id"]
          },
        ]
      }
      test_results: {
        Row: {
          age: number | null
          club_id: string | null
          created_at: string
          id: string
          level: number | null
          note: string | null
          recorded_by: string | null
          reps_done: number | null
          reps_total: number | null
          rounds: Json
          score: number | null
          session_date: string
          session_id: string
          swimmer_id: string
          template_id: string
          template_name: string
          updated_at: string
          year_of_birth: number | null
        }
        Insert: {
          age?: number | null
          club_id?: string | null
          created_at?: string
          id?: string
          level?: number | null
          note?: string | null
          recorded_by?: string | null
          reps_done?: number | null
          reps_total?: number | null
          rounds?: Json
          score?: number | null
          session_date: string
          session_id: string
          swimmer_id: string
          template_id: string
          template_name: string
          updated_at?: string
          year_of_birth?: number | null
        }
        Update: {
          age?: number | null
          club_id?: string | null
          created_at?: string
          id?: string
          level?: number | null
          note?: string | null
          recorded_by?: string | null
          reps_done?: number | null
          reps_total?: number | null
          rounds?: Json
          score?: number | null
          session_date?: string
          session_id?: string
          swimmer_id?: string
          template_id?: string
          template_name?: string
          updated_at?: string
          year_of_birth?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "test_results_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "test_results_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "test_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "test_results_swimmer_id_fkey"
            columns: ["swimmer_id"]
            isOneToOne: false
            referencedRelation: "swimmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "test_results_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "test_set_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      test_sessions: {
        Row: {
          clock_started_at: string | null
          closed_at: string | null
          club_id: string | null
          created_at: string
          created_by: string | null
          group_type: string
          id: string
          model: Json
          session_date: string
          squad_id: string | null
          status: string
          swimmer_ids: string[]
          template_id: string
          template_name: string
        }
        Insert: {
          clock_started_at?: string | null
          closed_at?: string | null
          club_id?: string | null
          created_at?: string
          created_by?: string | null
          group_type: string
          id?: string
          model: Json
          session_date?: string
          squad_id?: string | null
          status?: string
          swimmer_ids?: string[]
          template_id: string
          template_name: string
        }
        Update: {
          clock_started_at?: string | null
          closed_at?: string | null
          club_id?: string | null
          created_at?: string
          created_by?: string | null
          group_type?: string
          id?: string
          model?: Json
          session_date?: string
          squad_id?: string | null
          status?: string
          swimmer_ids?: string[]
          template_id?: string
          template_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_sessions_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "test_sessions_squad_id_fkey"
            columns: ["squad_id"]
            isOneToOne: false
            referencedRelation: "squads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "test_sessions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "test_set_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      test_set_templates: {
        Row: {
          active: boolean
          club_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          model: Json
          name: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          active?: boolean
          club_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          model: Json
          name: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          active?: boolean
          club_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          model?: Json
          name?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "test_set_templates_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      timetable_session_overrides: {
        Row: {
          cancelled: boolean
          coaches: string | null
          course: string | null
          created_at: string
          end_time: string | null
          id: string
          location: string | null
          note: string | null
          pool_size: string | null
          session_date: string
          start_time: string | null
          timetable_session_id: string
          updated_at: string
        }
        Insert: {
          cancelled?: boolean
          coaches?: string | null
          course?: string | null
          created_at?: string
          end_time?: string | null
          id?: string
          location?: string | null
          note?: string | null
          pool_size?: string | null
          session_date: string
          start_time?: string | null
          timetable_session_id: string
          updated_at?: string
        }
        Update: {
          cancelled?: boolean
          coaches?: string | null
          course?: string | null
          created_at?: string
          end_time?: string | null
          id?: string
          location?: string | null
          note?: string | null
          pool_size?: string | null
          session_date?: string
          start_time?: string | null
          timetable_session_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "timetable_session_overrides_timetable_session_id_fkey"
            columns: ["timetable_session_id"]
            isOneToOne: false
            referencedRelation: "timetable_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      timetable_sessions: {
        Row: {
          coaches: string | null
          course: string | null
          created_at: string
          day_of_week: number
          end_time: string | null
          id: string
          is_active: boolean
          location: string | null
          note: string | null
          pool_size: string | null
          start_time: string
          timetable_id: string
          updated_at: string
        }
        Insert: {
          coaches?: string | null
          course?: string | null
          created_at?: string
          day_of_week: number
          end_time?: string | null
          id?: string
          is_active?: boolean
          location?: string | null
          note?: string | null
          pool_size?: string | null
          start_time: string
          timetable_id: string
          updated_at?: string
        }
        Update: {
          coaches?: string | null
          course?: string | null
          created_at?: string
          day_of_week?: number
          end_time?: string | null
          id?: string
          is_active?: boolean
          location?: string | null
          note?: string | null
          pool_size?: string | null
          start_time?: string
          timetable_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "timetable_sessions_timetable_id_fkey"
            columns: ["timetable_id"]
            isOneToOne: false
            referencedRelation: "timetables"
            referencedColumns: ["id"]
          },
        ]
      }
      timetables: {
        Row: {
          created_at: string
          disabled_at: string | null
          id: string
          is_active: boolean
          season_end: string
          season_id: string | null
          season_start: string
          season_title: string | null
          squad_id: string
          updated_at: string
          weekly_focus: string | null
        }
        Insert: {
          created_at?: string
          disabled_at?: string | null
          id?: string
          is_active?: boolean
          season_end: string
          season_id?: string | null
          season_start: string
          season_title?: string | null
          squad_id: string
          updated_at?: string
          weekly_focus?: string | null
        }
        Update: {
          created_at?: string
          disabled_at?: string | null
          id?: string
          is_active?: boolean
          season_end?: string
          season_id?: string | null
          season_start?: string
          season_title?: string | null
          squad_id?: string
          updated_at?: string
          weekly_focus?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "timetables_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetables_squad_id_fkey"
            columns: ["squad_id"]
            isOneToOne: false
            referencedRelation: "squads"
            referencedColumns: ["id"]
          },
        ]
      }
      user_app_limits: {
        Row: {
          club_id: string
          created_at: string
          features: string[]
          note: string | null
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          club_id: string
          created_at?: string
          features: string[]
          note?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          club_id?: string
          created_at?: string
          features?: string[]
          note?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_app_limits_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      user_home_layout: {
        Row: {
          layout: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          layout?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          layout?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          club_id: string | null
          created_at: string
          role: string
          user_id: string
        }
        Insert: {
          club_id?: string | null
          created_at?: string
          role: string
          user_id: string
        }
        Update: {
          club_id?: string | null
          created_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      user_squads: {
        Row: {
          created_at: string
          squad_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          squad_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          squad_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_squads_squad_id_fkey"
            columns: ["squad_id"]
            isOneToOne: false
            referencedRelation: "squads"
            referencedColumns: ["id"]
          },
        ]
      }
      user_swimmers: {
        Row: {
          created_at: string
          relationship: string
          swimmer_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          relationship: string
          swimmer_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          relationship?: string
          swimmer_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_swimmers_swimmer_id_fkey"
            columns: ["swimmer_id"]
            isOneToOne: false
            referencedRelation: "swimmers"
            referencedColumns: ["id"]
          },
        ]
      }
      vocabulary_terms: {
        Row: {
          active: boolean
          aliases: string[]
          auto_merged: boolean
          claude_checked_at: string | null
          claude_match_id: string | null
          claude_reason: string | null
          claude_verdict: string | null
          club_id: string
          created_at: string
          created_by: string | null
          details: Json
          full_form: string | null
          id: string
          legacy_drill_id: string | null
          meaning: string | null
          merged_into: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          stroke: string | null
          term: string
          term_type: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          aliases?: string[]
          auto_merged?: boolean
          claude_checked_at?: string | null
          claude_match_id?: string | null
          claude_reason?: string | null
          claude_verdict?: string | null
          club_id: string
          created_at?: string
          created_by?: string | null
          details?: Json
          full_form?: string | null
          id?: string
          legacy_drill_id?: string | null
          meaning?: string | null
          merged_into?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          stroke?: string | null
          term: string
          term_type: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          aliases?: string[]
          auto_merged?: boolean
          claude_checked_at?: string | null
          claude_match_id?: string | null
          claude_reason?: string | null
          claude_verdict?: string | null
          club_id?: string
          created_at?: string
          created_by?: string | null
          details?: Json
          full_form?: string | null
          id?: string
          legacy_drill_id?: string | null
          meaning?: string | null
          merged_into?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          stroke?: string | null
          term?: string
          term_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vocabulary_terms_claude_match_id_fkey"
            columns: ["claude_match_id"]
            isOneToOne: false
            referencedRelation: "vocabulary_review_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vocabulary_terms_claude_match_id_fkey"
            columns: ["claude_match_id"]
            isOneToOne: false
            referencedRelation: "vocabulary_terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vocabulary_terms_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vocabulary_terms_legacy_drill_id_fkey"
            columns: ["legacy_drill_id"]
            isOneToOne: true
            referencedRelation: "drills_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vocabulary_terms_merged_into_fkey"
            columns: ["merged_into"]
            isOneToOne: false
            referencedRelation: "vocabulary_review_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vocabulary_terms_merged_into_fkey"
            columns: ["merged_into"]
            isOneToOne: false
            referencedRelation: "vocabulary_terms"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      swimmer_award_points: {
        Row: {
          award_1_pct: number | null
          award_2_pct: number | null
          award_3_pct: number | null
          award_4_pct: number | null
          award_5_pct: number | null
          award_6_pct: number | null
          awards_achieved: number | null
          club_id: string | null
          highest_achieved: number | null
          last_assessed: string | null
          points: number | null
          swimmer_id: string | null
        }
        Relationships: []
      }
      swimmer_award_progress: {
        Row: {
          achieved: boolean | null
          achieved_on: string | null
          activated: boolean | null
          activated_on: string | null
          award: number | null
          club_id: string | null
          criteria_complete: number | null
          criteria_marked: number | null
          criteria_total: number | null
          last_assessed: string | null
          pct: number | null
          swimmer_id: string | null
        }
        Relationships: []
      }
      competitions_with_files: {
        Row: {
          course: string | null
          created_at: string | null
          date_end: string | null
          date_start: string | null
          files: Json | null
          files_scanned_at: string | null
          gala_id: string | null
          id: string | null
          level: number | null
          license_number: string | null
          link_candidates: Json | null
          link_searched_at: string | null
          link_status: string | null
          meet_id: number | null
          meet_type: string | null
          name: string | null
          pool_length_m: number | null
          region: string | null
          scraped_at: string | null
          source_url: string | null
          town_city: string | null
          updated_at: string | null
          website_confidence: string | null
          website_url: string | null
          year: number | null
        }
        Relationships: [
          {
            foreignKeyName: "competitions_gala_id_fkey"
            columns: ["gala_id"]
            isOneToOne: false
            referencedRelation: "galas"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_counts: {
        Row: {
          total_swim_records: number | null
          total_swimmers: number | null
        }
        Relationships: []
      }
      latest_per_swimmer: {
        Row: {
          assessed_at: string | null
          club_id: string | null
          coach_email: string | null
          group: string | null
          notes: string | null
          scores: Json | null
          swimmer_id: string | null
          swimmer_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assessments_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_swimmer_id_fkey"
            columns: ["swimmer_id"]
            isOneToOne: false
            referencedRelation: "swimmers"
            referencedColumns: ["id"]
          },
        ]
      }
      rolling_90day: {
        Row: {
          assessment_count: number | null
          avg_total_score: number | null
          club_id: string | null
          group: string | null
          last_assessed: string | null
          swimmer_id: string | null
          swimmer_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assessments_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_swimmer_id_fkey"
            columns: ["swimmer_id"]
            isOneToOne: false
            referencedRelation: "swimmers"
            referencedColumns: ["id"]
          },
        ]
      }
      vocabulary_review_queue: {
        Row: {
          auto_merged: boolean | null
          claude_checked_at: string | null
          claude_match_id: string | null
          claude_reason: string | null
          claude_verdict: string | null
          club_id: string | null
          created_at: string | null
          created_by: string | null
          id: string | null
          match_meaning: string | null
          match_term: string | null
          meaning: string | null
          merged_into: string | null
          merged_into_term: string | null
          status: string | null
          stroke: string | null
          suggested_targets: Json | null
          term: string | null
          term_type: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vocabulary_terms_claude_match_id_fkey"
            columns: ["claude_match_id"]
            isOneToOne: false
            referencedRelation: "vocabulary_review_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vocabulary_terms_claude_match_id_fkey"
            columns: ["claude_match_id"]
            isOneToOne: false
            referencedRelation: "vocabulary_terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vocabulary_terms_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vocabulary_terms_merged_into_fkey"
            columns: ["merged_into"]
            isOneToOne: false
            referencedRelation: "vocabulary_review_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vocabulary_terms_merged_into_fkey"
            columns: ["merged_into"]
            isOneToOne: false
            referencedRelation: "vocabulary_terms"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      apply_retention: {
        Args: { p_club: string; p_dry_run?: boolean }
        Returns: Json
      }
      attendance_minutes: {
        Args: {
          p_minutes_attended: number
          p_session_minutes: number
          p_status: string
        }
        Returns: number
      }
      attendance_weight:
        | { Args: { p_status: string }; Returns: number }
        | {
            Args: {
              p_minutes_attended: number
              p_session_minutes: number
              p_status: string
            }
            Returns: number
          }
      can_grant_role: {
        Args: { p_club_id: string; p_role: string }
        Returns: boolean
      }
      can_write_plans_for: { Args: { p_club: string }; Returns: boolean }
      competitions_link_galas: { Args: never; Returns: number }
      deactivate_swimmer: {
        Args: { p_reason?: string; p_swimmer: string }
        Returns: Json
      }
      dsar_export: { Args: { p_swimmer: string }; Returns: Json }
      dsar_text_mentions: { Args: { p_swimmer: string }; Returns: Json }
      erase_swimmer: {
        Args: {
          p_confirm_name: string
          p_reason: string
          p_requested_on?: string
          p_swimmer: string
        }
        Returns: Json
      }
      home_stats: { Args: { p_club_id: string }; Returns: Json }
      is_superadmin: { Args: never; Returns: boolean }
      link_attendance_to_plan: { Args: { p_plan: string }; Returns: number }
      list_deactivated_swimmers: {
        Args: { p_club_id: string }
        Returns: {
          anon_name: string
          date_of_birth: string
          deactivated_on: string
          full_name: string
          reason: string
          result_count: number
          squad: string
          squad_id: string
          swimmer_id: string
        }[]
      }
      mm_cycle_week: {
        Args: { p_club: string; p_date: string; p_squad: string }
        Returns: {
          focus: string
          week_no: number
        }[]
      }
      mm_find_window: {
        Args: {
          p_club: string
          p_date: string
          p_protocol: string
          p_squad: string
        }
        Returns: string
      }
      mm_plan_lines: {
        Args: { p_plan: string }
        Returns: {
          auto_tags: string[]
          confirmed: boolean
          drill_ids: string[]
          heading: string
          line_no: number
          line_path: number[]
          metres: number
          mult: number
          strokes: string[]
          tags: string[]
          text: string
        }[]
      }
      mm_refresh_exposure: { Args: { p_club: string }; Returns: number }
      mm_set_rebaseline: {
        Args: { p_reason: string; p_result: string }
        Returns: undefined
      }
      mm_swimmer_compare: {
        Args: { p_swimmer: string }
        Returns: {
          age: number
          age_avg_points: number
          age_avg_ppa: number
          age_n: number
          benchmark: number
          code: string
          history: Json
          level_label: string
          max_reps: number
          month: string
          name: string
          points: number
          points_per_age: number
          protocol_id: string
          session_date: string
          set_completed: boolean
          squad_avg_points: number
          squad_avg_ppa: number
          squad_n: number
          squad_name: string
          value: number
          vs_age: string
        }[]
      }
      mm_swimmer_exposure: {
        Args: { p_from: string; p_swimmer: string; p_to: string }
        Returns: Json
      }
      mm_window_months: {
        Args: { p_protocol: string }
        Returns: {
          month: string
          swimmers: number
        }[]
      }
      mm_window_rows: {
        Args: { p_from: string; p_protocol: string; p_to: string }
        Returns: {
          age: number
          benchmark: number
          full_name: string
          level_key: string
          level_label: string
          level_no: number
          max_reps: number
          points: number
          points_per_age: number
          result_id: string
          session_date: string
          set_completed: boolean
          squad_id: string
          squad_name: string
          swimmer_id: string
          value: number
          vs_age: string
        }[]
      }
      my_access: { Args: never; Returns: Json }
      my_features: {
        Args: never
        Returns: {
          all_features: boolean
          club_id: string
          feature: string
        }[]
      }
      my_plan_squads: { Args: { p_club: string }; Returns: string[] }
      reactivate_swimmer: {
        Args: { p_squad?: string; p_swimmer: string }
        Returns: Json
      }
      retention_due: { Args: { p_club: string }; Returns: Json }
      season_plan_mm: { Args: { p_season: string }; Returns: Json }
      season_plan_panels: { Args: { p_season: string }; Returns: Json }
      set_swimmer_birth_year: {
        Args: { p_swimmer: string; p_year: number }
        Returns: number
      }
      snapshot_squad_month: { Args: { p_month?: string }; Returns: number }
      squad_month_figures: {
        Args: { p_club_id: string; p_from: string; p_to: string }
        Returns: {
          attendance_pct: number
          avg_improvement_pct: number
          drills_worked: number
          excused: number
          feedback_entries: number
          feedback_notes: number
          hours_per_swimmer: number
          hours_trained: number
          improved_swims: number
          marks: number
          median_improvement_pct: number
          members: number
          month: string
          pbs: number
          positive_feedback_pct: number
          present: number
          sessions: number
          skill_moves_down: number
          skill_moves_up: number
          skill_score: number
          squad_entries: number
          squad_id: string
          squad_name: string
          st_developing: number
          st_embedded: number
          st_not_discussed: number
          st_started: number
          status_entries: number
          swimmers_attending: number
          swimmers_raced: number
          swims: number
        }[]
      }
      squad_review_allowed: {
        Args: { p_club_id: string; p_squad: string }
        Returns: boolean
      }
      vocab_ack_merge: { Args: { p_term: string }; Returns: undefined }
      vocab_approve: {
        Args: { p_meaning?: string; p_term: string }
        Returns: undefined
      }
      vocab_can_review: { Args: { p_club: string }; Returns: boolean }
      vocab_merge: {
        Args: { p_into: string; p_term: string }
        Returns: undefined
      }
      vocab_reject: { Args: { p_term: string }; Returns: undefined }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
