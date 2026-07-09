# ANIMATION GUIDELINES — NCI Logistics Control Tower

Fecha: 2026-07-09
Implementación: CSS puro en `src/app/globals.css` (sin librería de animación en runtime — decisión en ADR-006).

## Cuándo animar

- Entrada de página y de grupos de tarjetas (orientación espacial).
- Feedback de acción: botón en submit (spinner), hover, active scale.
- Cambios de superficie: apertura de drawer móvil, chevron de colapsables.
- Señal de vida: punto "Operación en vivo" e indicador de conectividad.

## Cuándo NO animar

- Tablas con muchas filas (el historial no anima filas).
- Nada que retrase o bloquee una acción del usuario.
- Nada en bucle infinito salvo los puntos de estado (opacidad sutil).
- Sin parallax, giros, rebotes, zoom agresivo ni elementos en movimiento constante.

## Tokens de movimiento

| Token | Valor | Uso |
|---|---|---|
| `--duration-fast` | 140 ms | Microinteracciones (hover, chevron) |
| `--duration-base` | 220 ms | Elementos (tarjetas, paneles) |
| `--duration-slow` | 320 ms | Entrada de página |
| `--ease-out-soft` | cubic-bezier(0.22, 1, 0.36, 1) | Entradas |
| `--ease-in-out-soft` | cubic-bezier(0.65, 0, 0.35, 1) | Estados continuos |

## Clases utilitarias

| Clase | Efecto | Notas |
|---|---|---|
| `.anim-page` | fade-in-up 320 ms | Una por página, en el wrapper raíz |
| `.anim-item` | fade-in-up 220 ms + stagger | `style={{ "--stagger": index }}`; el delay se limita a 8 pasos (45 ms c/u) para listas largas |
| `.anim-scale-in` | scale 0.97→1 | Mapas y paneles |
| `.anim-slide-in-left` | slide 14px | Drawer móvil, panel de login |
| `.anim-live-dot` | pulso de opacidad 2.4 s | Solo puntos de estado "en vivo" |
| `.collapsible-chevron` | rotación 180° 140 ms | `details[open]` |

Transiciones de interacción: `transition-colors`/`transition-[background-color,box-shadow,transform]` con `duration-150`, `active:scale-[0.99]` en botones, hover con elevación (`hover:shadow-md`) en tarjetas clicables. Skeletons con `animate-pulse` de Tailwind.

## Rendimiento

- Solo `transform` y `opacity` en keyframes (sin layout shift; nunca animar width/height/top/left en contenido).
- Excepción controlada: el ancho del sidebar transiciona `width` 200 ms — área fija, una vez por acción de usuario, sin reflow de contenido crítico.
- Animaciones `both` con delay acotado: nada queda invisible esperando su turno más de ~360 ms.
- Sin JavaScript de animación: cero costo de bundle y compatible con Server Components.

## Reduced motion

`@media (prefers-reduced-motion: reduce)` fuerza `animation-duration: 0.01ms`, `transition-duration: 0.01ms` y desactiva `scroll-behavior: smooth`. El contenido aparece inmediatamente; el feedback esencial (spinner de submit, estados) sigue presente porque son cambios de estado, no desplazamientos.

## Patrones prohibidos

- Añadir una librería de animación sin ADR que lo justifique.
- Animaciones >500 ms o con rebote/spring exagerado.
- Stagger sin límite en listas de longitud variable.
- Animar tablas de datos u ocultar contenido tras animaciones encadenadas.
- Bloquear input durante una animación.
