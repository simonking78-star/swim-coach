// A-040: offline app-shell cache. Scope is deliberately narrow --
// this only serves the page shell and its fixed assets when offline.
// It never touches Supabase (or any other) API calls: those always go
// straight to the network so the app's own offline-write-queue logic
// (in index.html) decides what happens when a save fails.
const CACHE = "coach-tools-shell-v1";

const SHELL_URLS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
  "https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js",
  "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // Cache each shell URL independently -- one flaky fetch (e.g. a CDN
      // blip during install) must not fail the whole install.
      Promise.all(SHELL_URLS.map((url) => cache.add(url).catch(() => {})))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  // Only intercept full-page navigations and the explicit shell assets
  // above. Everything else -- every Supabase REST/Auth/Storage call,
  // any other API, any CDN script not in the shell list -- goes straight
  // to the network untouched.
  const isNav = req.mode === "navigate";
  const isShellUrl = SHELL_URLS.includes(req.url);
  if (!isNav && !isShellUrl) return;

  const cacheKey = isNav ? "./index.html" : req;

  event.respondWith(
    caches.match(cacheKey).then((cached) => {
      const network = fetch(req).then((res) => {
        // A same-origin response ok, or an opaque cross-origin response
        // (status 0 for the no-cors CDN scripts) -- both are cacheable.
        if (res && (res.ok || res.type === "opaque")) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(cacheKey, copy));
        }
        return res;
      }).catch(() => cached);
      // Serve the cached shell immediately when we have it (fast, and
      // works offline); refresh the cache from the network in the
      // background either way so the next load picks up a new deploy.
      return cached || network;
    })
  );
});
