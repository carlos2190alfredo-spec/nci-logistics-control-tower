import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string | null | undefined) {
  if (!date) return "Sin fecha";
  return new Intl.DateTimeFormat("es-PA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Panama",
  }).format(new Date(date));
}

/** Formato corto para listas densas: "9 jul, 14:32". */
export function formatDateShort(date: Date | string | null | undefined) {
  if (!date) return "Sin fecha";
  return new Intl.DateTimeFormat("es-PA", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Panama",
  }).format(new Date(date));
}

/** Solo hora, para hitos dentro de un mismo día: "14:32". */
export function formatTime(date: Date | string | null | undefined) {
  if (!date) return "";
  return new Intl.DateTimeFormat("es-PA", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Panama",
  }).format(new Date(date));
}
