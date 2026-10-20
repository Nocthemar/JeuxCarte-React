// =====================================================================
//  Comparaison avec l'ANCIEN moteur (ancien/JS/jeu-cartes-moteur.js), action par action
//
//  Des centaines de parties complètes, l'Ombre contre l'Ombre, avec des Grimoires, des terrains et
//  des difficultés tirés au hasard. Les deux moteurs reçoivent exactement les mêmes dés : l'ancien
//  tire avec Math.random (remplacé ici par le même générateur que le nouveau), le nouveau avec la
//  graine de l'état. Après CHAQUE action, l'état et l'événement doivent être identiques.
//
//  Les 4 corrections validées changent volontairement le résultat ; une partie est donc arrêtée
//  (sans échec) juste avant le premier de ces cas :
//    1. « adverse » a commencé et « joueur » va commencer son 4e tour (3 actions ici, 2 avant)
//    2. un Nécessaire d'aventurier fait son effet à 10 énergie ou plus
//    3. Kaéliss utilise « Maître du Flot » sur une unité protégée par un Bouclier
//    4. les deux héros sont tombés en même temps (égalité)
//  Chaque correction a ses propres tests dans regles.test.js.
// =====================================================================
import { describe, it, expect, vi, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as N from '../../src/moteur/index.js';
import { generateur } from '../../src/moteur/hasard.js';
import { OBJETS } from '../../src/data/cartes.js';
import { CATALOGUE } from './catalogue.js';

const CHEMIN_ANCIEN = ['ancien/JS/jeu-cartes-moteur.js', 'src/Ancient/Nochthémar JEU DE CARTE/JS/jeu-cartes-moteur.js']
  .map((c) => resolve(c)).find(existsSync);

// Un ancien moteur tout neuf (son compteur d'unités repart de 0, comme le nouveau)
async function ancienMoteur() {
  vi.resetModules();
  return import(/* @vite-ignore */ pathToFileURL(CHEMIN_ANCIEN).href);
}

afterEach(() => vi.restoreAllMocks());

// L'état sans ce que seul le nouveau moteur range dedans
function normaliser(p) {
  const c = structuredClone(p);
  delete c.graine; delete c.compteurUid; delete c.evenements; delete c.tirages;
  for (const camp of Object.values(c.camps)) delete camp.toursJoues;
  return c;
}
// Le nouveau moteur note dans l'événement l'action choisie par l'Ombre (ev.ia) : on l'enlève
const sansIa = (ev) => { const copie = { ...ev }; delete copie.ia; return copie; };

// Une action de l'IA dans l'ancien moteur (comme l'ancien appliquer() de JS/jeu-cartes.js)
function appliquerAncien(A, p, qui, a) {
  if (a.type === 'jouer') return A.jouer(p, qui, a.index, a.cible ?? null);
  if (a.type === 'attaque') return A.attaquer(p, qui, a.uid, a.cible);
  if (a.type === 'destin') return A.destin(p, qui);
  if (a.type === 'defendre') return A.defendre(p, qui, a.uid);
  if (a.type === 'capacite') return A.activer(p, qui, a.uid, a.cible ?? null);
  if (a.type === 'defausser') return A.defausser(p, qui, a.index);
  if (a.type === 'mediter') return A.mediter(p, qui);
  if (a.type === 'placer') return A.placerSous(p, qui, a.index ?? null);
  throw new Error(`action inconnue ${a.type}`);
}

// Le cas d'une correction est-il atteint ? (avant l'action a de l'ancien moteur)
function correctionAvant(A, p, qui, a) {
  const camp = p.camps[qui];
  if (a.type === 'jouer') {
    const carte = camp.main[a.index];
    if (carte?.fx === 'coffre' && camp.energie - A.coutDe(camp, carte) >= 10) return 'coffre';
  }
  if (a.type === 'capacite') {
    const u = A.trouver(camp, a.uid);
    const t = a.cible && A.trouver(p.camps[a.cible.camp], a.cible.uid);
    if (u?.def?.unique === 'kaeliss' && t?.bouclier) return 'kaeliss';
  }
  return null;
}
const egalite = (p) => p.camps.joueur.pv <= 0 && p.camps.adverse.pv <= 0;

// Une partie complète ; renvoie { fin, actions, compteurs }
async function jouerPartie(graine, { equipes = false } = {}) {
  const A = await ancienMoteur();
  vi.spyOn(Math, 'random').mockImplementation(generateur(graine));   // les dés de l'ancien moteur
  const choix = generateur(graine ^ 0x5bd1e995);                     // les choix du test (Grimoires…)
  const tirer = (n) => Math.floor(choix() * n);

  // Les Grimoires : quelques cartes du catalogue et objets, les mêmes dans les deux moteurs
  const catA = CATALOGUE.map(A.uniteDepuisCarte);
  const catN = CATALOGUE.map(N.uniteDepuisCarte);
  const deck = () => {
    const ids = Array.from({ length: tirer(14) }, () => tirer(catA.length));
    const objets = Array.from({ length: tirer(5) }, () => tirer(OBJETS.length));
    return {
      A: A.grimoire([...ids.map((i) => catA[i]), ...objets.map((i) => A.OBJETS[i])]),
      N: N.grimoire([...ids.map((i) => catN[i]), ...objets.map((i) => OBJETS[i])]),
    };
  };
  const premier = choix() < 0.5 ? 'joueur' : 'adverse';
  const options = { ...(choix() < 0.3 ? { pvAdverse: 26 } : {}), ...(choix() < 0.2 ? { energieBonusAdverse: 1 } : {}) };
  const DIFF = ['facile', 'normal', 'difficile'];
  const difficulte = { joueur: DIFF[tirer(3)], adverse: DIFF[tirer(3)] };
  const compteurs = {};
  const compter = (k) => { compteurs[k] = (compteurs[k] ?? 0) + 1; };

  let pA;
  let e;
  const verifier = (evsA) => {
    expect(normaliser(e)).toEqual(normaliser(pA));
    expect(e.evenements.map(sansIa)).toEqual(evsA);
  };

  // Création et renvoi de main
  if (!equipes) {
    const [dJ, dA] = [deck(), deck()];
    pA = A.creerPartie(dJ.A, dA.A, 'Moi', 'Ombre', premier, options);
    e = N.creerPartie(dJ.N, dA.N, 'Moi', 'Ombre', premier, { ...options, graine });
    expect(normaliser(e)).toEqual(normaliser(pA));
    const indAdv = A.choixRenvoiIA(pA.camps.adverse);
    const evR1 = A.renvoyerMain(pA, 'adverse', indAdv);
    e = N.appliquerAction(e, { type: 'renvoi', qui: 'adverse', indices: indAdv });
    verifier([evR1]);
    const indJ = [0, 1, 2, 3].filter(() => choix() < 0.3);
    const evR2 = A.renvoyerMain(pA, 'joueur', indJ);
    const evT = A.debutTour(pA);
    e = N.appliquerAction(e, { type: 'renvoi', qui: 'joueur', indices: indJ });
    verifier([evR2, evT]);
  } else {
    const membres = (qui) => [0, 1].map((i) => ({ nom: `${qui}${i}`, d: deck() }));
    const eq = { joueur: membres('joueur'), adverse: membres('adverse') };
    const pour = (k) => ({ joueur: eq.joueur.map((m) => ({ nom: m.nom, deck: m.d[k] })), adverse: eq.adverse.map((m) => ({ nom: m.nom, deck: m.d[k] })) });
    pA = A.creerPartieEquipes(pour('A'), premier, options);
    e = N.creerPartieEquipes(pour('N'), premier, { ...options, graine });
    expect(normaliser(e)).toEqual(normaliser(pA));
    for (const [qui, i] of [['joueur', 0], ['joueur', 1], ['adverse', 0], ['adverse', 1]]) {
      const ind = [0, 1, 2, 3].filter(() => choix() < 0.3);
      const evs = [A.renvoyerMainMembre(pA, qui, i, ind)];
      if (A.renvoiFini(pA)) { const ev = A.debutTour(pA); evs.push({ ...ev, membre: pA.camps[ev.qui].membreActif }); }
      e = N.appliquerAction(e, { type: 'renvoi', qui, membre: i, indices: ind });
      verifier(evs);
    }
  }

  // Les tours
  const toursJoueur = { n: 1 * (premier === 'joueur') };
  const finDeTour = () => {
    // Correction 1 : « joueur » va commencer son 4e tour alors qu'« adverse » a commencé
    if (pA.actif === 'adverse' && premier === 'adverse' && toursJoueur.n === 3) return 'tours';
    A.finTour(pA);
    if (pA.actif === 'joueur') toursJoueur.n += 1;
    const ev = A.debutTour(pA);
    return equipes ? { ...ev, membre: pA.camps[ev.qui].membreActif } : ev;
  };

  for (let tour = 0; tour < 150; tour++) {
    if (pA.fini) return { fin: 'finie', compteurs };
    const qui = pA.actif;
    let i = 0;
    for (; i < 30; i++) {
      const a = A.ai(pA, qui, difficulte[qui]);
      if (!a) {
        const evT = finDeTour();
        if (evT === 'tours') return { fin: 'arrêtée (correction 1 : actions)', compteurs };
        e = N.appliquerAction(e, { type: 'ia', qui, difficulte: difficulte[qui] });
        compter('fin');
        if (egalite(pA)) return { fin: 'arrêtée (correction 4 : égalité)', compteurs };
        verifier([evT]);
        break;
      }
      const correction = correctionAvant(A, pA, qui, a);
      if (correction) return { fin: `arrêtée (correction ${correction === 'coffre' ? 2 : 3} : ${correction})`, compteurs };
      const evA = appliquerAncien(A, pA, qui, a);
      expect(evA).not.toBeNull();
      e = N.appliquerAction(e, { type: 'ia', qui, difficulte: difficulte[qui] });
      compter(a.type === 'jouer' ? `jouer:${evA.carte.fx ?? evA.carte.unique ?? 'unite'}` : a.type);
      if (a.type === 'capacite') compter(`capacite:${A.trouver(pA.camps[qui], a.uid)?.def.unique ?? 'morte'}`);
      if (egalite(pA)) return { fin: 'arrêtée (correction 4 : égalité)', compteurs };
      verifier([evA]);
      if (pA.fini) return { fin: 'finie', compteurs };
    }
    if (i === 30) {
      const evT = finDeTour();
      if (evT === 'tours') return { fin: 'arrêtée (correction 1 : actions)', compteurs };
      e = N.appliquerAction(e, { type: 'fin', qui });
      verifier([evT]);
    }
  }
  return { fin: 'trop longue', compteurs };
}

// Les résultats de toutes les parties d'une série, résumés
function bilan(titre, resultats) {
  const fins = {};
  const total = {};
  for (const r of resultats) {
    fins[r.fin] = (fins[r.fin] ?? 0) + 1;
    for (const [k, v] of Object.entries(r.compteurs)) total[k] = (total[k] ?? 0) + v;
  }
  console.log(`\n${titre}\n  fins :`, fins, '\n  actions comparées :', total);
  return { fins, total };
}

describe("Comparaison avec l'ancien moteur", () => {
  it('trouve l’ancien moteur', () => {
    expect(CHEMIN_ANCIEN, 'ancien/JS/jeu-cartes-moteur.js introuvable').toBeTruthy();
  });

  it('transforme les cartes du catalogue en unités exactement de la même façon', async () => {
    const A = await ancienMoteur();
    expect(CATALOGUE.map(N.uniteDepuisCarte)).toEqual(CATALOGUE.map(A.uniteDepuisCarte));
    expect(N.grimoire([])).toEqual(A.grimoire([]));
  });

  it('1 contre 1 : 400 parties identiques action par action', async () => {
    const resultats = [];
    for (let g = 1; g <= 400; g++) resultats.push(await jouerPartie(g * 7919));
    const { fins, total } = bilan('1 contre 1', resultats);
    expect(fins['trop longue']).toBeUndefined();
    expect(fins.finie).toBeGreaterThan(150);   // la plupart des parties vont jusqu'au bout
    // Toutes les sortes d'actions ont été comparées
    for (const k of ['attaque', 'defendre', 'destin', 'mediter', 'placer', 'defausser', 'capacite', 'fin',
      'jouer:unite', 'jouer:heal', 'jouer:coffre', 'jouer:talisman', 'jouer:rage', 'jouer:jeton', 'jouer:ready',
      'jouer:unit', 'jouer:face', 'jouer:buff', 'jouer:draw', 'jouer:aoe', 'jouer:maitre', 'jouer:reine']) {
      expect(total[k] ?? 0, `aucune action « ${k} » comparée`).toBeGreaterThan(0);
    }
  }, 300_000);

  it('2 contre 2 : 100 parties identiques action par action', async () => {
    const resultats = [];
    for (let g = 1; g <= 100; g++) resultats.push(await jouerPartie(g * 104729, { equipes: true }));
    const { fins } = bilan('2 contre 2', resultats);
    expect(fins['trop longue']).toBeUndefined();
    expect(fins.finie).toBeGreaterThan(30);
  }, 300_000);
});
