// =====================================================================
//  Les Gemmes du Codex : les trois cartes du joueur (une par couleur), choisies dans sa collection et
//  retenues dans le navigateur, et celles de l'Ombre (tirées du catalogue selon la difficulté).
//  Une carte, pour ce mode : { cle, n, image, rarete } (cle : l'id de la carte dans la table cards).
// =====================================================================
import { auHasard, melanger } from '../../moteur/hasard.js';

const CLE = 'gemmes-cartes';
export const RANG_RARETE = { commune: 0, eveillee: 1, mythique: 2, legendaire: 3, transcendante: 4 };
export const NOM_RARETE = { commune: 'Commune', eveillee: 'Éveillée', mythique: 'Mythique', legendaire: 'Légendaire', transcendante: 'Transcendante' };

// Une unité du Duel (moteur/cartes.js uniteDepuisCarte) -> une carte du mode
export const carteGemmes = (u) => ({
  cle: u.carte.id, n: u.carte.name, image: u.carte.image ?? null,
  rarete: RANG_RARETE[u.carte.rarity] !== undefined ? u.carte.rarity : 'commune',
});

// Les plus rares d'abord, puis par nom
export const trier = (cartes) => [...cartes].sort((a, b) => RANG_RARETE[b.rarete] - RANG_RARETE[a.rarete] || a.n.localeCompare(b.n, 'fr'));

export function lireChoix() {
  try { const v = JSON.parse(localStorage.getItem(CLE)); return Array.isArray(v) && v.length === 3 ? v : null; } catch { return null; }
}
export function garderChoix(cles) {
  try { localStorage.setItem(CLE, JSON.stringify(cles)); } catch { /* stockage indisponible */ }
}

// Les cartes que le joueur peut choisir : sa collection. Moins de trois cartes : le Codex lui en prête
// (des communes du catalogue), marquées « prêtée ».
export function reserveGemmes(collection, catalogue) {
  const miennes = trier((collection ?? []).map(carteGemmes));
  if (miennes.length >= 3) return miennes;
  const pris = new Set(miennes.map((c) => c.cle));
  const pretees = trier((catalogue ?? []).map(carteGemmes)).reverse().filter((c) => !pris.has(c.cle))
    .slice(0, 3 - miennes.length).map((c) => ({ ...c, pretee: true }));
  return [...miennes, ...pretees];
}

// Les trois cartes choisies (dans l'ordre des couleurs) ; ce qui manque : les plus rares de la réserve
export function cartesDuChoix(cles, reserve) {
  const par = new Map(reserve.map((c) => [c.cle, c]));
  const choisies = (cles ?? []).map((k) => par.get(k) ?? null);
  const restantes = reserve.filter((c) => !choisies.includes(c));
  return [0, 1, 2].map((k) => choisies[k] ?? restantes.shift() ?? null);
}

// Les cartes de l'Ombre : plus rares quand elle est plus difficile
const RARETES_OMBRE = {
  facile: ['commune', 'eveillee'],
  normal: ['eveillee', 'mythique'],
  difficile: ['mythique', 'legendaire', 'transcendante'],
};
export function cartesOmbre(catalogue, difficulte, h = Math.random) {
  const toutes = (catalogue ?? []).map(carteGemmes);
  const voulues = toutes.filter((c) => RARETES_OMBRE[difficulte]?.includes(c.rarete));
  const tas = melanger(voulues.length >= 3 ? voulues : toutes, h);
  return [0, 1, 2].map((k) => tas[k] ?? auHasard(toutes, h) ?? { cle: 0, n: 'Ombre', image: null, rarete: 'commune' });
}
