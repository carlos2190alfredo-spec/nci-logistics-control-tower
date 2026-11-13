import { MANIFEST_STAGES } from "@/lib/ui/manifest";

/**
 * Grafico firma de la direccion "Manifiesto del istmo": el cruce de Colon
 * (Atlantico) a Balboa (Pacifico), abstracto y no cartografico, con los seis
 * hitos del manifiesto sellados en orden. Las coordenadas de los extremos son
 * las de las rutas demo del sistema. Decorativo: el contenido equivalente esta
 * en texto en la pagina (aria-hidden).
 */
const stops = [
  { x: 150, y: 74 },
  { x: 196, y: 134 },
  { x: 262, y: 164 },
  { x: 332, y: 204 },
  { x: 392, y: 252 },
  { x: 452, y: 308 },
];

export function IsthmusRoute({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={className}
      fill="none"
      focusable="false"
      viewBox="0 0 600 380"
    >
      {/* Tierra entre costas */}
      <path
        className="fill-ink-soft"
        d="M0 56 C80 40 120 76 170 60 S262 32 332 50 S470 32 600 42 L600 322 C560 350 520 336 470 330 S376 300 282 322 S92 302 0 330 Z"
      />
      {/* Lago Gatun, sugerido */}
      <path
        className="fill-ink"
        d="M168 118 C196 104 240 118 268 140 S300 182 270 186 S206 170 186 152 S150 128 168 118 Z"
        opacity="0.55"
      />
      {/* Costas */}
      <path
        className="stroke-fog/50"
        d="M0 56 C80 40 120 76 170 60 S262 32 332 50 S470 32 600 42"
        strokeWidth="1"
      />
      <path
        className="stroke-fog/50"
        d="M0 330 C92 302 186 344 282 322 S420 300 470 330 S560 350 600 322"
        strokeWidth="1"
      />
      {/* Reticula de manifiesto */}
      <g className="stroke-fog/10" strokeWidth="1">
        {[100, 200, 300, 400, 500].map((x) => (
          <line key={x} x1={x} x2={x} y1="0" y2="380" />
        ))}
      </g>

      <text
        className="fill-fog font-mono text-[10px] tracking-[0.2em]"
        x="24"
        y="28"
      >
        MAR CARIBE
      </text>
      <text
        className="fill-fog font-mono text-[10px] tracking-[0.2em]"
        x="24"
        y="364"
      >
        OCÉANO PACÍFICO
      </text>
      <text
        className="fill-fog font-mono text-[11px]"
        textAnchor="end"
        x="124"
        y="78"
      >
        COLÓN 9.36N 79.88W
      </text>
      <text
        className="fill-fog font-mono text-[11px]"
        textAnchor="end"
        x="424"
        y="322"
      >
        BALBOA
      </text>
      <text
        className="fill-fog font-mono text-[11px]"
        textAnchor="end"
        x="424"
        y="336"
      >
        8.95N 79.56W
      </text>

      {/* Ruta: se traza al entrar */}
      <path
        className="route-line stroke-signal-on-ink"
        d="M150 74 C165 104 178 124 196 134 S242 154 262 164 S312 189 332 204 S376 236 392 252 S432 292 452 308"
        pathLength={1}
        strokeLinecap="round"
        strokeWidth="2.5"
      />

      {stops.map((stop, index) => (
        // La posicion va en un <g> externo: la animacion CSS del sello usa `transform`
        // y pisaria el atributo transform del SVG si estuvieran en el mismo nodo.
        <g
          key={MANIFEST_STAGES[index]}
          transform={`translate(${stop.x} ${stop.y})`}
        >
          <g className="stamp" style={{ "--i": index } as React.CSSProperties}>
            <circle
              className="fill-ink stroke-signal-on-ink"
              r="16"
              strokeWidth="1.5"
            />
            <circle
              className="stroke-signal-on-ink/60"
              r="21"
              strokeDasharray="2 3"
              strokeWidth="1"
            />
            <text
              className="fill-paper font-mono text-[11px] font-bold"
              textAnchor="middle"
              y="4"
            >
              {String(index + 1).padStart(2, "0")}
            </text>
            <text
              className="fill-paper font-mono text-[12px] tracking-[0.12em]"
              x="28"
              y="4"
            >
              {MANIFEST_STAGES[index].toUpperCase()}
            </text>
          </g>
        </g>
      ))}
    </svg>
  );
}
