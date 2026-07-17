import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nestlog",
  description: "Shared, real-time baby-tracking app",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col font-sans" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
