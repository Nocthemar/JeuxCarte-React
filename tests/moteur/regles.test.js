// =====================================================================
//  Les règles du duel, une par une (scénarios construits à la main, dés forcés avec etat.tirages)
// =====================================================================
import { describe, it, expect } from 'vitest';
import { creerPartie, appliquerAction, defenseDe, actionsDuTour, uniteDepuisCarte, UNIQUES, grimoire } from '../../src/moteur/index.js';
import { faceD20 } from '../../src/moteur/hasard.js';
import { instancier, piocher, nettoyer } from '../../src/moteur/base.js';
import { TROUPES, OBJETS, SORTS } from '../../src/data/cartes.js';
import { CATALOGUE } from './catalogue.js';

const ECUYER = { ...TROUPES[0], caps: [] };   // 1 / 1 / 2, sans son Trait (Rapide) pour ces tests
const objet = (fx) => OBJETS.find((o) => o.fx === fx);

// Une partie sur les Lices de Pravorn (seule règle : Charge +1, et aucune unité des tests n'a Charge),
// renvois faits : c'est le premier tour de `premier`
function nouvellePartie({ premier = 'joueur', terrain = 'pravorn', deck = Array(20).fill(ECUYER) } = {}) {
  let e = creerPartie(deck, deck, 'Moi', 'Ombre', premier, { terrain, graine: 42 });
  e = appliquerAction(e, { type: 'renvoi', qui: 'joueur', indices: [] });
  e = appliquerAction(e, { type: 'renvoi', qui: 'adverse', indices: [] });
  return e;
}
// Pose une unité (définie à la main) dans le camp `qui`, prête à agir ; renvoie son uid
function poser(e, qui, def, place = e.camps[qui].terrain.indexOf(null)) {
  const u = instancier(e, { n: 'Test', c: 1, t: 'u', caps: [], ...def });
  u.prete = true;
  e.camps[qui].terrain[place] = u;
  return u.uid;
}
const attaque = (e, uid, cible, ...faces) => {
  e.tirages = faces.map(faceD20);
  return appliquerAction(e, { type: 'attaque', qui: 'joueur', uid, cible });
};
const HEROS = { camp: 'adverse', heros: true };

describe('Le jet d’attaque : d20 + Attaque contre 8 + Défense de la cible', () => {
  // Attaque 3 contre un héros (Défense 2) : seuil 10
  const preparer = () => { const e = nouvellePartie(); return { e, uid: poser(e, 'joueur', { a: 3, d: 1, h: 5 }) }; };

  it('touché : 7 + 3 = 10, le seuil est atteint, dégâts = Attaque', () => {
    const { e, uid } = preparer();
    const apres = attaque(e, uid, HEROS, 7);
    const ev = apres.evenements[0];
    expect([ev.de, ev.total, ev.seuil, ev.info.q, ev.degats]).toEqual([7, 10, 10, 'normal', 3]);
    expect(apres.camps.adverse.pv).toBe(17);
  });
  it('coup solide : seuil + 5 atteint, +1 dégât', () => {
    const { e, uid } = preparer();
    const ev = attaque(e, uid, HEROS, 12).evenements[0];
    expect([ev.total, ev.info.q, ev.degats]).toEqual([15, 'solide', 4]);
  });
  it('critique : un 20 naturel touche toujours et double les dégâts', () => {
    const e = nouvellePartie();
    const uid = poser(e, 'joueur', { a: 3, d: 1, h: 5 });
    const cible = poser(e, 'adverse', { a: 1, d: 30, h: 20 });   // Défense 30 : intouchable sauf critique
    const ev = attaque(e, uid, { camp: 'adverse', uid: cible }, 20).evenements[0];
    expect([ev.info.q, ev.degats]).toEqual(['critique', 6]);
  });
  it('échec critique : un 1 naturel rate, et l’attaquant est exposé (-2 Défense)', () => {
    const { e, uid } = preparer();
    const apres = attaque(e, uid, HEROS, 1);
    const ev = apres.evenements[0];
    expect([ev.info.q, ev.degats, ev.expose]).toEqual(['echec', 0, true]);
    const u = apres.camps.joueur.terrain.find((x) => x?.uid === uid);
    expect(defenseDe(u, apres)).toBe(0);   // Défense 1 - 2, jamais en dessous de 0
    expect(apres.camps.adverse.pv).toBe(20);
  });
  it('Neiges d’Erynedhal : un 2 est aussi un échec critique', () => {
    const e = nouvellePartie({ terrain: 'erynedhal' });
    const uid = poser(e, 'joueur', { a: 3, d: 1, h: 5 });
    expect(attaque(e, uid, HEROS, 2).evenements[0].info.q).toBe('echec');
  });
  it('le héros a 2 de Défense : il faut 10 au total', () => {
    const { e, uid } = preparer();
    expect(attaque(e, uid, HEROS, 6).evenements[0].seuil).toBe(10);
  });
});

