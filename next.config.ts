import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A self-contained server for the Docker image on the club's own host. Vercel keeps
  // building the app its own way.
  output: "standalone",
  devIndicators: false,
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
  async headers() {
    return [
      {
        source: "/demo-logo.png",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
        ],
      },
    ];
  },
};

export default nextConfig;
