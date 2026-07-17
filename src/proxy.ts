import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Renamed from middleware.ts: Next.js 16 deprecated the `middleware`
// file convention in favor of `proxy` (same behavior, new name/export).
export default async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
