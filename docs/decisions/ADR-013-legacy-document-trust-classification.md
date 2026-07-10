# ADR-013: Clasificacion de confianza para documentos legados

**Estado:** Aceptado  
**Fecha:** 2026-07-10  
**Contexto:** Cierre adversarial del pipeline de archivos

## Contexto

El pipeline de cuarentena (ADR-011) requiere que cada archivo descargable tenga un `FileAttachment` con estado `AVAILABLE`. Sin embargo, existen documentos creados antes de la implementacion del pipeline que carecen de `FileAttachment`.

Estos documentos legados se dividen en dos categorias:

1. **Generados por el sistema** (POD PDFs): sin `uploadedById`, o con `objectKey` conteniendo `/pod/`. Estos nunca fueron subidos por un usuario y se generan internamente con contenido controlado.

2. **Subidos por usuarios**: tienen `uploadedById`. Estos archivos ingresaron sin pasar por cuarentena ni escaneo antivirus.

## Decision

### Politica de acceso

- **Sin FileAttachment + sin uploadedById** (sistema): permitir descarga. El sistema los genero y su contenido es confiable.
- **Sin FileAttachment + con uploadedById** (legado usuario): bloquear con 403. No se puede garantizar que el archivo sea seguro.
- **Con FileAttachment**: respetar el estado del FileAttachment (`AVAILABLE` permite descarga, cualquier otro estado bloquea).

### Migracion

El script `files:migrate-legacy` crea registros `FileAttachment` retroactivos:

- Documentos del sistema: `status: AVAILABLE`, `quarantineKey: system/{objectKey}`
- Documentos de usuario: `status: AVAILABLE`, `quarantineKey: legacy/{objectKey}`, con nota en `scanDetail` indicando que no pasaron por AV

Ambos modos soportan `--dry-run` para inspeccion previa.

## Consecuencias

- Los documentos de usuario legados sin migrar quedan bloqueados hasta que se ejecute `files:migrate-legacy`
- Ejecutar la migracion los marca como AVAILABLE, asumiendo confianza retroactiva
- La politica fail-closed protege contra archivos no clasificados
- El script es idempotente: los documentos ya clasificados se omiten
