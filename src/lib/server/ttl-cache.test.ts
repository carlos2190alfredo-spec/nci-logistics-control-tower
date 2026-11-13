import { describe, expect, it, vi } from "vitest";
import { createSingleFlightTtlCache } from "./ttl-cache";

describe("createSingleFlightTtlCache", () => {
  it("devuelve el valor cacheado dentro del TTL sin volver a cargar", async () => {
    let clock = 1_000;
    const cache = createSingleFlightTtlCache<number>(20_000, () => clock);
    const load = vi.fn().mockResolvedValue(42);

    expect(await cache.get(load)).toBe(42);
    clock += 19_999;
    expect(await cache.get(load)).toBe(42);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("vuelve a cargar cuando el TTL venció", async () => {
    let clock = 1_000;
    const cache = createSingleFlightTtlCache<number>(20_000, () => clock);
    const load = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);

    expect(await cache.get(load)).toBe(1);
    clock += 20_000;
    expect(await cache.get(load)).toBe(2);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("comparte un unico calculo entre peticiones concurrentes", async () => {
    const cache = createSingleFlightTtlCache<string>(20_000);
    let release: (value: string) => void = () => {};
    const load = vi.fn(() => new Promise<string>((resolve) => (release = resolve)));

    const results = [cache.get(load), cache.get(load), cache.get(load)];
    // `load` se invoca en un microtask: esperar a que arranque antes de liberarlo.
    await new Promise((resolve) => setTimeout(resolve, 0));
    release("ok");

    expect(await Promise.all(results)).toEqual(["ok", "ok", "ok"]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("no cachea los fallos y permite reintentar", async () => {
    const cache = createSingleFlightTtlCache<number>(20_000);
    const load = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(7);

    await expect(cache.get(load)).rejects.toThrow("boom");
    expect(await cache.get(load)).toBe(7);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("reset descarta el valor cacheado", async () => {
    const cache = createSingleFlightTtlCache<number>(20_000);
    const load = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);

    expect(await cache.get(load)).toBe(1);
    cache.reset();
    expect(await cache.get(load)).toBe(2);
  });
});
