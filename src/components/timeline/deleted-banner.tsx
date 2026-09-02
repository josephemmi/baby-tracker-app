import Link from "next/link";

// Lives inside Timeline's content, above the day-grouped list — not the
// top-level Log/Timeline/Reports nav (JOS-20). Renders nothing at all,
// not just visually hidden, once there's nothing left to restore.
export function DeletedBanner({ deletedCount }: { deletedCount: number }) {
  if (deletedCount === 0) return null;

  return (
    <Link
      href="/timeline/deleted"
      className="flex items-center justify-between gap-3 rounded-[10px] border border-line bg-paper-raised px-3.5 py-2.5 text-[13.5px] text-ink shadow-card transition-colors hover:border-line-strong"
    >
      <span className="flex items-center gap-2">
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4 shrink-0 text-ink-soft"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <path
            d="M4 7h16M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2m-9 0v12a2 2 0 002 2h6a2 2 0 002-2V7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span>
          <b>Recently Deleted</b> ({deletedCount}) · tap to restore
        </span>
      </span>
      <svg
        viewBox="0 0 16 16"
        className="h-3 w-3 shrink-0 text-line-strong"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M6 3l5 5-5 5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Link>
  );
}
