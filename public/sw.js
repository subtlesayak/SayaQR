const CACHE_NAME = "sayaqr-v2";
const APP_SHELL = ["./manifest.webmanifest", "./icon.svg"];

async function cacheFreshShell(cache) {
  await cache.addAll(APP_SHELL);

  const response = await fetch("./", { cache: "no-cache" });
  if (!response.ok) return;

  await cache.put("./", response.clone());
  await cache.put("./index.html", response.clone());

  const html = await response.text();
  const assetUrls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((match) => new URL(match[1], self.registration.scope))
    .filter((url) => url.origin === self.location.origin && !url.pathname.endsWith("sw.js"));
  await Promise.allSettled(assetUrls.map((url) => cache.add(url.href)));
}

function isNavigationRequest(request) {
  return request.mode === "navigate" || request.headers.get("accept")?.includes("text/html");
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request, { cache: "no-cache" });
    if (response.ok) {
      await cache.put(request, response.clone());
      if (isNavigationRequest(request)) {
        await cache.put("./", response.clone());
        await cache.put("./index.html", response.clone());
      }
    }
    return response;
  } catch {
    return (await caches.match(request)) || (await caches.match("./index.html")) || (await caches.match("./")) || new Response("Offline", { status: 503 });
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then(cacheFreshShell).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("sayaqr-") && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(isNavigationRequest(event.request) ? networkFirst(event.request) : cacheFirst(event.request));
});
