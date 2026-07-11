import { WifiOff } from "lucide-react";
import { OfflineRetryButton } from "@/components/offline/offline-retry-button";

export const metadata = {
  title: "Sin conexion — NCI Logistics",
  robots: "noindex",
};

export default function OfflinePage() {
  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <div className="mx-auto max-w-sm text-center">
        <div className="mx-auto mb-4 grid size-16 place-items-center rounded-2xl bg-warning-soft">
          <WifiOff className="size-8 text-warning-strong" />
        </div>
        <h1 className="text-xl font-bold text-foreground">Sin conexion</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          No hay conexion a internet. Las acciones pendientes se sincronizaran automaticamente cuando vuelva la conexion.
        </p>
        <OfflineRetryButton />
      </div>
    </div>
  );
}