describe('L’Éraflure', () => {
  const preparer = () => { const e = nouvellePartie(); return { e, uid: poser(e, 'joueur', { a: 3, d: 1, h: 5 }) }; };
  it('sous le seuil avec un dé de 5 ou plus : 1 dégât quand même', () => {
    const { e, uid } = preparer();
    const apres = attaque(e, uid, HEROS, 6);   // 6 + 3 = 9 < 10
    expect([apres.evenements[0].info.q, apres.evenements[0].degats, apres.camps.adverse.pv]).toEqual(['eraflure', 1, 19]);
  });
  it('sous le seuil avec un dé de 5 tout juste : Éraflure', () => {
    const { e, uid } = preparer();
    expect(attaque(e, uid, HEROS, 5).evenements[0].info.q).toBe('eraflure');
  });
  it('sous le seuil avec un dé de 2 à 4 : raté, aucun dégât', () => {
    for (const face of [2, 3, 4]) {
      const { e, uid } = preparer();
      const apres = attaque(e, uid, HEROS, face);
      expect([apres.evenements[0].info.q, apres.camps.adverse.pv]).toEqual(['faible', 20]);
    }
  });
});

describe('Défendre', () => {
  it('coûte 1 action, donne +2 Défense, et l’unité n’attaque plus ce tour', () => {
    const e = nouvellePartie();
    const uid = poser(e, 'joueur', { a: 2, d: 1, h: 4 });
    const apres = appliquerAction(e, { type: 'defendre', qui: 'joueur', uid });
    const u = apres.camps.joueur.terrain.find((x) => x?.uid === uid);
    expect(apres.camps.joueur.actions).toBe(e.camps.joueur.actions - 1);
    expect(defenseDe(u, apres)).toBe(3);
    expect(appliquerAction(apres, { type: 'attaque', qui: 'joueur', uid, cible: HEROS }).evenements[0].type).toBe('refus');
  });
  it('l’unité en garde riposte quand on l’attaque, même si l’attaque rate', () => {
    let e = nouvellePartie();
    const garde = poser(e, 'joueur', { a: 2, d: 1, h: 4 });
    e = appliquerAction(e, { type: 'defendre', qui: 'joueur', uid: garde });
    e = appliquerAction(e, { type: 'fin', qui: 'joueur' });
    const assaillant = poser(e, 'adverse', { a: 1, d: 1, h: 5 });
    e.tirages = [faceD20(3)];   // raté
    const apres = appliquerAction(e, { type: 'attaque', qui: 'adverse', uid: assaillant, cible: { camp: 'joueur', uid: garde } });
    expect(apres.evenements[0].riposte).toBe(2);
    expect(apres.camps.adverse.terrain.find((x) => x?.uid === assaillant).h).toBe(3);
  });
  it('la garde prend fin au début du tour suivant de son camp', () => {
    let e = nouvellePartie();
    const uid = poser(e, 'joueur', { a: 2, d: 1, h: 4 });
    e = appliquerAction(e, { type: 'defendre', qui: 'joueur', uid });
    e = appliquerAction(e, { type: 'fin', qui: 'joueur' });
    expect(e.camps.joueur.terrain.find((x) => x?.uid === uid).defend).toBe(true);    // pendant le tour adverse
    e = appliquerAction(e, { type: 'fin', qui: 'adverse' });
    expect(e.camps.joueur.terrain.find((x) => x?.uid === uid).defend).toBe(false);   // de retour à mon tour
  });
});

