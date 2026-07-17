import Link from "next/link";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { BrandMark } from "@/components/brand/brand-mark";
import { initials, personColor } from "@/lib/person-colors";

interface AppHeaderProps {
  householdName: string;
  inviteCode: string;
  profileName: string;
  profileColorIndex: number;
  active: "log" | "timeline" | "reports";
}

const navLinkClass = (isActive: boolean) =>
  `rounded-full border px-3 py-1.5 text-sm font-bold transition-colors ${
    isActive
      ? "border-ink bg-ink text-paper-raised"
      : "border-transparent text-ink-soft hover:border-line hover:bg-paper-raised"
  }`;

export function AppHeader({
  householdName,
  inviteCode,
  profileName,
  profileColorIndex,
  active,
}: AppHeaderProps) {
  const color = personColor(profileColorIndex);

  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <BrandMark size={40} />
        <div>
          <h1 className="text-[19px] font-bold tracking-[-0.01em] text-ink">
            {householdName}
          </h1>
          <div className="flex items-center gap-2 text-[12.5px] text-ink-soft">
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${color.bg} ${color.text}`}
            >
              {initials(profileName)}
            </span>
            <span>
              {profileName} · Invite code:{" "}
              <span className="tabular-nums">{inviteCode}</span>
            </span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <nav role="tablist" aria-label="Sections" className="flex gap-2">
          <Link
            href="/"
            role="tab"
            aria-selected={active === "log"}
            className={navLinkClass(active === "log")}
          >
            Log
          </Link>
          <Link
            href="/timeline"
            role="tab"
            aria-selected={active === "timeline"}
            className={navLinkClass(active === "timeline")}
          >
            Timeline
          </Link>
          <Link
            href="/reports"
            role="tab"
            aria-selected={active === "reports"}
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
