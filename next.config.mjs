/** @type {import('next').NextConfig} */

// Two build targets from one codebase:
//   - default (WSL / Vercel / container): the FULL server app + agent.
//   - BUILD_TARGET=pages: a static export for GitHub Project Pages at /beacon.
const isPages = process.env.BUILD_TARGET === "pages";

const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  ...(isPages
    ? {
        output: "export",
        basePath: "/beacon",
        assetPrefix: "/beacon/",
        images: { unoptimized: true },
        trailingSlash: true,
      }
    : {}),
};

export default nextConfig;
