"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
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
