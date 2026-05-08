import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    domains: ["localhost"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  // Production builds on the VPS are hanging during the post-lint type-check
  // step (next 15.5 + this codebase). We type-check locally before every
  // commit (`npx tsc --noEmit` in scripts/deploy.sh upstream of this), so
  // re-running it during `next build` on the server is duplicate work and a
  // recurring source of stuck deploys. Same logic for lint — useful in dev,
  // a deploy hazard in prod where the warnings are advisory.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
