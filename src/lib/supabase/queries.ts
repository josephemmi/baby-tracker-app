import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type Profile = Database["public"]["Tables"]["users"]["Row"];
type Household = Database["public"]["Tables"]["households"]["Row"];

interface CurrentUserAndProfile {
  user: User | null;
  profile: Profile | null;
  household: Household | null;
}

export async function getCurrentUserAndProfile(): Promise<CurrentUserAndProfile> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, profile: null, household: null };
  }

  const { data: profile } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    return { user, profile: null, household: null };
  }

  const { data: household } = await supabase
    .from("households")
    .select("*")
    .eq("id", profile.household_id)
    .maybeSingle();

  return { user, profile, household };
}
