/*
 * Service worker minimo do MechaFlow.
 * Objetivo: permitir instalar o PWA e dar uma resposta basica sem internet.
 * Estrategia: network-first (sempre tenta a rede; cache so como reserva).
 *
 * NAO cacheia: requisicoes que nao sao GET, outras origens (ex.: Supabase),
 * /api/*, /auth/*, requisicoes RSC do Next e paginas fora da lista publica.
 * Paginas com dados da oficina nunca devem ir para o cache.
 */
const CACHE_NAME = "mechaflow-v1";

// Paginas publicas que podem ficar em cache como reserva offline.
const PUBLIC_PAGES = ["/", "/login"];

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

function isCacheable(request, url) {
  if (request.method !== "GET") return false;
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith("/api/")) return false;
  if (url.pathname.startsWith("/auth/")) return false;
  if (request.headers.get("RSC") || url.searchParams.has("_rsc")) return false;

  if (request.mode === "navigate") return PUBLIC_PAGES.includes(url.pathname);

  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest"
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (!isCacheable(request, url)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response.ok && response.type === "basic") {
          cache.put(request, response.clone());
        }
        return response;
      } catch (error) {
        const cached = await cache.match(request);
        if (cached) return cached;
        if (request.mode === "navigate") {
          const home = await cache.match("/");
          if (home) return home;
        }
        throw error;
      }
    })(),
  );
});
