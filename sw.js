/* ═══════════════════════════════════════════════════════════════════════════
   PRIMAL GAMBIT — SERVICE WORKER
   ─────────────────────────────────────────────────────────────────────────
   Objectif : rendre le jeu réellement jouable HORS-LIGNE une fois installé
   sur l'écran d'accueil. Sans ce fichier, l'icône n'est qu'un raccourci :
   sans réseau, rien ne se lance.

   Stratégie
   ─────────
   · index.html + manifeste  → network-first, repli sur le cache.
     Le joueur reçoit toujours la dernière version quand il a du réseau,
     et le jeu se lance quand même quand il n'en a pas.
   · Tout le reste (images, police, sons FX) → cache-first.
     Ces fichiers ne changent jamais sans changer de nom ; inutile de les
     revalider à chaque partie.
   · Musiques (assets/sounds/music/, assets/sounds/battle/) → JAMAIS mises
     en cache. 74 Mo de MP3 rempliraient le quota d'origine pour un bénéfice
     nul : elles sont diffusées en streaming et bouclées.

   VERSION : à incrémenter à chaque livraison. Changer cette constante suffit
   à purger tous les anciens caches (voir 'activate').
   ═══════════════════════════════════════════════════════════════════════════ */

const VERSION    = 'pg-v40-b06';
const SHELL      = `${VERSION}-shell`;
const RUNTIME    = `${VERSION}-runtime`;

// Coquille minimale : ce qu'il faut pour afficher l'écran titre hors-ligne.
// Volontairement court — le reste arrive au fil de la navigation.
const SHELL_URLS = [
  './',
  './index.html',
  './manifest.json',
  './assets/fonts/tt0524m_.ttf',
  './assets/background/bg0.png',
  './assets/background/bg1.png',
  './assets/background/logo_new.png',
  './assets/background/favicon.png',
  './assets/background/manifest-icon.png',
  './assets/background/manifest-icon-maskable.png',
  './assets/background/button_l_black.png',
  './assets/background/button_l_white.png',
  './assets/background/button_s_black.png',
  './assets/background/button_s_white.png',
];

// Requêtes qu'on ne met jamais en cache (trop lourdes / streamées).
function isUncacheable(url){
  return /\/assets\/sounds\/(music|battle)\//.test(url.pathname);
}

// Documents : on veut la fraîcheur d'abord.
function isDocument(request, url){
  return request.mode === 'navigate'
      || url.pathname.endsWith('/index.html')
      || url.pathname.endsWith('/manifest.json');
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    // addAll() est atomique : un seul 404 ferait échouer toute l'installation.
    // On tolère les manquants pour ne jamais bloquer une mise en ligne.
    await Promise.all(SHELL_URLS.map(u =>
      cache.add(new Request(u, { cache: 'reload' })).catch(() => {})
    ));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => k !== SHELL && k !== RUNTIME).map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if(request.method !== 'GET') return;

  const url = new URL(request.url);
  if(url.origin !== self.location.origin) return; // rien d'externe à gérer
  if(isUncacheable(url)) return;                  // musiques : réseau direct

  if(isDocument(request, url)){
    // ── Network-first ──
    event.respondWith((async () => {
      try{
        const fresh = await fetch(request);
        const cache = await caches.open(SHELL);
        cache.put(request, fresh.clone());
        return fresh;
      }catch(e){
        const cached = await caches.match(request)
                    || await caches.match('./index.html')
                    || await caches.match('./');
        if(cached) return cached;
        throw e;
      }
    })());
    return;
  }

  // ── Cache-first ──
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if(cached) return cached;
    try{
      const fresh = await fetch(request);
      // Ne mettre en cache que les réponses réellement utilisables :
      // un 404 ou une réponse opaque en cache serait servi indéfiniment.
      if(fresh && fresh.ok && fresh.type === 'basic'){
        const cache = await caches.open(RUNTIME);
        cache.put(request, fresh.clone());
      }
      return fresh;
    }catch(e){
      // Hors-ligne et jamais vu : on laisse le onerror/catch du jeu gérer.
      return Response.error();
    }
  })());
});

// Permet à la page de forcer l'activation d'une mise à jour sans attendre
// la fermeture de tous les onglets (voir _swRegister() dans index.html).
self.addEventListener('message', event => {
  if(event.data === 'skipWaiting') self.skipWaiting();
});
