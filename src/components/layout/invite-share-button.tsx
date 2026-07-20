"use client";

import { useState } from "react";

interface InviteShareButtonProps {
  householdName: string;
  inviteCode: string;
}

export function InviteShareButton({
  householdName,
  inviteCode,
}: InviteShareButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    const joinUrl = `${window.location.origin}/signup?mode=join&code=${inviteCode}`;
    const text = `Join our "${householdName}" household on Nestlog — invite code ${inviteCode}. ${joinUrl}`;

    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "Nestlog invite", text, url: joinUrl });
      } catch {
        // user dismissed the share sheet — nothing to do
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable — nothing more we can do
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      aria-label={`Share invite code ${inviteCode}`}
      className="flex items-center gap-1 text-[12.5px] text-ink-soft transition-colors hover:text-ink"
    >
      Invite code:{" "}
      <span className="tabular-nums underline decoration-dotted decoration-line-strong underline-offset-2">
        {inviteCode}
      </span>
      {copied && <span className="ml-1 font-bold text-sage">Copied!</span>}
    </button>
  );
}
