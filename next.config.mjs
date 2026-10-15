/** @type {import('next').NextConfig} */

// Two build targets from one codebase:
//   - default (WSL / container / Vercel): the FULL server app + /api + agent.
//   - BUILD_TARGET=pages: a static export for GitHub Project Pages at /beacon.
//
// Anything that only the server target can do (response headers, a standalone
// server bundle) is gated on this flag, because `output: "export"` has no
// server to apply it.

import { readFileSync } from "node:fs";

const isPages = process.env.BUILD_TARGET === "pages";

// Build identity, read once here and inlined into the bundle so /api/health and
// a bug report can name the exact build (lib/version.ts). A deployed bundle can
// neither read package.json nor run git, so it has to arrive at build time.
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const commit = (process.env.GITHUB_SHA || process.env.BEACON_COMMIT || "unknown").slice(0, 7);

/**
 * Response headers for the server target.
 *
 * CSP NOTE — script-src and style-src keep 'unsafe-inline'. That is not an
 * oversight: the theme boot script (lib/prefs.ts BOOT_SCRIPT) runs inline
 * before first paint to avoid a flash of the wrong theme, and the screens use
 * inline style attributes. Moving to a strict nonce-based CSP means reworking
 * both, and is listed as a known gap in docs/PRODUCTION-READINESS.md rather
 * than quietly left out. Everything else is locked to this origin: the browser
 * never talks to a model provider directly — only the server does.
 */
const securityHeaders = [
  {
    key: "content-security-policy",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data:",
      "connect-src 'self'",
    ].join("; "),
  },
  // Beacon is never meant to be framed; frame-ancestors above covers modern
  // browsers, this covers the rest.
  { key: "x-frame-options", value: "DENY" },
  { key: "x-content-type-options", value: "nosniff" },
  { key: "referrer-policy", value: "strict-origin-when-cross-origin" },
  { key: "permissions-policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "cross-origin-opener-policy", value: "same-origin" },
];

// HSTS is only correct once the deployment is actually HTTPS-only; asserting it
// from a plain-HTTP local run would pin a developer's browser to https on
// localhost. Opt in where it belongs (the pilot's ingress).
if (process.env.BEACON_ENABLE_HSTS === "true") {
  securityHeaders.push({ key: "strict-transport-security", value: "max-age=63072000; includeSubDomains" });
}

const nextConfig = {
  reactStrictMode: true,
  // The build must not pass while the code does not lint. `npm run verify`
  // (typecheck + lint + test + build) is the gate; see docs/TESTING.md.
  eslint: { ignoreDuringBuilds: false },
  // Nothing useful, and it advertises the framework version.
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_BEACON_VERSION: pkg.version,
    NEXT_PUBLIC_BEACON_COMMIT: commit,
    NEXT_PUBLIC_BEACON_BUILT_AT: new Date().toISOString(),
    NEXT_PUBLIC_BEACON_TARGET: isPages ? "pages" : "server",
  },
  ...(isPages
    ? {
        output: "export",
        basePath: "/beacon",
        assetPrefix: "/beacon/",
        images: { unoptimized: true },
        trailingSlash: true,
      }
    : {
        // The container build wants a self-contained server bundle; a plain
        // `npm run build && npm start` does not.
        ...(process.env.BEACON_OUTPUT === "standalone" ? { output: "standalone" } : {}),
        async headers() {
          return [{ source: "/:path*", headers: securityHeaders }];
        },
      }),
};

export default nextConfig;
