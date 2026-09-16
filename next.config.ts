import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Meal photos are shrunk on the phone to ~300 KB; this leaves headroom
      // for a PNG screenshot plus the multipart overhead.
      bodySizeLimit: '5mb',
    },
  },
  // The share card reads its fonts from disk at runtime; file tracing cannot
  // see a path built with process.cwd(), so name them here or Vercel ships
  // the route without them.
  outputFileTracingIncludes: {
    '/api/share/month': ['./assets/fonts/**'],
  },
};

export default nextConfig;
