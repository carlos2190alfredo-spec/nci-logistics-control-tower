# Handoff — Auditoría independiente + remediación P0/P1

Fecha: 2026-07-10
Agente: Claude Opus 4.7
Commit base: `0141575`

Detalle completo en [docs/HANDOFF_LATEST.md](../HANDOFF_LATEST.md) y [docs/CLAUDE_SECURITY_AUDIT.md](../CLAUDE_SECURITY_AUDIT.md).

## Resumen

- Auditoría independiente: 8 hallazgos (1 P0, 3 P1, 3 P2, 1 baja) + 3 análisis de dependencia.
- Migración `20260710080000_session_metadata_and_reset_revocation` (aplicada).
- VULN-001 (P0): race condition en receipt-first transaction corregida.
- VULN-002 (P1): rotación de sesión post-login (revoca cookie previa).
- VULN-003 + VULN-004 (P1): recuperación de contraseña con Mailpit + invalidación de sesiones.
- VULN-005 (P1): página `/account/sessions` con SessionSummary sin secretos.
- VULN-007 (P2): `currentServerState` eliminado en `ASSIGNMENT_CHANGED`.
- VULN-DEP-001 (P1): AWS SDK 3.946.0 → 3.1083.0 cierra 7 advisories (1 crítica + 4 altas + 2 moderadas).
- VULN-DEP-002 y VULN-DEP-003: NOT_REACHABLE (build-time), documentadas en `docs/DEPENDENCY_REACHABILITY.md`.
- Nuevos docs: CLAUDE_SECURITY_AUDIT, SECURITY_REMEDIATION_PLAN, AUTHENTICATION_SECURITY, SESSION_MANAGEMENT, DEPENDENCY_REACHABILITY, ADR-009, ADR-010.
- 28/28 unit + 23/23 E2E + 15/15 security:check.
- Working tree limpio, sin remote, sin push.

## Contratos que futuras sesiones NO deben romper

- `SessionSummary` no debe exponer nunca `tokenHash`, `ipHash`, User-Agent completo, ni `token` en claro.
- `password-reset.ts` debe seguir aplicando `hashToken(token)` antes de persistir.
- Rutas `/recuperar/*` deben mantener `dynamic = "force-dynamic"` y `robots: noindex`.
- El endpoint `/api/t/[tenantSlug]/driver/sync` procesa el receipt como PRIMER paso de la transacción; el orden es crítico para VULN-001.
- Los E2E `SEC-AUTH-001..004` son intocables (labels, testids, headings).
- Playwright serializado `workers: 1` — no aumentar sin aislar los tests de auth.
