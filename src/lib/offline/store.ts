"use client";

import type { LocalCommandRecord } from "@/lib/offline/db";
import { listOwnerCommands, type QueueOwner } from "@/lib/offline/queue";

/**
 * Store externo para `useSyncExternalStore`: mantiene los comandos del owner
 * en un snapshot inmutable y notifica a los suscriptores cuando cambian.
 * Aísla a un único owner por store; los cambios de owner (login/logout)
 * fuerzan reinicialización.
 */

type Listener = () => void;

let currentOwner: QueueOwner | null = null;
let snapshot: LocalCommandRecord[] = [];
let inFlight = false;
const listeners = new Set<Listener>();

function notify() {
  for (const listener of listeners) listener();
}

async function refresh() {
  if (!currentOwner || inFlight) return;
  inFlight = true;
  try {
    const records = await listOwnerCommands(currentOwner);
    snapshot = records;
    notify();
  } finally {
    inFlight = false;
  }
}

export function initOwner(owner: QueueOwner) {
  const same =
    currentOwner &&
    currentOwner.userId === owner.userId &&
    currentOwner.tenantId === owner.tenantId &&
    currentOwner.driverId === owner.driverId;
  if (same) return;
  currentOwner = owner;
  snapshot = [];
  notify();
  void refresh();
}

export function clearOwner() {
  currentOwner = null;
  snapshot = [];
  notify();
}

export function requestRefresh() {
  void refresh();
}

export function subscribeStore(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot(): LocalCommandRecord[] {
  return snapshot;
}

export function getServerSnapshot(): LocalCommandRecord[] {
  return [];
}

export function getActiveOwner(): QueueOwner | null {
  return currentOwner;
}
