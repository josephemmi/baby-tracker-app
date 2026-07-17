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
      className="rounded-full border border-line-strong bg-paper-raised px-4 py-2 text-sm font-bold text-ink transition-colors hover:bg-paper"
    >
      Sign out
    </button>
  );
}
