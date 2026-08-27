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
    };
    Views: Record<string, never>;
    Functions: {
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
