import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Meal photos are shrunk on the phone to ~300 KB; this leaves headroom
      // for a PNG screenshot plus the multipart overhead.
      bodySizeLimit: '5mb',
    },
  },
};

export default nextConfig;
