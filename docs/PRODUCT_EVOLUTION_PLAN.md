# Plan de Evolucion del Producto — NCI Logistics Control Tower

Fecha: 2026-07-12
Version: 1.0
Agente: Claude Opus 4.6

## Resumen ejecutivo

Evolucion de NCI LCT desde prototipo local funcional hacia plataforma SaaS multitenant con panel avanzado de propietario de plataforma, dashboard de administracion de tenant, arquitectura de conectores de integracion (desactivados), capa de IA basada en reglas (sin APIs externas), y sistema de feedback de tenants.

## Estado actual del producto

### Componentes existentes (intocables)

| Componente | Estado | Tests | Referencia |
|-----------|--------|-------|-----------|
| Autenticacion (Argon2id, cookies httpOnly) | VERIFIED | E2E + unit | ADR-003 |
| MFA/TOTP (AES-256-GCM, recovery codes) | VERIFIED | 30 unit + E2E | ADR-018, ADR-019 |
| Multitenancy (aislamiento server-side) | VERIFIED | E2E negativas | ADR-001, ADR-004 |
| PWA conductor (offline-first) | VERIFIED | E2E + unit | ADR-015, ADR-016 |
| Offline sync (idempotencia, receipts) | VERIFIED | E2E + unit | ADR-007 |
| Photo sync engine | VERIFIED | E2E + unit | ADR-016, ADR-017 |
| ClamAV file pipeline | VERIFIED | EICAR + unit | ADR-011 |
| Backups cifrados (AES-256-GCM) | VERIFIED | 21 unit + drill | ADR-020 |
| Observabilidad (health, metricas, alertas) | VERIFIED | 20 E2E + 38 unit | ADR-021, ADR-022 |
| POD con firma digital | VERIFIED | E2E | — |

### Metricas de baseline

| Metrica | Valor |
|---------|-------|
| Unit tests (Vitest) | 142 |
| E2E tests (Playwright) | 66 |
| Security checks | 48 |
| Prisma models | ~35 |
| API endpoints | ~15 |
| ADRs | 22 |
| Lint warnings preexistentes | 12 (3 errors) |

## Fases de implementacion

### Fase 1: Panel avanzado de propietario de plataforma

**Objetivo**: Expandir `/platform` con gestion completa de tenants, metricas globales, errores, feedback, recomendaciones, estado de integraciones y alertas.

**Modelos Prisma nuevos**: Ninguno — usa modelos existentes (Tenant, TenantPlan, OperationalAlert, AuditLog).

**Rutas nuevas**:

| Ruta | Proposito | Guard |
|------|-----------|-------|
| `/platform` | Dashboard con metricas globales KPI | requirePlatformRole |
| `/platform/tenants` | Lista de tenants con filtros y estado | requirePlatformRole |
| `/platform/tenants/new` | Formulario de creacion de tenant | requirePlatformRole([PLATFORM_SUPER_ADMIN]) |
| `/platform/tenants/[id]` | Detalle de tenant con edicion | requirePlatformRole |
| `/platform/errors` | Log de errores recientes | requirePlatformRole |
| `/platform/feedback` | Feedback recibido de tenants | requirePlatformRole |
| `/platform/recommendations` | Recomendaciones IA por tenant | requirePlatformRole |
| `/platform/integrations` | Estado global de integraciones | requirePlatformRole |
| `/platform/plans` | Gestion de planes | requirePlatformRole([PLATFORM_SUPER_ADMIN]) |

**Tenant CRUD extendido**: Campos adicionales para contacto, limites, branding, timezone, pais, moneda — todos opcionales y con valores por defecto. Se extiende `TenantSettings` y se agrega un modelo `TenantContact` si es necesario, o campos directos en `Tenant`.

**Metricas globales del dashboard**:
- Total tenants activos / suspendidos / trial
- Total usuarios registrados / activos en 7 dias
- Total viajes (semana, mes) / completados / con incidencia
- Alertas activas por severidad
- Errores recientes (ultimas 24h)
- Integraciones habilitadas vs total

