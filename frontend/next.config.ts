import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  allowedDevOrigins: ['192.168.100.13'],
  // reactCompiler (experimental) was crashing the dev/build worker on the large
  // subject page ("Jest worker … exceeding retry limit"). Disabled — no runtime
  // downside; re-enable only if the subject page is split into smaller components.
  reactCompiler: false,
};

export default nextConfig;
