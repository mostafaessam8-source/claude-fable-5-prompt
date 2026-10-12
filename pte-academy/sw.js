/* PTE-79 Express service worker: cache-first app shell so it works offline in the car */
const VER = "pte79-v4";
const SHELL = ["./", "index.html", "css/style.css", "manifest.webmanifest", "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png", "icons/nosleep.mp4", "icons/nosleep.webm",
  "data/plan.js", "data/vocab_a.js", "data/vocab_b.js", "data/phonetics.js", "data/grammar.js", "data/bank_speaking.js", "data/bank_lw.js", "data/bank_reading.js", "data/strategies.js",
  "js/core.js", "js/v_home.js", "js/v_vocab.js", "js/v_learn.js", "js/v_tasks.js", "js/v_reading.js", "js/v_misc.js", "js/drive.js", "js/drive_units.js", "js/fx.js", "js/select.js", "vendor/gsap.min.js", "vendor/ScrollTrigger.min.js", "vendor/lenis.min.js", "vendor/lenis.css"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(VER).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {})))).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VER).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const u = new URL(e.request.url); if (u.origin !== location.origin && !/fonts\.(googleapis|gstatic)/.test(u.host)) return; /* translation / dictionary APIs go straight to the network */
  e.respondWith(fetch(e.request).then((r) => { if (r && r.ok && (new URL(e.request.url).origin === location.origin || /fonts\.(googleapis|gstatic)/.test(e.request.url))) { const c = r.clone(); caches.open(VER).then((ch) => ch.put(e.request, c)); } return r; }).catch(() => caches.match(e.request).then((m) => m || caches.match("index.html"))));
});