describe('Les Traits : une seule capacité par carte', () => {
  const unite = (nom) => uniteDepuisCarte(CATALOGUE.find((c) => c.name === nom));

  it('chaque carte du catalogue a exactement une capacité', () => {
    for (const c of CATALOGUE) expect(uniteDepuisCarte(c).caps, c.name).toHaveLength(1);
  });
  it('les détenteurs d’une Veine ont la capacité de leur Veine, et son nom', () => {
    expect([unite('Kaéliss').caps, unite('Kaéliss').veineNom]).toEqual([['drain'], 'Veine du Sang']);
    expect([unite('Dalek').caps, unite('Dalek').veineNom]).toEqual([['interception'], 'Veine du Rêve']);
  });
  it('les autres ont leur Trait, même une commune', () => {
    expect([unite('Vultoff').caps, unite('Vultoff').veineNom]).toEqual([['tenace'], null]);
    expect(unite('Slime').caps).toEqual(['tenace']);
    expect(unite("Gardes d'Erynedhal").caps).toEqual(['rapide']);
    expect(unite('Garde de Pravorn').caps).toEqual(['interception']);
  });
});

describe('Rapide', () => {
  it('après avoir attaqué, elle peut encore se mettre en défense (1 action)', () => {
    const e = nouvellePartie();
    const uid = poser(e, 'joueur', { a: 2, d: 1, h: 4, caps: ['rapide'] });
    const apres = attaque(e, uid, HEROS, 10);
    const garde = appliquerAction(apres, { type: 'defendre', qui: 'joueur', uid });
    expect(garde.evenements[0].type).toBe('defense');
    expect(garde.camps.joueur.actions).toBe(e.camps.joueur.actions - 2);
  });
  it('sans Rapide, une unité qui a attaqué ne peut plus défendre', () => {
    const e = nouvellePartie();
    const uid = poser(e, 'joueur', { a: 2, d: 1, h: 4 });
    const apres = attaque(e, uid, HEROS, 10);
    expect(appliquerAction(apres, { type: 'defendre', qui: 'joueur', uid }).evenements[0].type).toBe('refus');
  });
  it('en défense d’abord, elle n’attaque plus ce tour', () => {
    const e = nouvellePartie();
    const uid = poser(e, 'joueur', { a: 2, d: 1, h: 4, caps: ['rapide'] });
    const garde = appliquerAction(e, { type: 'defendre', qui: 'joueur', uid });
    expect(appliquerAction(garde, { type: 'attaque', qui: 'joueur', uid, cible: HEROS }).evenements[0].type).toBe('refus');
  });
});

describe('Tenace', () => {
  const preparer = () => {
    const e = nouvellePartie();
    const uid = poser(e, 'joueur', { a: 5, d: 1, h: 5 });
    const cible = poser(e, 'adverse', { a: 1, d: 1, h: 3, caps: ['tenace'] });
    return { e, uid, cible: { camp: 'adverse', uid: cible } };
  };
  const pv = (e, camp, uid) => e.camps[camp].terrain.find((x) => x?.uid === uid)?.h ?? null;

  it('un coup qui devrait la tuer la laisse à 1 PV, une seule fois', () => {
    const { e, uid, cible } = preparer();
    const apres = attaque(e, uid, cible, 15);   // 5 dégâts sur 3 PV
    expect(apres.evenements[0].tenace).toEqual(cible);
    expect(pv(apres, 'adverse', cible.uid)).toBe(1);
    // le coup suivant la tue
    const u2 = poser(apres, 'joueur', { a: 5, d: 1, h: 5 });
    const fin = attaque(apres, u2, cible, 15);
    expect(pv(fin, 'adverse', cible.uid)).toBeNull();
  });
  it('debout à 1 PV, elle riposte si elle en a le Trait (ou si elle défend)', () => {
    const { e, uid, cible } = preparer();
    e.camps.adverse.terrain.find((x) => x?.uid === cible.uid).caps.push('riposte');
    const apres = attaque(e, uid, cible, 15);
    expect(apres.evenements[0].riposte).toBe(1);
  });
  it('aussi contre les dégâts d’un sort', () => {
    const { e, cible } = preparer();
    e.camps.joueur.main = [SORTS.find((s) => s.id === 's-sang')];   // Saignée : 5 dégâts
    e.camps.joueur.energie = 10;
    const apres = appliquerAction(e, { type: 'jouer', qui: 'joueur', index: 0, cible });
    expect(pv(apres, 'adverse', cible.uid)).toBe(1);
    expect(apres.evenements[0].touches.some((t) => t.texte === 'Tenace !')).toBe(true);
  });
  it('un attaquant Tenace tué par une riposte reste à 1 PV', () => {
    const e = nouvellePartie();
    const uid = poser(e, 'joueur', { a: 1, d: 1, h: 2, caps: ['tenace'] });
    const cible = poser(e, 'adverse', { a: 4, d: 1, h: 9, caps: ['riposte'] });
    const apres = attaque(e, uid, { camp: 'adverse', uid: cible }, 10);
    expect(apres.evenements[0].tenaceAttaquant).toEqual({ camp: 'joueur', uid });
    expect(pv(apres, 'joueur', uid)).toBe(1);
  });
});

