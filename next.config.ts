import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
    ],
  },
  async redirects() {
    return [
      {
        source: "/work-with-us",
        destination: "/join-our-team",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
