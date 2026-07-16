# ADR-034: Panama Logistics Compliance Layer — núcleo (FASE 1, corte 1)

Estado: Aceptado
Fecha: 2026-07-16

## Contexto

El programa de adaptación a operación logística panameña (contenedores,
combustible, mercancías peligrosas) requiere una capa central de cumplimiento:
registro documental con vencimientos, reglas regulatorias configurables y un
motor de elegibilidad determinista antes de asignar/despachar un viaje.

Restricción central del programa: **ninguna decisión de IA marca elegibilidad
legal**; la elegibilidad se calcula con reglas deterministas sobre datos
verificados. Ninguna regla regulatoria se codifica como verdad inmutable: cada
una exige fuente, autoridad, fecha de vigencia, severidad y es configurable por
tenant. La capa no sustituye a las autoridades (ATTT, Aduanas, Bomberos, AMP,
PORTCEL, terminales, navieras) ni constituye asesoría legal.

## Decisión

Este primer corte entrega el **núcleo de datos y la lógica determinista de
vencimiento**, sin UI todavía (cortes siguientes):

1. **Modelos Prisma** (migración `20260716192225_add_compliance_layer_core`):
   - `ComplianceDocument`: documento con vencimiento, criticidad
     (`ComplianceSeverity`), `blocksDispatch`, confidencialidad, ventanas de
     alerta (`alertDaysBefore` por defecto [120,90,60,30,15,7,3]), verificación
     (quién/cuándo/fuente), versión, hash de archivo, notas. Relación
     polimórfica `entityType` (`ComplianceEntityType`) + `entityId`; solo
     `tenantId` es FK dura (aislamiento multitenant). Índices por
     (tenant, entityType, entityId), (tenant, status), (tenant, expiresAt),
     (tenant, blocksDispatch).
   - `ComplianceRule`: regla regulatoria configurable con `authority`,
     `sourceUrl`, `publishedAt`, `verifiedAt`, `effectiveFrom`, `severity`,
     `condition`, `recommendedAction`, `blocks`, `active`, `version`,
     `reviewerId`. Nunca inmutable.
   - Enums: `ComplianceEntityType`, `ComplianceDocStatus`,
     `ComplianceSeverity`, `ComplianceConfidentiality`.

2. **Módulo determinista puro** `src/lib/compliance/expiry.ts`:
   - `computeExpiry({ expiresAt, alertDaysBefore, now })` →
     SIN_VENCIMIENTO / VIGENTE / PROXIMO_A_VENCER / VENCIDO, con
     `daysUntilExpiry` y umbral de alerta cruzado.
   - `reconcileStatus(manual, derived)`: los estados terminales fijados a mano
     (RECHAZADO, SUSPENDIDO, REEMPLAZADO, NO_APLICABLE, PENDIENTE, EN_REVISION)
     tienen prioridad sobre la derivación por fechas.
   - `documentBlocksNow({ blocksDispatch, status })`: base del futuro motor de
     elegibilidad.
   - 13 pruebas unitarias; sin dependencia de DB ni IA.

## Corrección incidental: fossil `enums.ts`

Durante la implementación se descubrió que `src/generated/prisma/enums.ts` era
un artefacto **fósil** de un generador anterior (`prisma-client`, TS-first) que
dejó de regenerarse tras cambiar el generador del schema a `prisma-client-js`.
El directorio `/src/generated/prisma` está en `.gitignore`, así que el archivo
sobrevivía entre sesiones sin actualizarse, y no incluía enums nuevos. Un clon
fresco (`pnpm install` → `postinstall: prisma generate`) habría fallado el
typecheck/build porque `@/generated/prisma/enums` no se genera.

Corrección: repointar los 15 imports de `@/generated/prisma/enums` al índice
canónico `@/generated/prisma`, que sí se regenera correctamente y exporta todos
los enums. Los imports de tipos (`import type`) se borran en compilación, por lo
que los componentes cliente no cargan el motor de Prisma. El único import de
valor (`NotificationChannel` en `notifications.ts`, server-side) ya importaba el
cliente completo, sin regresión de bundle.

## Consecuencias

**Positivas:**
- Base de datos y lógica de vencimiento listas y probadas para construir sobre
  ellas el registro documental (UI), las alertas y el motor de elegibilidad.
- Eliminado un bug latente que rompía clones frescos / CI.
- La derivación de estado es determinista y auditable; la IA no participa.

**Pendiente (cortes siguientes de FASE 1):**
- Server actions CRUD para documentos y reglas (con auditoría + RBAC).
- UI de "Cumplimiento y Documentos" (listado, alertas, criticidad).
- Motor de elegibilidad (semáforo verde/amarillo/rojo/gris/azul) que combine
  documentos + reglas + compatibilidades antes de asignar/despachar.
- Excepciones aprobadas con justificación, alcance, evidencia y expiración.
- Job de alertas de vencimiento por canal.

## Referencias

- `docs/PANAMA_LOGISTICS_AUDIT_FASE0.md` (auditoría y baseline).
- Migración: `prisma/migrations/20260716192225_add_compliance_layer_core/`.
- Código: `src/lib/compliance/expiry.ts` (+ pruebas).
