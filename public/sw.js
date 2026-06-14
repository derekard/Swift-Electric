// Minimal service worker — its presence (with a fetch handler) makes the app
// installable as a PWA. We intentionally pass requests through to the network
// rather than caching authenticated pages, to avoid serving stale data.
self.addEventListener("install", () => {
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener("fetch", () => {
  // No-op fetch handler: let the browser handle requests normally.
})
