# DeepSeek Setup Guide

## Requisitos

Solo una variable de entorno es requerida:

```
DEEPSEEK_API_KEY=sk-your-key-here
```

## Variables opcionales

| Variable | Default | Descripcion |
|----------|---------|-------------|
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | URL base de la API |
| `DEEPSEEK_MODEL` | `deepseek-v4-pro` | Modelo a usar |
| `DEEPSEEK_REASONING_EFFORT` | `high` | Esfuerzo de razonamiento (`low`/`medium`/`high`) |
| `DEEPSEEK_THINKING_ENABLED` | `true` | Habilitar thinking del modelo |
| `DEEPSEEK_TIMEOUT_MS` | `25000` | Timeout de la solicitud en ms |
| `DEEPSEEK_MAX_OUTPUT_TOKENS` | `1500` | Tokens maximos de respuesta |
| `AI_PROVIDER` | `auto` | Modo del proveedor (`auto`/`disabled`/`rules`/`deepseek`) |

## Modos del proveedor

- **auto** (default): usa DeepSeek si `DEEPSEEK_API_KEY` existe, sino motor de reglas
- **disabled**: IA desactivada para todos los tenants
- **rules**: siempre motor de reglas, sin llamadas externas
- **deepseek**: fuerza DeepSeek (falla si no hay API key)

## Sin API key

La plataforma funciona sin `DEEPSEEK_API_KEY`. El motor de reglas determinista genera respuestas para todas las funciones del copiloto. Las respuestas son menos detalladas pero funcionales.

## Verificar configuracion

```bash
pnpm app:doctor    # Muestra estado de DEEPSEEK_API_KEY
```

En la UI: `/t/[slug]/admin/operations-copilot` muestra el estado del proveedor.

## Seguridad

- La API key nunca se registra en logs
- Los errores de API sanitizan la key antes de mostrar mensajes
- El contenido de usuario se sanitiza antes de enviar al modelo
- Las respuestas del modelo se validan con Zod antes de usarlas
- `reasoning_content` del modelo nunca se persiste
- En tests, nunca se llama a la API real

## Control por tenant

Cada tenant puede activar/desactivar la IA desde `TenantAiSetting`. Un tenant con IA desactivada usa el `DisabledAiProvider` aunque `DEEPSEEK_API_KEY` este configurado.
