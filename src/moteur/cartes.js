// =====================================================================
//  Les cartes : une carte du catalogue devient une unité, les limites du Grimoire, les coûts
//  (règles reprises de l'ancien JS/jeu-cartes-moteur.js, sans changement)
// =====================================================================
import {
  BASE, CAP_VEINE, TRAIT_PAR_NOM, VEINE_PAR_NOM, UNIQUE_PAR_NOM, COPIES_MAX, TAILLE_DECK, TRANSCENDANTES_MAX, OBJETS_MAX,
  JETS, DESTIN, TERRAINS,
} from '../data/regles.js';
import { CARTES_BASE, OBJETS } from '../data/cartes.js';
import { melanger } from './hasard.js';

// Actions par tour : 2, puis 3 à partir du 5e tour (la partie monte en puissance)
export const actionsDuTour = (tour) => (tour >= 5 ? 3 : 2);

export const puissance = (p) => (p === '∞' ? 120 : Number.isFinite(Number(p)) ? Number(p) : 50);
const sansAccents = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Une carte du catalogue (table cards) -> une unité du duel.
// Coût / Attaque / Défense / PV de base selon la rareté, ajustés par le rang (Rang I = le plus fort)
// et la puissance moyenne des attaques.
export function uniteDepuisCarte(carte) {
  const rarete = BASE[carte.rarity] ? carte.rarity : 'commune';
  const b = BASE[rarete];
  let { c, a, d, h } = b;
  if (carte.rank === 1) { a += 1; h += 1; }
  else if (carte.rank === 2) h += 1;

  const attaques = [carte.attack_1, carte.attack_2].filter((x) => x?.nom);
  const moyenne = attaques.length ? attaques.reduce((s, x) => s + puissance(x.puissance), 0) / attaques.length : 50;
  if (moyenne >= 80) { a += 1; h = Math.max(1, h - 1); }
  else if (moyenne <= 35) { a = Math.max(1, a - 1); d += 1; }

  // Une seule capacité : celle de sa Veine si la carte en détient une (VEINE_PAR_NOM), sinon son Trait
  // (TRAIT_PAR_NOM). Les Veines des attaques ne donnent plus de capacité : elles colorent la carte.
  const veines = attaques.map((x) => x.veine).filter(Boolean);
  const cle = sansAccents(carte.name);
  const [veineDetenue = null, veineNom = null] = VEINE_PAR_NOM[cle] ?? [];
  const trait = veineDetenue ? CAP_VEINE[veineDetenue] : TRAIT_PAR_NOM[cle] ?? null;
  // Les chiffres ne bougent pas encore (étape 3 : la puissance des raretés) : une mythique ou plus
  // dont les deux attaques donnaient la même capacité gardait +1 Défense, elle le garde
  if (!['commune', 'eveillee'].includes(rarete) && veines.length > 1 && CAP_VEINE[veines[0]] === CAP_VEINE[veines[1]]) d += 1;
  // Capacité unique : par le nom de la carte, sinon celle de sa rareté (légendaire, transcendante)
  const unique = UNIQUE_PAR_NOM[cle]
    ?? (rarete === 'legendaire' ? 'presence' : rarete === 'transcendante' ? 'fracas' : null);

  return {
    id: `c${carte.id}`, n: carte.name, c, t: 'u', a, d, h, caps: trait ? [trait] : [], veine: veines[0] ?? null,
    act: b.act ?? 1, condition: b.condition ?? null, unique, carte, veineNom,
  };
}

// Retrouve un objet à partir d'un nom d'inventaire (« Tonique d’endurance », « potion de soin »…)
const cleObjet = (nom) => String(nom).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, "'").trim().toLowerCase();
export const objetDepuisNom = (nom) => OBJETS.find((o) => cleObjet(o.n) === cleObjet(nom)) ?? null;

// Limites du Grimoire : 2 exemplaires d'une carte, 1 seul d'une Légendaire ou d'une Transcendante,
// une seule Transcendante, 4 objets
export const estObjet = (c) => !!c && OBJETS.some((o) => o.id === c.id);
export const estTranscendante = (c) => c?.carte?.rarity === 'transcendante';
export const estLegendaire = (c) => c?.carte?.rarity === 'legendaire';
export const copiesMax = (c) => (estTranscendante(c) || estLegendaire(c) ? 1 : COPIES_MAX);
// La carte c peut-elle encore entrer dans la liste (sans dépasser les limites) ?
export function peutAjouter(liste, c) {
  if (!c || liste.length >= TAILLE_DECK) return false;
  if (liste.filter((x) => x.id === c.id).length >= copiesMax(c)) return false;
  if (estObjet(c) && liste.filter(estObjet).length >= OBJETS_MAX) return false;
  if (estTranscendante(c) && liste.filter(estTranscendante).length >= TRANSCENDANTES_MAX) return false;
  return true;
}

// Le Grimoire d'un joueur : les cartes choisies (dans l'ordre, avec répétitions pour les exemplaires),
// dans les limites, puis complété avec les cartes de base jusqu'à TAILLE_DECK. Non mélangé.
export function grimoire(cartes = []) {
  const liste = [];
  const ajouter = (c) => { if (!peutAjouter(liste, c)) return false; liste.push(c); return true; };
  cartes.forEach(ajouter);
  // Complément : un exemplaire de chaque carte de base, puis un second, jusqu'à 20
  for (let tour = 0; tour < COPIES_MAX && liste.length < TAILLE_DECK; tour++) {
    for (const c of CARTES_BASE) ajouter(c);
  }
  return liste;
}

// Un Grimoire mélangé (h : la fonction de hasard)
export const construireDeck = (cartes, h) => melanger(grimoire(cartes), h);

// Coût réel d'une carte : le Jeton du marchand réduit la suivante ; le terrain d'Aelkor fait payer
// 1 de moins les sorts et les objets. camp.terrainId : le terrain du duel (recopié dans chaque camp)
export function coutDe(camp, carte) {
  if (carte.fx === 'jeton') return carte.c;
  let cout = carte.c - (camp.reduction ?? 0);
  if (carte.t === 's' && camp.terrainId === 'aelkor') cout -= 1;
  return Math.max(0, cout);
}
export const actionsDe = (carte) => carte?.act ?? 1;          // actions pour jouer une carte
export const capsDe = (x) => x?.caps ?? [];                   // capacités d'une carte ou d'une unité
export const aCap = (x, k) => capsDe(x).includes(k);

export const rollInfo = (q) => JETS.find((j) => j.q === q);
export const destinInfo = (de) => DESTIN.find((j) => de >= j.min && de <= j.max);
export const terrainDe = (p) => TERRAINS[p?.terrainId] ?? null;

// Attaque montrée à l'écran (nom, Veine), sans effet sur les dégâts : sur un bon jet (15 ou plus),
// la plus puissante des deux attaques de la carte, sinon l'autre. null pour les troupes du Codex.
export function attaqueJouee(def, de) {
  const liste = [def?.carte?.attack_1, def?.carte?.attack_2].filter((x) => x?.nom);
  if (!liste.length) return null;
  const [faible, forte = faible] = [...liste].sort((x, y) => puissance(x.puissance) - puissance(y.puissance));
  const choisie = de >= 15 ? forte : faible;
  return { nom: choisie.nom, veine: choisie.veine ?? null };
}
