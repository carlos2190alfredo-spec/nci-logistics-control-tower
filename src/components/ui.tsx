import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={cn("rounded-lg border border-slate-200 bg-white p-5 shadow-sm", className)}>{children}</section>;
}

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "blue" | "green" | "orange" | "red" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    blue: "bg-blue-100 text-blue-800",
    green: "bg-emerald-100 text-emerald-800",
    orange: "bg-orange-100 text-orange-800",
    red: "bg-red-100 text-red-800",
  };

  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", tones[tone])}>{children}</span>;
}

export function SubmitButton({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <button
      className={cn(
        "inline-flex min-h-10 items-center justify-center rounded-md bg-[#0f2d46] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#163d5f]",
        className,
      )}
      type="submit"
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  name,
  type = "text",
  defaultValue,
  required = true,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-slate-700">
      {label}
      <input
        className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-950"
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
      />
    </label>
  );
}

export function TextArea({ label, name, required = false }: { label: string; name: string; required?: boolean }) {
  return (
    <label className="grid gap-1 text-sm font-medium text-slate-700">
      {label}
      <textarea className="min-h-24 rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-950" name={name} required={required} />
    </label>
  );
}
