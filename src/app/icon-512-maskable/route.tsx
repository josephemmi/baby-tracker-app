import { ImageResponse } from "next/og";
import { brandMarkSvg } from "@/lib/brand-icon";

// Android adaptive icons crop to a circle/squircle, so maskable icons keep
// the actual artwork inside a safe zone (~80% of the canvas) with padding
// around it, rather than full-bleed.
export async function GET() {
  return new ImageResponse(brandMarkSvg(512, { padding: 51 }), {
    width: 512,
    height: 512,
  });
}
