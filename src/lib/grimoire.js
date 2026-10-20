// =====================================================================
//  Le Grimoire du joueur (le deck de 20 cartes du duel), côté menu (ancien JS/jeu-cartes.js)
//  20 cartes choisies dans la réserve : sa collection, les troupes et les sorts du Codex, ses objets
//  (2 exemplaires au plus, 1 seul d'une Transcendante, 2 Transcendantes, 4 objets au plus).
//  Ce qui manque est complété par des cartes de base (grimoire() du moteur).
//  Le choix est retenu dans le navigateur, sous la même clé qu'avant (le site Nocthémar la lit aussi).
// =====================================================================
import { TROUPES, SORTS } from '../data/cartes.js';
import { peutAjouter, estObjet } from '../moteur/index.js';

export const CLE_CHOIX = 'duel-couronnes-grimoire';

// La clé d'une carte dans le choix enregistré : « u12 » pour la carte 12 du catalogue, sinon son id
export const cleCarte = (c) => (c.carte ? `u${c.carte.id}` : c.id);

export function lireChoix() {
  try {
    const choix = JSON.parse(localStorage.getItem(CLE_CHOIX) ?? 'null');
    return Array.isArray(choix) ? choix : null;
  } catch { return null; }
}
export function garderChoix(choix) {
  try { localStorage.setItem(CLE_CHOIX, JSON.stringify(choix)); } catch { /* stockage indisponible */ }
}

// Les cartes qu'on peut mettre dans son Grimoire
//   persos : les unités de sa collection ; objets : ses objets de pouvoir (un de chaque)
export function reserve(persos, objetsInventaire) {
  const objets = [...new Map(objetsInventaire.map((o) => [o.id, o])).values()];
  return { persos, troupes: TROUPES, sorts: SORTS, objets, toutes: [...persos, ...TROUPES, ...SORTS, ...objets] };
}

// Les cartes d'un choix (clés), en respectant les limites (cartes disparues de la collection ignorées)
export function cartesChoisies(choix, toutes) {
  const cartes = [];
  for (const cle of choix ?? []) {
    const c = toutes.find((x) => cleCarte(x) === cle);
    if (peutAjouter(cartes, c)) cartes.push(c);
  }
  return cartes;
}

// Le Grimoire proposé d'office : la collection (favorites du profil d'abord) en 2 exemplaires,
// puis les objets possédés
export function choixParDefaut({ persos, objets }, idsFavorites) {
  const fav = idsFavorites.map((id) => persos.find((u) => u.carte.id === id)).filter(Boolean);
  const ordre = [...fav, ...persos.filter((u) => !fav.includes(u))];
  return [...ordre.flatMap((u) => [u, u]), ...objets.flatMap((o) => [o, o])].map(cleCarte);
}

// Les cartes du Grimoire du joueur, d'après les données du Duel (lib/donneesDuel.js) et son choix
// enregistré (sinon le Grimoire proposé d'office)
export function grimoireDuJoueur(donnees, choix = lireChoix()) {
  const res = reserve(donnees.collection ?? [], donnees.objets ?? []);
  return cartesChoisies(choix ?? choixParDefaut(res, donnees.favorites ?? []), res.toutes);
}

export const exemplaires = (cartes, c) => cartes.filter((x) => x === c).length;

// Genre et rareté d'une carte de la réserve (filtres et tri du constructeur)
export const genreDe = (c) => (c.carte ? 'collection' : estObjet(c) ? 'objet' : c.t === 's' ? 'sort' : 'troupe');
export const rareteGrimoire = (c) => c.carte?.rarity ?? (estObjet(c) ? 'objet' : c.t === 's' ? 'sort' : 'base');
export const ORDRE_RARETE = ['base', 'sort', 'objet', 'commune', 'eveillee', 'mythique', 'legendaire', 'transcendante'];
