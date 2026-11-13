import { describe, expect, it, vi } from "vitest";
import { HttpAntivirusProvider } from "@/lib/server/antivirus";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("HttpAntivirusProvider (gateway ClamAV, ADR-036)", () => {
  it("envia el archivo con el token y devuelve el veredicto del gateway", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ verdict: "CLEAN", detail: "stream: OK" }),
      );
    const provider = new HttpAntivirusProvider(
      "https://av.example.test",
      "secret-token",
      fetchMock,
    );

    const result = await provider.scan(Buffer.from("hola"));

    expect(result).toEqual({ verdict: "CLEAN", detail: "stream: OK" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://av.example.test/scan");
    expect(init.method).toBe("POST");
    expect(init.headers.authorization).toBe("Bearer secret-token");
  });

  it("reporta INFECTED", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ verdict: "INFECTED", detail: "Eicar-Signature" }),
      );
    const provider = new HttpAntivirusProvider(
      "https://av.example.test",
      "t",
      fetchMock,
    );
    expect((await provider.scan(Buffer.from("x"))).verdict).toBe("INFECTED");
  });

  it("falla cerrado: HTTP no-OK, veredicto desconocido o error de red son ERROR", async () => {
    const unauthorized = new HttpAntivirusProvider(
      "https://av",
      "t",
      vi.fn().mockResolvedValue(jsonResponse({}, 401)),
    );
    const unknown = new HttpAntivirusProvider(
      "https://av",
      "t",
      vi.fn().mockResolvedValue(jsonResponse({ verdict: "MAYBE" })),
    );
    const network = new HttpAntivirusProvider(
      "https://av",
      "t",
      vi.fn().mockRejectedValue(new Error("ECONNRESET")),
    );

    expect((await unauthorized.scan(Buffer.from("x"))).verdict).toBe("ERROR");
    expect((await unknown.scan(Buffer.from("x"))).verdict).toBe("ERROR");
    expect((await network.scan(Buffer.from("x"))).verdict).toBe("ERROR");
  });

  it("ping devuelve false si el gateway no responde", async () => {
    const down = new HttpAntivirusProvider(
      "https://av",
      "t",
      vi.fn().mockRejectedValue(new Error("down")),
    );
    const up = new HttpAntivirusProvider(
      "https://av",
      "t",
      vi.fn().mockResolvedValue(new Response("ok")),
    );
    expect(await down.ping()).toBe(false);
    expect(await up.ping()).toBe(true);
  });
});
