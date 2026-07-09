type RoutePoint = {
  label: string;
  lat: number;
  lng: number;
};

export const demoRoutes: Record<string, RoutePoint[]> = {
  canal: [
    { label: "Manzanillo International Terminal", lat: 9.36, lng: -79.88 },
    { label: "Cocosolo", lat: 9.35, lng: -79.89 },
    { label: "Las Cumbres", lat: 9.09, lng: -79.54 },
    { label: "Puerto de Balboa", lat: 8.95, lng: -79.56 },
  ],
  fuel: [
    { label: "Bahia Las Minas", lat: 9.36, lng: -79.82 },
    { label: "Panama Pacifico", lat: 8.91, lng: -79.6 },
    { label: "Aeropuerto de Tocumen", lat: 9.07, lng: -79.38 },
  ],
};

export function getDeterministicProgress(input: {
  startedAt: Date | null;
  pausedAt: Date | null;
  storedProgress: number;
  expectedDuration: number;
}) {
  if (!input.startedAt) return input.storedProgress;
  if (input.pausedAt) return input.storedProgress;

  const elapsed = (Date.now() - input.startedAt.getTime()) / 1000;
  return Math.min(1, Math.max(input.storedProgress, elapsed / input.expectedDuration));
}

export function interpolateRoute(points: RoutePoint[], progress: number) {
  if (points.length === 0) return null;
  if (points.length === 1) return points[0];

  const scaled = progress * (points.length - 1);
  const index = Math.min(points.length - 2, Math.floor(scaled));
  const local = scaled - index;
  const from = points[index];
  const to = points[index + 1];

  return {
    label: to.label,
    lat: from.lat + (to.lat - from.lat) * local,
    lng: from.lng + (to.lng - from.lng) * local,
  };
}
