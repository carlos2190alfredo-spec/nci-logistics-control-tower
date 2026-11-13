import {
  Activity,
  Boxes,
  DollarSign,
  Flame,
  History,
  Inbox,
  LayoutDashboard,
  Monitor,
  Route,
  Settings,
  ShieldCheck,
  Smartphone,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import type { TenantRole } from "@/generated/prisma";
import { hasPermission, type TenantPermission } from "@/lib/server/tenant-permissions";

/**
 * Navegacion del tenant. La visibilidad de cada enlace sale del mismo mapa de
 * permisos que protege las paginas en el servidor (`hasPermission`), de modo que
 * el menu y el acceso real no pueden divergir.
 */
export function getTenantNavGroups(tenantSlug: string, role: TenantRole) {
  const base = `/t/${tenantSlug}`;
  const can = (permission: TenantPermission) => hasPermission(role, permission);
  const canView = can("tenant.view");
  return [
    ...(canView
      ? [
          {
            title: "Operacion",
            items: [
              { label: "Resumen", href: base, icon: <LayoutDashboard />, exact: true },
              { label: "Solicitudes", href: `${base}/requests`, icon: <Inbox /> },
              { label: "Viajes activos", href: `${base}/trips`, icon: <Route /> },
              ...(can("tenant.containers.view")
                ? [{ label: "Contenedores", href: `${base}/containers`, icon: <Boxes /> }]
                : []),
              ...(can("tenant.hazmat.view")
                ? [{ label: "Combustible / Hazmat", href: `${base}/hazmat`, icon: <Flame /> }]
                : []),
              ...(can("tenant.maintenance.view")
                ? [{ label: "Mantenimiento", href: `${base}/maintenance`, icon: <Wrench /> }]
                : []),
              { label: "Incidencias", href: `${base}/incidents`, icon: <TriangleAlert /> },
              ...(can("tenant.compliance.view")
                ? [{ label: "Cumplimiento", href: `${base}/compliance`, icon: <ShieldCheck /> }]
                : []),
              { label: "Actividad", href: `${base}/activity`, icon: <Activity /> },
              { label: "Historial", href: `${base}/history`, icon: <History /> },
            ],
          },
        ]
      : []),
    {
      title: "Experiencias",
      items: [
        ...(canView ? [{ label: "Portal cliente", href: `${base}/portal`, icon: <Monitor /> }] : []),
        ...(["DRIVER", "TENANT_OWNER", "DISPATCHER"].includes(role)
          ? [{ label: "PWA conductor", href: `${base}/driver`, icon: <Smartphone /> }]
          : []),
      ],
    },
    ...(can("tenant.finance.view") || can("tenant.settings.edit")
      ? [
          {
            title: "Administracion",
            items: [
              ...(can("tenant.finance.view")
                ? [{ label: "Rentabilidad", href: `${base}/finance`, icon: <DollarSign /> }]
                : []),
              ...(can("tenant.settings.edit")
                ? [{ label: "Configuracion", href: `${base}/settings`, icon: <Settings /> }]
                : []),
            ],
          },
        ]
      : []),
  ];
}
