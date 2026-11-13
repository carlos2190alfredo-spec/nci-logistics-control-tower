# Dirección creativa — cara pública y portal del cliente

Fecha: 2026-11-13
Alcance aprobado por el dueño:
- se rediseñan la landing, el login y el portal del cliente;
- los paneles internos heredan los tokens sin cambiar su estructura;
- los selectores E2E son contrato.

## Diagnóstico breve

- **[U] Producto:** SaaS multiempresa para transportistas de carga en Panamá: solicitudes,
  viajes, conductores, evidencias y POD digital, con aislamiento por empresa.
- **[V] Datos del propio sistema:** las rutas demo cruzan el istmo.
  - Manzanillo International Terminal y Bahía Las Minas (Colón, Atlántico).
  - Puerto de Balboa y Tocumen (Pacífico).
  - Cumplimiento panameño, contenedores y mercancía peligrosa.
- **[H] Audiencia:**
  - dueños y gerentes de operaciones de transportistas medianos, que buscan control y
    evidencia;
  - clientes del transportista (navieras, industria, aviación), que quieren saber "dónde
    está mi carga" y tener la prueba de entrega.
- **[V] Estado previo:**
  - landing y login correctos pero genéricos: azul marino y naranja, sans neutra, tarjetas
    iguales;
  - la landing exponía credenciales demo;
  - el portal es funcional pero plano.

## Tres direcciones (validadas con `check_directions.py`: 9/9 ejes distintos por par)

| | A — Torre de control | **B — Manifiesto del istmo** (elegida) | C — Radar nocturno |
| --- | --- | --- | --- |
| Concepto | La consola que ya es, con precisión editorial | Cada servicio es un manifiesto que cruza el istmo de Colón a Balboa; cada hito se sella | Operación 24/7 como un radar de madrugada |
| Layout / hero | editorial-grid / captura de producto | split-asymmetric / diagrama de ruta | spatial-canvas / objeto interactivo |
| Luz / color | claro, frío | secciones mixtas: papel de manifiesto y tinta marina, cálido | oscuro, cromático |
| Tipografía | grotesca | display expresiva de ancho variable + mono técnica | mono |
| Movimiento | contenido | mecánico-técnico (trazo, sello) | fluido, generativo |
| Riesgo | bajo | medio | alto (WebGL, accesibilidad) |

**Por qué B:**
- Es la única que no serviría para un competidor: nace de la geografía real de la
  operación (Atlántico → Pacífico) y del documento central del oficio (el manifiesto y
  la prueba de entrega con sello).
- Evoluciona la marca en vez de romperla: conserva la tinta marina `#0b2338` y el naranja
  de señal.
- Se construye con SVG y CSS, sin librerías nuevas. Respeta la regla del design system de
  animar solo con CSS y protege LCP e INP.

## Sistema de la dirección B

- **Tipografía:**
  - **Archivo**, variable de ancho y peso (Google Fonts, OFL), para titulares tipo
    estampado;
  - **Geist Sans** para el cuerpo (se conserva por consistencia con los paneles);
  - **Geist Mono** para datos de manifiesto: referencias, horas, coordenadas.
- **Paleta:**

  | Rol | Valor | Contraste |
  | --- | --- | --- |
  | Papel | `#f4efe4` | — |
  | Tinta | `#0b2338` | 13,96:1 sobre papel |
  | Tinta secundaria | `#5b4a37` | 7,39:1 |
  | Señal | `#c2410c` | 4,52:1 sobre papel |
  | Señal sobre tinta | `#f59e5b` | 7,57:1 |
  | Niebla sobre tinta | `#9db2c6` | 7,33:1 |

- **Composición:**
  - columnas asimétricas: el manifiesto a la izquierda, la ruta a la derecha;
  - reglas finas de 1 px y numeración de hitos (01–06) como en un documento de embarque.
- **Gráfico firma:**
  - perfil del istmo simplificado y abstracto, no un mapa cartográfico;
  - la ruta Colón → Balboa se traza con `stroke-dashoffset`;
  - sellos circulares por hito: Solicitud, Asignación, En ruta, Entrega, Evidencia, POD.
- **Movimiento:**
  - trazo de la ruta en unos 1,6 s;
  - sello: escala 1,15 → 1 y opacidad, 180 ms, `cubic-bezier(.2,.9,.3,1.2)`;
  - con `prefers-reduced-motion` todo aparece en su estado final.
- **Accesibilidad:**
  - el diagrama es decorativo (`aria-hidden`) y su contenido está en texto real;
  - contraste AA o mejor en todos los pares de texto.

## Fuera de alcance

- Paneles internos: solo heredan tokens.
- Fotografía de stock, porque no hay material real del cliente. Todo el contenido
  comercial se limita a capacidades verificables del producto: no hay cifras, clientes ni
  testimonios inventados.
