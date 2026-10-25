// =====================================================================
//  Les outils de base des règles : camps, unités, pioche, dégâts, soins, fin de partie
//  (repris de l'ancien JS/jeu-cartes-moteur.js ; une seule différence voulue : l'égalité, voir nettoyer)
//
//  Ces fonctions MODIFIENT l'état qu'on leur donne : elles ne sont appelées que par appliquerAction
//  (src/moteur/actions.js), sur une COPIE de l'état. L'état d'origine n'est jamais touché.
// =====================================================================
import {
  MAIN_MAX, BONUS_DEFENSE, MALUS_EXPOSE, SEUIL_BASE, DEFENSE_HEROS,
} from '../data/regles.js';
import { MILICIEN } from '../data/cartes.js';
import { aCap, capsDe } from './cartes.js';

export const autre = (qui) => (qui === 'joueur' ? 'adverse' : 'joueur');
export const unites = (camp) => camp.terrain.filter(Boolean);
export const trouver = (camp, uid) => camp.terrain.find((u) => u?.uid === uid) ?? null;
export const placeLibre = (camp) => camp.terrain.findIndex((u) => !u);
// Le camp peut-il agir ? (son tour, partie en cours, pas de méditation en attente)
export const libre = (p, qui) => p.actif === qui && !p.fini && !p.camps[qui].meditation;

// Une unité posée sur le plateau. Son numéro (uid) vient de l'état : deux parties ne se mélangent pas
export function instancier(p, def) {
  p.compteurUid = (p.compteurUid ?? 0) + 1;
  return {
    uid: p.compteurUid, def, n: def.n, a: def.a, d: def.d ?? 1, h: def.h, hMax: def.h, caps: [...capsDe(def)],
    prete: aCap(def, 'charge'), aAttaque: false, defend: false, expose: false, gele: 0, bloquee: false,
    bouclier: aCap(def, 'bouclier'), esquiveUtilisee: false, interceptionUtilisee: false, capaciteUtilisee: false,
  };
}

// Pioche n cartes sur le dessus du Grimoire.
// - main pleine (MAIN_MAX) : la carte est brûlée et va au Tombeau
// - Grimoire vide : épuisement, le héros perd 1 PV, puis 2, puis 3… à chaque carte manquante
// Renvoie { piochees, brulees, epuisement } (epuisement : PV perdus). Après une pioche, l'appelant
// vérifie la fin de partie (nettoyer), car l'épuisement peut faire tomber un héros.
export function piocher(camp, n = 1) {
  const res = { piochees: [], brulees: [], epuisement: 0 };
  for (let i = 0; i < n; i++) {
    if (!camp.deck.length) {
      camp.epuisement += 1;
      camp.pv -= camp.epuisement;
      res.epuisement += camp.epuisement;
      continue;
    }
    const carte = camp.deck.shift();
    if (camp.main.length >= MAIN_MAX) { res.brulees.push(carte); camp.tombeau.push(carte); }
    else { camp.main.push(carte); res.piochees.push(carte); }
  }
  return res;
}

// Attaque et Défense du moment : Inspiration, posture défensive, exposition,
// terrain (Pravorn : Charge +1 Attaque ; Vharos : +1 Défense)
export function attaqueDe(p, qui, u) {
  const inspirants = unites(p.camps[qui]).filter((x) => x !== u && aCap(x, 'inspiration')).length;
  const terrain = p?.terrainId === 'pravorn' && aCap(u, 'charge') ? 1 : 0;
  return Math.max(0, u.a + inspirants + terrain);
}
export function defenseDe(u, p = null) {
  const terrain = p?.terrainId === 'vharos' ? 1 : 0;
  return Math.max(0, u.d + (u.defend ? BONUS_DEFENSE : 0) - (u.expose ? MALUS_EXPOSE : 0) + terrain);
}
// Seuil pour toucher une cible ({ camp, uid } ou { camp, heros })
export function seuilDe(p, cible) {
  if (cible.heros) return SEUIL_BASE + DEFENSE_HEROS;
  const t = trouver(p.camps[cible.camp], cible.uid);
  return SEUIL_BASE + (t ? defenseDe(t, p) : 0);
}
// Chance de toucher (de 5 % à 95 % : 1 rate toujours, 20 touche toujours)
export function chanceDeToucher(p, qui, u, cible) {
  const besoin = seuilDe(p, cible) - attaqueDe(p, qui, u) - (p.camps[qui].bonusDe ?? 0);
  return Math.min(0.95, Math.max(0.05, (21 - besoin) / 20));
}

