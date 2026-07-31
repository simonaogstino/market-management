import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@market/database", "@market/shared"],
  // Airo/GoDaddy preview hosts hit /_next from a different origin than the app binds to.
  allowedDevOrigins: ["*.airoapp.ai"],
};

export default nextConfig;
