import {
  Activity,
  AlertTriangle,
  Brain,
  Building2,
  LayoutDashboard,
  LifeBuoy,
  Link2,
  MessageSquare,
  PlusCircle,
  Settings,
} from "lucide-react";

export const platformRoleLabel = {
  PLATFORM_SUPER_ADMIN: "Super administrador",
  PLATFORM_SUPPORT: "Soporte de plataforma",
} as const;

export function getPlatformNavGroups() {
  return [
    {
      items: [{ label: "Resumen", href: "/platform", icon: <LayoutDashboard />, exact: true }],
    },
    {
      title: "Gestion",
      items: [
        { label: "Tenants", href: "/platform/tenants", icon: <Building2 /> },
        { label: "Crear tenant", href: "/platform#crear-tenant", icon: <PlusCircle /> },
        { label: "Planes", href: "/platform/plans", icon: <Settings /> },
        { label: "Soporte auditado", href: "/platform#soporte", icon: <LifeBuoy /> },
      ],
    },
    {
      title: "Inteligencia",
      items: [
        { label: "Feedback", href: "/platform/feedback", icon: <MessageSquare /> },
        { label: "Recomendaciones IA", href: "/platform/recommendations", icon: <Brain /> },
        { label: "Errores", href: "/platform/errors", icon: <AlertTriangle /> },
      ],
    },
    {
      title: "Integraciones",
      items: [
        { label: "Conectores", href: "/platform/integrations", icon: <Link2 /> },
      ],
    },
    {
      title: "Operaciones",
      items: [
        { label: "Estado del sistema", href: "/platform/system-status", icon: <Activity /> },
      ],
    },
  ];
}
