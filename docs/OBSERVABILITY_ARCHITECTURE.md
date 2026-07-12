# Arquitectura de Observabilidad

## Resumen

NCI LCT implementa observabilidad local sin dependencias de servicios cloud. Cada capa tiene un proposito especifico y controles de acceso definidos.

## Componentes

```
┌─────────────────────────────────────────────────────────────┐
│ Next.js Middleware                                           │
│  → Genera/valida X-Request-ID por request                   │
│  → Propaga en headers de request y response                 │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│ Logger Estructurado (src/lib/observability/logger.ts)        │
│  → 8 niveles: debug|info|warn|error|security|audit|job|metric│
│  → Salida JSON a stdout                                     │
│  → Redaccion automatica de 30+ claves sensibles             │
│  → Truncado de strings (240), arrays (10), depth (4)        │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
┌──────────────┬──────────────┬──────────────┬────────────────┐
│ Health Checks│ Metricas     │ Alertas      │ Job Runner     │
│              │              │              │                │
│ PostgreSQL   │ 19 queries   │ P0/P1/P2     │ runObservedJob │
│ Prisma       │ paralelas    │ dedupeKey    │ persiste en DB │
│ MinIO        │              │ cooldown     │ inicio/fin/ms  │
│ ClamAV       │              │ Mailpit SMTP │                │
│ Mailpit      │              │              │                │
└──────┬───────┴──────┬───────┴──────┬───────┴────────┬───────┘
       │              │              │                │
       ▼              ▼              ▼                ▼
┌──────────────────────────────────────────────────────────────┐
│ PostgreSQL (tablas operativas)                                │
│  OperationalCheck | OperationalAlert | JobRun | MetricsSnap  │
└──────────────────────────────────────────────────────────────┘
```

## Endpoints

| Endpoint | Acceso | Respuesta |
|----------|--------|-----------|
| `GET /api/internal/health` | Publico | `{status, checkedAt}` — solo estado agregado |
| `GET /api/internal/liveness` | Publico | `{alive: true}` — para orquestadores |
| `GET /api/internal/readiness` | PLATFORM_SUPER_ADMIN, PLATFORM_SUPPORT | HealthSummary completo con checks |
| `GET /api/internal/metrics` | PLATFORM_SUPER_ADMIN, PLATFORM_SUPPORT | SystemMetrics completo |
| `POST /api/t/:slug/driver/pwa-telemetry` | DRIVER (con rate limit) | Telemetria PWA con allowlist |

## Dashboard

- **Ruta**: `/platform/system-status`
- **Acceso**: PLATFORM_SUPER_ADMIN, PLATFORM_SUPPORT (con MFA verificado)
- **Renderizado**: Server-side, no expone datos en client JS bundle
- **Secciones**: Estado general, Servicios, Archivos/ClamAV, Seguridad, Offline/PWA, Base de datos, Alertas activas, Backups

## Redaccion de secretos

El logger redacta automaticamente los siguientes campos:

```
password, passwordHash, token, tokenHash, cookie, authorization, signature,
signatureData, signatureSvg, secret, accessKeyId, secretAccessKey, otp, mfa,
mfaCode, recoveryCode, session, sessionToken, signedUrl, objectKey, base64,
backupEncryptionKey, minioSecretKey, databaseUrl, encryptedSecret, authTag, iv, codeHash
```

Ademas:
- URLs con parametros `Token`, `Signature`, `Credential` se redactan
- Strings que empiezan con `data:image/` se redactan
- Profundidad maxima de objetos: 4 niveles
- Arrays truncados a 10 elementos
- Strings truncados a 240 caracteres

## Scripts operativos

| Comando | Proposito |
|---------|-----------|
| `pnpm ops:health` | Chequeo rapido de salud de todos los servicios |
| `pnpm ops:readiness` | Chequeo completo con estado y remediacion |
| `pnpm ops:metrics` | Dump de metricas operativas en JSON |
| `pnpm ops:alerts:test` | Crea, notifica y resuelve una alerta de prueba |
| `pnpm ops:jobs:list` | Lista los ultimos 25 jobs ejecutados |
| `pnpm ops:status-report` | Genera `docs/OPERABILITY_STATUS_LATEST.md` |

## Modelo de datos

```prisma
enum CheckStatus   { HEALTHY DEGRADED UNHEALTHY UNKNOWN }
enum AlertSeverity { P0 P1 P2 }
enum AlertStatus   { ACTIVE RESOLVED ACKNOWLEDGED }
enum JobStatus     { RUNNING SUCCESS FAILED PARTIAL }

model OperationalCheck {
  id name status severity message checkedAt durationMs metadataJson
}

model OperationalAlert {
  id severity source title description status dedupeKey(unique)
  tenantId firstSeenAt lastSeenAt resolvedAt occurrenceCount metadataJson
}

model JobRun {
  id jobName status startedAt finishedAt durationMs
  triggeredBy requestId summaryJson errorCode safeErrorMessage
}

model SystemMetricsSnapshot {
  id capturedAt metricsJson
}
```
