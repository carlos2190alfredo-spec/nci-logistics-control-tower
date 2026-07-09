# UI/UX AUDIT — NCI Logistics Control Tower

Fecha: 2026-07-09
Commit base: 2a12ddb
Screenshots de referencia: `docs/ui-audit/before/` (375 px y 1280 px por perfil)

Escala de prioridad: P1 crítico para demo comercial, P2 alto, P3 medio.

## Hallazgos globales

| # | Problema | Impacto | Pantallas | Solución propuesta | Prioridad | Estado |
|---|---|---|---|---|---|---|
| G1 | Solo existen 2 tokens CSS (`--background`, `--foreground`); colores hardcodeados en componentes (`#0f2d46` repetido en botones, firma, home) | Inconsistencia visual, branding por tenant imposible de aplicar con seguridad | Todas | Sistema completo de tokens semánticos en `globals.css` con Tailwind 4 `@theme` | P1 | Pendiente |
| G2 | Tipografía "Geist" referenciada en CSS pero nunca cargada; fallback silencioso a system-ui | Identidad visual débil, métricas y datos sin jerarquía tipográfica | Todas | Cargar tipografía real vía `next/font`, escala tipográfica documentada, `tabular-nums` para cifras | P1 | Pendiente |
| G3 | `lucide-react` instalado pero 0 iconos usados en toda la app | Interfaz plana, estados solo distinguibles por texto/color | Todas | Iconografía consistente Lucide (tamaños 16/20, stroke 2) en navegación, métricas, estados y acciones | P1 | Pendiente |
| G4 | Enums crudos en inglés mostrados al usuario final (`REQUESTED`, `EVIDENCE_SUBMITTED`, `OPEN`, `ACTIVE`) | Los usuarios operativos no hablan "enum"; aspecto de prototipo | Control, portal, driver, platform, settings | Mapa central de etiquetas en español + `StatusBadge` semántico con punto de color e icono | P1 | Pendiente |
| G5 | Sin navegación real: header con enlaces sueltos, sin estado activo, sin sidebar, sin breadcrumbs, sin menú de usuario | Desorientación; no parece SaaS empresarial | Todas | Shells por perfil con sidebar colapsable (desktop), navegación móvil, estado activo, breadcrumbs | P1 | Pendiente |
| G6 | Botones sin estado de carga ni prevención de doble envío | Doble clic genera doble acción percibida; sin feedback | Todos los formularios | `SubmitButton` con `useFormStatus`: spinner + disabled durante submit | P1 | Pendiente |
| G7 | Sin estados vacíos diseñados (texto plano "Sin viajes.") | Pantallas vacías parecen error | Control, portal, driver | Componente `EmptyState` con icono, mensaje y acción | P2 | Pendiente |
| G8 | Sin skeletons ni `loading.tsx`; pantalla en blanco durante navegación server-side | Percepción de lentitud | Todas | `loading.tsx` por ruta con skeletons de layout | P2 | Pendiente |
| G9 | Sin páginas 404 / error / acceso denegado diseñadas | Errores muestran pantalla Next.js por defecto | Global | `not-found.tsx` y `error.tsx` con recuperación | P2 | Pendiente |
| G10 | Cero animaciones/microinteracciones; sin `prefers-reduced-motion` | Interfaz estática, transiciones bruscas | Todas | Sistema de animación CSS (tokens de duración/easing, entrada de página, stagger, hover) respetando reduced motion | P2 | Pendiente |
| G11 | Fechas repetidas con formato completo en listas largas; sin `tabular-nums` | Ruido visual, difícil escaneo | Portal, control | Formato corto en listas, completo en detalle | P3 | Pendiente |

## Hallazgos por pantalla

