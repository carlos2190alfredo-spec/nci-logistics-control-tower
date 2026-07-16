# FASE 0 — Auditoría y baseline

Programa: adaptación de NCI Logistics Control Tower a operación logística
integral en Panamá (contenedores, combustible, mercancías peligrosas),
manteniendo el producto SaaS multitenant.

Fecha: 2026-07-16

---

## 1. Baseline técnico (estado inicial)

Ejecutado sobre el repositorio existente sin modificar lógica crítica.

| Verificación | Comando | Resultado |
| --- | --- | --- |
| TypeScript | `pnpm typecheck` | ✅ 0 errores |
| Lint | `pnpm lint` | ✅ 0 warnings / 0 errores |
| Unit tests | `pnpm test` | ✅ 192 pruebas, 19 archivos |
| Security checks | `pnpm security:check` | ✅ 55/55 |
| Build producción | `pnpm build` | ✅ correcto |
| Doctor | `pnpm app:doctor` | ✅ 27/27 |
| Migraciones | Prisma | ✅ 14 aplicadas, DB en sync |

El repositorio compila, pasa pruebas y construye. Es una base sólida.

## 2. Inventario real del modelo de datos

59 modelos Prisma, 35 enums. Agrupados:

- **Multitenant / plataforma**: Tenant, TenantMembership, TenantPlan,
  TenantBranding, TenantSettings, TenantFeature, TenantSupportSession.
- **Identidad / seguridad**: User, Session, UserMfaSecret, MfaRecoveryCode,
  MfaChallenge, PasswordResetToken, UserInvitation, AuditLog, RateLimitBucket.
- **Cliente**: CustomerAccount, CustomerMembership, CustomerContact.
- **Operación**: ServiceType, ServiceRequest, Trip, TripEvent, TripAssignment,
  TripLocation, TripStop, TripRouteEstimate, TripStopEstimate, Incident,
  Location.
- **Recursos**: Vehicle, Equipment, Driver, DriverWorkSchedule,
  DriverAvailabilityException, DriverAssignmentRecommendation.
- **Evidencia / archivos**: Document, ProofOfDelivery, FileAttachment,
  FileScanEvent, AttachmentReceipt, OfflineCommandReceipt, SyncActionReceipt.
- **Notificaciones**: NotificationDelivery.
- **Integraciones**: IntegrationConnector, TenantIntegration,
  IntegrationCredential, IntegrationEvent, TenantWebhookEndpoint,
  WebhookDelivery.
- **IA**: TenantAiSetting, AiInvocation, AiRecommendation, AiInsightEvent,
  AiUsageDaily.
- **Observabilidad**: OperationalCheck, OperationalAlert, JobRun,
  SystemMetricsSnapshot.
- **Feedback**: TenantFeedback, FeedbackComment.

Roles tenant actuales (6): TENANT_OWNER, TENANT_ADMIN, OPERATIONS_MANAGER,
DISPATCHER, SAFETY_MANAGER, DRIVER. Roles plataforma (2):
PLATFORM_SUPER_ADMIN, PLATFORM_SUPPORT. Roles cliente (2): CUSTOMER_ADMIN,
CUSTOMER_VIEWER.

## 3. Diagnóstico por categorías

### 3.1 Mantener (funciona, no tocar sin razón)

- Aislamiento multitenant (filtro por `tenantId` derivado de sesión).
- Auth Argon2id + sesiones opacas + MFA TOTP + recuperación.
- Flujo solicitud → viaje → asignación → POD con firma embebida.
- Cola offline doble (conductor + genérica) con idempotencia por receipt.
- Pipeline de cuarentena de archivos (ClamAV) + EXIF strip.
- Observabilidad (health, métricas, alertas, dashboard, request-id).
- Backups AES-256-GCM + DR drill.
- DeepSeek con modos disabled/rules/auto/deepseek + anti-injection + fallback.
- Portal cliente, PWA conductor, panel plataforma, panel admin tenant.
- Exportación CSV (viajes, incidencias) — recién añadida.
- CI/CD (GitHub Actions), .env.example, guías de despliegue.

### 3.2 Ampliar / modificar

