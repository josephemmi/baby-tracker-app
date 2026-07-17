"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { HouseholdChoiceFields } from "@/components/onboarding/household-choice-fields";
import { BrandMark } from "@/components/brand/brand-mark";
import { Field } from "@/components/ui/field";
import { TextInput } from "@/components/ui/text-input";
import { PrimaryButton } from "@/components/ui/primary-button";

type Mode = "create" | "join";

export function HouseholdSetupForm({
  defaultName = "",
}: {
  defaultName?: string;
}) {
  const [mode, setMode] = useState<Mode>("create");
  const [memberName, setMemberName] = useState(defaultName);
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

    window.location.href = "/";
  }

  return (
    <div className="w-full max-w-[380px] rounded-[10px] border border-line bg-paper-raised p-6 shadow-card">
      <div className="mb-5 flex flex-col items-center gap-2">
        <BrandMark size={36} />
        <h1 className="text-[19px] font-bold tracking-[-0.01em] text-ink">
          Set up your household
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Your name">
          <TextInput
            required
            value={memberName}
            onChange={(e) => setMemberName(e.target.value)}
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
          {loading
            ? "Setting up…"
            : mode === "create"
              ? "Create household"
              : "Join household"}
        </PrimaryButton>
      </form>
    </div>
  );
}
