// =====================================================================
//  Le niveau caché de l'Ombre (duel contre l'IA, hors mode Histoire)
//  (repris de l'ancien JS/jeu-cartes-ombre.js ; l'élan, lui, est rangé dans le navigateur par
//  src/lib/elan.js : le moteur ne touche jamais au stockage)
//
//  L'Ombre joue un Grimoire « en miroir » du tien. Pour chaque carte de ton Grimoire, elle prend
//  une carte de même rang :
//    carte de base du Codex -> une carte de base de coût voisin
//    commune / éveillée / mythique / légendaire / transcendante -> une carte du catalogue de la même rareté
//    objet de pouvoir -> un objet de pouvoir
//  L'élan (-3 à +3, selon tes victoires et défaites) fait monter (ou descendre) 2 cartes par point
//  d'un rang, et donne 1 PV de plus (ou de moins) à l'Ombre.
// =====================================================================
import { CARTES_BASE, OBJETS } from '../data/cartes.js';
import { estObjet, grimoire, peutAjouter } from './cartes.js';
import { melanger, auHasard } from './hasard.js';

const RANGS = ['base', 'commune', 'eveillee', 'mythique', 'legendaire', 'transcendante'];
export const ELAN_MAX = 3;
const CARTES_PAR_ELAN = 2;

// Rang d'une carte du Grimoire : 0 = carte de base, 1 à 5 = rareté d'une carte du catalogue, null = objet
function rangDe(c) {
  if (estObjet(c)) return null;
  const r = RANGS.indexOf(c.carte?.rarity);
  return r > 0 ? r : 0;
}

// Le Grimoire de l'Ombre, en miroir de celui du joueur (20 cartes, complément compris), mélangé.
// catalogue : les unités du catalogue (uniteDepuisCarte) ; elan : de -3 à +3 ; h : la fonction de hasard
export function grimoireOmbre(grimoireJoueur, catalogue, elan, h) {
  const modele = grimoireJoueur.map((c) => ({ c, rang: rangDe(c) }));

  // L'élan : quelques cartes montent d'un rang (au hasard), ou descendent (les plus fortes d'abord ;
  // une carte de base qui descend devient une carte de base moins chère)
  const n = Math.abs(elan) * CARTES_PAR_ELAN;
  const cartesDuModele = melanger(modele.filter((m) => m.rang !== null), h);
  if (elan > 0) {
    for (const m of cartesDuModele.slice(0, n)) m.rang = Math.min(RANGS.length - 1, m.rang + 1);
  } else if (elan < 0) {
    for (const m of cartesDuModele.sort((x, y) => y.rang - x.rang).slice(0, n)) {
      if (m.rang > 0) m.rang -= 1;
      else m.moinsChere = true;
    }
  }

  const cartes = [];
  const libre = (c) => peutAjouter(cartes, c);

  // Une carte de base de coût voisin (même genre : troupe ou sort), sinon n'importe quelle carte de base ;
  // moinsChere : strictement moins chère (élan négatif), si possible
  const carteBase = (cout, genre, moinsChere = false) => {
    const pool = CARTES_BASE.filter((x) => libre(x) && x.t === genre);
    const voisines = moinsChere
      ? pool.filter((x) => x.c < cout).sort((a, b) => b.c - a.c).filter((x, _, l) => x.c === l[0].c)
      : pool.filter((x) => Math.abs(x.c - cout) <= 1);
    return auHasard(voisines.length ? voisines : pool.length ? pool : CARTES_BASE.filter(libre), h);
  };
  // Une carte du catalogue de ce rang ; s'il n'y en a plus, le rang le plus proche (en dessous d'abord)
  const carteDuRang = (rang, cout, genre) => {
    for (let ecart = 0; ecart < RANGS.length; ecart++) {
      for (const r of ecart ? [rang - ecart, rang + ecart] : [rang]) {
        if (r < 0 || r >= RANGS.length) continue;
        if (r === 0) { const b = carteBase(cout, genre); if (b) return b; continue; }
        const choix = catalogue.filter((u) => u.carte?.rarity === RANGS[r] && libre(u));
        if (choix.length) return auHasard(choix, h);
      }
    }
    return null;
  };

  for (const { c, rang, moinsChere } of modele) {
    const memeCarte = rangDe(c) === rang && !moinsChere && libre(c);   // carte inchangée par l'élan
    const carte = rang === null
      ? auHasard(OBJETS.filter(libre), h)
      : rang === 0 ? (memeCarte ? c : carteBase(c.c, c.t, moinsChere)) : carteDuRang(rang, c.c, c.t);
    if (carte) cartes.push(carte);
  }
  return melanger(grimoire(cartes), h);
}

// PV en plus (ou en moins) pour l'Ombre selon l'élan
export const pvElan = (elan) => elan;

// L'élan après un duel : +1 pour une victoire, -1 pour une défaite (entre -3 et +3)
export const elanApres = (elan, gagne) => Math.max(-ELAN_MAX, Math.min(ELAN_MAX, elan + (gagne ? 1 : -1)));