describe('La puissance des grandes cartes (octobre 2026)', () => {
  const unite = (nom) => uniteDepuisCarte(CATALOGUE.find((c) => c.name === nom));
  // Pose une grande carte du catalogue dans le camp du joueur, prête ; renvoie l'unité
  const grande = (e, nom) => {
    const u = instancier(e, unite(nom));
    u.prete = true;
    e.camps.joueur.terrain[e.camps.joueur.terrain.indexOf(null)] = u;
    return u;
  };

  it('chiffres de base : Légendaire 5 / 4 / 9, Transcendante coût 6 et 6 / 5 / 12', () => {
    const v = unite('Vultoff');   // ni rang, ni attaques très fortes ou très faibles
    expect([v.c, v.a, v.d, v.h]).toEqual([5, 5, 4, 9]);
    const t = unite('Elfe des Neiges dorée');   // attaques puissantes (moyenne 100) : +1 Attaque, -1 PV
    expect([t.c, t.a, t.d, t.h, t.act]).toEqual([6, 7, 5, 11, 2]);
  });
  it('Grimoire : un seul exemplaire d’une Légendaire, une seule Transcendante', () => {
    const [k, d, elfe, veines] = ['Kaéliss', 'Dalek', 'Elfe des Neiges dorée', 'Les Veines'].map(unite);
    const liste = grimoire([k, k, d, elfe, veines]);
    expect(liste.filter((c) => c === k)).toHaveLength(1);
    expect(liste.filter((c) => c === d)).toHaveLength(1);
    expect([liste.includes(elfe), liste.includes(veines)]).toEqual([true, false]);
  });
  it('une capacité active ne coûte pas d’action (seulement de l’énergie), une fois par tour', () => {
    const e = nouvellePartie();
    const vultoff = grande(e, 'Vultoff');
    const cible = poser(e, 'adverse', { a: 1, d: 1, h: 6 });
    e.camps.joueur.actions = 0;
    e.camps.joueur.energie = 4;
    const apres = appliquerAction(e, { type: 'capacite', qui: 'joueur', uid: vultoff.uid, cible: { camp: 'adverse', uid: cible } });
    expect(apres.evenements[0].type).toBe('capacite');
    expect([apres.camps.joueur.actions, apres.camps.joueur.energie]).toEqual([0, 2]);
    // une seule fois par tour
    expect(appliquerAction(apres, { type: 'capacite', qui: 'joueur', uid: vultoff.uid, cible: { camp: 'adverse', uid: cible } }).evenements[0].type).toBe('refus');
  });
  it('Sentence du Sans-Tête (Vultoff) : 2 dégâts ; si l’unité tombe, ton héros récupère 2 PV', () => {
    const e = nouvellePartie();
    const vultoff = grande(e, 'Vultoff');
    const cible = poser(e, 'adverse', { a: 1, d: 1, h: 2 });
    e.camps.joueur.energie = 2;
    e.camps.joueur.pv = 10;
    const apres = appliquerAction(e, { type: 'capacite', qui: 'joueur', uid: vultoff.uid, cible: { camp: 'adverse', uid: cible } });
    expect(apres.camps.adverse.terrain.some((x) => x?.uid === cible)).toBe(false);
    expect(apres.camps.joueur.pv).toBe(12);
  });
  it('Marcheur d’Esprit (Dalek) : 2 énergie, endort une unité adverse (avant : piocher 2 cartes)', () => {
    const e = nouvellePartie();
    const dalek = grande(e, 'Dalek');
    const cible = poser(e, 'adverse', { a: 4, d: 1, h: 6 });
    e.camps.joueur.energie = 2;
    const main = e.camps.joueur.main.length;
    const apres = appliquerAction(e, { type: 'capacite', qui: 'joueur', uid: dalek.uid, cible: { camp: 'adverse', uid: cible } });
    expect(apres.camps.adverse.terrain.find((x) => x?.uid === cible).gele).toBe(1);
    expect(apres.camps.joueur.main.length).toBe(main);
  });
  it('Plume du Codex (Maître du Jeu) : 2 énergie, le prochain jet est un 20 naturel', () => {
    const e = nouvellePartie();
    const maitre = grande(e, 'Maître du Jeu');
    e.camps.joueur.energie = 2;
    const apres = appliquerAction(e, { type: 'capacite', qui: 'joueur', uid: maitre.uid });
    expect([apres.camps.joueur.prochainCritique, apres.camps.joueur.energie]).toEqual([true, 0]);
  });
});

