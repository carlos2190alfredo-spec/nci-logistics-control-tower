self.addEventListener("install", (event) => {
  event.waitUntil(caches.open("nci-lct-v1").then((cache) => cache.addAll(["/", "/login"])));
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
