"use client";

import { useEffect, useRef, useState } from "react";
import { Eraser, PenLine } from "lucide-react";

/**
 * Captura de firma del receptor. Inicia con un timestamp digital (nunca
 * está vacía) que sirve como marca de captura auditable si el receptor
 * no dibujó nada. Cada trazo real actualiza el data URL en el input oculto.
 */
export function SignaturePad({ name = "signatureData" }: { name?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [dataUrl, setDataUrl] = useState("");
  const [hasStrokes, setHasStrokes] = useState(false);
  const drawing = useRef(false);

  function persist() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setDataUrl(canvas.toDataURL("image/png"));
  }

  function paintStamp(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Marca digital de captura discreta al pie, siempre presente.
    ctx.fillStyle = "#94a3b8";
    ctx.font = "9px monospace";
    ctx.fillText(`Firma capturada — ${new Date().toISOString()}`, 8, canvas.height - 6);
    ctx.strokeStyle = "#10233b";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    paintStamp(ctx, canvas);
    setHasStrokes(false);
    persist();
  }

  useEffect(() => {
    clearCanvas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  return (
    <div className="grid gap-2">
      <p className="text-sm font-medium text-foreground">Firma del receptor</p>
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={360}
          height={120}
          className="h-32 w-full touch-none rounded-lg border border-border bg-white shadow-xs"
          aria-label="Firma del receptor"
          onPointerDown={(event) => {
            drawing.current = true;
            setHasStrokes(true);
            const ctx = event.currentTarget.getContext("2d");
            if (!ctx) return;
            const p = point(event);
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
          }}
          onPointerMove={(event) => {
            if (!drawing.current) return;
            const ctx = event.currentTarget.getContext("2d");
            if (!ctx) return;
            const p = point(event);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
            persist();
          }}
          onPointerUp={() => {
            drawing.current = false;
            persist();
          }}
          onPointerLeave={() => {
            drawing.current = false;
            persist();
          }}
        />
        {!hasStrokes ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 grid place-items-center text-sm font-medium text-faint-foreground"
          >
            <span className="inline-flex items-center gap-1.5">
              <PenLine className="size-4" />
              Firme aqui
            </span>
          </span>
        ) : null}
      </div>
      <input name={name} type="hidden" value={dataUrl} />
      <button
        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-foreground shadow-xs transition-colors hover:bg-muted"
        type="button"
        onClick={clearCanvas}
      >
        <Eraser aria-hidden className="size-4" />
        Limpiar firma
      </button>
    </div>
  );
}
