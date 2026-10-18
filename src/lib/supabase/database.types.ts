export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type EntryType = "feed" | "pee" | "poop" | "pump";
export type BreastSide = "right" | "left";
export type UserRole = "parent" | "caregiver";
export type SleepActionName =
  | "start"
  | "pause"
  | "resume"
  | "finish"
  | "reopen"
  | "edit"
  | "delete"
  | "restore";

// One stretch of a sleep, as stored in sleeps.segments: UTC ISO text, the
// last stretch's `end` null while it is running.
export interface SleepSegmentJson {
  start: string;
  end: string | null;
}

export interface Database {
  public: {
    Tables: {
      households: {
        Row: {
          id: string;
          name: string;
          invite_code: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          invite_code?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          invite_code?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      users: {
        Row: {
          id: string;
          household_id: string;
          name: string;
          role: UserRole;
          created_at: string;
        };
        Insert: {
          id: string;
          household_id: string;
          name: string;
          role?: UserRole;
          created_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          name?: string;
          role?: UserRole;
          created_at?: string;
        };
        Relationships: [];
      };
      babies: {
        Row: {
          id: string;
          household_id: string;
          name: string;
          date_of_birth: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          name: string;
          date_of_birth: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          name?: string;
          date_of_birth?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      entries: {
        Row: {
          id: string;
          baby_id: string;
          logged_by: string | null;
          type: EntryType;
          timestamp: string;
          notes: string | null;
          amount_ml: number | null;
          bottle: boolean;
          breast: boolean;
          breast_right_seconds: number;
          breast_left_seconds: number;
          breast_active_side: BreastSide | null;
          breast_active_started_at: string | null;
          breast_session_ended: boolean;
          created_at: string;
          deleted_at: string | null;
          deleted_by: string | null;
        };
        Insert: {
          id?: string;
          baby_id: string;
          logged_by?: string | null;
          type: EntryType;
          timestamp?: string;
          notes?: string | null;
          amount_ml?: number | null;
          bottle?: boolean;
          breast?: boolean;
          breast_right_seconds?: number;
          breast_left_seconds?: number;
          breast_active_side?: BreastSide | null;
          breast_active_started_at?: string | null;
          breast_session_ended?: boolean;
          created_at?: string;
          deleted_at?: string | null;
          deleted_by?: string | null;
        };
        Update: {
          id?: string;
          baby_id?: string;
          logged_by?: string | null;
          type?: EntryType;
          timestamp?: string;
          notes?: string | null;
          amount_ml?: number | null;
          bottle?: boolean;
          breast?: boolean;
          breast_right_seconds?: number;
          breast_left_seconds?: number;
          breast_active_side?: BreastSide | null;
          breast_active_started_at?: string | null;
          breast_session_ended?: boolean;
          created_at?: string;
          deleted_at?: string | null;
          deleted_by?: string | null;
        };
        Relationships: [];
      };
      // Created and changed only through the sleep functions below (see the
      // 20261017000000_sleeps migration); a household member can edit just
      // `notes` and `logged_by` directly.
      sleeps: {
        Row: {
          id: string;
          baby_id: string;
          logged_by: string | null;
          segments: SleepSegmentJson[];
          started_at: string;
          closed_at: string | null;
          rev: number;
          last_by: string | null;
          last_action: SleepActionName;
          last_at: string;
          notes: string | null;
          deleted_at: string | null;
          deleted_by: string | null;
          created_at: string;
        };
        Insert: never;
        Update: {
          logged_by?: string | null;
          notes?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_sleeps: {
        Args: { p_baby_id: string; p_since: string };
        Returns: Json;
      };
      start_sleep: {
        Args: { p_baby_id: string; p_logged_by?: string | null };
        Returns: Json;
      };
      pause_sleep: { Args: { p_id: string; p_rev: number }; Returns: Json };
      resume_sleep: { Args: { p_id: string; p_rev: number }; Returns: Json };
      stop_sleep: { Args: { p_id: string; p_rev: number }; Returns: Json };
      reopen_sleep: { Args: { p_id: string; p_rev: number }; Returns: Json };
      set_sleep_time: {
        Args: {
          p_id: string;
          p_rev: number;
          p_field: "start" | "end";
          p_at?: string | null;
          p_ago_minutes?: number | null;
        };
        Returns: Json;
      };
      remove_sleep_pause: {
        Args: { p_id: string; p_rev: number; p_index: number };
        Returns: Json;
      };
      delete_sleep: { Args: { p_id: string; p_rev: number }; Returns: Json };
      restore_sleep: { Args: { p_id: string }; Returns: Json };
      create_household: {
        Args: { household_name: string; member_name: string };
        Returns: Database["public"]["Tables"]["households"]["Row"];
      };
      join_household: {
        Args: { code: string; member_name: string };
        Returns: Database["public"]["Tables"]["households"]["Row"];
      };
    };
  };
}
