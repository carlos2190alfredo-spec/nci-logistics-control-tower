# ADR-032: Copilot UI Pattern (Explain + Prioritize Only)

**Estado:** Aceptada  
**Fecha:** 2026-07-14  
**Contexto:** ADR-029, ADR-028

## Contexto

La IA podria ejecutar acciones automaticamente (asignar conductores, cancelar viajes). Esto introduce riesgos operativos y legales significativos.

## Decision

1. **Solo explica y prioriza**: el copiloto genera resumenes, analisis de riesgo y explicaciones. Nunca ejecuta acciones operativas.

2. **Acciones sugeridas**: las sugerencias de la IA se muestran como texto informativo. El operador decide si actuar.

3. **Formularios HTML nativos**: los botones de accion del copiloto son forms con server actions. No hay ejecucion automatica de sugerencias de la IA.

4. **Transparencia del proveedor**: la UI muestra que proveedor se uso (DeepSeek vs reglas) y si hubo fallback.

5. **Mensaje claro**: "Las sugerencias son informativas — las decisiones son suyas."

## Consecuencias

- El motor de reglas sigue siendo la autoridad para asignaciones
- No hay riesgo de que la IA ejecute acciones destructivas
- Los operadores mantienen control total
- La IA agrega valor al explicar decisiones del motor de reglas en lenguaje natural
