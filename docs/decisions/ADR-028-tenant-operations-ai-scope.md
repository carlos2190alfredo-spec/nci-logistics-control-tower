# ADR-028: Alcance de Operaciones IA para Tenant

**Estado:** Aceptada
**Fecha:** 2026-07-13

## Contexto

La fase de Operaciones IA agrega capacidades de estimacion de ruta y recomendacion de conductores al nivel de tenant, sin activar IA para el dueno global de la plataforma.

## Decision

### Alcance incluido

- Estimacion de ruta con proveedores disabled/simulated/google
- Horarios de trabajo de conductores (semanal + excepciones)
- Motor de recomendacion de conductores (reglas deterministas)
- Dashboard de insights operativos para tenant admin
- Integracion en tarjetas de viaje existentes

### Excluido explicitamente

- IA para el dueno global de la plataforma
- WhatsApp real
- GPS real
- Waze real (stub preparado)
- IA externa generativa (OpenAI, Anthropic, etc.)

### Acceso por rol

| Accion | Roles permitidos |
|--------|-----------------|
| Ver insights operativos | TENANT_OWNER, TENANT_ADMIN, OPERATIONS_MANAGER |
| Calcular estimacion ruta | + DISPATCHER |
| Generar recomendacion | + DISPATCHER |
| Aceptar recomendacion | + DISPATCHER |
| Override recomendacion | + DISPATCHER |
| Gestionar horarios | TENANT_OWNER, TENANT_ADMIN, OPERATIONS_MANAGER |

### Navegacion

Se agrega "Operaciones IA" al menu de admin del tenant con icono `Gauge`.

## Consecuencias

- El dueno de la plataforma no tiene funciones IA nuevas en esta fase
- Todas las funciones nuevas respetan aislamiento multi-tenant
- El sistema funciona sin configuracion adicional (modo disabled por defecto)