describe('La pioche', () => {
  it('main de départ : 3 cartes pour celui qui commence, 4 pour l’autre', () => {
    const e = creerPartie(Array(20).fill(ECUYER), Array(20).fill(ECUYER), 'Moi', 'Ombre', 'adverse', { graine: 1 });
    expect([e.camps.adverse.main.length, e.camps.joueur.main.length]).toEqual([3, 4]);
  });
  it('une carte au début de chaque tour', () => {
    const e = nouvellePartie();
    expect(e.camps.joueur.main.length).toBe(4);   // 3 + la pioche du premier tour
  });
  it('main pleine (7 cartes) : la carte piochée est brûlée et part au Tombeau', () => {
    const e = nouvellePartie();
    const camp = e.camps.joueur;
    camp.main = Array(7).fill(ECUYER);
    const res = piocher(camp, 1);
    expect([res.piochees.length, res.brulees.length, camp.main.length, camp.tombeau.length]).toEqual([0, 1, 7, 1]);
  });
  it('épuisement : Grimoire vide, le héros perd 1 PV, puis 2, puis 3…', () => {
    let e = nouvellePartie();
    e.camps.joueur.deck = [];
    e = appliquerAction(e, { type: 'fin', qui: 'joueur' });
    e = appliquerAction(e, { type: 'fin', qui: 'adverse' });
    expect([e.camps.joueur.pv, e.evenements[0].fatigue]).toEqual([19, 1]);
    e = appliquerAction(e, { type: 'fin', qui: 'joueur' });
    e = appliquerAction(e, { type: 'fin', qui: 'adverse' });
    expect([e.camps.joueur.pv, e.evenements[0].fatigue]).toEqual([17, 2]);
    expect(piocher(e.camps.joueur, 2).epuisement).toBe(3 + 4);
  });
  it('l’épuisement peut faire tomber le héros', () => {
    let e = nouvellePartie();
    e.camps.joueur.deck = [];
    e.camps.joueur.pv = 1;
    e = appliquerAction(e, { type: 'fin', qui: 'joueur' });
    e = appliquerAction(e, { type: 'fin', qui: 'adverse' });
    expect(e.fini).toBe('adverse');
  });
});

describe('L’énergie', () => {
  it('+1 énergie max par tour (10 au plus), rechargée au début du tour', () => {
    let e = nouvellePartie();
    const vues = [];
    for (let t = 0; t < 12; t++) {
      vues.push(e.camps.joueur.energieMax);
      e.camps.joueur.energie = 0;   // tout dépensé
      e = appliquerAction(e, { type: 'fin', qui: 'joueur' });
      e = appliquerAction(e, { type: 'fin', qui: 'adverse' });
      expect(e.camps.joueur.energie).toBe(e.camps.joueur.energieMax);
    }
    expect(vues).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10]);
  });
  it('une carte coûte son énergie ; sans assez d’énergie, elle est refusée', () => {
    const e = nouvellePartie();
    e.camps.joueur.main = [TROUPES[4]];   // Chevalier errant : 3 énergie
    expect(appliquerAction(e, { type: 'jouer', qui: 'joueur', index: 0 }).evenements[0].type).toBe('refus');
    e.camps.joueur.energie = 3;
    expect(appliquerAction(e, { type: 'jouer', qui: 'joueur', index: 0 }).camps.joueur.energie).toBe(0);
  });
  it('Fortune du Destin : +2 énergie, jusqu’à 12', () => {
    const e = nouvellePartie();
    e.camps.joueur.energie = 12;
    e.tirages = [faceD20(10)];   // Fortune
    expect(appliquerAction(e, { type: 'destin', qui: 'joueur' }).camps.joueur.energie).toBe(12);   // 12 - 2 + 2
  });
});

