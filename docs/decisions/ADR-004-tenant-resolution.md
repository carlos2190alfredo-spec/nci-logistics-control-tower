# ADR-004: Tenant Resolution

Estado: aceptado.

Decision: en localhost el tenant se resuelve por ruta `/t/[tenantSlug]`. El slug solo identifica candidato; la autorizacion requiere membresia activa.

Motivo: es simple para desarrollo local y compatible con subdominios futuros.
