import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@market/database", "@market/shared"],
};

export default nextConfig;
