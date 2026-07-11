# ADR-015: Estrategia de actualizacion PWA

**Estado:** Aceptado  
**Fecha:** 2026-07-11  
**Contexto:** PWA instalable para conductor con actualizaciones controladas

## Contexto

La aplicacion del conductor opera en dispositivos moviles con conectividad intermitente. Necesita ser instalable como PWA para acceso rapido y funcionar offline. Las actualizaciones del service worker deben ser controladas para evitar interrumpir operaciones en curso (como captura de evidencia o envio de firma).

## Decision

### Actualizaciones controladas (no skipWaiting inmediato)

El service worker NO ejecuta `self.skipWaiting()` en el evento `install`. En su lugar:

1. El nuevo SW se instala y queda en estado `waiting`
2. `register-service-worker.tsx` detecta el SW en espera via `updatefound` + `statechange`
3. Se muestra un banner azul "Nueva version disponible" con boton "Actualizar"
4. Solo cuando el usuario presiona el boton se envia `postMessage({ type: "SKIP_WAITING" })`
5. El handler `controllerchange` ejecuta `window.location.reload()` para activar la nueva version

### Proteccion contra recarga en primera instalacion

El handler de `controllerchange` incluye un guard:
```
const hadController = !!navigator.serviceWorker.controller;
if (!hadController || refreshing) return;
```

Esto evita que `self.clients.claim()` durante la primera instalacion dispare una recarga innecesaria que rompia 9 tests E2E.

### Estrategia de cache

- **SHELL_URLS**: cache-first para paginas estaticas (`/login`, `/offline`)
- **Hashes de assets** (`/_next/static`): cache-first, inmutable
- **APIs autenticadas**: network-only, nunca cacheadas
- **Navegacion offline**: cuando fetch falla para requests de navegacion, retorna `/offline` del cache
- **CACHE_VERSION**: `nci-lct-v3`, se incrementa para forzar renovacion de cache

### Manifiesto instalable

- `display: standalone`, `orientation: portrait-primary`
- Iconos PNG: 192x192, 512x512, maskable 512x512
- `start_url: /login`, `lang: es`
- `beforeinstallprompt` capturado para mostrar banner de instalacion

## Consecuencias

- El conductor controla cuando se aplica la actualizacion
- No se pierde trabajo en curso durante actualizaciones
- Las APIs autenticadas y datos sensibles nunca se cachean
- La pagina `/offline` siempre esta disponible en el cache del SW