export const peutAttaquer = (u) => !!u && u.prete && !u.aAttaque && !u.bloquee && u.a > 0;
// Rapide : elle peut se mettre en défense même après avoir attaqué
export const peutDefendre = (u) => !!u && u.prete && (!u.aAttaque || aCap(u, 'rapide')) && !u.bloquee && !u.defend;

// Une unité perd des PV. Tenace : la première fois qu'elle devrait tomber, elle reste à 1 PV
// (u.tenaceUtilisee n'existe qu'une fois le Trait déclenché). Renvoie vrai si Tenace a joué.
export function encaisser(u, degats) {
  u.h -= degats;
  if (u.h > 0 || !aCap(u, 'tenace') || u.tenaceUtilisee) return false;
  u.h = 1;
  u.tenaceUtilisee = true;
  return true;
}
export const memeCible = (x, y) => x.camp === y.camp && (x.heros ? y.heros : x.uid === y.uid);

// Retire les unités détruites (elles vont au Tombeau, sauf le Milicien du Destin qui n'est pas
// une carte) et regarde si un héros est tombé.
// CORRIGÉ : si les deux héros tombent en même temps, c'est une égalité (p.fini = 'egalite') ;
// l'ancien moteur donnait la victoire au camp « adverse ».
export function nettoyer(p) {
  const morts = [];
  for (const qui of ['joueur', 'adverse']) {
    const camp = p.camps[qui];
    let tombes = 0;
    camp.terrain = camp.terrain.map((u) => {
      if (u && u.h <= 0) {
        morts.push(u.uid);
        tombes += 1;
        if (u.def && u.def.id !== MILICIEN.id) camp.tombeau.push(u.def);
        return null;
      }
      return u;
    });
    if (!tombes) continue;
    // Ruines hantées : le camp pioche une carte par unité tombée
    if (p.terrainId === 'ruines') piocher(camp, tombes);
  }
  const joueurTombe = p.camps.joueur.pv <= 0;
  const adverseTombe = p.camps.adverse.pv <= 0;
  if (joueurTombe && adverseTombe) p.fini = 'egalite';
  else if (joueurTombe) p.fini = 'adverse';
  else if (adverseTombe) p.fini = 'joueur';
  return morts;
}

// Dégâts à une unité (le Bouclier les annule une fois) ; ev.touches reçoit le coup.
// Renvoie les dégâts réellement infligés (0 si le Bouclier les a absorbés)
export function blesser(p, campCible, t, degats, ev, source) {
  if (!t || degats <= 0) return 0;
  if (t.bouclier) {
    t.bouclier = false;
    ev.touches.push({ camp: campCible, uid: t.uid, texte: 'Bouclier !', etat: true });
    return 0;
  }
  const tenace = encaisser(t, degats);
  if (source) p.camps[source].stats.degats += degats;
  ev.touches.push({ camp: campCible, uid: t.uid, valeur: degats });
  if (tenace) ev.touches.push({ camp: campCible, uid: t.uid, texte: 'Tenace !', etat: true });
  return degats;
}

export function soignerHeros(camp, v, qui, ev) {
  const avant = camp.pv;
  camp.pv = Math.min(camp.pvMax, camp.pv + v);
  ev.touches.push({ camp: qui, heros: true, valeur: camp.pv - avant, soin: true });
}
