# INCIDENT RESPONSE

Plan mínimo viable para incidentes de seguridad. Debe ejercitarse en simulacro antes del piloto.

## 1. Detección

- Alertas de logger (`level=error` o `warn` con `action=offline.payload_tampered | origin rejected | login rate limited`).
- Reportes del cliente en el portal.
- Anomalías en `audit_logs`: intentos cross-tenant, acciones fuera de secuencia, descargas repetidas.
- `pnpm security:check` y `pnpm audit` como controles preventivos.

## 2. Clasificación

| Nivel | Criterio | Ejemplo |
|---|---|---|
| P1 | Datos expuestos cross-tenant o robo de sesión | POD de tenant A visible para tenant B |
| P2 | Compromiso potencial pero contenido | Login bruteforce sostenido, escalada intentada |
| P3 | Anomalía sin evidencia de compromiso | Errores masivos de sync, uploads rechazados |

## 3. Contención

- Revocar sesiones sospechosas: `UPDATE sessions SET revoked_at = now() WHERE user_id = ...`.
- Suspender tenant: `UPDATE tenants SET status = 'SUSPENDED' WHERE id = ...` (los guards ya bloquean acceso a tenants suspendidos).
- Rotar credenciales de MinIO / DB si aplica.
- Detener el flujo afectado con feature flag (`tenant_features`).

## 4. Preservación de evidencia

- Snapshot lógico de `audit_logs` filtrado por ventana temporal y tenant.
- Dump del bucket MinIO afectado (backup script).
- Copia de los logs estructurados del período.
- Volcado de `offline_command_receipts` para reconstruir acciones enviadas.

## 5. Recuperación

- Aplicar parche (código o config).
- Migración correctiva de datos si aplica (documentada en ADR).
- Reactivación gradual con feature flag.

## 6. Comunicación

- Interna: canal privado del equipo con timeline.
- Al cliente afectado: descripción, alcance, mitigación, próximos pasos.
- A NCI Automation: reporte al responsable de seguridad.

## 7. Lecciones aprendidas

- Retrospectiva sin culpa.
- Actualización del threat model.
- Nueva prueba automatizada que cubra el vector.
- Actualización del checklist si el control faltaba.
