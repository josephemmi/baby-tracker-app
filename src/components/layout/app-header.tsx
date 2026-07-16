import Link from "next/link";
import { SignOutButton } from "@/components/auth/sign-out-button";

interface AppHeaderProps {
  householdName: string;
  inviteCode: string;
  profileName: string;
  active: "log" | "timeline" | "reports";
}

const navLinkClass = (isActive: boolean) =>
  `rounded px-3 py-1.5 text-sm ${
    isActive
      ? "bg-zinc-950 text-white dark:bg-zinc-50 dark:text-zinc-950"
      : "bg-zinc-100 text-zinc-950 dark:bg-zinc-900 dark:text-zinc-50"
  }`;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function AppHeader({
  householdName,
  inviteCode,
  profileName,
  active,
}: AppHeaderProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          {householdName}
        </h1>
        <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-950 text-[10px] font-semibold text-white dark:bg-zinc-50 dark:text-zinc-950">
            {initials(profileName)}
          </span>
          <span>
            {profileName} · Invite code:{" "}
            <span className="font-mono">{inviteCode}</span>
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <nav className="flex gap-2">
          <Link href="/" className={navLinkClass(active === "log")}>
            Log
          </Link>
          <Link
            href="/timeline"
            className={navLinkClass(active === "timeline")}
          >
            Timeline
          </Link>
          <Link
            href="/reports"
            className={navLinkClass(active === "reports")}
          >
            Reports
          </Link>
        </nav>
        <SignOutButton />
      </div>
    </header>
  );
}