### Fase 2: Dashboard de administracion de tenant

**Objetivo**: Crear `/t/[tenantSlug]/admin` con gestion de usuarios, conductores, roles, permisos, invitaciones, integraciones del tenant, feedback y recomendaciones.

**Modelos Prisma nuevos**:

| Modelo | Campos clave | Proposito |
|--------|-------------|-----------|
| `UserInvitation` | tenantId, email, role, tokenHash, expiresAt, usedAt, invitedById | Invitaciones con token hasheado |

**Rutas nuevas**:

| Ruta | Proposito | Guard |
|------|-----------|-------|
| `/t/[tenantSlug]/admin` | Dashboard admin del tenant | requireTenantRole([TENANT_OWNER, TENANT_ADMIN]) |
| `/t/[tenantSlug]/admin/users` | Gestion de usuarios del tenant | requireTenantRole |
| `/t/[tenantSlug]/admin/drivers` | Gestion de conductores | requireTenantRole |
| `/t/[tenantSlug]/admin/invitations` | Invitaciones pendientes | requireTenantRole |
| `/t/[tenantSlug]/admin/roles` | Vista de roles y permisos | requireTenantRole([TENANT_OWNER]) |
| `/t/[tenantSlug]/admin/integrations` | Configuracion de integraciones | requireTenantRole([TENANT_OWNER]) |
| `/t/[tenantSlug]/admin/feedback` | Enviar feedback a plataforma | requireTenantRole |
| `/t/[tenantSlug]/admin/recommendations` | Ver recomendaciones IA | requireTenantRole |
| `/t/[tenantSlug]/admin/activity` | Log de actividad del tenant | requireTenantRole |
| `/t/[tenantSlug]/admin/security` | Configuracion de seguridad | requireTenantRole([TENANT_OWNER]) |

**Flujo de invitacion**:
1. TENANT_OWNER/TENANT_ADMIN crea invitacion con email y rol
2. Se genera token, se hashea con SHA-256, se persiste con TTL (72h)
3. Se envia email via Mailpit con link de registro
4. El invitado se registra, el token se marca usado (single-use)
5. Se crea TenantMembership automaticamente

**Permisos centralizados**: Helper `requireTenantPermission(tenantSlug, permission)` que mapea permisos a roles. No se mueve autorizacion al frontend — todo server-side.

### Fase 3: Arquitectura de conectores de integracion

**Objetivo**: Crear infraestructura de conectores con patron disabled-first. GPS, WhatsApp, CRM, Billing, Webhooks, Email, AI — todos desactivados con providers de simulacion.

**Modelos Prisma nuevos**:

| Modelo | Campos clave | Proposito |
|--------|-------------|-----------|
| `IntegrationConnector` | type, name, description, version, configSchema, enabled | Catalogo global de conectores |
| `TenantIntegration` | tenantId, connectorId, enabled, config, status | Instancia por tenant |
| `IntegrationCredential` | tenantIntegrationId, key, encryptedValue, iv, authTag | Credenciales cifradas AES-256-GCM |
| `IntegrationEvent` | tenantIntegrationId, eventType, payload, status | Log de eventos |
| `TenantWebhookEndpoint` | tenantId, url, secretHash, events, active | Endpoints webhook |
| `WebhookDelivery` | webhookEndpointId, eventType, payload, status, httpStatus, attempts | Entregas webhook |

**Tipos de conector**:

| Tipo | Provider desactivado | Simulacion |
|------|---------------------|-----------|
| GPS | `DisabledGpsProvider` | Devuelve coordenadas fijas |
| WhatsApp | `DisabledWhatsAppProvider` | Log en notificaciones |
| CRM | `DisabledCrmProvider` | No-op |
| Billing | `DisabledBillingProvider` | No-op |
| Email | `LocalEmailProvider` (ya existe) | Via Mailpit |
| Webhooks | `WebhookDispatcher` | Log pero no envia |
| AI | `DisabledAiProvider` | No-op |

