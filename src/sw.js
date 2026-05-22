/* Service Worker for pythonlidar.com
   Strategy:
     - precache: shell (homepage, offline page, CSS, JS, logo, favicon, manifest)
     - HTML navigations  -> stale-while-revalidate, fall back to /offline.html
     - assets (CSS/JS/img/font) -> cache-first with background revalidation
*/

const VERSION = "v1.0.0";
const PRECACHE = `pl-precache-${VERSION}`;
const RUNTIME = `pl-runtime-${VERSION}`;

const PRECACHE_URLS = [
  "/",
  "/offline.html",
  "/assets/css/styles.css",
  "/assets/js/site.js",
  "/assets/img/logo.svg",
  "/assets/img/favicon.svg",
  "/favicon.ico",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(PRECACHE).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== PRECACHE && k !== RUNTIME).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

function isAsset(url) {
  return /\.(css|js|svg|png|jpg|jpeg|webp|gif|ico|woff2?|ttf)$/i.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // HTML navigations -> stale-while-revalidate with offline fallback
  if (req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html")) {
    event.respondWith(
      caches.open(RUNTIME).then(async (cache) => {
        const cached = await cache.match(req);
        const network = fetch(req).then((res) => {
          if (res && res.status === 200) cache.put(req, res.clone());
          return res;
        }).catch(() => null);
        return cached || (await network) || caches.match("/offline.html");
      })
    );
    return;
  }

  // Static assets -> cache-first
  if (isAsset(url)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) {
          // refresh in the background
          fetch(req).then((res) => {
            if (res && res.status === 200) {
              caches.open(RUNTIME).then((c) => c.put(req, res));
            }
          }).catch(() => {});
          return cached;
        }
        return fetch(req).then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(RUNTIME).then((c) => c.put(req, copy));
          }
          return res;
        });
      })
    );
  }
});