describe('Les actions par tour', () => {
  it('2 actions par tour, 3 à partir du 5e tour', () => {
    expect([1, 2, 3, 4, 5, 6, 12].map(actionsDuTour)).toEqual([2, 2, 2, 2, 3, 3, 3]);
  });
  it('chaque unité attaque une fois par tour, et les actions s’épuisent', () => {
    const e = nouvellePartie();
    const u1 = poser(e, 'joueur', { a: 1, d: 1, h: 5 });
    const u2 = poser(e, 'joueur', { a: 1, d: 1, h: 5 });
    const u3 = poser(e, 'joueur', { a: 1, d: 1, h: 5 });
    let x = attaque(e, u1, HEROS, 10);
    expect(attaque(x, u1, HEROS, 10).evenements[0].type).toBe('refus');   // déjà attaqué
    x = attaque(x, u2, HEROS, 10);
    expect(x.camps.joueur.actions).toBe(0);
    expect(attaque(x, u3, HEROS, 10).evenements[0].type).toBe('refus');   // plus d'action
  });
  it('une Transcendante coûte 2 actions et demande une unité alliée déjà en jeu', () => {
    const e = nouvellePartie();
    const veines = uniteDepuisCarte(CATALOGUE.find((c) => c.name === 'Les Veines'));
    e.camps.joueur.main = [veines];
    e.camps.joueur.energie = 10;
    expect(appliquerAction(e, { type: 'jouer', qui: 'joueur', index: 0 }).evenements[0].type).toBe('refus');
    poser(e, 'joueur', { a: 1, d: 1, h: 2 });
    const apres = appliquerAction(e, { type: 'jouer', qui: 'joueur', index: 0 });
    expect([apres.evenements[0].type, apres.camps.joueur.actions]).toEqual(['pose', 0]);
  });
});

// ---------------------------------------------------------------------
//  Les 4 corrections validées
// ---------------------------------------------------------------------
describe('Correction 1 : chaque camp passe à 3 actions à SON 5e tour', () => {
  // Fait jouer n tours complets (fin du tour de chacun) et relève les actions de chaque camp à chaque tour
  function actionsParTour(premier) {
    let e = nouvellePartie({ premier });
    const vues = { joueur: [], adverse: [] };
    for (let i = 0; i < 12; i++) {
      vues[e.actif].push(e.camps[e.actif].actionsMax);
      e = appliquerAction(e, { type: 'fin', qui: e.actif });
    }
    return vues;
  }
  it('quand « joueur » commence', () => {
    const v = actionsParTour('joueur');
    expect(v.joueur).toEqual([2, 2, 2, 2, 3, 3]);
    expect(v.adverse).toEqual([2, 2, 2, 2, 3, 3]);
  });
  it('quand « adverse » commence (avant : « joueur » avait 3 actions dès son 4e tour)', () => {
    const v = actionsParTour('adverse');
    expect(v.adverse).toEqual([2, 2, 2, 2, 3, 3]);
    expect(v.joueur).toEqual([2, 2, 2, 2, 3, 3]);
  });
});

describe('Correction 2 : le Nécessaire d’aventurier ne fait jamais baisser l’énergie', () => {
  const jouerCoffre = (energie) => {
    const e = nouvellePartie();
    e.camps.joueur.main = [objet('coffre')];   // coûte 1
    e.camps.joueur.energie = energie;
    return appliquerAction(e, { type: 'jouer', qui: 'joueur', index: 0 }).camps.joueur.energie;
  };
  it('au-dessus de 10 (après une Fortune) : la carte coûte 1, puis +1 sans plafond', () => {
    expect(jouerCoffre(12)).toBe(12);   // 12 - 1 = 11, puis +1 (avant : ramenée à 10)
    expect(jouerCoffre(11)).toBe(11);   // 11 - 1 = 10, puis +1 (avant : 10)
  });
  it('jusqu’à 10 : +1, plafonné à 10, comme avant', () => {
    expect(jouerCoffre(5)).toBe(5);     // 5 - 1 + 1
    expect(jouerCoffre(10)).toBe(10);   // 10 - 1 = 9, puis +1
  });
});

