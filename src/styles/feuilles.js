// =====================================================================
//  Les feuilles de style de chaque page
//
//  Dans l'ancien jeu, chaque page HTML chargeait SA liste de fichiers CSS, dans un ordre précis.
//  Certaines règles changent d'une page à l'autre (la notification, par exemple, n'a pas le même
//  style dans boutique.css et dans cartes-jeu.css). Pour garder exactement le même design, chaque
//  écran React charge la même liste que son ancienne page, dans le même ordre, et la retire quand
//  on le quitte (voir components/Page.jsx).
// =====================================================================

// Le texte de chaque fichier CSS du dossier (?inline : Vite le donne comme une chaîne de caractères).
// Chargés à la demande : un écran ne télécharge que ses propres feuilles (celles du Duel pèsent 150 ko),
// et les styles gardés mais inutilisés de l'ancien jeu (profil-vitrail.css…) ne sont jamais téléchargés.
const fichiers = import.meta.glob('./*.css', { query: '?inline', import: 'default' });
// Les images des CSS sont écrites depuis la racine du site (url("/img/…")) : on les fait partir de l'adresse
// du jeu (import.meta.env.BASE_URL), qui n'est pas la racine une fois en ligne (…github.io/CarteJeuxNocthemar/)
const depuisLeJeu = (css) => css.replace(/url\((['"]?)\/(?!\/)/g, `url($1${import.meta.env.BASE_URL}`);

// Avant les styles de la page : chargés par toutes les pages
const DEBUT = ['polices', 'index', 'compte'];
// Après : le thème de jour, puis la barre latérale (ajoutée en dernier par l'ancien barre-laterale.js)
const FIN = ['theme-jour'];
const RAIL = ['barre-jeu'];

const liste = (page, { transitions = false } = {}) => [
  ...DEBUT, ...page, ...FIN, ...(transitions ? ['transitions-pages'] : []), ...RAIL,
];

export const FEUILLES = {
  duel: liste(['carte-infos', 'jeu-cartes', 'duel-spectacle', 'duel-accueil'], { transitions: true }),
  histoire: liste(['cartes-jeu', 'carte-infos', 'histoire'], { transitions: true }),
  collection: liste(['cartes-jeu', 'carte-infos', 'collection', 'collection-roue', 'collection-doublons']),
  cartes: liste(['cartes-jeu', 'carte-infos', 'toutes-les-cartes']),
  succes: liste(['cartes-jeu', 'carte-infos', 'succes-badges', 'succes']),
  boutique: liste(['cartes-jeu', 'carte-infos', 'booster', 'boutique-vitrine', 'boutique-accueil', 'badges-caverne']),
  caverne: liste(['caverne', 'badges-caverne']),
  marche: liste(['cartes-jeu', 'carte-infos', 'marche', 'marche-echanges']),
  pass: liste(['cartes-jeu', 'carte-infos', 'pass']),
  profil: liste(['cartes-jeu', 'carte-infos', 'succes-badges', 'profil-heros']),
  parametres: liste(['parametres']),
  mj: liste(['mj']),
  // L'écran de connexion : sans la barre latérale
  connexion: [...DEBUT, 'connexion', ...FIN],
};

// Les feuilles d'un écran, dans l'ordre : [nom, texte][] (une promesse, gardée : chaque écran ne les
// télécharge qu'une fois). Page.jsx l'attend avant d'afficher l'écran.
const enCache = new Map();
export function chargerFeuilles(id) {
  if (!enCache.has(id)) {
    enCache.set(id, Promise.all(FEUILLES[id].map(async (nom) => [nom, depuisLeJeu((await fichiers[`./${nom}.css`]?.()) ?? '')])));
  }
  return enCache.get(id);
}
