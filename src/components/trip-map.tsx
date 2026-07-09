import { interpolateRoute, getDeterministicProgress } from "@/lib/domain/gps";

type TripMapProps = {
  routePoints: unknown;
  simulationStartedAt: Date | null;
  simulationPausedAt: Date | null;
  simulationProgress: number;
  expectedDuration: number;
};

export function TripMap(props: TripMapProps) {
  const points = Array.isArray(props.routePoints)
    ? props.routePoints.filter((point): point is { label: string; lat: number; lng: number } => {
        return typeof point === "object" && point !== null && "lat" in point && "lng" in point && "label" in point;
      })
    : [];
  const progress = getDeterministicProgress({
    startedAt: props.simulationStartedAt,
    pausedAt: props.simulationPausedAt,
    storedProgress: props.simulationProgress,
    expectedDuration: props.expectedDuration,
  });
  const current = interpolateRoute(points, progress);

  return (
    <div className="control-map relative min-h-72 overflow-hidden rounded-lg border border-slate-200">
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 600 280" role="img" aria-label="Mapa local de ruta demo">
        <path d="M60 210 C 150 80, 260 210, 360 100 S 510 80, 550 180" fill="none" stroke="#2563eb" strokeWidth="7" strokeLinecap="round" />
        <path d="M60 210 C 150 80, 260 210, 360 100 S 510 80, 550 180" fill="none" stroke="#14b8a6" strokeWidth="3" strokeDasharray="10 10" strokeLinecap="round" />
        <circle cx={60 + progress * 490} cy={210 - Math.sin(progress * Math.PI) * 115} r="12" fill="#f97316" />
      </svg>
      <div className="absolute bottom-4 left-4 rounded-md bg-white/90 p-3 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">GPS Demo</p>
        <p className="font-semibold text-slate-950">{current?.label ?? "Ruta sin puntos"}</p>
        <p className="text-sm text-slate-600">{Math.round(progress * 100)}% completado</p>
      </div>
    </div>
  );
}
