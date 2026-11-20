/* BrainGuard Companion — offline shell.
   Cache-first for the app itself, nothing else. No analytics, no remote calls. */
const CACHE = "brainguard-v3.7";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/app.css",
  "./assets/i18n.js",
  "./assets/store.js",
  "./assets/model.js",
  "./assets/sensors.js",
  "./assets/views.js",
  "./assets/views2.js",
  "./assets/emergency.js",
  "./assets/app.js",
  "./assets/mark.png",
  "./assets/logo.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // device models/CDN are not cached here
  // Network-first so a redeploy is picked up immediately; cache keeps it usable offline.
  e.respondWith(
    fetch(e.request, { cache: "no-store" }).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request).then((hit) => hit || caches.match("./index.html")))
  );
});
