import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TODO",
  description: "Magic TODO lists powered by LLMs",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "TODO",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0908",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning className="min-h-dvh bg-background-primary text-text-normal antialiased">
        {children}
      </body>
    </html>
  );
}


