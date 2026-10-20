// =====================================================================
//  Les anciennes adresses du jeu (jeu-cartes.html, profil.html?id=…, marche.html#echanges…) mènent
//  au bon écran de la version React, en gardant leurs réglages. Liens d'invitation déjà envoyés, favoris,
//  liens du site Nocthémar ou du bot Discord continuent donc de marcher.
//  Chaque ancienne page est un petit fichier HTML (public/*.html) qui dit vers quel écran aller :
//  <html data-vers="duel">. Fichier à part, et non script dans la page : la politique de sécurité
//  (Content-Security-Policy) interdit les scripts écrits dans le HTML.
// =====================================================================
(() => {
  const ecran = document.documentElement.dataset.vers || 'duel';
  const params = new URLSearchParams(location.search);
  const ancre = location.hash.slice(1);
  // Ce que l'ancien jeu mettait après « # » devient un réglage de l'écran
  if (ecran === 'collection' && (ancre === 'grimoire' || ancre === 'roue')) params.set('vue', ancre);
  if (ecran === 'collection' && params.has('avec')) params.set('onglet', 'echanges');
  if (ecran === 'marche' && ancre === 'echanges') params.set('onglet', 'echanges');
  const suite = params.toString();
  location.replace(`./#/${ecran === 'collection' && params.has('avec') ? 'marche' : ecran}${suite ? `?${suite}` : ''}`);
})();
