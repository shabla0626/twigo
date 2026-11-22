import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// Realtime chat connects to /socket.io on the same host (WebSocket).
const site = (() => {
  try {
    return new URL(process.env.SITE_URL || "http://localhost:3000");
  } catch {
    return null;
  }
})();
const wsOrigin = site ? ` ${site.protocol === "https:" ? "wss" : "ws"}://${site.host}` : "";

// Content Security Policy. Next.js injects small inline scripts for hydration,
// so 'unsafe-inline' is required for script-src unless nonces are adopted.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${wsOrigin}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  ...(isProd
    ? // No "preload" yet: preloading is hard to undo and belongs to a final domain, which is not settled.
      [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
    : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Lets the e2e server run beside a normal dev server without sharing build output.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: ["@prisma/client", "bcryptjs", "nodemailer", "sharp", "pg", "pg-copy-streams", "qrcode", "socket.io"],
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      ...[
        "/admin/:path*",
        "/community/:path*",
        "/account/:path*",
        "/login/:path*",
        "/join",
        "/continue",
        "/apply",
        "/application",
        "/forgot-password",
        "/activate/:path*",
        "/reset-password/:path*",
        "/verify-email/:path*",
      ].map((source) => ({
        source,
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "no-store" },
          // Tokens in these URLs must never leak through the Referer header.
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      })),
    ];
  },
};

export default nextConfig;
