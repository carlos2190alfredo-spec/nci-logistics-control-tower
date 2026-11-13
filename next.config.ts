import type { NextConfig } from "next";

/**
 * Cabeceras de seguridad globales. CSP diferencia dev/prod:
 * - En dev permitimos `unsafe-eval`/`unsafe-inline` (React Refresh + Turbopack).
 * - En prod bloqueamos `unsafe-eval` y permitimos únicamente inline necesario.
 * HSTS solo se aplica cuando el runtime detecta HTTPS (fuera de este archivo).
 */

const isDev = process.env.NODE_ENV !== "production";

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  ...(isDev
    ? []
    : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]),
];

/**
 * Limite del cuerpo de las Server Actions (por defecto 1 MB, lo que rompia la evidencia de entrega
 * con cualquier foto mayor). Vercel rechaza cuerpos de mas de ~4,5 MB antes de llegar a la funcion,
 * asi que este valor debe quedar por debajo. El multipart incluye la firma (data URL) y los demas
 * campos, por eso `MAX_UPLOAD_FILE_BYTES` (src/lib/server/storage.ts) es 3 MB: ~1 MB de margen.
 */
const SERVER_ACTIONS_BODY_LIMIT = "4mb";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: {
    root: __dirname,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: SERVER_ACTIONS_BODY_LIMIT,
    },
  },
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, no-cache, must-revalidate" }],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
