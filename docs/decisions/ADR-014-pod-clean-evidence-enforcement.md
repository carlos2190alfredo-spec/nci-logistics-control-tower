# ADR-014: Enforcement de evidencia limpia en POD

**Estado:** Aceptado  
**Fecha:** 2026-07-10  
**Contexto:** Cierre adversarial del pipeline de archivos

## Contexto

El POD (Proof of Delivery) es un PDF generado por el sistema que incluye documentos de evidencia (fotos subidas por el conductor). Antes de esta decision, el POD incluia todos los documentos con `visibility: CUSTOMER_VISIBLE` sin verificar su estado de escaneo antivirus.

Un archivo infectado o en cuarentena podria ser referenciado en un POD, generando riesgo para el cliente que lo descarga.

## Decision

### Filtrado en generacion de POD

La funcion `generatePodPdf` ahora filtra documentos:

1. Obtiene todos los `FileAttachment` del viaje con estado `AVAILABLE`
2. Construye un `Set<string>` de `objectKey` disponibles
3. Para cada documento `CUSTOMER_VISIBLE`:
   - Si no tiene `uploadedById` (generado por sistema): incluir siempre
   - Si tiene `uploadedById` (subido por usuario): incluir solo si su `objectKey` esta en el set de disponibles

### Gating en descarga de POD

La ruta `/api/t/[tenantSlug]/proof/[tripId]` ahora verifica el `FileAttachment` del documento POD antes de servir la descarga. Si el FileAttachment existe y no esta en `AVAILABLE`, retorna 403.

### Verificacion en approveProofAction

La accion que aprueba el POD ahora incluye `fileAttachments: true` en su query para que la funcion de generacion tenga acceso a los estados.

## Consecuencias

- Los PODs generados solo contienen evidencia verificada como limpia
- Un archivo que pasa a INFECTED despues de generar el POD no afecta al PDF ya generado (el PDF es un snapshot)
- Los documentos generados por el sistema (como el propio POD) no requieren FileAttachment para ser incluidos
- El E2E-FLOW-001 verifica el flujo completo desde solicitud hasta cierre POD con esta logica activa
