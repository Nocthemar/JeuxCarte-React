// =====================================================================
//  Le service worker : un petit programme que le navigateur garde à côté du jeu, même fermé.
//  Il range une copie du jeu sur l'appareil : le jeu s'ouvre vite, et même sans internet
//  (le duel contre l'Ombre ; ce qui passe par Supabase demande toujours une connexion).
//
//  Ce fichier est un modèle : à la construction (vite.config.js, appliHorsLigne), la liste des
//  fichiers du jeu est ajoutée au début (self.__PRECACHE) et le tout devient dist/sw.js.
//
//  Une nouvelle version publiée attend sagement : le jeu propose « Mettre à jour » (lib/appli.js),
//  pour ne jamais recharger la page en plein duel.
// =====================================================================
const { fichiers, version } = self.__PRECACHE;
const CACHE_JEU = `nocthemar-jeu-${version}`;
const CACHE_IMAGES = 'nocthemar-images';
const CACHE_POLICES = 'nocthemar-polices';

// Le dossier du jeu (…github.io/JeuxCarte-React/) : les chemins de la liste partent de là
const BASE = new URL('./', self.location).href;
const adresse = (chemin) => new URL(chemin, BASE).href;
const DANS_LE_JEU = new Set(fichiers);

// Installation : copie de tous les fichiers du jeu
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_JEU).then((cache) => cache.addAll(fichiers.map(adresse))));
});

// Le joueur a accepté la mise à jour
self.addEventListener('message', (e) => {
  if (e.data === 'activer') self.skipWaiting();
});

// La nouvelle version prend la main : les copies des anciennes versions sont effacées
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const noms = await caches.keys();
    await Promise.all(noms.filter((n) => n.startsWith('nocthemar-jeu-') && n !== CACHE_JEU).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

// D'abord la copie rangée ; sinon internet
async function depuisLaCopie(cle, requete) {
  return (await caches.match(cle, { ignoreSearch: true })) ?? fetch(requete);
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
    if (chemin === '' || chemin === 'index.html') e.respondWith(depuisLaCopie(adresse('index.html'), requete));
    return;
  }
  if (DANS_LE_JEU.has(chemin)) {
    e.respondWith(depuisLaCopie(adresse(chemin), requete));
    return;
  }
  if (chemin.startsWith('img/')) e.respondWith(copieRafraichie(CACHE_IMAGES, requete, e));
});
