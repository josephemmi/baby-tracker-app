"use client";

type Mode = "create" | "join";

interface HouseholdChoiceFieldsProps {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  householdName: string;
  onHouseholdNameChange: (value: string) => void;
  inviteCode: string;
  onInviteCodeChange: (value: string) => void;
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
      <fieldset className="flex flex-col gap-2 text-sm text-zinc-950 dark:text-zinc-50">
        <legend className="mb-1 font-medium">Household</legend>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="household-mode"
            checked={mode === "create"}
            onChange={() => onModeChange("create")}
            className="h-4 w-4"
          />
          Create a new household
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="household-mode"
            checked={mode === "join"}
            onChange={() => onModeChange("join")}
            className="h-4 w-4"
          />
          Join an existing household
        </label>
      </fieldset>

      {mode === "create" ? (
        <label className="flex flex-col gap-1 text-sm text-zinc-950 dark:text-zinc-50">
          Household name
          <input
            required
            value={householdName}
            onChange={(e) => onHouseholdNameChange(e.target.value)}
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
            onChange={(e) => onInviteCodeChange(e.target.value)}
            placeholder="e.g. A3F9K2LP"
            className="rounded border border-zinc-300 px-3 py-2 uppercase dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
      )}
    </>
  );
}
