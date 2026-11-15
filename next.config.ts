import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  cacheComponents: false,
  // Opening 127.0.0.1 while the dev server is "localhost" blocks the client
  // bundle, so the page paints but no button handlers attach.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};
export default nextConfig;
