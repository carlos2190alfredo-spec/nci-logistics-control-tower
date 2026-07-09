# ADR-005: Storage

Estado: aceptado.

Decision: usar MinIO local compatible S3 para binarios y PostgreSQL para metadata.

Motivo: evita binarios en DB, mantiene operacion local y prepara migracion futura a S3-compatible storage.
