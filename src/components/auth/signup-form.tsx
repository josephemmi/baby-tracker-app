"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { HouseholdChoiceFields } from "@/components/onboarding/household-choice-fields";
import { GoogleOAuthButton } from "@/components/auth/google-oauth-button";
import { AuthCard } from "@/components/auth/auth-card";
import { Field } from "@/components/ui/field";
import { TextInput } from "@/components/ui/text-input";
import { PrimaryButton } from "@/components/ui/primary-button";

type Mode = "create" | "join";

export function SignupForm() {
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

    window.location.href = "/";
  }

  if (checkEmail) {
    return (
      <AuthCard active="signup">
        <p className="text-center text-sm text-ink">
          Check your email to confirm your account, then{" "}
          <Link href="/login" className="font-bold text-sage underline">
            log in
          </Link>{" "}
          to finish setting up your household.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard active="signup">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <GoogleOAuthButton />
        <p className="-mt-2 text-center text-xs text-ink-soft">
          You&apos;ll set your name and household after continuing with
          Google.
        </p>

        <div className="flex items-center gap-3 text-xs text-ink-soft">
          <div className="h-px flex-1 bg-line" />
          or sign up with email
          <div className="h-px flex-1 bg-line" />
        </div>

        <Field label="Name">
          <TextInput
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Email">
          <TextInput
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Password">
          <TextInput
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        <HouseholdChoiceFields
          mode={mode}
          onModeChange={setMode}
          householdName={householdName}
          onHouseholdNameChange={setHouseholdName}
          inviteCode={inviteCode}
          onInviteCodeChange={setInviteCode}
        />

        {error && <p className="text-sm text-terracotta">{error}</p>}
        <PrimaryButton type="submit" disabled={loading}>
          {loading ? "Signing up…" : "Sign up"}
        </PrimaryButton>
      </form>
    </AuthCard>
  );
}
