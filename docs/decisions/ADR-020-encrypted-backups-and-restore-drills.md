# ADR-020 — Backups cifrados y drill de restauracion

Fecha: 2026-07-12
Estado: Aceptado

## Contexto

El sistema no tenia backups cifrados ni un mecanismo verificado de restauracion. Un fallo de disco, corrupcion de datos o eliminacion accidental dejaria sin recuperacion. El SECURITY_CHECKLIST.md lo listaba como pendiente para la fase "antes de nube".

## Decision

### Cifrado

Todos los backups se cifran con AES-256-GCM usando `BACKUP_ENCRYPTION_KEY` (64 chars hex = 32 bytes). El formato de archivo es:

```
[NCIBAK01][IV 16 bytes][ciphertext...][AuthTag 16 bytes]
```

Los dumps sin cifrar se eliminan automaticamente despues de cifrar.

### Alcance

| Componente | Metodo | Contenido |
|---|---|---|
| PostgreSQL | `pg_dump` via Docker + cifrado | Esquema completo + datos |
| MinIO | Descarga de objetos + tar + cifrado | Todos los archivos del bucket |
| Configuracion | Bundle JSON + cifrado | docker-compose, package.json, schema, tsconfig, next.config |

### Checksums

Cada entrada del manifiesto incluye SHA-256 del archivo original y del archivo cifrado. La restauracion verifica ambos checksums antes de proceder.

### Manifiesto

```json
{
  "version": "1.0",
  "createdAt": "ISO timestamp",
  "hostname": "machine",
  "entries": [{ "filename", "type", "originalSize", "encryptedSize", "sha256", "encryptedSha256", "iv", "authTag", "metadata" }],
  "totalOriginalSize": number,
  "totalEncryptedSize": number,
  "entryCount": number
}
```

### Restauracion aislada

La restauracion siempre usa destinos aislados:
- PostgreSQL: base de datos `nci_logistics_restore_test` (creada, verificada, eliminada)
- MinIO: bucket `nci-logistics-restore-test` (creado, verificado, vaciado)

Nunca se restaura directamente sobre la base de produccion.

### Drill de recuperacion

`pnpm backup:drill` ejecuta el ciclo completo:
1. Backup de PostgreSQL, MinIO y configuracion
2. Verificacion de integridad (checksums del manifiesto)
3. Restauracion a destinos aislados
4. Verificacion de tablas criticas y conteos de objetos
5. Limpieza de destinos de prueba
6. Generacion de reporte JSON

### Exclusiones de seguridad

- `.env.local`, `.env.production` y archivos con "credentials" o "secret" en el nombre se excluyen del backup de configuracion
- El directorio `/backups/` esta en `.gitignore`
- Las claves de cifrado nunca se incluyen en el backup

## Alternativas consideradas

1. **Backup sin cifrado**: rechazado — los dumps contienen hashes de contrasenas, secretos MFA cifrados y datos de negocio.
2. **GPG en lugar de AES-256-GCM**: rechazado — requiere gestion de claves asimetricas; AES-GCM es suficiente para backups locales con clave simetrica.
3. **Backup incremental**: diferido — la escala actual no lo justifica. Candidato para fase futura con WAL archiving.

## Consecuencias

- Backup completo en ~2s para la escala actual (~3 MB cifrados)
- Restauracion verificada en ~5s
- `BACKUP_ENCRYPTION_KEY` debe custodiarse fuera del repositorio
- Perdida de la clave impide restaurar backups existentes

## Decisiones derivadas

| # | Decision | Razon |
|---|---|---|
| 1 | AES-256-GCM con clave simetrica | Misma primitiva que MFA; suficiente para backups locales |
| 2 | Formato binario con magic header `NCIBAK01` | Deteccion rapida de archivos corruptos o no cifrados |
| 3 | Restauracion a DB/bucket aislados | Evita corrupcion accidental de datos de produccion |
| 4 | Eliminacion automatica de dumps sin cifrar | No dejar datos sensibles en disco sin proteccion |
| 5 | Checksums SHA-256 en manifiesto | Verificacion de integridad end-to-end |
| 6 | Reporte JSON del drill | Evidencia auditable de que el restore funciona |
