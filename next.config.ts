import type { NextConfig } from "next";

const API_URL =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "https://antivirusapi-production.up.railway.app";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_URL.replace(/\/$/, "")}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
