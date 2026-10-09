/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The design canvas lives under design/ and is not part of the app build.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
