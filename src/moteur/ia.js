// =====================================================================
//  L'IA : la prochaine action de l'Ombre, ou null pour finir le tour
//  { type: 'jouer', index, cible } | { type: 'destin' } | { type: 'attaque', uid, cible }
//  | { type: 'defendre', uid } | { type: 'capacite', uid, cible }
//  | { type: 'defausser', index } | { type: 'mediter' } | { type: 'placer', index }
//  Elle suit les mêmes règles que le joueur, avec ses actions du tour.
//  difficulte : 'facile' (oublie parfois une carte, vise au hasard, ne se défend pas, Destin rare),
//               'normal' (le jeu habituel), 'difficile' (Destin plus souvent ; les boss
//               ont en plus des PV et de l'énergie en bonus, voir creerPartie)
//  (repris de l'ancien JS/jeu-cartes-moteur.js, sans changement ; son hasard vient de l'état)
// =====================================================================
import { ENERGIE_MAX } from '../data/regles.js';
import { capsDe, aCap } from './cartes.js';
import { hasard } from './hasard.js';
import { autre, unites, trouver, attaqueDe, chanceDeToucher, peutAttaquer, peutDefendre } from './base.js';
import {
  peutJouer, peutActiver, capaciteActive, ciblesCapacite, peutDestin, ciblesAttaque, peutDefausser, peutMediter,
} from './partie.js';

const CHANCE_DESTIN = { facile: 0.15, normal: 0.4, difficile: 0.6 };

// Renvoi de main de l'IA : les cartes trop chères pour les premiers tours (coût 5 ou plus)
export function choixRenvoiIA(camp) {
  return camp.main.map((c, i) => (c.c >= 5 ? i : -1)).filter((i) => i >= 0);
}

// Valeur d'une attaque pour l'IA : dégâts espérés, unités tuées, riposte encaissée
function valeurAttaque(p, qui, u, cible) {
  const adv = autre(qui);
  const chance = chanceDeToucher(p, qui, u, cible);
  const atk = attaqueDe(p, qui, u);
  if (cible.heros) {
    const pv = p.camps[adv].pv;
    return chance * atk * (pv <= atk ? 6 : pv <= 8 ? 1.6 : 1.1);
  }
  const t = trouver(p.camps[adv], cible.uid);
  const tue = !t.bouclier && t.h <= atk;
  let v = chance * (tue ? 3 + t.a * 1.5 + t.hMax * 0.4 + (capsDe(t).length + (t.def.unique ? 2 : 0)) : (t.bouclier ? 0.5 : atk * 0.7));
  // Riposte si la cible survit
  if ((aCap(t, 'riposte') || t.defend) && (!tue || chance < 1)) {
    const coup = attaqueDe(p, adv, t);
    v -= (1 - chance * (tue ? 1 : 0)) * (coup >= u.h ? 2 + u.a * 1.5 : coup * 0.5);
  }
  return v;
}

