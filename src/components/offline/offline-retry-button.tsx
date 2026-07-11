"use client";

export function OfflineRetryButton() {
  return (
    <button
      className="mt-6 inline-flex min-h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-primary/90"
      onClick={() => window.location.reload()}
      type="button"
    >
      Reintentar
    </button>
  );
}
