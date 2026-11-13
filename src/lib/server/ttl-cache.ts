/**
 * Caché en memoria con TTL y "single flight" para una sola clave.
 *
 * - Mientras el valor está vigente se devuelve sin volver a calcularlo.
 * - Si varias peticiones llegan con el caché vencido, comparten un único cálculo en curso
 *   (evita que una ráfaga multiplique las consultas a Postgres, S3 o el gateway).
 * - Un cálculo fallido no se cachea: la siguiente petición lo reintenta.
 *
 * El estado vive en la instancia serverless (no se comparte entre instancias); es una
 * protección de carga, no una fuente de verdad.
 */
export type SingleFlightTtlCache<T> = {
  get(load: () => Promise<T>): Promise<T>;
  /** Descarta el valor cacheado (pruebas). */
  reset(): void;
};

export function createSingleFlightTtlCache<T>(ttlMs: number, now: () => number = Date.now): SingleFlightTtlCache<T> {
  let cached: { value: T; expiresAt: number } | null = null;
  let inflight: Promise<T> | null = null;

  return {
    get(load) {
      if (cached && now() < cached.expiresAt) return Promise.resolve(cached.value);
      if (inflight) return inflight;

      const pending = Promise.resolve()
        .then(load)
        .then((value) => {
          cached = { value, expiresAt: now() + ttlMs };
          return value;
        })
        .finally(() => {
          inflight = null;
        });
      inflight = pending;
      return pending;
    },
    reset() {
      cached = null;
      inflight = null;
    },
  };
}
