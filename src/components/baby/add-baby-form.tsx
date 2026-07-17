"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Field } from "@/components/ui/field";
import { TextInput } from "@/components/ui/text-input";
import { PrimaryButton } from "@/components/ui/primary-button";

export function AddBabyForm({ householdId }: { householdId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await createClient()
      .from("babies")
      .insert({ household_id: householdId, name, date_of_birth: dateOfBirth });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full max-w-sm flex-col gap-4 rounded-[10px] border border-line bg-paper-raised p-6 shadow-card"
    >
      <h2 className="text-[19px] font-bold tracking-[-0.01em] text-ink">
        Add your baby
      </h2>
      <Field label="Name">
        <TextInput
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label="Date of birth">
        <TextInput
          type="date"
          required
          value={dateOfBirth}
          onChange={(e) => setDateOfBirth(e.target.value)}
        />
      </Field>
      {error && <p className="text-sm text-terracotta">{error}</p>}
      <PrimaryButton type="submit" disabled={loading}>
        {loading ? "Adding…" : "Add baby"}
      </PrimaryButton>
    </form>
  );
}
