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
  other: {
    // Next emits the generic tag; older iOS only honours the Apple-prefixed one.
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
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


