import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TODO",
  description: "Magic TODO lists powered by LLMs",
  other: {
    "viewport": "width=device-width, initial-scale=1, viewport-fit=cover",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
  },
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


