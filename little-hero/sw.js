const CACHE = "little-hero-v3";
const ASSETS = ["./", "./index.html", "./styles.css", "./app-loader.js", "./config.js", "./manifest.webmanifest", "./icons/icon.svg", "./setup.html", "./app-parts/01.txt", "./app-parts/02.txt", "./app-parts/03.txt", "./app-parts/04.txt", "./app-parts/05.txt", "./app-parts/06.txt", "./app-parts/07.txt", "./gs-parts/01.txt", "./gs-parts/02.txt", "./gs-parts/03.txt", "./gs-parts/04.txt", "./gs-parts/05.txt"];
self.addEventListener("install", event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener("activate", event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))));
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request).then(response => {
    const clone = response.clone();
    caches.open(CACHE).then(cache => cache.put(event.request, clone));
    return response;
  }).catch(() => caches.match(event.request).then(hit => hit || caches.match("./"))));
});
