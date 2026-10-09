/** @type {import('next').NextConfig} */


const nextConfig = {
  output: "standalone", // eigenständiges Server-Paket (Plesk/Node.js)
  outputFileTracingIncludes: { "/**": ["./node_modules/.prisma/client/**/*"] },
  reactStrictMode: true,
  poweredByHeader: false,
  images: { unoptimized: true },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};
export default nextConfig;