| # | Problema | Impacto | Pantalla | Solución propuesta | Prioridad | Estado |
|---|---|---|---|---|---|---|
| H1 | Hero plano con tarjeta de credenciales como foco; mitad inferior vacía | Primera impresión débil para demo comercial | Home | Hero de torre de control con identidad visual, credenciales demo colapsadas como sección secundaria | P2 | Pendiente |
| L1 | Copy técnico visible al usuario ("Sesion opaca local con cookie httpOnly") | Lenguaje de desarrollador en pantalla de negocio | Login | Copy empresarial, panel visual de marca, mismos labels/roles accesibles | P2 | Pendiente |
| P1 | Métricas sin icono, contexto ni acción; mismas jerarquías para todo | No comunica qué requiere atención | Platform | `MetricCard` con icono, contexto y enlace | P2 | Pendiente |
| P2 | Tabla básica sin hover, sin alineación numérica, acción "Abrir" como texto suelto | Legibilidad pobre | Platform | Tabla empresarial consistente (hover, th scope, números tabulares, acción con icono) | P2 | Pendiente |
| C1 | **La pantalla más crítica es la más débil**: lista única de ~25 tarjetas de viaje mezclando cerrados y activos; scroll >10.000 px | Centro de operaciones inutilizable con datos reales | Centro de control | Lista operativa = viajes activos; historial reciente compacto separado; detalle expandible por viaje | P1 | Pendiente |
| C2 | Bug UX/flakiness: `take: 20` por `scheduledAt asc` deja viajes nuevos fuera de la lista (causó fallo E2E baseline con datos acumulados) | Operaciones no ve el viaje recién confirmado; E2E frágil | Centro de control | La lista operativa excluye CLOSED/CANCELLED y el viaje nuevo siempre aparece | P1 | Pendiente |
| C3 | Cada tarjeta repite 3 formularios completos (asignar/avanzar/incidencia) aunque no apliquen al estado del viaje | Ruido extremo, riesgo de error operativo | Centro de control | Mostrar solo acciones válidas según estado; incidencia como sección colapsable | P1 | Pendiente |
| C4 | Métricas sin significado operativo (p. ej. "Notificaciones: 8") y sin estados de alerta | No responde "¿qué requiere mi atención?" | Centro de control | Métricas operativas: solicitudes nuevas, activos, evidencias por aprobar, incidencias abiertas, flota disponible | P1 | Pendiente |
| C5 | Sin panel de incidencias ni actividad reciente visibles pese a consultarse en la query | Información cargada pero no mostrada | Centro de control | Panel lateral de incidencias y actividad reciente | P2 | Pendiente |
| PO1 | Formulario de solicitud: 16 campos en una columna sin secciones ni ayudas | Abandono/errores de captura; no premium | Portal | Secciones (Ruta y fecha / Contenedor / Contacto / Preferencias), 2 columnas en desktop, ayudas | P1 | Pendiente |
| PO2 | Timeline como líneas de texto repetitivas con timestamp completo | Ilegible; el valor (trazabilidad) no se percibe | Portal | Componente `Timeline` visual con hitos, iconos y jerarquía | P1 | Pendiente |
| PO3 | Documentos como lista de nombres de archivo crudos (`evidence-71119007-...png`) | No parece un portal de documentos empresarial | Portal | `DocumentCard` con tipo, icono, fecha y acción de descarga | P2 | Pendiente |
| PO4 | Branding del tenant no aplicado en el portal (colores seed sin uso) | El portal no se siente "entregado por su transportista" | Portal | Acento de marca del tenant en franja/identidad, con contraste seguro | P2 | Pendiente |
| D1 | Cada viaje muestra 3 formularios completos siempre visibles (avance + incidencia + evidencia) | El conductor debe hacer scroll enorme; riesgo de tocar lo equivocado | Driver | Acción siguiente dominante; incidencia y evidencia como secciones colapsables; evidencia solo en estados de entrega | P1 | Pendiente |
| D2 | Firma aparece pre-dibujada con curva demo | Confuso y legalmente cuestionable | Driver | Canvas de firma vacío con hint "Firme aquí"; botón limpiar | P1 | Pendiente |
| D3 | Banner técnico sobre IndexedDB/PWA visible al conductor | Lenguaje de desarrollador | Driver | Indicador real de conectividad (online/offline con `navigator.onLine`) | P2 | Pendiente |
| D4 | Estados del viaje en select con enums crudos | El conductor no entiende `EN_ROUTE_TO_ORIGIN` | Driver | Etiquetas en español en las opciones (valor = enum para compatibilidad) | P1 | Pendiente |
| S1 | Branding mostrado como texto hex sin muestra de color; límites de plan como texto plano | Configuración se siente inacabada | Settings | Swatches de color, barras de uso de límites, tarjetas ordenadas | P3 | Pendiente |
| A1 | Sin `aria-live` en error de login; tablas sin `scope`; sin skip link | Accesibilidad AA incompleta | Global | `role="alert"` en errores, `scope="col"`, skip link en shells | P2 | Pendiente |
| R1 | Móvil: tablas desbordan; formulario de asignación de 3 selects colapsa mal; sin navegación móvil | Uso en tableta/teléfono deficiente | Global | Navegación móvil, tablas con scroll contenido o vista tarjeta, formularios apilados | P1 | Pendiente |

## Inventario de componentes previo

- `AppShell` (header simple), `Card`, `Badge` (5 tonos), `SubmitButton`, `Field`, `TextArea`, `LoginForm`, `SignaturePad`, `TripMap`, `RegisterServiceWorker`. Sin librería de componentes externa. Sin sistema de tokens. Iconos: ninguno.

## Plan visual aprobado en esta sesión

Dirección: torre de control logística — azul marino profundo institucional + azul corporativo de acción + acentos naranja (hitos/alertas) y teal (positivo), neutros fríos, tipografía Geist con cifras tabulares, iconografía Lucide, animaciones CSS discretas (sin librería nueva de runtime). Detalle completo en `docs/DESIGN_SYSTEM.md` y `docs/ANIMATION_GUIDELINES.md`.
