import { ImageResponse } from "next/og";
import { brandMarkSvg } from "@/lib/brand-icon";

export async function GET() {
  return new ImageResponse(brandMarkSvg(512), { width: 512, height: 512 });
}