// ATTENTION : l'IA tire au hasard dans l'état (p.graine avance). Elle n'est donc appelée que par
// appliquerAction (action « ia »), sur une copie de l'état.
export function ai(p, qui = 'adverse', difficulte = 'normal') {
  const camp = p.camps[qui];
  const adv = p.camps[autre(qui)];
  const ennemis = unites(adv);
  const facile = difficulte === 'facile';
  const h = () => hasard(p);

  // 0. Méditation en cours : la carte la plus chère qu'elle ne pourra pas jouer bientôt part dessous
  if (camp.meditation) {
    const loin = camp.meditation
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => c.c > Math.min(ENERGIE_MAX, camp.energieMax + 2))
      .sort((x, y) => y.c.c - x.c.c)[0];
    return { type: 'placer', index: loin ? loin.i : null };
  }

  if (camp.actions > 0) {
    // 1. Victoire immédiate avec un sort sur le héros
    const fatal = camp.main.findIndex((c, i) => c.fx === 'face' && c.v >= adv.pv && peutJouer(p, qui, i));
    if (fatal >= 0) return { type: 'jouer', index: fatal };

    // 2. Cartes, de la plus chère à la moins chère, si elles servent à quelque chose
    const ordre = camp.main.map((c, i) => ({ c, i })).filter(({ i }) => peutJouer(p, qui, i)).sort((x, y) => y.c.c - x.c.c);
    // Facile : une fois sur quatre, l'IA « oublie » ses cartes et passe aux attaques
    const oublie = facile && h() < 0.25;
    for (const { c, i } of oublie ? [] : ordre) {
      if (c.t === 'u') return { type: 'jouer', index: i };
      if (c.fx === 'unit') {
        // de préférence une unité qu'il tue, la plus menaçante
        const tues = ennemis.filter((u) => u.h <= c.v && !u.bouclier).sort((x, y) => y.a - x.a);
        const cible = tues[0] ?? (c.v >= 4 ? [...ennemis].sort((x, y) => y.a - x.a)[0] : null);
        if (cible) return { type: 'jouer', index: i, cible: { camp: autre(qui), uid: cible.uid } };
        continue;
      }
      if (c.fx === 'buff' || c.fx === 'rage') {
        const u = [...unites(camp)].sort((x, y) => (y.a + y.h) - (x.a + x.h))[0];
        return { type: 'jouer', index: i, cible: { camp: qui, uid: u.uid } };
      }
      if (c.fx === 'ready') {
        if (camp.actions < 2) continue;   // il faut encore une action pour attaquer
        const u = unites(camp).filter((x) => x.aAttaque && x.a > 0 && !x.bloquee).sort((x, y) => y.a - x.a)[0];
        return { type: 'jouer', index: i, cible: { camp: qui, uid: u.uid } };
      }
      if (c.fx === 'talisman' && (camp.bonusDe || !unites(camp).some(peutAttaquer) || camp.actions < 2)) continue;
      if (c.fx === 'jeton' && (camp.reduction || !camp.main.some((x) => x !== c && x.c > camp.energie && x.c - c.v <= camp.energie))) continue;
      if (c.fx === 'aoe' && ennemis.length < 2) continue;
      if (c.fx === 'heal' && camp.pv > camp.pvMax - c.v) continue;
      if (c.fx === 'draw' && camp.main.length > 5) continue;
      return { type: 'jouer', index: i };
    }

    // 3. Capacités des grandes cartes
    if (!facile) {
      for (const u of unites(camp)) {
        if (!peutActiver(p, qui, u.uid)) continue;
        if (capaciteActive(u).utile && !capaciteActive(u).utile(p, qui, u)) continue;
        const cibles = ciblesCapacite(p, qui, u.uid);
        if (!cibles) return { type: 'capacite', uid: u.uid };
        const t = cibles.map((c) => trouver(adv, c.uid)).sort((x, y) => (y.h <= 3) - (x.h <= 3) || y.a - x.a)[0];
        if (t) return { type: 'capacite', uid: u.uid, cible: { camp: autre(qui), uid: t.uid } };
      }
    }

    // 4. Le Destin, plus ou moins souvent selon la difficulté, s'il reste de l'énergie
    if (peutDestin(p, qui) && camp.pv > 3 && h() < (CHANCE_DESTIN[difficulte] ?? 0.4)) return { type: 'destin' };

    // 5. Attaques : la meilleure cible de chaque unité prête (facile : au hasard)
    const pretes = unites(camp).filter(peutAttaquer).sort((x, y) => y.a - x.a);
    let meilleure = null;
    for (const u of pretes) {
      const cibles = ciblesAttaque(p, qui, u.uid);
      if (facile) return { type: 'attaque', uid: u.uid, cible: cibles[Math.floor(h() * cibles.length)] };
      for (const cible of cibles) {
        const v = valeurAttaque(p, qui, u, cible);
        if (!meilleure || v > meilleure.v) meilleure = { v, uid: u.uid, cible };
      }
    }
    if (meilleure && meilleure.v > 0.4) return { type: 'attaque', uid: meilleure.uid, cible: meilleure.cible };

    // 6. Défendre : la plus solide de ses unités, si la menace adverse est réelle
    if (!facile) {
      const menace = ennemis.reduce((s, u) => s + u.a, 0);
      const aGarder = unites(camp).filter(peutDefendre).sort((x, y) => (y.h + y.d) - (x.h + x.d))[0];
      if (aGarder && menace > 0 && (menace >= camp.pv / 2 || ennemis.some((e) => e.a >= aGarder.h))) {
        return { type: 'defendre', uid: aGarder.uid };
      }
    }
    // Sinon, la meilleure attaque même médiocre
    if (meilleure && meilleure.v > 0) return { type: 'attaque', uid: meilleure.uid, cible: meilleure.cible };
  }

  // 7. Énergie restante (sans action) : défausser une carte injouable avant longtemps, ou méditer
  if (!facile && peutDefausser(p, qui) && !camp.main.some((c, i) => peutJouer(p, qui, i))) {
    const lourde = camp.main.map((c, i) => ({ c, i })).filter(({ c }) => c.c > camp.energieMax + 2).sort((x, y) => y.c.c - x.c.c)[0];
    if (lourde) return { type: 'defausser', index: lourde.i };
  }
  if (!facile && peutMediter(p, qui) && camp.deck.length >= 3) return { type: 'mediter' };
  return null;
}
