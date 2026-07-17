import Link from "next/link";
import { BrandMark } from "@/components/brand/brand-mark";

interface AuthCardProps {
  active: "login" | "signup";
  children: React.ReactNode;
}

export function AuthCard({ active, children }: AuthCardProps) {
  return (
    <div className="w-full max-w-[380px] rounded-[10px] border border-line bg-paper-raised p-6 shadow-card">
      <div className="mb-5 flex flex-col items-center gap-2">
        <BrandMark size={36} />
        <h1 className="text-[19px] font-bold tracking-[-0.01em] text-ink">
          Nestlog
        </h1>
      </div>

      <div
        role="tablist"
        aria-label="Log in or sign up"
        className="mb-5 flex rounded-full bg-paper p-1"
      >
        <Link
          href="/login"
          role="tab"
          aria-selected={active === "login"}
          className={`flex-1 rounded-full py-2 text-center text-sm font-bold transition-colors ${
            active === "login"
              ? "bg-ink text-paper-raised"
              : "text-ink-soft hover:bg-paper-raised"
          }`}
        >
          Log in
        </Link>
        <Link
          href="/signup"
          role="tab"
          aria-selected={active === "signup"}
          className={`flex-1 rounded-full py-2 text-center text-sm font-bold transition-colors ${
            active === "signup"
              ? "bg-ink text-paper-raised"
              : "text-ink-soft hover:bg-paper-raised"
          }`}
        >
          Sign up
        </Link>
      </div>

      {children}
    </div>
  );
}
