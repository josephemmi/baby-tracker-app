import { ImageResponse } from "next/og";
import { brandMarkSvg } from "@/lib/brand-icon";

// Fixed URL (unlike icon.tsx's auto-hashed route) so manifest.ts can
// reference it directly for the Android/Chrome install icon.
export async function GET() {
  return new ImageResponse(brandMarkSvg(192), { width: 192, height: 192 });
}
