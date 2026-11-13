/*
 * Service Worker de NCI Logistics Control Tower.
 * Politica: lista de permitidos. Solo se cachea lo que es publico por diseno.
 * - Shell publico exacto y sin query: /, /login, /offline y /manifest.webmanifest.
 * - Assets estaticos: /_next/static/*, /icons/*, /apple-touch-icon.png y /favicon.ico.
 * - Todo lo demas pasa directo a la red y nunca se guarda: cuentas (/account), MFA,
 *   /t/*, /platform, /api/*, enlaces con token (/recuperar, /verificar-email), MinIO
 *   y cualquier otro origen. Cache Storage ignora Cache-Control: no-store, por eso la
 *   decision se toma por ruta y no por cabecera.
 * - No guarda redirecciones ni respuestas no OK (401/403/5xx); no cachea signed URLs.
 * - Elimina caches viejos al activar: subir CACHE_VERSION purga todo lo anterior.
 * - Actualizacion controlada: no ejecuta skipWaiting automaticamente.
 *   El cliente decide cuando activar la nueva version.
 */
const CACHE_VERSION = "nci-lct-v4";
const SHELL_URLS = ["/", "/login", "/offline", "/manifest.webmanifest"];
const STATIC_PREFIXES = ["/_next/static/", "/icons/"];
const STATIC_FILES = ["/apple-touch-icon.png", "/favicon.ico"];
// Rutas privadas: se resuelven siempre contra la red (sin cache ni fallback).
const PRIVATE_PATH_PREFIXES = [
  "/api",
  "/platform",
  "/t",
  "/account",
  "/mfa",
  "/recuperar",
  "/verificar-email",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL_URLS)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => caches.delete(key)),
      );
      // Defensa adicional: nada fuera de la lista de permitidos sobrevive en el cache actual.
      const cache = await caches.open(CACHE_VERSION);
      const stored = await cache.keys();
      await Promise.all(
        stored
          .filter((entry) => !isCacheable(new URL(entry.url)))
          .map((entry) => cache.delete(entry)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function isPrivatePath(pathname) {
  return PRIVATE_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isCacheable(url) {
  if (url.origin !== self.location.origin) return false;
  if (isPrivatePath(url.pathname)) return false;
  if (STATIC_PREFIXES.some((prefix) => url.pathname.startsWith(prefix)))
    return true;
  if (STATIC_FILES.includes(url.pathname)) return true;
  // El shell solo se cachea sin query: /login?x=... no debe crear entradas nuevas.
  return SHELL_URLS.includes(url.pathname) && url.search === "";
}

async function networkFirstWithCache(request) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const response = await fetch(request);
    if (response.ok && response.type === "basic" && !response.redirected) {
      cache.put(request, response.clone()).catch(() => undefined);
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (request.mode === "navigate") {
      const offlinePage = await cache.match("/offline");
      if (offlinePage) return offlinePage;
    }
    throw error;
  }
}

async function networkOrOfflinePage(request) {
  try {
    return await fetch(request);
  } catch (error) {
    const cache = await caches.open(CACHE_VERSION);
    const offlinePage = await cache.match("/offline");
    if (offlinePage) return offlinePage;
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Otros origenes (MinIO, signed URLs, terceros): sin intervencion y sin cache.
  if (url.origin !== self.location.origin) return;

  if (isPrivatePath(url.pathname)) {
    event.respondWith(fetch(request));
    return;
  }

  if (isCacheable(url)) {
    event.respondWith(networkFirstWithCache(request));
    return;
  }

  // Navegaciones a rutas que no son shell (p. ej. /login?x=1): red y, sin conexion, /offline.
  if (request.mode === "navigate") {
    event.respondWith(networkOrOfflinePage(request));
  }
});
