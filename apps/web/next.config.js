/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Produces a self-contained .next/standalone build with its own
  // minimal node_modules, which Dockerfile.nextjs copies wholesale -
  // no monorepo-wide `pnpm install` needed inside the final image.
  output: "standalone",
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
};

module.exports = nextConfig;
