import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Everything is served from this origin (fonts are self-hosted), so the policy allows only 'self'.
// Inline scripts stay allowed: nonces need fully dynamic rendering, which partial prerendering
// rules out (see the Next.js CSP guide, "Without Nonces"). No upgrade-insecure-requests: the app
// runs over plain HTTP on localhost or a LAN address.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

// Neither the admin nor the public form is meant to be embedded: deny framing (clickjacking),
// MIME sniffing and full-URL referrers. To embed the form on the career site, replace
// frame-ancestors 'none' with that site's origin and drop X-Frame-Options.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
