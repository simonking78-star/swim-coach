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
      app_feedback: {
        Row: {
          club: string | null
          club_id: string | null
          created_at: string
          id: string
          message: string
          page: string | null
          user_id: string | null
        }
        Insert: {
          club?: string | null
          club_id?: string | null
          created_at?: string
          id?: string
          message: string
          page?: string | null
          user_id?: string | null
        }
        Update: {
          club?: string | null
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
          coach_email: string
          created_at: string
          group: string
          id: string
          notes: string | null
          scores: Json
          swimmer_name: string
        }
        Insert: {
          assessed_at?: string
          coach_email: string
          created_at?: string
          group: string
          id?: string
          notes?: string | null
          scores?: Json
          swimmer_name: string
        }
        Update: {
          assessed_at?: string
          coach_email?: string
          created_at?: string
          group?: string
          id?: string
          notes?: string | null
          scores?: Json
          swimmer_name?: string
        }
        Relationships: []
      }
      attendance_records: {
        Row: {
          club_id: string
          coach: string | null
          id: string
          marked_at: string
          minutes_attended: number | null
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
          id?: string
          marked_at?: string
          minutes_attended?: number | null
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
          id?: string
          marked_at?: string
          minutes_attended?: number | null
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
          club: string | null
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
          club?: string | null
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
          club?: string | null
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
          club: string | null
          club_id: string | null
          expires_at: string
          role: string
          squad_ids: string[]
          started_at: string
          swimmer_ids: string[]
          user_id: string
        }
        Insert: {
          club?: string | null
          club_id?: string | null
          expires_at?: string
          role: string
          squad_ids?: string[]
          started_at?: string
          swimmer_ids?: string[]
          user_id?: string
        }
        Update: {
          club?: string | null
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
      seasons: {
        Row: {
          club: string
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
          club: string
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
          club?: string
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
      session_plans: {
        Row: {
          block_model: string | null
          club: string
          club_id: string | null
          coach: string | null
          content: Json
          created_at: string
          id: string
          intended_date: string | null
          macro: string | null
          meso: string | null
          micro_id: string | null
          micro_session_id: string | null
          notes: string | null
          pool_size: string | null
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
          club?: string
          club_id?: string | null
          coach?: string | null
          content?: Json
          created_at?: string
          id?: string
          intended_date?: string | null
          macro?: string | null
          meso?: string | null
          micro_id?: string | null
          micro_session_id?: string | null
          notes?: string | null
          pool_size?: string | null
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
          club?: string
          club_id?: string | null
          coach?: string | null
          content?: Json
          created_at?: string
          id?: string
          intended_date?: string | null
          macro?: string | null
          meso?: string | null
          micro_id?: string | null
          micro_session_id?: string | null
          notes?: string | null
          pool_size?: string | null
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
          club: string
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
          club: string
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
          club?: string
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
          club: string
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
          session_date: string
          session_plan_id: string | null
          squad_id: string
          status: string | null
          thread_id: string
        }
        Insert: {
          category: string
          club: string
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
          session_date?: string
          session_plan_id?: string | null
          squad_id: string
          status?: string | null
          thread_id?: string
        }
        Update: {
          category?: string
          club?: string
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
          club: string
          club_id: string | null
          generated_at: string
          metrics: Json
          month: string
          squad_id: string
        }
        Insert: {
          club: string
          club_id?: string | null
          generated_at?: string
          metrics: Json
          month: string
          squad_id: string
        }
        Update: {
          club?: string
          club_id?: string | null
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
          club: string
          club_id: string | null
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          club?: string
          club_id?: string | null
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          club?: string
          club_id?: string | null
          created_at?: string
          id?: string
          name?: string
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
          club: string | null
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
          squad: string | null
          stroke: string
          swimmer_id: string
          time_display: string
          time_ms: number
          time_type: string
        }
        Insert: {
          club?: string | null
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
          squad?: string | null
          stroke: string
          swimmer_id: string
          time_display: string
          time_ms: number
          time_type?: string
        }
        Update: {
          club?: string | null
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
          squad?: string | null
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
            foreignKeyName: "stopwatch_times_swimmer_id_fkey"
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
          club: string | null
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
          club?: string | null
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
          club?: string | null
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
      swimmer_feedback: {
        Row: {
          category: string
          club_id: string | null
          coach: string | null
          created_at: string
          criterion: string | null
          entry_type: string
          id: string
          media: Json
          note: string | null
          observation: string | null
          remedial_action: string | null
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
          media?: Json
          note?: string | null
          observation?: string | null
          remedial_action?: string | null
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
          media?: Json
          note?: string | null
          observation?: string | null
          remedial_action?: string | null
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
      swimmers: {
        Row: {
          active: boolean | null
          club: string | null
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
          squad: string | null
          squad_id: string | null
          swim_england_id: string | null
          updated_at: string | null
          year_of_birth: number | null
        }
        Insert: {
          active?: boolean | null
          club?: string | null
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
          squad?: string | null
          squad_id?: string | null
          swim_england_id?: string | null
          updated_at?: string | null
          year_of_birth?: number | null
        }
        Update: {
          active?: boolean | null
          club?: string | null
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
          squad?: string | null
          squad_id?: string | null
          swim_england_id?: string | null
          updated_at?: string | null
          year_of_birth?: number | null
        }
        Relationships: [
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
      test_results: {
        Row: {
          age: number | null
          club: string
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
          club: string
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
          club?: string
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
          club: string
          club_id: string | null
          created_at: string
          created_by: string | null
          group_type: string
          id: string
          model: Json
          session_date: string
          squad_id: string | null
          squad_name: string | null
          status: string
          swimmer_ids: string[]
          template_id: string
          template_name: string
        }
        Insert: {
          clock_started_at?: string | null
          closed_at?: string | null
          club: string
          club_id?: string | null
          created_at?: string
          created_by?: string | null
          group_type: string
          id?: string
          model: Json
          session_date?: string
          squad_id?: string | null
          squad_name?: string | null
          status?: string
          swimmer_ids?: string[]
          template_id: string
          template_name: string
        }
        Update: {
          clock_started_at?: string | null
          closed_at?: string | null
          club?: string
          club_id?: string | null
          created_at?: string
          created_by?: string | null
          group_type?: string
          id?: string
          model?: Json
          session_date?: string
          squad_id?: string | null
          squad_name?: string | null
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
          club: string
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
          club: string
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
          club?: string
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
      timetable_sessions: {
        Row: {
          created_at: string
          day_of_week: number
          end_time: string | null
          id: string
          is_active: boolean
          pool_size: string | null
          start_time: string
          timetable_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          end_time?: string | null
          id?: string
          is_active?: boolean
          pool_size?: string | null
          start_time: string
          timetable_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          end_time?: string | null
          id?: string
          is_active?: boolean
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
          club: string | null
          club_id: string | null
          created_at: string
          role: string
          user_id: string
        }
        Insert: {
          club?: string | null
          club_id?: string | null
          created_at?: string
          role: string
          user_id: string
        }
        Update: {
          club?: string | null
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
    }
    Views: {
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
          coach_email: string | null
          group: string | null
          notes: string | null
          scores: Json | null
          swimmer_name: string | null
        }
        Relationships: []
      }
      rolling_90day: {
        Row: {
          assessment_count: number | null
          avg_total_score: number | null
          group: string | null
          last_assessed: string | null
          swimmer_name: string | null
        }
        Relationships: []
      }
    }
    Functions: {
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
        Args: { p_club: string; p_role: string }
        Returns: boolean
      }
      competitions_link_galas: { Args: never; Returns: number }
      deactivate_swimmer: {
        Args: { p_reason?: string; p_swimmer: string }
        Returns: Json
      }
      home_stats: { Args: { p_club?: string }; Returns: Json }
      is_superadmin: { Args: never; Returns: boolean }
      list_deactivated_swimmers: {
        Args: { p_club: string }
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
      my_access: { Args: never; Returns: Json }
      reactivate_swimmer: {
        Args: { p_squad?: string; p_swimmer: string }
        Returns: Json
      }
      set_swimmer_birth_year: {
        Args: { p_swimmer: string; p_year: number }
        Returns: number
      }
      snapshot_squad_month: { Args: { p_month?: string }; Returns: number }
      squad_month_figures: {
        Args: { p_club: string; p_from: string; p_to: string }
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
      squad_month_review: {
        Args: { p_club: string; p_from: string; p_to: string }
        Returns: {
          attendance_pct: number
          avg_improvement_pct: number
          drills_worked: number
          feedback_entries: number
          feedback_notes: number
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
        Args: { p_club: string; p_squad: string }
        Returns: boolean
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
