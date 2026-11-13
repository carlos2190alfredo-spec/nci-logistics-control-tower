import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Archivo } from "next/font/google";
import { RegisterServiceWorker } from "@/components/register-service-worker";
import "./globals.css";

// Display de ancho variable para titulares tipo estampado (Google Fonts, OFL).
const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  axes: ["wdth"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "NCI Logistics Control Tower",
  description:
    "Plataforma multiempresa para transportistas de carga: solicitudes, flota, conductor, evidencias y prueba de entrega digital.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icons/icon-192x192.png",
    apple: "/apple-touch-icon.png",
  },
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
