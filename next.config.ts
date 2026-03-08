import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  images: {
    unoptimized: true, // Thường dùng cho static export hoặc Vercel free
  },
};

export default nextConfig;
