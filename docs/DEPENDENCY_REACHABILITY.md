# DEPENDENCY REACHABILITY

Fecha: 2026-07-10

Análisis de alcanzabilidad de cada advisory reportado por `pnpm audit --prod`. Cada entrada incluye la evidencia por la que se clasifica, la cadena de dependencia y la condición que forzaría reevaluación.

## Estado tras la fase actual

- Base previa: 9 advisories.
- Tras `pnpm add @aws-sdk/client-s3@3.1083.0 @aws-sdk/s3-request-presigner@3.1083.0`: 2 advisories, ambas NO ALCANZABLES.

## Advisories cerradas

Las siete advisories sobre `fast-xml-parser@5.2.5` (1113153, 1113568 crítica, 1113569, 1114153, 1115339, 1116307, 1117911) quedaron eliminadas porque el nuevo `@aws-sdk/xml-builder@3.972.34` (transitivo de `@aws-sdk/client-s3@3.1083.0`) **ya no depende de `fast-xml-parser`** — solo depende de `@smithy/types` y `tslib`. Verificado con:

```
pnpm view @aws-sdk/xml-builder@3.972.34 dependencies
# → { "@smithy/types": "^4.16.0", "tslib": "^2.6.2" }
```

## Advisories abiertas — NO ALCANZABLES

### effect@3.18.4 (advisory 1115356, alta)

- Título: "Effect AsyncLocalStorage context lost/contaminated inside Effect fibers".
- Cadena: `logistics-control-tower > prisma > @prisma/config@6.19.1 > effect@3.18.4`. Ambién por `@prisma/client > prisma`.
- Clasificación: **BUILD_TIME_ONLY / NOT_REACHABLE_IN_CURRENT_USAGE**.
- Evidencia:
  - `@prisma/config` se importa **solo** por el CLI de Prisma (comandos `prisma migrate`, `prisma generate`, `prisma studio`), en pasos discretos de desarrollo o despliegue. **No** participa del bundle del servidor Next.js (`next build` no lo importa).
  - La vulnerabilidad requiere fibras `Effect` con `AsyncLocalStorage` compartido bajo carga concurrente. La CLI de Prisma es proceso corto sin ese patrón.
  - `grep -R "from \"effect\"" src` → sin resultados.
  - `grep -R "@prisma/config" src` → sin resultados.
- Condición para reevaluar: si adoptamos `@prisma/client` v7 (major upgrade con `@prisma/config@7.8.0` que incluye `effect >= 3.20.0`), o si integramos `effect` directamente en runtime.
- Acción: **aceptado con seguimiento**. Revisión trimestral o cuando Prisma 6.x publique patch. Próxima revisión: 2026-10-10.

### postcss@8.4.31 (advisory 1117015, moderada)

- Título: "PostCSS has XSS via Unescaped `</style>` in its CSS Stringify Output".
- Cadena: `logistics-control-tower > next@16.2.10 > postcss@8.4.31` (dev-only transitiva; también en `next > geist > postcss`).
- Clasificación: **BUILD_TIME_ONLY / NOT_REACHABLE_IN_CURRENT_USAGE**.
- Evidencia:
  - PostCSS se ejecuta durante `next build` para procesar CSS. La vulnerabilidad afecta al output serializado cuando se procesa CSS controlado por atacante.
  - Nuestro CSS es 100 % estático (Tailwind + `globals.css`). Ningún input de usuario alcanza el pipeline PostCSS.
  - `grep -RE "process(css|Css)" src` → sin resultados.
  - Impacto en runtime del servidor: cero.
- Condición para reevaluar: si aceptamos CSS dinámico controlado por tenant o si Next libera versión con `postcss >= 8.5.10` (esperado en Next 16.3+).
- Acción: **aceptado con seguimiento**. Revisión mensual del changelog de Next.js. Próxima revisión: 2026-08-10.

## Reglas de despliegue relacionadas

### X-Forwarded-For sin sanitizar

Nuestro rate limit usa `X-Forwarded-For` para identificar clientes. Si se despliega detrás de un proxy no confiable, un atacante puede forjar la IP:

- Nginx: `real_ip_header X-Forwarded-For; set_real_ip_from <trusted cidr>;`.
- HAProxy: `option forwardfor`.
- Cloudflare: usar `CF-Connecting-IP`.

Sin proxy delante (localhost, dev, single-node), el valor por defecto `"local"` protege el rate limit.

## Herramientas de seguimiento

- `pnpm audit --prod` — ejecutar tras cada `pnpm install` o cambio de dependencias.
- `pnpm security:audit` — alias que agrega `|| true` para no fallar el CI local.
- Revisión trimestral de este documento; actualizar tras cada fase.

## Historial

| Fecha | Cambio |
|---|---|
| 2026-07-09 | Fase offline+hardening: `nodemailer` 7 → 9.0.3 (cerró 4 advisories). |
| 2026-07-10 | Auditoría independiente + remediación: `@aws-sdk/client-s3` 3.946.0 → 3.1083.0 (cerró 7 advisories `fast-xml-parser`). Restantes: 2 no alcanzables. |
