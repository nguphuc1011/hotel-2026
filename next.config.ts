/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Cảnh báo: Việc này cho phép build hoàn tất ngay cả khi có lỗi ESLint.
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Cho phép build hoàn tất ngay cả khi có lỗi TypeScript.
    ignoreBuildErrors: true,
  },
};

export default nextConfig;