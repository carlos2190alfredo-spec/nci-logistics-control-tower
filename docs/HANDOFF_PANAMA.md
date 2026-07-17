# Informe de handoff — Adaptación logística Panamá

NCI Logistics Control Tower · Programa FASE 0–7
Fecha: 2026-07-17

---

## 1. Resumen ejecutivo

Se adaptó la plataforma SaaS multitenant existente a operación logística
integral en Panamá (contenedores, combustible, mercancías peligrosas) sin
reescribir el proyecto, preservando todo lo que ya funcionaba y añadiendo una
capa de cumplimiento configurable, módulos de contenedores y hazmat con lógica
determinista, dashboards, rentabilidad y salud de conectores. La elegibilidad y
las alertas se calculan siempre de forma determinista sobre datos verificados;
la IA nunca autoriza ni marca cumplimiento legal.

## 2. Estado inicial encontrado

Base sólida: Next.js 16 + Prisma 6 + PostgreSQL, multitenant con aislamiento,
Argon2id + sesiones opacas + MFA TOTP, cola offline (conductor + genérica),
verificación de correo, observabilidad, backups, DeepSeek con fallback por
reglas. 192 unit tests, build verde. Sin capa de cumplimiento, contenedores ni
combustible. Se corrigió un bug latente (fossil `enums.ts`) que rompía clones
frescos.

## 3. Funcionalidades preservadas

Aislamiento multitenant, auth/MFA, flujo solicitud→viaje→POD, cola offline e
idempotencia, cuarentena de archivos + EXIF, observabilidad, backups, DeepSeek
(disabled/rules/auto/deepseek) con anti-injection, portal cliente, PWA
conductor, rate-limit persistido, CI/CD. Ninguna se eliminó.

## 4. Funcionalidades nuevas

- **Capa de cumplimiento (FASE 1):** `ComplianceDocument`, `ComplianceRule`,
  cómputo determinista de vencimiento, semáforo de elegibilidad advisory en
  viajes, página "Cumplimiento" con registro y verificación.
- **Contenedores (FASE 2):** ciclo de vida de 26 estados, días
  libres/demurrage/detention deterministas, cargos, excepción de liberación,
  export CSV.
- **Combustible / hazmat (FASE 3):** órdenes con ONU/clase, readiness calculada
  desde documentos de cumplimiento reales, workflow de aprobación (humano,
  auditado), ciclo de vida, export CSV.
- **UX (FASE 4):** dashboard cross-módulo en el Resumen, "qué sigue" en lenguaje
  natural en el portal.
- **Rentabilidad (FASE 5):** líneas ingreso/costo por viaje, margen por
  viaje/cliente/ruta, export CSV restringido a OWNER/ADMIN.
- **Salud de conectores (FASE 6):** evaluación determinista + tabla de estado.

## 5. Funcionalidades modificadas

Seed con guarda de producción y datos demo Panamá; export CSV extendido
(viajes, incidencias, contenedores, hazmat, finanzas); navegación del tenant
con las nuevas secciones; permisos RBAC ampliados (compliance/containers/
hazmat/finance).

## 6. Migraciones creadas

`add_compliance_layer_core`, `add_container_operations`, `add_hazmat_shipments`,
`add_trip_financials`, `add_sync_action_receipts`, `add_email_verification_fields`
(18 migraciones en total, sin alterar históricas).

## 7. Rutas nuevas

`/t/[slug]/compliance`, `/t/[slug]/containers`, `/t/[slug]/containers/[id]`,
`/t/[slug]/hazmat`, `/t/[slug]/hazmat/[id]`, `/t/[slug]/finance`.

## 8. APIs nuevas

`GET /api/t/[slug]/export/[kind]` con kinds `trips|incidents|containers|hazmat|finance`
(finanzas restringido a OWNER/ADMIN).

## 9. Modelo de datos

67 modelos Prisma. Nuevos: ComplianceDocument, ComplianceRule, Container,
ContainerCharge, HazmatShipment, TripFinancialEntry. Todos con `tenantId` FK
(aislamiento), índices por estado/vencimiento/entidad, y enums dedicados.

## 10. Roles y permisos

