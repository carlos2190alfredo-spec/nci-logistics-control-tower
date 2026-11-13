import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Archivo } from "next/font/google";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_SHORT_NAME,
  SITE_THEME_COLOR,
  allowsIndexing,
  resolveSiteOrigin,
  siteOpenGraph,
  siteTwitter,
} from "@/components/brand/site";
import { RegisterServiceWorker } from "@/components/register-service-worker";
import "./globals.css";

// Display de ancho variable para titulares tipo estampado (Google Fonts, OFL).
const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  axes: ["wdth"],
  display: "swap",
});

// Fuera de produccion (local, staging o APP_ENV desconocido) ninguna pagina se
// indexa; robots.ts y sitemap.ts aplican la misma regla (allowsIndexing).
export const metadata: Metadata = {
  metadataBase: new URL(resolveSiteOrigin()),
  title: { default: SITE_NAME, template: `%s · ${SITE_SHORT_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icons/icon-192x192.png",
    apple: "/apple-touch-icon.png",
  },
  openGraph: siteOpenGraph(),
  twitter: siteTwitter(),
  ...(allowsIndexing() ? {} : { robots: { index: false, follow: false } }),
};

export const viewport: Viewport = {
  themeColor: SITE_THEME_COLOR,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      data-scroll-behavior="smooth"
      lang="es"
      className={`h-full antialiased ${GeistSans.variable} ${GeistMono.variable} ${archivo.variable}`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <RegisterServiceWorker />
        {children}
      </body>
    </html>
  );
}
