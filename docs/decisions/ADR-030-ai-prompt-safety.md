# ADR-030: AI Prompt Safety and Content Sanitization

**Estado:** Aceptada  
**Fecha:** 2026-07-14  
**Contexto:** ADR-029

## Contexto

Al enviar datos operativos a un LLM externo, existe riesgo de inyeccion de prompts, fuga de secretos y cross-tenant data leakage.

## Decision

1. **Deteccion de inyeccion** (18 patrones EN+ES): detecta intentos de manipulacion del modelo antes de enviar el prompt. Si se detecta, se bloquea la solicitud y se usa fallback.

2. **Sanitizacion de input**:
   - `stripSecrets()`: API keys, tokens JWT, AWS keys, GitHub tokens
   - `stripSignedUrls()`: URLs con firmas de autenticacion
   - `stripBase64()`: blobs binarios grandes
   - `stripPhones()`: numeros de telefono
   - `stripObjectKeys()`: UUIDs compuestos de storage

3. **Contenido no confiable marcado**: campos de usuario envueltos en `[CONTENIDO_USUARIO:...]` para que el modelo los trate como datos, no instrucciones.

4. **Sanitizacion de output**: la respuesta del modelo pasa por los mismos filtros de secretos antes de usarla.

5. **System prompt** incluye reglas estrictas: solo JSON, no ejecutar acciones, no cross-tenant.

## Consecuencias

- Defensa en profundidad: aun si un patron de inyeccion no se detecta, el system prompt y la validacion Zod limitan el dano
- `reasoning_content` nunca se persiste
- La API key nunca aparece en logs (sanitizeError en DeepSeekProvider)
