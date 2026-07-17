"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { GoogleOAuthButton } from "@/components/auth/google-oauth-button";
import { AuthCard } from "@/components/auth/auth-card";
import { Field } from "@/components/ui/field";
import { TextInput } from "@/components/ui/text-input";
import { PrimaryButton } from "@/components/ui/primary-button";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await createClient().auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    // Hard navigation: a client-side router.replace() can serve a cached,
    // pre-login RSC response for "/" and bounce back to /login even though
    // the session cookie is already set. A full reload guarantees the
    // server sees the fresh session.
    window.location.href = "/";
  }

  return (
    <AuthCard active="login">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <GoogleOAuthButton />

        <div className="flex items-center gap-3 text-xs text-ink-soft">
          <div className="h-px flex-1 bg-line" />
          or
          <div className="h-px flex-1 bg-line" />
        </div>

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
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {error && <p className="text-sm text-terracotta">{error}</p>}
        <PrimaryButton type="submit" disabled={loading}>
          {loading ? "Logging in…" : "Log in"}
        </PrimaryButton>
      </form>
    </AuthCard>
  );
}
