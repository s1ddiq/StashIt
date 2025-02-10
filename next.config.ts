import { prototype } from "events";
import type { NextConfig } from "next";
import { hostname } from "os";

const nextConfig: NextConfig = {
  /* config options here */
experimental: {
  serverActions: {
    bodySizeLimit: '100MB',
  }
}
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cloud.appwrite.io'
      }
    ]
  }
};

export default nextConfig;
