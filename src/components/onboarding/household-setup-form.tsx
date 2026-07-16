"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "create" | "join";

export function HouseholdSetupForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("create");
  const [memberName, setMemberName] = useState("");
  const [householdName, setHouseholdName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } =
      mode === "create"
        ? await supabase.rpc("create_household", {
            household_name: householdName,
            member_name: memberName,
          })
        : await supabase.rpc("join_household", {
            code: inviteCode,
            member_name: memberName,
          });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950"
    >
      <h1 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
        Set up your household
      </h1>

      <div className="flex gap-2 text-sm">
        <button
          type="button"
          onClick={() => setMode("create")}
          className={`flex-1 rounded px-3 py-2 ${
            mode === "create"
              ? "bg-zinc-950 text-white dark:bg-zinc-50 dark:text-zinc-950"
              : "bg-zinc-100 text-zinc-950 dark:bg-zinc-900 dark:text-zinc-50"
          }`}
        >
          Create household
        </button>
        <button
          type="button"
          onClick={() => setMode("join")}
          className={`flex-1 rounded px-3 py-2 ${
            mode === "join"
              ? "bg-zinc-950 text-white dark:bg-zinc-50 dark:text-zinc-950"
              : "bg-zinc-100 text-zinc-950 dark:bg-zinc-900 dark:text-zinc-50"
          }`}
        >
          Join household
        </button>
      </div>

      <label className="flex flex-col gap-1 text-sm text-zinc-950 dark:text-zinc-50">
        Your name
        <input
          required
          value={memberName}
          onChange={(e) => setMemberName(e.target.value)}
          className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>

      {mode === "create" ? (
        <label className="flex flex-col gap-1 text-sm text-zinc-950 dark:text-zinc-50">
          Household name
          <input
            required
            value={householdName}
            onChange={(e) => setHouseholdName(e.target.value)}
            placeholder="e.g. The Smiths"
            className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
      ) : (
        <label className="flex flex-col gap-1 text-sm text-zinc-950 dark:text-zinc-50">
          Invite code
          <input
            required
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            placeholder="e.g. A3F9K2LP"
            className="rounded border border-zinc-300 px-3 py-2 uppercase dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="rounded bg-zinc-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950"
      >
        {loading
          ? "Setting up…"
          : mode === "create"
            ? "Create household"
            : "Join household"}
      </button>
    </form>
  );
}
