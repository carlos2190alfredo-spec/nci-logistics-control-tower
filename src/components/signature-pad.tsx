"use client";

import { useEffect, useRef, useState } from "react";

export function SignaturePad({ name = "signatureData" }: { name?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [dataUrl, setDataUrl] = useState("");
  const drawing = useRef(false);

  function persist() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setDataUrl(canvas.toDataURL("image/png"));
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#0f2d46";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(24, 86);
    ctx.bezierCurveTo(86, 22, 148, 118, 230, 56);
    ctx.bezierCurveTo(272, 28, 310, 72, 342, 42);
    ctx.stroke();
    persist();
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
      <canvas
        ref={canvasRef}
        width={360}
        height={120}
        className="h-32 w-full touch-none rounded-md border border-slate-300 bg-white"
        aria-label="Firma del receptor"
        onPointerDown={(event) => {
          drawing.current = true;
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
      <input name={name} type="hidden" value={dataUrl} />
      <button
        className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"
        type="button"
        onClick={() => {
          const canvas = canvasRef.current;
          const ctx = canvas?.getContext("2d");
          if (!canvas || !ctx) return;
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          setDataUrl(canvas.toDataURL("image/png"));
        }}
      >
        Limpiar firma
      </button>
    </div>
  );
}
