// Service worker mínimo de Snodic Mapping: habilita instalar la app y guarda en caché solo archivos estáticos.
// Los datos (páginas y API) siempre van a la red: nunca se muestran datos viejos de prospectos.
const CACHE = "snodic-static-v1";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) =>
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())),
);
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  const isStatic = e.request.method === "GET" && url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") || /\.(png|svg|ico|woff2?)$/.test(url.pathname));
  if (!isStatic) return;
  e.respondWith(
    caches.open(CACHE).then(async (c) => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) c.put(e.request, res.clone());
      return res;
    }),
  );
});
