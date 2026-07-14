# ADR-029: DeepSeek Provider Integration

**Estado:** Aceptada  
**Fecha:** 2026-07-14  
**Contexto:** ADR-024, ADR-028

## Contexto

La plataforma usa un motor de reglas determinista para recomendaciones de conductores y analisis operativo. Los operadores requieren explicaciones en lenguaje natural y analisis de riesgos que superan las capacidades del motor de reglas.

## Decision

Integrar DeepSeek como proveedor de LLM externo con patron disabled-first:

1. **Provider Factory** (`auto | disabled | rules | deepseek`):
   - `auto`: usa DeepSeek si `DEEPSEEK_API_KEY` existe, sino reglas
   - En `NODE_ENV=test`: siempre reglas (sin llamadas externas)
   - Control por tenant: `TenantAiSetting.enabled`

2. **Solo una variable requerida**: `DEEPSEEK_API_KEY`
   - Defaults: `DEEPSEEK_MODEL=deepseek-v4-pro`, `DEEPSEEK_TIMEOUT_MS=25000`

3. **Fallback automatico**: si DeepSeek falla (401, 429, 5xx, timeout), cae a RulesBasedAiProvider

4. **Validacion de output**: Zod valida toda respuesta del LLM; si falla el parse, retorna fallback

## Consecuencias

- DeepSeek solo explica y analiza; las decisiones las toma el motor de reglas
- Sin API key, la plataforma funciona igual con motor de reglas
- Los tests nunca llaman APIs externas
- Cada invocacion se registra en AiInvocation para auditoria