describe('Correction 3 : Kaéliss ne se soigne que si elle inflige des dégâts', () => {
  function maitreDuFlot(bouclier) {
    const e = nouvellePartie();
    const def = uniteDepuisCarte(CATALOGUE.find((c) => c.name === 'Kaéliss'));
    const k = instancier(e, def);
    k.prete = true;
    k.h = 2;   // blessée
    e.camps.joueur.terrain[0] = k;
    e.camps.joueur.energie = 3;
    const cible = poser(e, 'adverse', { a: 1, d: 1, h: 6 });
    e.camps.adverse.terrain.find((x) => x?.uid === cible).bouclier = bouclier;
    const apres = appliquerAction(e, { type: 'capacite', qui: 'joueur', uid: k.uid, cible: { camp: 'adverse', uid: cible } });
    return { kaeliss: apres.camps.joueur.terrain[0].h, cible: apres.camps.adverse.terrain.find((x) => x?.uid === cible).h };
  }
  it('sans Bouclier : 2 dégâts, et Kaéliss récupère 2 PV', () => {
    expect(maitreDuFlot(false)).toEqual({ kaeliss: 4, cible: 4 });
  });
  it('le Bouclier absorbe le coup : pas de dégâts, donc pas de soin (avant : des PV quand même)', () => {
    expect(maitreDuFlot(true)).toEqual({ kaeliss: 2, cible: 6 });
  });
  it('le texte de la capacité est inchangé', () => {
    expect(UNIQUES.kaeliss.actif.texte).toContain('Kaéliss récupère autant de PV');
  });
});

describe('Correction 4 : les deux héros tombés en même temps, c’est une égalité', () => {
  it('égalité (avant : victoire de « adverse »)', () => {
    const e = nouvellePartie();
    e.camps.joueur.pv = 0;
    e.camps.adverse.pv = -2;
    nettoyer(e);
    expect(e.fini).toBe('egalite');
  });
  it('un seul héros tombé : son adversaire gagne, comme avant', () => {
    const e = nouvellePartie();
    e.camps.adverse.pv = 0;
    nettoyer(e);
    expect(e.fini).toBe('joueur');
  });
});

// ---------------------------------------------------------------------
//  Le moteur lui-même
// ---------------------------------------------------------------------
describe('appliquerAction', () => {
  it('ne modifie jamais l’état reçu', () => {
    const e = nouvellePartie();
    const uid = poser(e, 'joueur', { a: 3, d: 1, h: 5 });
    const avant = structuredClone(e);
    attaque(e, uid, HEROS, 15);
    delete avant.tirages; const apresCopie = structuredClone(e); delete apresCopie.tirages;
    expect(apresCopie).toEqual(avant);
  });
  it('même graine et mêmes actions : même partie, au dé près', () => {
    const jouer = () => {
      let e = nouvellePartie();
      for (let i = 0; i < 40 && !e.fini; i++) e = appliquerAction(e, { type: 'ia', qui: e.actif, difficulte: 'normal' });
      return e;
    };
    expect(jouer()).toEqual(jouer());
  });
  it('une action impossible est refusée et ne change rien', () => {
    const e = nouvellePartie();
    const apres = appliquerAction(e, { type: 'fin', qui: 'adverse' });   // ce n'est pas son tour
    expect(apres.evenements).toEqual([{ type: 'refus', qui: 'adverse' }]);
    expect({ ...apres, evenements: undefined }).toEqual({ ...e, evenements: undefined });
  });
  it('le premier tour ne commence qu’après les deux renvois de main', () => {
    let e = creerPartie(Array(20).fill(ECUYER), Array(20).fill(ECUYER), 'Moi', 'Ombre', 'joueur', { graine: 3 });
    expect(appliquerAction(e, { type: 'fin', qui: 'joueur' }).evenements[0].type).toBe('refus');
    e = appliquerAction(e, { type: 'renvoi', qui: 'joueur', indices: [0, 1] });
    expect(e.evenements.map((x) => x.type)).toEqual(['renvoi']);
    expect(e.camps.joueur.main.length).toBe(3);   // 2 renvoyées, 2 repiochées
    e = appliquerAction(e, { type: 'renvoi', qui: 'adverse', indices: [] });
    expect(e.evenements.map((x) => x.type)).toEqual(['renvoi', 'tour']);
    expect(appliquerAction(e, { type: 'renvoi', qui: 'joueur', indices: [] }).evenements[0].type).toBe('refus');
  });
  it('un sort joué part au Tombeau', () => {
    const e = nouvellePartie();
    e.camps.joueur.main = [SORTS.find((s) => s.fx === 'face')];
    e.camps.joueur.energie = 2;
    const apres = appliquerAction(e, { type: 'jouer', qui: 'joueur', index: 0 });
    expect([apres.camps.adverse.pv, apres.camps.joueur.tombeau.length]).toEqual([17, 1]);
  });
});
