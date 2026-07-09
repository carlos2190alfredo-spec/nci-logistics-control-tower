# ADR-006: Sistema de diseño con tokens CSS, tipografía local y animaciones sin librería

Fecha: 2026-07-09
Estado: Aceptada

## Contexto

El rediseño visual integral (auditoría en `docs/UI_UX_AUDIT.md`) requería: tokens semánticos, tipografía real, iconografía, navegación por perfil, estados en español y animaciones accesibles — sin romper el flujo E2E validado, sin debilitar el aislamiento multitenant y sin volver la app pesada.

## Decisiones

1. **Tokens semánticos en CSS con Tailwind 4 `@theme inline`** (`src/app/globals.css`). Sin `tailwind.config` de colores ni librería de theming. El branding por tenant se inyecta como variables `--brand-*` desde datos autorizados en servidor (`TenantBrandingProvider`), limitado a acentos decorativos.
2. **Tipografía Geist mediante el paquete npm `geist@1.5.1` (pinneado)**. Archivos de fuente locales servidos por `next/font`; no hay dependencia de red en build ni runtime (compatible con la restricción de infraestructura local). Alternativa descartada: `next/font/google` (requiere red en build).
3. **Animaciones con CSS puro; NO se incorpora Framer Motion**. Motivos: (a) las páginas son Server Components con server actions y Framer Motion exigiría convertir árboles completos a Client Components, (b) costo de bundle (~30 kB+) sin beneficio para el tipo de animación requerido (entradas, stagger, feedback), (c) `prefers-reduced-motion` se resuelve con una media query global. Guía en `docs/ANIMATION_GUIDELINES.md`.
4. **Iconografía única: lucide-react** (ya instalada, tree-shakeable, compatible con RSC). Tamaños 16/20 px.
5. **Componentes propios sin librería de UI externa** (sin shadcn/radix): la superficie de componentes necesaria es acotada, los colapsables usan `details/summary` nativo y los formularios son server-action-first. Barrel en `src/components/ui.tsx`.
6. **Estados del dominio centralizados en `src/lib/ui/status.ts`**: etiqueta en español + tono semántico por enum; los formularios conservan `value=enum` para no tocar el backend ni las pruebas.
7. **Lista operativa del centro de control = viajes activos** (excluye `CLOSED/CANCELLED`, `take 30`) con historial reciente separado. Corrige el defecto por el cual un viaje nuevo podía quedar fuera del `take: 20` ordenado por `scheduledAt asc` (causa del fallo E2E baseline con datos acumulados).

## Consecuencias

- Cero dependencias nuevas de runtime salvo `geist` (solo fuentes).
- Las páginas siguen siendo Server Components; los únicos Client Components son: SubmitButton, ShellChrome, ConnectivityIndicator, SignaturePad, LoginForm, error boundary.
- Los selectores E2E (labels, roles, testids, headings) se conservaron; el contrato visual queda documentado como "patrones prohibidos" en `docs/DESIGN_SYSTEM.md`.
- Riesgo aceptado: `src/generated/prisma` contiene artefactos mixtos de dos generadores (preexistente); los tipos nuevos (`ProofStatus`, `Prisma`) se importan desde la raíz del cliente generado.
