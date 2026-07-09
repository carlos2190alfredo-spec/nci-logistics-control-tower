import type { Metadata } from "next";
import { RegisterServiceWorker } from "@/components/register-service-worker";
import "./globals.css";

export const metadata: Metadata = {
  title: "NCI Logistics Control Tower",
  description: "Plataforma logistica multitenant local de NCI Automation",
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <RegisterServiceWorker />
        {children}
      </body>
    </html>
  );
}
