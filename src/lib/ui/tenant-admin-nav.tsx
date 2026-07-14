import {
  Brain,
  ClipboardList,
  Gauge,
  LayoutDashboard,
  Link2,
  Mail,
  MessageSquare,
  Shield,
  Truck,
  Users,
} from "lucide-react";

export function getTenantAdminNavGroups(tenantSlug: string) {
  const base = `/t/${tenantSlug}/admin`;
  return [
    {
      items: [{ label: "Resumen", href: base, icon: <LayoutDashboard />, exact: true }],
    },
    {
      title: "Personas",
      items: [
        { label: "Usuarios", href: `${base}/users`, icon: <Users /> },
        { label: "Conductores", href: `${base}/drivers`, icon: <Truck /> },
        { label: "Invitaciones", href: `${base}/invitations`, icon: <Mail /> },
      ],
    },
    {
      title: "Configuracion",
      items: [
        { label: "Integraciones", href: `${base}/integrations`, icon: <Link2 /> },
        { label: "Seguridad", href: `${base}/security`, icon: <Shield /> },
      ],
    },
    {
      title: "Inteligencia",
      items: [
        { label: "Operaciones IA", href: `${base}/operations-insights`, icon: <Gauge /> },
        { label: "Feedback", href: `${base}/feedback`, icon: <MessageSquare /> },
        { label: "Recomendaciones", href: `${base}/recommendations`, icon: <Brain /> },
        { label: "Actividad", href: `${base}/activity`, icon: <ClipboardList /> },
      ],
    },
  ];
}
