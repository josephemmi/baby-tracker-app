"use client";

import { Field } from "@/components/ui/field";
import { TextInput } from "@/components/ui/text-input";

type Mode = "create" | "join";

interface HouseholdChoiceFieldsProps {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  householdName: string;
  onHouseholdNameChange: (value: string) => void;
  inviteCode: string;
  onInviteCodeChange: (value: string) => void;
}

function RadioOption({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-3 rounded-[10px] border px-3 py-2.5 text-[13.5px] transition-colors ${
        checked
          ? "border-sage bg-sage-soft text-ink"
          : "border-line-strong text-ink hover:bg-paper"
      }`}
    >
      <input
        type="radio"
        name="household-mode"
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 accent-sage"
      />
      {label}
    </label>
  );
}

export function HouseholdChoiceFields({
  mode,
  onModeChange,
  householdName,
  onHouseholdNameChange,
  inviteCode,
  onInviteCodeChange,
}: HouseholdChoiceFieldsProps) {
  return (
    <>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-[11px] font-bold tracking-[0.05em] text-ink-soft uppercase">
          Household
        </legend>
        <RadioOption
          checked={mode === "create"}
          onChange={() => onModeChange("create")}
          label="Create a new household"
        />
        <RadioOption
          checked={mode === "join"}
          onChange={() => onModeChange("join")}
          label="Join an existing household"
        />
      </fieldset>

      {mode === "create" ? (
        <Field label="Household name">
          <TextInput
            required
            value={householdName}
            onChange={(e) => onHouseholdNameChange(e.target.value)}
            placeholder="e.g. The Smiths"
          />
        </Field>
      ) : (
        <Field label="Invite code">
          <TextInput
            required
            value={inviteCode}
            onChange={(e) => onInviteCodeChange(e.target.value)}
            placeholder="e.g. A3F9K2LP"
            className="uppercase"
          />
        </Field>
      )}
    </>
  );
}
