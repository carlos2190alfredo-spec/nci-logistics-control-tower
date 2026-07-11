/*
 * Service Worker de NCI Logistics Control Tower.
 * Politica:
 * - Cachea solo el shell publico (/, /login, /offline) y assets estaticos.
 * - No cachea /api/*, /platform/*, /t/* ni MinIO (nada autenticado o privado).
 * - No guarda respuestas 401/403; no cachea signed URLs.
 * - Elimina caches viejos al activar.
 * - Actualizacion controlada: no ejecuta skipWaiting automaticamente.
 *   El cliente decide cuando activar la nueva version.
 */
const CACHE_VERSION = "nci-lct-v3";
const SHELL_URLS = ["/", "/login", "/offline", "/manifest.webmanifest"];
const PRIVATE_PATH_PREFIXES = ["/api/", "/platform", "/t/"];
const PRIVATE_HOST_PATTERNS = [/localhost:9000/, /minio/];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL_URLS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function isPrivateRequest(url) {
  if (PRIVATE_PATH_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) return true;
  if (PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(url.host))) return true;
  return false;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (isPrivateRequest(url)) {
    event.respondWith(fetch(request));
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      try {
        const response = await fetch(request);
        if (response.ok && response.type === "basic") {
          const cache = await caches.open(CACHE_VERSION);
          cache.put(request, response.clone());
        }
        return response;
      } catch (error) {
        if (cached) return cached;
        if (request.mode === "navigate") {
          const offlinePage = await caches.match("/offline");
          if (offlinePage) return offlinePage;
        }
        throw error;
      }
    })(),
  );
});
