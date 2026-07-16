export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type EntryType = "feed" | "pee" | "poop";
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
          created_at: string;
        };
        Insert: {
          id?: string;
          baby_id: string;
          logged_by?: string | null;
          type: EntryType;
          timestamp?: string;
          notes?: string | null;
          amount_ml?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          baby_id?: string;
          logged_by?: string | null;
          type?: EntryType;
          timestamp?: string;
          notes?: string | null;
          amount_ml?: number | null;
          created_at?: string;
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
