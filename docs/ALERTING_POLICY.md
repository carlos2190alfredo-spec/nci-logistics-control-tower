# Politica de Alertas

## Niveles de severidad

| Nivel | Significado | Cooldown | Ejemplo |
|-------|-------------|----------|---------|
| **P0** | Servicio critico caido | 5 min | PostgreSQL no responde, MinIO inalcanzable |
| **P1** | Funcionalidad degradada | 30 min | ClamAV caido (uploads bloqueados), backups fallidos |
| **P2** | Advertencia operativa | 60 min | Mailpit no disponible, metricas anomalas |

## Mecanismo de deduplicacion

Cada alerta tiene un `dedupeKey` unico. Si una alerta con el mismo key ya existe:
1. Se incrementa `occurrenceCount`
2. Se actualiza `lastSeenAt`
3. Se reabre si estaba resuelta
4. Solo se reenvia notificacion si paso el periodo de cooldown

## Ciclo de vida

```
NUEVO → raiseAlert() → ACTIVE → resolveAlert() → RESOLVED
                           ↑                          │
                           └── raiseAlert() ──────────┘
                               (si se repite)
```

## Canal de notificacion

- **Local**: Mailpit via SMTP (configurable con MAIL_HOST / MAIL_PORT)
- **Remitente**: `ops@nci-lct.local`
- **Destinatario**: `admin@nci-lct.local`
- **Subject**: `[P0|P1|P2] Titulo de la alerta`
- Si Mailpit no esta disponible, el fallo de notificacion se loguea pero no bloquea la alerta

## Cuándo levantar alertas

### P0 (accion inmediata)
- Base de datos inaccesible
- Storage de objetos caido
- Antivirus no responde y hay uploads en cola
- Backup fallido en produccion

### P1 (atencion en horas)
- Pipeline de archivos con cola creciente
- Multiples fallos de login en periodo corto
- Conflictos de sync offline acumulados
- DR drill fallido

### P2 (revision en proxima sesion)
- Mailpit no disponible
- Metricas de uso inusuales
- Jobs con duracion anomala

## Scripts de prueba

```bash
pnpm ops:alerts:test  # crea, notifica y resuelve una alerta de prueba
```

## Acceso a alertas

- **Dashboard**: `/platform/system-status` (solo plataforma con MFA)
- **API**: Tabla `OperationalAlert` via Prisma
- **CLI**: `pnpm ops:status-report` incluye alertas activas
