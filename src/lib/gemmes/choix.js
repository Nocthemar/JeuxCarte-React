// =====================================================================
//  Les Gemmes du Codex : les trois cartes du joueur, choisies dans sa collection et retenues dans le
//  navigateur, et celles de l'Ombre (tirées du catalogue selon la difficulté).
//  Chaque carte se charge avec les gemmes de sa rareté : les trois cartes sont de trois raretés différentes.
//  Une carte, pour ce mode : { cle, n, image, rarete } (cle : l'id de la carte dans la table cards).
// =====================================================================
import { melanger } from '../../moteur/hasard.js';
import { SORTES } from '../../moteur/gemmes.js';

const CLE = 'gemmes-cartes';
export const RANG_RARETE = Object.fromEntries(SORTES.map((r, k) => [r, k]));

// Une unité du Duel (moteur/cartes.js uniteDepuisCarte) -> une carte du mode
export const carteGemmes = (u) => ({
  cle: u.carte.id, n: u.carte.name, image: u.carte.image ?? null,
  rarete: RANG_RARETE[u.carte.rarity] !== undefined ? u.carte.rarity : 'commune',
});

// Les plus rares d'abord, puis par nom
export const trier = (cartes) => [...cartes].sort((a, b) => RANG_RARETE[b.rarete] - RANG_RARETE[a.rarete] || a.n.localeCompare(b.n, 'fr'));

export function lireChoix() {
  try { const v = JSON.parse(localStorage.getItem(CLE)); return Array.isArray(v) ? v.slice(0, 3) : null; } catch { return null; }
}
export function garderChoix(cles) {
  try { localStorage.setItem(CLE, JSON.stringify(cles)); } catch { /* stockage indisponible */ }
}

// Les cartes que le joueur peut choisir : sa collection. Moins de trois raretés différentes : le Codex lui
// prête une carte de chaque rareté qui manque (les moins rares d'abord), marquée « prêtée ».
export function reserveGemmes(collection, catalogue) {
  const miennes = trier((collection ?? []).map(carteGemmes));
  const raretes = new Set(miennes.map((c) => c.rarete));
  const pretees = [];
  for (const rarete of SORTES) {
    if (raretes.size + pretees.length >= 3) break;
    if (raretes.has(rarete)) continue;
    const c = trier((catalogue ?? []).map(carteGemmes)).reverse().find((x) => x.rarete === rarete);
    if (c) pretees.push({ ...c, pretee: true });
  }
  return [...miennes, ...pretees];
}

// Les trois cartes choisies (trois raretés différentes) ; ce qui manque : les plus rares de la réserve,
// d'une rareté pas encore prise
export function cartesDuChoix(cles, reserve) {
  const par = new Map(reserve.map((c) => [c.cle, c]));
  const choisies = [];
  for (const k of cles ?? []) {
    const c = par.get(k);
    if (c && !choisies.some((x) => x.rarete === c.rarete)) choisies.push(c);
  }
  for (const c of reserve) {
    if (choisies.length >= 3) break;
    if (!choisies.some((x) => x.rarete === c.rarete)) choisies.push(c);
  }
  return choisies.slice(0, 3);
}

// Les cartes de l'Ombre : trois raretés différentes, plus hautes quand elle est plus difficile, chacune chargée
// par une gemme tirée au hasard
const RARETES_OMBRE = {
  facile: [['commune', 'eveillee', 'mythique']],
  normal: [['commune', 'mythique', 'legendaire'], ['eveillee', 'mythique', 'legendaire'], ['commune', 'eveillee', 'legendaire']],
  difficile: [['mythique', 'legendaire', 'transcendante'], ['eveillee', 'legendaire', 'transcendante']],
};
export function cartesOmbre(catalogue, difficulte, h = Math.random) {
  const toutes = melanger((catalogue ?? []).map(carteGemmes), h);
  const presentes = SORTES.filter((r) => toutes.some((c) => c.rarete === r));
  const choix = (RARETES_OMBRE[difficulte] ?? RARETES_OMBRE.normal).filter((l) => l.every((r) => presentes.includes(r)));
  // (le catalogue n'a pas toutes les raretés voulues : les plus rares qu'il a, ou à défaut des cartes sans image)
  const raretes = choix.length ? choix[Math.floor(h() * choix.length)]
    : [...presentes.slice(-3), ...SORTES.filter((r) => !presentes.includes(r))].slice(0, 3);
  // Ses cartes ne se chargent pas forcément avec les gemmes de leur rareté : trois gemmes différentes, au hasard
  const gemmes = melanger(SORTES, h);
  return raretes.map((rarete, k) => ({ ...(toutes.find((c) => c.rarete === rarete) ?? { cle: 0, n: 'Ombre', image: null, rarete }), gemme: gemmes[k] }));
}
