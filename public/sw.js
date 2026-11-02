/*
 * Service worker minimo do MechaFlow.
 * Objetivo: permitir instalar o PWA e, sem internet, nunca cair no erro do navegador.
 *
 * Navegacao (abrir ou recarregar uma tela): sempre vai para a rede. Se a rede falhar,
 * responde com /offline.html, na mesma URL. Essa pagina e fixa, nao tem dado da oficina, e
 * recarrega a URL em "Tentar de novo" ou sozinha quando a internet volta (PLANO 18.5).
 * NAO e modo offline: nenhuma pagina do app fica guardada, nem as publicas.
 *
 * Arquivos estaticos (_next/static, icones, manifest): network-first, cache so como reserva.
 *
 * NAO cacheia: requisicoes que nao sao GET, outras origens (ex.: Supabase), /api/*, /auth/*,
 * requisicoes RSC do Next e qualquer pagina. Paginas com dados nunca devem ir para o cache.
 *
 * Mudou este arquivo ou o /offline.html? Troque CACHE_NAME: o aparelho instala o SW novo na
 * proxima abertura com internet e apaga o cache antigo.
 */
const CACHE_NAME = "mechaflow-v2";
const PAGINA_OFFLINE = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      // Se a pagina nao vier inteira, a instalacao falha e o SW anterior continua valendo.
      const resposta = await fetch(PAGINA_OFFLINE, { cache: "reload" });
      if (!resposta.ok || resposta.redirected) throw new Error("offline.html indisponivel");
      const cache = await caches.open(CACHE_NAME);
      await cache.put(PAGINA_OFFLINE, resposta);
      await self.skipWaiting();
    })(),
  );
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

function ehArquivoEstatico(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest"
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async (error) => {
        const reserva = await caches.match(PAGINA_OFFLINE);
        if (reserva) return reserva;
        throw error;
      }),
    );
    return;
  }

  if (request.headers.get("RSC") || url.searchParams.has("_rsc")) return;
  if (!ehArquivoEstatico(url)) return;

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
        throw error;
      }
    })(),
  );
});