| Área | Estado actual | Necesario |
| --- | --- | --- |
| Flota | Vehicle/Equipment minimalistas (code, plate, type, status) | Tipos ricos (cabezal, chasis, cisterna…), capacidades, seguros, permisos, matriz de compatibilidad |
| Conductores | Datos básicos + horario | Licencia/categoría/vencimiento, capacitaciones, habilitaciones hazmat/combustible, elegibilidad |
| Documentos | `Document` ligado a trip/customer | Registro documental central con vencimientos, alertas, criticidad, bloqueo de despacho |
| Roles | 6 roles tenant | Añadir CUMPLIMIENTO, MANTENIMIENTO, FINANZAS, SERVICIO_CLIENTE, SUPERVISOR, AUDITOR (RBAC granular) |
| Portal cliente | Funcional | Lenguaje natural de estados, vista ejecutiva, control de visibilidad por confidencialidad |
| Incidencias | Categoría + severidad + visibilidad | Causa raíz, medidas, SLA, cadena de custodia de evidencia |
| Notificaciones | NotificationDelivery | Motor configurable por evento/canal/severidad/plantilla |

### 3.3 Construir (nuevo)

Ordenado por las fases del programa:

- **FASE 1 — Cumplimiento (capa central)**: registro documental con
  vencimientos, motor de reglas regulatorias configurable
  (autoridad/fuente/vigencia/severidad/bloquea), motor de elegibilidad
  determinista (semáforo verde/amarillo/rojo/gris/azul), excepciones
  aprobadas con auditoría.
- **FASE 2 — Contenedores**: ciclo de vida completo (booking→gate-out→
  retorno de vacío→EIR→cierre), navieras/terminales, días libres,
  demurrage, detention, almacenaje.
- **FASE 3 — Combustible / hazmat**: productos (ONU, clase), permisos
  (PPC, registro técnico), hojas de seguridad, ruta/horario autorizados,
  elegibilidad especializada.
- **FASE 4 — UX**: dashboards por rol (operaciones/cumplimiento/cliente/
  financiero), navegación, lenguaje natural, accesibilidad.
- **FASE 5 — Costos / rentabilidad**: ingresos/costos por servicio,
  márgenes, indicadores.
- **FASE 6 — Integraciones / automatización**: conectores preparados
  (aduanas/portuario/GPS) en estado declarado, CSV, webhooks, IA.
- **FASE 7 — Hardening / cierre**: pruebas, seguridad, rendimiento, docs,
  demo Panamá.

## 4. Principios de ejecución (acordados con el spec)

- No romper aislamiento, auth, roles, flujos, offline, idempotencia,
  seguridad de archivos, MFA, auditoría, backups, observabilidad, DeepSeek.
- Migraciones nuevas, incrementales, sin alterar migraciones históricas.
- Ninguna decisión de IA marca elegibilidad legal; la elegibilidad es
  determinista sobre datos verificados.
- Ninguna regla regulatoria se codifica como verdad inmutable: siempre con
  fuente, fecha de vigencia, severidad y configurable por tenant.
- No simular integraciones oficiales inexistentes; declarar estado.
- Commits pequeños y verificables; el árbol queda limpio.

## 5. Advertencia de cumplimiento

La "Panama Logistics Compliance Layer" es un sistema configurable de
registro, verificación, alertas y elegibilidad. **No** sustituye a ATTT,
Aduanas, Bomberos, AMP, PORTCEL, terminales, navieras, aeropuertos ni
autoridades competentes, ni constituye asesoría legal. Las empresas deben
validar periódicamente los requisitos con las autoridades y asesores
correspondientes. Toda regla registrada exige fuente, fecha de verificación
y fecha de vigencia, y muestra un aviso de validación humana.

## 6. Estado de esta entrega

- **FASE 0**: ✅ completa (este documento + baseline verde).
- **FASE 1**: 🔶 en progreso — primer corte entregado (registro documental
  de cumplimiento + cómputo de estado de vencimiento, con migración y
  pruebas). Ver `docs/decisions/` para el ADR correspondiente.
- **FASE 2–7**: ⏭️ planificadas; se ejecutan en entregas sucesivas, sin
  avanzar de fase si la anterior deja errores críticos.
