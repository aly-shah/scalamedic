/**
 * Doctor-app service worker (read-only offline cache).
 *
 * History note: previous versions of this file were a kill-switch
 * (cached HTML pages → broke chunk loading after deploys). This
 * version is scoped narrowly to the doctor-app's specific needs:
 *   - Cache the doctor-app shell page (/doctor-app)
 *   - Cache GETs for /api/patients/*, /api/auth/me, /api/products
 *   - Stale-while-revalidate; 24h max age before forced refetch
 *   - Writes (POST/PUT/DELETE) ALWAYS pass through; offline writes
 *     fail loudly by design
 *
 * Registration is explicit from the doctor-app page (no layout-
 * level register), so the rest of the app is unaffected.
 *
 * When the cache serves a response (because the network fetch
 * failed), it stamps `X-From-Cache: 1` and `X-Cached-At: <iso>` so
 * the doctor-app UI can show a "showing cached data" pill.
 */
const CACHE_NAME  = "scalamedic-doctor-v1";
const SHELL_URLS  = ["/doctor-app"];
const API_PATTERNS = [
  /^\/api\/patients\/[^/]+/,
  /^\/api\/patients(\?|$)/,
  /^\/api\/auth\/me$/,
  /^\/api\/products(\?|$)/,
];
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS).catch(() => undefined)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

function isCacheableApi(url) {
  for (const re of API_PATTERNS) {
    if (re.test(url.pathname + url.search)) return true;
  }
  return false;
}

function isShell(url) {
  return url.pathname === "/doctor-app";
}

async function cloneWithFromCacheHeader(resp) {
  const cachedAt = resp.headers.get("x-cached-at") || "";
  const headers = new Headers(resp.headers);
  headers.set("X-From-Cache", "1");
  if (cachedAt) headers.set("X-Cached-At", cachedAt);
  const body = await resp.clone().blob();
  return new Response(body, {
    status: resp.status,
    statusText: resp.statusText,
    headers,
  });
}

async function cachePut(cache, req, resp) {
  if (!resp.ok) return;
  const headers = new Headers(resp.headers);
  headers.set("X-Cached-At", new Date().toISOString());
  const body = await resp.clone().blob();
  await cache.put(
    req,
    new Response(body, {
      status: resp.status,
      statusText: resp.statusText,
      headers,
    }),
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // writes are network-only

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (isShell(url)) {
    event.respondWith(handleShell(req));
    return;
  }
  if (isCacheableApi(url)) {
    event.respondWith(handleCacheableApi(req));
    return;
  }
  // Everything else passes through unmodified.
});

async function handleShell(req) {
  try {
    const network = await fetch(req);
    const cache = await caches.open(CACHE_NAME);
    cachePut(cache, req, network).catch(() => undefined);
    return network;
  } catch {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    if (cached) return cloneWithFromCacheHeader(cached);
    return new Response("Offline", { status: 503 });
  }
}

async function handleCacheableApi(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);

  const networkPromise = fetch(req)
    .then(async (resp) => {
      if (resp.ok) cachePut(cache, req, resp).catch(() => undefined);
      return resp;
    })
    .catch(() => null);

  if (cached) {
    const cachedAt = cached.headers.get("x-cached-at");
    const age = cachedAt ? Date.now() - new Date(cachedAt).getTime() : MAX_AGE_MS + 1;
    if (age < MAX_AGE_MS) {
      // Return cached immediately; let the network refresh in background.
      networkPromise.catch(() => undefined);
      return cloneWithFromCacheHeader(cached);
    }
  }

  const network = await networkPromise;
  if (network) return network;
  if (cached) return cloneWithFromCacheHeader(cached);
  return new Response(JSON.stringify({ success: false, error: "Offline and not cached" }), {
    status: 503,
    headers: { "Content-Type": "application/json" },
  });
}
