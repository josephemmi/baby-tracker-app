"use client";

import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  async function handleSignOut() {
    await createClient().auth.signOut();
    window.location.href = "/login";
  }

  return (
    <button
      onClick={handleSignOut}
      className="rounded border border-zinc-300 px-4 py-2 text-sm text-zinc-950 dark:border-zinc-700 dark:text-zinc-50"
    >
      Sign out
    </button>
  );
}
