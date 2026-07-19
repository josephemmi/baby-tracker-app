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

  // Single round trip via embedded select instead of two sequential
  // queries — this runs on every navigation, so the extra round trip
  // was adding real latency to every tab switch.
  const { data: row } = await supabase
    .from("users")
    .select("*, households(*)")
    .eq("id", user.id)
    .maybeSingle<Profile & { households: Household | null }>();

  if (!row) {
    return { user, profile: null, household: null };
  }

  const { households: household, ...profile } = row;

  return { user, profile, household };
}
