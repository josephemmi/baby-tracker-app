"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { HouseholdChoiceFields } from "@/components/onboarding/household-choice-fields";
import { GoogleOAuthButton } from "@/components/auth/google-oauth-button";

type Mode = "create" | "join";

export function SignupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<Mode>("create");
  const [householdName, setHouseholdName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (signUpError) {
      setLoading(false);
      setError(signUpError.message);
      return;
    }

    if (!data.session) {
      // Email confirmation is required, so there's no session yet to attach
      // a household to. They'll finish setup via /onboarding after logging in.
      setLoading(false);
      setCheckEmail(true);
      return;
    }

    const { error: householdError } =
      mode === "create"
        ? await supabase.rpc("create_household", {
            household_name: householdName,
            member_name: name,
          })
        : await supabase.rpc("join_household", {
            code: inviteCode,
            member_name: name,
          });

    setLoading(false);

    if (householdError) {
      setError(householdError.message);
      return;
    }

    router.replace("/");
    router.refresh();
  }

  if (checkEmail) {
    return (
      <div className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-6 text-center dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-zinc-950 dark:text-zinc-50">
          Check your email to confirm your account, then{" "}
          <Link href="/login" className="font-medium underline">
            log in
          </Link>{" "}
          to finish setting up your household.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950"
    >
      <h1 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
        Sign up
      </h1>

      <GoogleOAuthButton />
      <p className="-mt-2 text-center text-xs text-zinc-500">
        You&apos;ll set your name and household after continuing with Google.
      </p>

      <div className="flex items-center gap-3 text-xs text-zinc-500">
        <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
        or sign up with email
        <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
      </div>

      <label className="flex flex-col gap-1 text-sm text-zinc-950 dark:text-zinc-50">
        Name
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-zinc-950 dark:text-zinc-50">
        Email
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-zinc-950 dark:text-zinc-50">
        Password
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>

      <HouseholdChoiceFields
        mode={mode}
        onModeChange={setMode}
        householdName={householdName}
        onHouseholdNameChange={setHouseholdName}
        inviteCode={inviteCode}
        onInviteCodeChange={setInviteCode}
      />

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="rounded bg-zinc-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950"
      >
        {loading ? "Signing up…" : "Sign up"}
      </button>
      <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">
        Already have an account?{" "}
        <Link href="/login" className="font-medium underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
