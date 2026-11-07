const CACHE_NAME = "sayaqr-v3";
const APP_SHELL = ["./manifest.webmanifest", "./icon.svg"];
const pendingShares = new Map();
const readyUrl = () => new URL("./offline-ready", self.registration.scope).href;

function cleanNavigationUrl(input) {
  const url = new URL(input);
  for (const key of ["title", "text", "url"]) url.searchParams.delete(key);
  return url.href;
}

async function cacheFreshShell(cache) {
  await cache.addAll(APP_SHELL);
  const response = await fetch(new URL("./", self.registration.scope), { cache: "no-cache" });
  if (!response.ok) throw new Error("App shell unavailable");
  const html = await response.clone().text();
  const assetUrls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((match) => new URL(match[1], self.registration.scope))
    .filter((url) => url.origin === self.location.origin && !url.pathname.endsWith("sw.js"));
  await Promise.all(assetUrls.map((url) => cache.add(url.href)));
  await cache.put(new URL("./", self.registration.scope), response.clone());
  await cache.put(new URL("./index.html", self.registration.scope), response);
  await cache.put(readyUrl(), new Response("ready"));
}

function isNavigationRequest(request) {
  return request.mode === "navigate" || request.headers.get("accept")?.includes("text/html");
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cleanUrl = cleanNavigationUrl(request.url);
  try {
    // Keep the verified offline shell until a complete update installs.
    return await fetch(cleanUrl, { cache: "no-cache", credentials: "same-origin" });
  } catch {
    return (await cache.match(cleanUrl)) || (await cache.match(new URL("./index.html", self.registration.scope))) || new Response("Offline", { status: 503 });
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function receiveShare(request) {
  const data = await request.formData();
  const value = ["url", "text", "title"].map((key) => data.get(key)).find((item) => typeof item === "string" && item.trim());
  const token = crypto.randomUUID();
  const now = Date.now();
  for (const [key, entry] of pendingShares) if (now - entry.time > 60000) pendingShares.delete(key);
  pendingShares.set(token, { value: typeof value === "string" ? value : "", time: now });
  return Response.redirect(new URL(`./#share=${token}`, self.registration.scope).href, 303);
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then(cacheFreshShell).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith("sayaqr-") && key !== CACHE_NAME).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener("message", (event) => {
  if (!event.source?.url?.startsWith(self.registration.scope)) return;
  const port = event.ports?.[0];
  if (!port) return;
  if (event.data?.type === "take-share") {
    const entry = pendingShares.get(event.data.token);
    pendingShares.delete(event.data.token);
    port.postMessage({ value: entry && Date.now() - entry.time < 60000 ? entry.value : "" });
  }
  if (event.data?.type === "offline-status") {
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.match(readyUrl())).then((response) => port.postMessage({ ready: Boolean(response) })));
  }
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  if (event.request.method === "POST" && url.pathname === new URL("./share", self.registration.scope).pathname) {
    event.respondWith(receiveShare(event.request));
    return;
  }
  if (event.request.method !== "GET") return;
  event.respondWith(isNavigationRequest(event.request) ? networkFirst(event.request) : cacheFirst(event.request));
});
