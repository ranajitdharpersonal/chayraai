import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // 🛑 Added for Docker / Cloud Run deployment
  /* config options here */
};

export default nextConfig;