**Encriptacion de credenciales**: Mismo patron que MFA (AES-256-GCM con `INTEGRATION_ENCRYPTION_KEY`). Cada credencial se cifra individualmente. Nunca se expone en frontend.

**Modulo TypeScript**: `src/lib/integrations/`
- `types.ts` — interfaces IntegrationProvider, ConnectorConfig
- `registry.ts` — registro de providers
- `credential-crypto.ts` — encrypt/decrypt con AES-256-GCM
- `disabled/` — providers desactivados para cada tipo
- `webhook/` — dispatcher con retry y signature

### Fase 4: Capa de IA basada en reglas

**Objetivo**: Motor de recomendaciones determinista, aislado por tenant, sin APIs externas. Ver `docs/AI_INTEGRATION_STRATEGY.md` para detalle completo.

**Modelos Prisma nuevos**:

| Modelo | Campos clave | Proposito |
|--------|-------------|-----------|
| `TenantAiSetting` | tenantId, enabled, config | Configuracion IA por tenant |
| `AiRecommendation` | tenantId, type, title, description, priority, data, status | Recomendaciones generadas |
| `AiInsightEvent` | tenantId, type, data, processedAt | Eventos de insight |

**Motor de reglas** (`src/lib/ai/`):
- `types.ts` — interfaces
- `disabled-provider.ts` — provider desactivado por defecto
- `context-builder.ts` — construye contexto solo con datos del tenant activo
- `safety.ts` — filtros: no cruza tenants, no ejecuta sin confirmacion, no usa datos externos
- `recommendations.ts` — `RulesBasedRecommendationEngine` con reglas como:
  - Vehiculos con baja utilizacion
  - Conductores con alta tasa de incidencia
  - Tipos de servicio sin uso en 30 dias
  - Clientes con volumen decreciente
  - Alertas operativas recurrentes

### Fase 5: Sistema de feedback

**Objetivo**: Permitir que tenants reporten bugs, soliciten features y den feedback de UX. La plataforma puede revisar, responder y categorizar.

**Modelos Prisma nuevos**:

| Modelo | Campos clave | Proposito |
|--------|-------------|-----------|
| `TenantFeedback` | tenantId, userId, type, title, description, status, priority, response, respondedAt | Feedback del tenant |

**Tipos de feedback**: `BUG`, `FEATURE_REQUEST`, `UX`, `PERFORMANCE`, `INTEGRATION`, `OTHER`

