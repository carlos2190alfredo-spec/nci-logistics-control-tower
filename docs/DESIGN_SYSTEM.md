# DESIGN SYSTEM — NCI Logistics Control Tower

Fecha: 2026-07-09
Fuente de verdad de tokens: `src/app/globals.css`
Barrel de componentes: `src/components/ui.tsx`

## Principios

1. **Torre de control, no plantilla**: azul marino institucional para navegación e identidad, azul corporativo para acción, acentos medidos (naranja = atención/hito, teal = positivo). Nada de decoración sin función.
2. **Tokens, no hex**: los componentes consumen tokens semánticos (`bg-primary`, `text-muted-foreground`). Prohibido escribir colores hex en JSX salvo en el sistema de branding por tenant y swatches de configuración.
3. **El estado siempre en español**: los enums del dominio nunca se muestran crudos. `src/lib/ui/status.ts` centraliza etiqueta + tono por estado. Los formularios envían el valor enum (`value=enum`, `label=español`).
4. **Server-first**: los componentes del sistema son Server Components salvo necesidad real de interactividad (SubmitButton, ShellChrome, ConnectivityIndicator, SignaturePad, LoginForm).
5. **Accesible por defecto**: labels reales asociados por `htmlFor`, focus visible, `scope="col"`, `role="alert"` en errores, skip link, áreas táctiles ≥40px (≥56px en driver).
6. **Densidad por perfil**: panel operativo más denso; portal cliente más espacioso; driver con elementos grandes de alto contraste.

## Paleta y tokens

Definidos en `:root` y mapeados a utilidades Tailwind 4 vía `@theme inline`.

| Grupo | Tokens | Uso |
|---|---|---|
| Neutros | `--background #f3f6fa`, `--surface #fff`, `--surface-sunken #e9eef6`, `--muted #eef2f8`, `--border #dce3ee`, `--border-strong #c2cddf` | Fondos, tarjetas, bordes |
| Texto | `--foreground #10233b`, `--muted-foreground #4f617b`, `--faint-foreground #64748b` | Jerarquía tipográfica (todos ≥4.5:1 sobre surface) |
| Navegación | `--nav #0b2338`, `--nav-surface #12304c`, `--nav-border`, `--nav-foreground #e9f0f7`, `--nav-muted #9db2c6`, `--nav-active #f97316` | Sidebar, headers oscuros, hero |
| Acción | `--primary #1d4ed8` (+hover, soft, strong), `--secondary #0f2d46` (institucional) | Botones, enlaces, métricas |
| Acentos | `--accent #ea580c` (naranja), `--success #0f766e` (teal), `--warning #b45309`, `--danger #dc2626`, `--info #0369a1` — cada uno con `-soft` y `-strong` | Estados, badges, alertas |
| Branding tenant | `--brand-primary/secondary/accent` | Solo acentos decorativos (BrandMark, franjas); el texto nunca usa colores de tenant |
| Foco | `--focus-ring #0d9488` | Outline global 3px |

Tonos de estado (`StatusTone`): `neutral · info · progress · success · warning · danger`. Un estado = etiqueta + tono, resuelto en `status.ts`; los badges agregan punto de color (no se depende solo del color).

## Tipografía

- **Familia**: Geist Sans (UI) y Geist Mono (referencias, credenciales, hex) vía paquete `geist` (archivos locales, sin red). Variables `--font-geist-sans/mono` cargadas en `layout.tsx`.
- **Jerarquía**: h1 páginas `text-2xl font-bold tracking-tight`; display home `text-4xl/5xl`; título de tarjeta `text-base font-bold`; cuerpo `text-sm`; secundario `text-sm text-muted-foreground`; etiquetas `text-sm font-medium`; ayudas/errores `text-xs`; overlines `text-[11px] uppercase tracking-[0.12em+]`.
- **Cifras**: métricas `text-3xl font-bold tabular-nums`; toda fecha/número en listas usa `tabular-nums`. Referencias de viaje en `font-mono`.
- Máximo dos familias. No usar más pesos que 400/500/600/700.

## Espaciado, radios, sombras

