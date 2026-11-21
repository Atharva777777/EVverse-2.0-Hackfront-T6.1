import type { NextConfig } from "next";

const securityHeaders = [
  {
    key: "X-DNS-Prefetch-Control",
    value: "on",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self), payment=(), usb=(), screen-wake-lock=(), accelerometer=(), gyroscope=(), magnetometer=()",
  },
  {
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin",
  },
  {
    key: "X-XSS-Protection",
    value: "1; mode=block",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self';",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' blob: https://unpkg.com https://cdn.jsdelivr.net;",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com;",
      "img-src 'self' data: blob: https: *.tile.openstreetmap.org *.basemaps.cartocdn.com unpkg.com;",
      "font-src 'self' data: https://fonts.gstatic.com;",
      "connect-src 'self' data: blob: https: wss: http://localhost:* https://*.vercel.app https://api.openchargemap.io https://router.project-osrm.org;",
      "worker-src 'self' blob:;",
      "frame-ancestors 'none';",
      "form-action 'self';",
      "base-uri 'self';",
      "object-src 'none';",
      "upgrade-insecure-requests;",
    ].join(" "),
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
