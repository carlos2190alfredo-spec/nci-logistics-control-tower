# CHATGPT MEMORY UPDATE — NCI Logistics Control Tower

Copia este bloque a tu ChatGPT para mantener contexto del proyecto.

---

## Estado actual del proyecto (2026-07-13)

NCI Logistics Control Tower es una plataforma SaaS multitenant de logistica
construida con Next.js 16 App Router, TypeScript strict, Prisma ORM, PostgreSQL.

### Completado hasta la fecha:

1. **Diseño visual profesional** — Design system con tokens CSS, animaciones, responsive
2. **Offline + PWA** — Service worker, IndexedDB, foto sync, acciones offline
3. **Seguridad** — MFA TOTP, session rotation, ClamAV, AES-256-GCM, argon2
4. **File pipeline** — Cuarentena → scan → promote, EXIF removal
5. **Observabilidad** — Health checks, metricas, alertas, system status
6. **Product completion** — CRUD tenants, usuarios, conductores, integraciones,
   IA basada en reglas, feedback bidireccional, onboarding, demo mode

### Stack tecnico:
- Next.js 16 + Turbopack
- TypeScript strict
- Prisma ORM + PostgreSQL (port 5433)
- argon2 para contraseñas
- AES-256-GCM para credenciales de integracion
- ClamAV para escaneo de archivos
- Playwright para E2E (80 tests, workers=1)

### Patrones clave:
- Server actions con requirePlatformRole/requireTenantRole + audit()
- StatusTone: "neutral" | "info" | "progress" | "success" | "warning" | "danger" (NO "default", NO "primary")
- MetricTone: "default" | "primary" | "success" | "warning" | "danger" (NO "neutral")
- PageHeader usa prop `actions` (no children)
- Field defaults required=true — usar required={false} explícitamente
- Enums nuevos importar de @/generated/prisma (NO de @/generated/prisma/enums)
- Prisma JSON fields castear a Record<string, string | number>
- searchParams en Next.js pages es Promise<Record<string, string | string[] | undefined>>

### Reglas de seguridad (31 restricciones):
- No push, no remote, no APIs externas reales
- Autorizacion siempre en servidor
- TenantId nunca confiado desde navegador
- Interfaz en español
- Working tree limpio despues de cada commit

### Rutas: 55 total
- 10 plataforma (/platform/*)
- 14 admin tenant (/t/[slug]/admin/*)
- 4 operacion (/t/[slug]/, settings, portal, driver)
- 4 autenticacion (login, mfa, recuperar)

### Documentacion:
- 5 guias de usuario por rol
- 57+ documentos en /docs
- Task reports en /docs/task-reports
- ADRs en /docs/decisions

### Proximos pasos:
- Pruebas formales con usuarios reales
- Activar integraciones reales
- Load testing
- CI/CD pipeline
- Produccion