**Estados**: `SUBMITTED`, `IN_REVIEW`, `ACKNOWLEDGED`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`, `WONT_FIX`

### Fase 6: Tests y seguridad

**Unit tests nuevos** (objetivo: +30):
- Permisos y roles (requireTenantPermission, invitation flow)
- Creacion de tenant (validacion, limites del plan)
- Integraciones (credential encryption, disabled providers)
- IA (safety filters, context isolation, recommendation rules)
- Feedback (isolation por tenant)

**E2E tests nuevos** (objetivo: +14):
- Tenant CRUD desde plataforma
- Invitacion de usuario y registro
- Integraciones desactivadas (UI y API)
- Feedback submit y respuesta
- Recomendaciones IA visibles
- Permisos: acceso denegado cross-tenant

**Security checks nuevos** (objetivo: +10):
- Credenciales de integracion cifradas
- No hay API keys en frontend
- Context builder no cruza tenants
- Feedback aislado por tenant
- Invitaciones con token hasheado y TTL
- Webhooks con secret hasheado

### Fase 7: Documentacion

**Documentos nuevos**:

| Documento | Proposito |
|-----------|-----------|
| `docs/PLATFORM_PANEL_ARCHITECTURE.md` | Arquitectura del panel de plataforma |
| `docs/TENANT_ADMIN_ARCHITECTURE.md` | Arquitectura del dashboard admin |
| `docs/INTEGRATION_ARCHITECTURE.md` | Conectores, credenciales, webhooks |
| `docs/AI_ARCHITECTURE.md` | Motor de reglas, safety, context |
| `docs/FEEDBACK_SYSTEM.md` | Sistema de feedback |
| `docs/INVITATION_FLOW.md` | Flujo de invitaciones |
| `docs/PERMISSIONS_MODEL.md` | Modelo de permisos centralizado |
| `docs/WEBHOOK_ARCHITECTURE.md` | Webhooks, signatures, delivery |

**ADRs nuevos**:

| ADR | Titulo |
|-----|--------|
| ADR-023 | Integration connectors disabled-first pattern |
| ADR-024 | Rules-based AI recommendations without external APIs |
| ADR-025 | User invitation flow with hashed tokens |

**Documentos actualizados**:

| Documento | Actualizacion |
|-----------|-------------|
| `docs/CURRENT_STATE.md` | Refleja nueva fase |
| `docs/HANDOFF_LATEST.md` | Handoff completo |
| `docs/SECURITY_CHECKLIST.md` | Nuevos controles |
| `docs/THREAT_MODEL.md` | Nuevas superficies |
| `docs/SESSION_LOG.md` | Entrada de sesion |
| `docs/VERIFICATION_LATEST.md` | Conteos actualizados |
| `docs/PROJECT_STATUS_REPORT.md` | Reporte actualizado |
| `docs/integrations.md` | Arquitectura de conectores |

## Orden de ejecucion

| Paso | Fase | Dependencia | Commit esperado |
|------|------|-------------|----------------|
| 1 | Documentacion de planning | — | `docs: plan product evolution...` |
| 2 | Migracion Prisma | Paso 1 | `feat: add integration, AI, feedback, invitation models` |
| 3 | Panel de plataforma (CRUD tenants + metricas) | Paso 2 | `feat: platform owner panel with tenant CRUD and metrics` |
| 4 | Dashboard admin tenant + invitaciones | Paso 2 | `feat: tenant admin dashboard with user management and invitations` |
| 5 | Conectores de integracion | Paso 2 | `feat: integration connector architecture (disabled-first)` |
| 6 | Capa de IA | Paso 2 | `feat: rules-based AI recommendation engine` |
| 7 | Sistema de feedback | Paso 2 | `feat: tenant feedback system` |
| 8 | Tests y security checks | Pasos 3-7 | `test: add unit, E2E, and security checks for new features` |
| 9 | Documentacion | Pasos 3-7 | `docs: architecture docs, ADRs, and updated references` |
| 10 | Verificacion final | Paso 9 | (no commit, solo verificacion) |

## Restricciones de seguridad

Todas las restricciones del spec original se respetan:

1. No push, no remote
2. No romper: multitenancy, auth, MFA, PWA, offline sync, photo sync, ClamAV, backups, observabilidad, tests existentes
3. Autorizacion solo en servidor; no confiar en tenantId/rol del navegador
4. Credenciales de integracion cifradas (AES-256-GCM), nunca en texto plano
5. No exponer API keys en frontend ni en logs
6. No crear integraciones reales sin credenciales reales
7. No enviar datos a servicios externos
8. IA no cruza datos entre tenants, no ejecuta sin confirmacion
9. No editar migraciones aplicadas; crear nuevas
10. No usar `any` para silenciar TypeScript
11. Interfaz en espanol, diseno profesional y consistente
12. Working tree limpio al terminar

## Conteo estimado de archivos nuevos

| Categoria | Archivos | LOC estimadas |
|-----------|----------|--------------|
| Prisma migration | 1 | ~150 |
| Platform routes | ~10 | ~2000 |
| Tenant admin routes | ~12 | ~2500 |
| Integration lib | ~10 | ~800 |
| AI lib | ~6 | ~600 |
| Feedback routes | ~4 | ~400 |
| Tests (unit) | ~5 | ~800 |
| Tests (E2E) | ~3 | ~500 |
| Security checks | — | ~200 |
| Docs | ~12 | ~1500 |
| **Total** | **~63** | **~9450** |
