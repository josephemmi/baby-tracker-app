import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Nestlog",
    short_name: "Nestlog",
    description: "Shared, real-time baby-tracking app",
    start_url: "/",
    display: "standalone",
    background_color: "#FBF7EC",
    theme_color: "#4F7566",
    icons: [
      { src: "/icon-192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon-512-maskable",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
