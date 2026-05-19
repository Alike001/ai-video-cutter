  import type { NextConfig } from "next";

  const securityHeaders = [
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
  ];

  const nextConfig: NextConfig = {
    async headers() {
      return [
        {
          source: "/(.*)",
          headers: securityHeaders,
        },
      ];
    },
  };

  export default nextConfig;