- Escala Tailwind (4px). Gaps de página `gap-6`, dentro de tarjetas `gap-3/3.5/4`, chips `gap-1.5/2`.
- Radios: controles `rounded-lg` (8px), tarjetas `rounded-xl` (12px), héroe/login `rounded-2xl` (16px), badges `rounded-full`.
- Sombras frías tenues: `shadow-xs` (tarjetas en reposo), `shadow-sm/md` (hover y paneles), `shadow-lg` (drawer/hero). Definidas como tokens `--shadow-*`.
- Contenedor principal `max-w-[1400px]`; sidebar 264px (76px colapsado).
- Breakpoints: `sm 640 · md 768 · lg 1024 · xl 1280`. En grids personalizados usar SIEMPRE `minmax(0, Xfr)` para no dejar que tablas/contenido ancho rompa la proporción.

## Componentes (barrel `@/components/ui`)

| Componente | Uso |
|---|---|
| `SubmitButton` (client) | Envío con `useFormStatus`: disabled + spinner durante submit; variantes `primary/secondary/accent/success/outline/ghost/danger`, tamaños `sm/md/lg` |
| `buttonStyles` (puro) | Mismos estilos para `<Link>`/`<a>`; módulo sin `"use client"` |
| `Card`, `CardHeader` | Tarjeta base con título, descripción, icono y acciones |
| `Badge`, `StatusBadge` | Chip por tono; StatusBadge agrega punto de estado (y `pulse` para "en vivo") |
| `Field`, `TextArea`, `SelectField` | Campos con label asociado, requerido marcado, texto de ayuda con `aria-describedby` |
| `MetricCard` | Métrica con icono, valor tabular, contexto y `href` opcional |
| `EmptyState` | Vacío con icono, mensaje, explicación y acción |
| `Skeleton`, `PageSkeleton` | Carga (usados por `loading.tsx` por ruta) |
| `DataTable` + `TableHead/Body/Row/HeaderCell/Cell` | Tabla empresarial: sticky head, hover, `scope="col"`, scroll horizontal contenido |
| `Timeline`, `TimelineItem` | Línea de tiempo con marcador tonal, hora tabular y detalle |
| `Alert` | Inline info/success/warning/danger (`role="alert"` en urgentes) |
| `PageHeader` | Breadcrumb + título + descripción + meta + acciones |
| `Collapsible` | `details/summary` nativo con chevron animado (sin JS) |
| `DocumentCard` | Documento con icono por MIME, nombre legible y descarga |
| `TenantBrandingProvider`, `BrandMark` | Variables `--brand-*` desde el tenant autorizado en servidor; valida formato hex |

Shells (`@/components/shell`): `AppShell` (plataforma/tenant/portal: skip link, banner soporte, `ShellChrome` con sidebar colapsable persistente + drawer móvil + topbar con usuario y Salir) y `DriverShell` (móvil-primero, `ConnectivityIndicator` real con `navigator.onLine`).

## Estados y branding por tenant

- El branding llega SOLO de `tenant.branding` resuelto por los guards de servidor; nunca de parámetros del cliente.
- `TenantBrandingProvider` valida `#RGB/#RRGGBB` y aplica `--brand-*` al subárbol; se usa en portal para `BrandMark` y acentos. El texto y los fondos de contenido siguen usando los tokens base para garantizar contraste AA.

## Patrones prohibidos

- Hex directos en componentes de página.
- Enums del dominio visibles al usuario.
- Placeholders como sustituto de labels.
- Botones sin acción o sin estado de carga en formularios de mutación.
- `grid-cols-[Xfr_Yfr]` sin `minmax(0, …)` cuando una celda contiene tablas o texto largo.
- Iconos emoji o de más de una librería (solo Lucide, `size-4`/`size-5`, stroke por defecto).
- Texto informativo únicamente por color.
- Cambiar labels/roles usados por las pruebas E2E (`Correo`, `Contrasena`, `Entrar`, `Salir`, `Crear solicitud`, `Confirmar y convertir`, `Asignar`, `Avanzar`, `Confirmar accion`, `Reportar`, `Registrar evidencia y firma`, `Aprobar evidencia y generar POD`, testids `request-card-*`, `trip-card-*`, `driver-trip-card-*`, headings de página).
