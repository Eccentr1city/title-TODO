import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  devIndicators: false,
  // Hosts the dev server may be reached through (Tailscale MagicDNS name, short name, and IP)
  allowedDevOrigins: [
    "adams-macbook-pro-3.tail18d97e.ts.net",
    "adams-macbook-pro-3",
    "100.72.197.109",
  ],
};

export default nextConfig;


