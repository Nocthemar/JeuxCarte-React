// =====================================================================
//  Le service worker : un petit programme que le navigateur garde à côté du jeu, même fermé.
//  Il range une copie du jeu sur l'appareil : le jeu s'ouvre vite, et même sans internet
//  (le duel contre l'Ombre ; ce qui passe par Supabase demande toujours une connexion).
//
//  Ce fichier est un modèle : à la construction (vite.config.js, appliHorsLigne), la liste des
//  fichiers du jeu est ajoutée au début (self.__PRECACHE) et le tout devient dist/sw.js.
//
//  Une nouvelle version prend la main tout de suite, mais ne recharge jamais la page : un écran
//  ouvert continue avec ses fichiers (la copie précédente est gardée), et le jeu propose
//  « Mettre à jour » (lib/appli.js). Jamais de rechargement surprise en plein duel.
//
//  ⚠️ GitHub Pages dit au navigateur de garder chaque fichier 10 minutes : la copie est donc toujours
//  téléchargée « fraîche » (cache: 'reload'), sinon elle pourrait ranger l'ANCIENNE page d'accueil, qui
//  réclame des fichiers effacés -> page blanche (bug du 20/10/2026).
// =====================================================================
const { fichiers, version } = self.__PRECACHE;
const CACHE_JEU = `nocthemar-jeu-${version}`;
const CACHE_IMAGES = 'nocthemar-images';
const CACHE_POLICES = 'nocthemar-polices';

// Le dossier du jeu (…github.io/JeuxCarte-React/) : les chemins de la liste partent de là
const BASE = new URL('./', self.location).href;
const adresse = (chemin) => new URL(chemin, BASE).href;
const DANS_LE_JEU = new Set(fichiers);

// Installation : copie de tous les fichiers du jeu, téléchargés frais, puis on prend la main sans attendre
self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE_JEU);
    await cache.addAll(fichiers.map((f) => new Request(adresse(f), { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

// On garde la copie de la version précédente (un écran resté ouvert en a encore besoin) ;
// les plus anciennes sont effacées
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const versions = (await caches.keys()).filter((n) => n.startsWith('nocthemar-jeu-') && n !== CACHE_JEU);
    await Promise.all(versions.slice(0, -1).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

// D'abord une copie rangée (de cette version ou de la précédente) ; sinon internet
async function depuisLaCopie(requete) {
  return (await caches.match(requete, { ignoreSearch: true })) ?? fetch(requete);
}

// L'entrée du jeu : la page d'accueil d'internet (vérifiée auprès du site, jamais celle gardée 10 min
// par le navigateur) ; la copie seulement sans connexion
async function pageDAccueil(requete) {
  try {
    return await fetch(requete.url, { cache: 'no-cache', credentials: 'same-origin' });
  } catch {
    return (await caches.match(adresse('index.html'), { cacheName: CACHE_JEU })) ?? Response.error();
  }
}

// Images et polices : la copie tout de suite si on l'a, et on la rafraîchit en arrière-plan
async function copieRafraichie(nomCache, requete, e) {
  const cache = await caches.open(nomCache);
  const copie = await cache.match(requete);
  const fraiche = fetch(requete).then((reponse) => {
    if (reponse.ok || reponse.type === 'opaque') cache.put(requete, reponse.clone());
    return reponse;
  });
  if (copie) {
    e.waitUntil(fraiche.catch(() => {}));
    return copie;
  }
  return fraiche;
}

self.addEventListener('fetch', (e) => {
  const requete = e.request;
  if (requete.method !== 'GET' || requete.headers.has('range')) return;
  const url = new URL(requete.url);

  // Polices Google : gardées pour jouer sans internet
  if (url.host === 'fonts.googleapis.com' || url.host === 'fonts.gstatic.com') {
    e.respondWith(copieRafraichie(CACHE_POLICES, requete, e));
    return;
  }
  // Supabase et tout autre site : jamais touchés (toujours en direct)
  if (!url.href.startsWith(BASE)) return;

  const chemin = url.href.slice(BASE.length).split(/[?#]/)[0];
  if (requete.mode === 'navigate') {
    // L'entrée du jeu (y compris le retour de Discord, « ?code=… ») ; les anciennes pages .html passent par internet
    if (chemin === '' || chemin === 'index.html') e.respondWith(pageDAccueil(requete));
    return;
  }
  // Les fichiers du jeu (leur nom change à chaque version : une copie n'est jamais périmée)
  if (DANS_LE_JEU.has(chemin) || chemin.startsWith('assets/')) {
    e.respondWith(depuisLaCopie(requete));
    return;
  }
  // les images et les sons (public/sons) : gardés pour jouer hors ligne
  if (chemin.startsWith('img/') || chemin.startsWith('sons/')) e.respondWith(copieRafraichie(CACHE_IMAGES, requete, e));
});
