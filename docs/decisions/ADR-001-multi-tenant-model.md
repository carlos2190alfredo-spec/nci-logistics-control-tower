# ADR-001: Multi-Tenant Model

Estado: aceptado.

Decision: usar un modelo compartido con `tenant_id` obligatorio en entidades operativas y validacion server-side de membresia.

Motivo: permite operar multiples empresas desde una instancia local y preparar futura migracion cloud sin rehacer el dominio.
