import { ImageResponse } from "next/og";
import { brandMarkSvg } from "@/lib/brand-icon";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(brandMarkSvg(180), { ...size });
}
