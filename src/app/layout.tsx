import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nestlog",
  description: "Shared, real-time baby-tracking app",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Nestlog",
  },
};

export const viewport: Viewport = {
  themeColor: "#4F7566",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col font-sans" suppressHydrationWarning>
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
