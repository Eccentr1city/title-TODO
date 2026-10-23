import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TODO",
  description: "Magic TODO lists powered by LLMs",
  appleWebApp: {
    capable: true,
    // solid, not black-translucent: under a see-through status bar iOS 18
    // home-screen apps get a viewport 59pt short of what they draw, so the
    // bottom of the app is never shown. Changing this needs the icon re-added.
    statusBarStyle: "black",
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


