import {
  Activity,
  Boxes,
  History,
  Inbox,
  LayoutDashboard,
  Monitor,
  Route,
  Settings,
  ShieldCheck,
  Smartphone,
  TriangleAlert,
} from "lucide-react";
import type { TenantRole } from "@/generated/prisma";

export function getTenantNavGroups(tenantSlug: string, role: TenantRole) {
  const base = `/t/${tenantSlug}`;
  return [
    {
      title: "Operacion",
      items: [
        { label: "Resumen", href: base, icon: <LayoutDashboard />, exact: true },
        { label: "Solicitudes", href: `${base}/requests`, icon: <Inbox /> },
        { label: "Viajes activos", href: `${base}/trips`, icon: <Route /> },
        { label: "Contenedores", href: `${base}/containers`, icon: <Boxes /> },
        { label: "Incidencias", href: `${base}/incidents`, icon: <TriangleAlert /> },
        ...(["TENANT_OWNER", "TENANT_ADMIN", "OPERATIONS_MANAGER", "SAFETY_MANAGER"].includes(role)
          ? [{ label: "Cumplimiento", href: `${base}/compliance`, icon: <ShieldCheck /> }]
          : []),
        { label: "Actividad", href: `${base}/activity`, icon: <Activity /> },
        { label: "Historial", href: `${base}/history`, icon: <History /> },
      ],
    },
    {
      title: "Experiencias",
      items: [
        { label: "Portal cliente", href: `${base}/portal`, icon: <Monitor /> },
        ...(["DRIVER", "TENANT_OWNER", "DISPATCHER"].includes(role)
          ? [{ label: "PWA conductor", href: `${base}/driver`, icon: <Smartphone /> }]
          : []),
      ],
    },
    ...(["TENANT_OWNER", "TENANT_ADMIN"].includes(role)
      ? [
          {
            title: "Administracion",
            items: [{ label: "Configuracion", href: `${base}/settings`, icon: <Settings /> }],
          },
        ]
      : []),
  ];
}