Se ampliaron los permisos RBAC: `tenant.compliance.view/manage/verify`,
`tenant.containers.view/manage`, `tenant.hazmat.view/manage/approve`,
`tenant.finance.view/manage`. La aprobación de hazmat y las finanzas quedan
restringidas a roles de mando/seguridad/administración.

## 11–16. Pruebas y verificación (baseline final)

| Verificación | Resultado |
| --- | --- |
| TypeScript | ✅ 0 errores |
| Lint | ✅ 0 |
| Unit tests | ✅ **272** (29 archivos) |
| Security checks | ✅ 55/55 |
| Build producción | ✅ |
| Doctor | ✅ 27/27 |
| E2E specs | 11 (87 tests) |

Se añadieron ~80 pruebas unitarias de lógica determinista (vencimiento,
semáforo, free-time, ciclos de vida, readiness hazmat, rentabilidad, salud de
conectores) verificando además aislamiento y RBAC en vivo (p.ej. export de
finanzas devuelve 403 a operaciones).

## 17. Estado de PWA

Intacto. PWA del conductor con cola offline idempotente y sync de fotos;
funciona sin conexión.

## 18. Estado de DeepSeek

Intacto. Modos disabled/rules/auto/deepseek; opera sin API key. La IA no
participa en elegibilidad, aprobación de hazmat ni cálculo de rentabilidad.

## 19. Variables pendientes

Ninguna nueva obligatoria. Documentadas en `.env.example` (incluye
`ALLOW_PROD_SEED` para la guarda del seed).

## 20. Integraciones preparadas

GPS, WhatsApp, CRM, Facturación, IA — todas como providers `Disabled*` con
catálogo, esquema de credenciales y salud declarada. Preparadas, no conectadas.

## 21. Integraciones realmente conectadas

Ninguna externa real. Correo (SMTP/Mailpit), almacenamiento (MinIO/S3),
antivirus (ClamAV) sí operan localmente.

## 22. Riesgos

- Las reglas regulatorias concretas (categorías de licencia, PPC, permisos de
  Bomberos) deben cargarse como `ComplianceRule` configurables con fuente y
  vigencia; **no** están precodificadas.
- 2 advisories transitivas (`effect`, `postcss`) NOT_REACHABLE, con seguimiento.

## 23. Pendientes externos

Provisionar DB managed, S3, SMTP transaccional, dominio+TLS, vault de secretos,
backups programados, sink de logs. Ver `DEPLOYMENT.md`.

## 24. Próximos pasos

Cargar reglas/documentos reales de un tenant piloto; conectar una integración
real (GPS o WhatsApp) reemplazando su provider `Disabled*`; extender pruebas E2E
a los nuevos módulos.

## 25. Commits

28 commits atómicos en esta sesión (feat(compliance), feat(containers),
feat(hazmat), feat(finance), feat(integrations), feat(ux), fix, docs). Sin push
(por restricción del proyecto).

## 26. Estado del working tree

Limpio.

---

## Diferenciación de madurez

- **Completamente implementado:** capa de cumplimiento, contenedores, hazmat,
  rentabilidad, dashboards, salud de conectores, con lógica determinista
  probada y datos demo.
- **Preparado, pendiente de credenciales:** integraciones GPS/WhatsApp/CRM/
  facturación.
- **Pendiente de acceso institucional:** conectores Aduanas/SIGA/PORTCEL/
  terminales/navieras (declarados, no simulados).
- **Requiere validación de Panatruck/autoridad:** las reglas regulatorias
  concretas y sus vigencias.
- **Requiere datos reales de operación:** tarifas, permisos, hojas de seguridad.
- **Recomendado para fase posterior:** más pruebas E2E de los módulos nuevos,
  reportes PDF financieros, mantenimiento preventivo de flota.

## Advertencia de cumplimiento

La Panama Logistics Compliance Layer es un sistema configurable de registro,
verificación, alertas y elegibilidad. **No** sustituye a las autoridades
competentes (ATTT, Aduanas, Bomberos, AMP, PORTCEL, terminales, navieras,
aeropuertos) ni constituye asesoría legal. Las empresas deben validar
periódicamente los requisitos con las autoridades y asesores correspondientes.
