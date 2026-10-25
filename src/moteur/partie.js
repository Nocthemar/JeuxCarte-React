// =====================================================================
//  La partie : création, renvoi de main, 2 contre 2, tours, et toutes les actions d'un tour
//  (repris de l'ancien JS/jeu-cartes-moteur.js). Différences voulues, marquées « CORRIGÉ » :
//    - debutTour : chaque camp passe à 3 actions à SON 5e tour ;
//    - cast (Nécessaire d'aventurier) : l'énergie ne baisse jamais.
//
//  Ces fonctions MODIFIENT l'état qu'on leur donne et renvoient l'événement à animer (ou null si
//  l'action est impossible). Les écrans ne les appellent pas directement : ils passent par
//  appliquerAction (src/moteur/actions.js), qui travaille sur une copie.
// =====================================================================
import {
  PV_HEROS, PV_EQUIPE, ENERGIE_MAX, PLACES, MAIN_MAX, MAIN_DEPART, COUT_DESTIN, COUT_DEFAUSSE, COUT_MEDITER,
  TERRAINS, TERRAINS_IDS,
} from '../data/regles.js';
import { actionsDuTour, coutDe, actionsDe, aCap, rollInfo, attaqueJouee, destinInfo } from './cartes.js';
import { hasard, d20, melanger, auHasard, nouvelleGraine } from './hasard.js';
import {
  autre, unites, trouver, placeLibre, libre, instancier, piocher, attaqueDe, seuilDe,
  peutAttaquer, peutDefendre, memeCible, nettoyer, blesser, soignerHeros, encaisser,
} from './base.js';
import { appliquerDestin } from './destin.js';
import { UNIQUES } from './uniques.js';

function creerCamp(nom, deck) {
  return {
    nom, pv: PV_HEROS, pvMax: PV_HEROS,
    energie: 0, energieMax: 0, actions: 0, actionsMax: 0, destinUtilise: false,
    deck, main: [], tombeau: [], terrain: Array(PLACES).fill(null),
    epuisement: 0, defausseUtilisee: false, mediterUtilise: false, meditation: null,
    stats: { jets: 0, critiques: 0, echecs: 0, cartes: 0, degats: 0, destins: 0 },
    toursJoues: 0,   // tours déjà commencés par ce camp (les actions en dépendent)
  };
}

// deckJoueur / deckAdverse : les Grimoires, mélangés ici. premier : 'joueur' ou 'adverse'.
// options (toutes facultatives) :
//   graine              la graine du hasard (au hasard s'il manque)
//   pvAdverse           PV du héros adverse (20 par défaut)
//   energieBonusAdverse énergie en plus à chaque tour de l'adversaire (boss)
//   terrain             le terrain du duel (TERRAINS) ; au hasard s'il manque
// La partie commence par le renvoi de main : p.renvoi[qui] passe à true quand le joueur a choisi,
// et le premier tour ne commence qu'une fois les deux renvois faits (renvoiFini).
export function creerPartie(deckJoueur, deckAdverse, nomJoueur, nomAdverse, premier, options = {}) {
  const p = { graine: (options.graine ?? nouvelleGraine()) >>> 0, compteurUid: 0 };
  const h = () => hasard(p);
  const terrainId = TERRAINS[options.terrain] ? options.terrain : auHasard(TERRAINS_IDS, h);
  Object.assign(p, {
    camps: { joueur: creerCamp(nomJoueur, melanger(deckJoueur, h)), adverse: creerCamp(nomAdverse, melanger(deckAdverse, h)) },
    actif: premier, tour: 0, fini: null, terrainId,
    renvoi: { joueur: false, adverse: false },
    jets: [],   // historique des derniers jets (affichage)
  });
  p.camps.joueur.terrainId = p.camps.adverse.terrainId = terrainId;
  if (options.pvAdverse > 0) p.camps.adverse.pv = p.camps.adverse.pvMax = options.pvAdverse;
  if (options.energieBonusAdverse > 0) p.camps.adverse.energieBonus = options.energieBonusAdverse;
  piocher(p.camps[premier], MAIN_DEPART);
  piocher(p.camps[autre(premier)], MAIN_DEPART + 1);   // le second joueur a une carte de plus
  return p;
}

export const renvoiFini = (p) => !!p.renvoi && p.renvoi.joueur && p.renvoi.adverse;

// Renvoi de main (une seule fois, avant le premier tour) : les cartes choisies (index dans la main)
// retournent dans le Grimoire, qui est remélangé, puis le joueur repioche autant de cartes
export function renvoyerMain(p, qui, indices = []) {
  if (!p.renvoi || p.renvoi[qui] || p.fini) return null;
  const camp = p.camps[qui];
  const choisis = [...new Set(indices)].filter((i) => Number.isInteger(i) && i >= 0 && i < camp.main.length);
  const renvoyees = choisis.sort((x, y) => y - x).map((i) => camp.main.splice(i, 1)[0]);
  camp.deck = melanger([...camp.deck, ...renvoyees], () => hasard(p));
  const pioche = piocher(camp, renvoyees.length);
  p.renvoi[qui] = true;
  return { type: 'renvoi', qui, n: renvoyees.length, pioche };
}

// ---------------------------------------------------------------------
//  2 contre 2 : le camp partagé
//  Chaque équipe a UN héros (PV_EQUIPE) et UNE rangée de 5 places, commune aux deux joueurs ;
//  chaque joueur garde sa main, son Grimoire, son énergie, ses actions et ses statistiques.
//  Ordre des tours : A1, B1, A2, B2, puis de nouveau A1…
//  Le camp porte toujours les affaires du joueur qui a la main (camp.main, camp.energie…) : toutes
//  les règles restent celles du 1 contre 1. Les affaires des autres attendent dans camp.membres[i]
//  (celles du joueur actif y sont périmées : lire membreDe()).
// ---------------------------------------------------------------------
const PERSONNEL = ['nom', 'deck', 'main', 'energie', 'energieMax', 'energieBonus', 'actions', 'actionsMax', 'destinUtilise',
  'defausseUtilisee', 'mediterUtilise', 'meditation', 'epuisement', 'stats'];
const extraire = (camp) => Object.fromEntries(PERSONNEL.map((k) => [k, camp[k]]));
const charger = (camp, m) => PERSONNEL.forEach((k) => { camp[k] = m[k]; });

// Les affaires du joueur i d'une équipe (à jour, qu'il ait la main ou non)
export const membreDe = (camp, i) => (!camp.membres || i === camp.membreActif ? extraire(camp) : camp.membres[i]);

function passerLaMain(camp, i) {
  if (!camp.membres || i === camp.membreActif) return;
  camp.membres[camp.membreActif] = extraire(camp);
  camp.membreActif = i;
  charger(camp, camp.membres[i]);
}

// equipes : { joueur: [{ nom, deck }, { nom, deck }], adverse: [...] } ; premier : l'équipe qui commence
export function creerPartieEquipes(equipes, premier, options = {}) {
  const [a, b] = [equipes.joueur, equipes.adverse];
  const p = creerPartie(a[0].deck, b[0].deck, a[0].nom, b[0].nom, premier, options);
  for (const qui of ['joueur', 'adverse']) {
    const camp = p.camps[qui];
    camp.pv = camp.pvMax = PV_EQUIPE;
    const second = creerCamp(equipes[qui][1].nom, melanger(equipes[qui][1].deck, () => hasard(p)));
    piocher(second, qui === premier ? MAIN_DEPART : MAIN_DEPART + 1);
    camp.membres = [extraire(camp), extraire(second)];
    camp.membreActif = 0;
    camp.aJoue = false;
    camp.nomEquipe = `${equipes[qui][0].nom} & ${equipes[qui][1].nom}`;
  }
  p.equipes = true;
  p.renvoiSieges = { joueur: [false, false], adverse: [false, false] };
  return p;
}

// Renvoi de main du joueur i d'une équipe ; le renvoi de l'équipe est fait quand ses deux joueurs ont choisi
export function renvoyerMainMembre(p, qui, i, indices = []) {
  const camp = p.camps[qui];
  if (!camp.membres || !p.renvoiSieges || p.renvoiSieges[qui][i] !== false || p.fini) return null;
  const actif = camp.membreActif;
  passerLaMain(camp, i);
  p.renvoi[qui] = false;
  const ev = renvoyerMain(p, qui, indices);
  passerLaMain(camp, actif);
  p.renvoiSieges[qui][i] = true;
  p.renvoi[qui] = p.renvoiSieges[qui].every(Boolean);
  return ev && { ...ev, membre: i };
}

// Ramène une carte du Tombeau (pour les futures cartes de la Veine du Tombeau).
// vers : 'main' (si elle n'est pas pleine) ou 'grimoire' (sur le dessus). Renvoie la carte, ou null.
export function ramenerDuTombeau(p, qui, index, vers = 'main') {
  const camp = p.camps[qui];
  const carte = camp.tombeau[index];
  if (!carte) return null;
  if (vers === 'main' && camp.main.length >= MAIN_MAX) return null;
  camp.tombeau.splice(index, 1);
  if (vers === 'main') camp.main.push(carte);
  else camp.deck.unshift(carte);
  return carte;
}

// ---------------------------------------------------------------------
//  Début et fin de tour
// ---------------------------------------------------------------------
export function debutTour(p) {
  const qui = p.actif;
  const camp = p.camps[qui];
  // 2 contre 2 : à chaque tour de l'équipe (sauf son premier), son autre joueur prend la main
  if (camp.membres) {
    if (camp.aJoue) passerLaMain(camp, (camp.membreActif + 1) % camp.membres.length);
    camp.aJoue = true;
  }
  // Le numéro de tour affiché (« Tour 3 ») : comme avant
  if (qui === 'joueur' || p.tour === 0) p.tour += 1;
  // CORRIGÉ : les actions dépendent des tours de CE camp (3 actions à son 5e tour). L'ancien moteur
  // utilisait le numéro de tour affiché : quand « adverse » commençait, « joueur » avait 3 actions
  // dès son 4e tour.
  camp.toursJoues = (camp.toursJoues ?? 0) + 1;
  camp.energieMax = Math.min(ENERGIE_MAX, camp.energieMax + 1);
  camp.energie = Math.min(ENERGIE_MAX, camp.energieMax + (camp.energieBonus ?? 0));
  camp.actionsMax = actionsDuTour(camp.toursJoues);
  camp.actions = camp.actionsMax;
  camp.destinUtilise = false;
  camp.defausseUtilisee = false;
  camp.mediterUtilise = false;
  // Tes unités : prêtes, la posture défensive et l'exposition prennent fin ; une unité gelée
  // (ou endormie) passe ce tour sans agir
  unites(camp).forEach((u) => {
    u.prete = true; u.aAttaque = false; u.defend = false; u.expose = false; u.capaciteUtilisee = false;
    u.bloquee = u.gele > 0;
    u.gele = 0;
  });
  // Les réactions de l'adversaire se rechargent pour ce tour
  unites(p.camps[autre(qui)]).forEach((u) => { u.esquiveUtilisee = false; u.interceptionUtilisee = false; });

  const ev = { type: 'tour', qui, pioche: piocher(camp, 1), touches: [] };
  // Soin : au début de ton tour, 2 PV à ton unité la plus blessée, sinon à ton héros
  unites(camp).filter((u) => aCap(u, 'soin')).forEach(() => {
    const blessee = unites(camp).filter((x) => x.h < x.hMax).sort((x, y) => (y.hMax - y.h) - (x.hMax - x.h))[0];
    if (blessee) {
      const avant = blessee.h;
      blessee.h = Math.min(blessee.hMax, blessee.h + 2);
      ev.touches.push({ camp: qui, uid: blessee.uid, valeur: blessee.h - avant, soin: true });
    } else soignerHeros(camp, 2, qui, ev);
  });
  // Épuisement : Grimoire vide, le héros perd des PV (ev.fatigue = PV perdus)
  if (ev.pioche.epuisement) ev.fatigue = ev.pioche.epuisement;
  nettoyer(p);
  return ev;
}

export function finTour(p) {
  p.actif = autre(p.actif);
}

// ---------------------------------------------------------------------
//  Jouer une carte
// ---------------------------------------------------------------------
// Une carte peut-elle être jouée (énergie, actions, place, condition, cible) ?
export function peutJouer(p, qui, index) {
  const camp = p.camps[qui];
  const carte = camp.main[index];
  if (!carte || !libre(p, qui) || coutDe(camp, carte) > camp.energie || actionsDe(carte) > camp.actions) return false;
  if (carte.t === 'u') {
    if (carte.condition === 'allie' && !unites(camp).length) return false;
    return placeLibre(camp) >= 0;
  }
  if (carte.fx === 'unit') return unites(p.camps[autre(qui)]).length > 0;
  if (carte.fx === 'buff' || carte.fx === 'rage') return unites(camp).length > 0;
  if (carte.fx === 'ready') return unites(camp).some((u) => u.aAttaque && u.a > 0 && !u.bloquee);
  return true;
}
// Pourquoi une carte ne peut pas être jouée (aide du joueur), ou ''
export function raisonInjouable(p, qui, index) {
  const camp = p.camps[qui];
  const carte = camp.main[index];
  if (!carte) return '';
  if (coutDe(camp, carte) > camp.energie) return 'Pas assez d’énergie.';
  if (actionsDe(carte) > camp.actions) return actionsDe(carte) > 1 ? `Il faut ${actionsDe(carte)} actions.` : 'Plus d’action ce tour.';
  if (carte.t === 'u' && carte.condition === 'allie' && !unites(camp).length) return 'Il faut déjà une de tes unités en jeu.';
  if (carte.t === 'u' && placeLibre(camp) < 0) return 'Plus de place sur le terrain.';
  return '';
}

// Cibles d'un sort : null si le sort n'en demande pas
export function ciblesSort(p, qui, carte) {
  if (carte.fx === 'unit') return unites(p.camps[autre(qui)]).map((u) => ({ camp: autre(qui), uid: u.uid }));
  if (carte.fx === 'buff' || carte.fx === 'rage') return unites(p.camps[qui]).map((u) => ({ camp: qui, uid: u.uid }));
  if (carte.fx === 'ready') return unites(p.camps[qui]).filter((u) => u.aAttaque && u.a > 0 && !u.bloquee).map((u) => ({ camp: qui, uid: u.uid }));
  return null;
}

// Joue une carte de la main. cible : { camp, uid } pour les sorts qui en demandent une
export function jouer(p, qui, index, cible = null) {
  if (!peutJouer(p, qui, index)) return null;
  const camp = p.camps[qui];
  const carte = camp.main[index];
  const cibles = carte.t === 's' ? ciblesSort(p, qui, carte) : null;
  if (cibles && !cibles.some((c) => cible && memeCible(c, cible))) return null;

  camp.main.splice(index, 1);
  camp.energie -= coutDe(camp, carte);
  camp.actions -= actionsDe(carte);
  if (carte.fx !== 'jeton') camp.reduction = 0;   // la réduction du Jeton ne sert qu'une fois
  camp.stats.cartes += 1;
  const ev = { type: carte.t === 'u' ? 'pose' : 'sort', qui, carte, cible, index, touches: [] };   // index : pour l'animation (main -> plateau)

  if (carte.t === 'u') {
    const place = placeLibre(camp);
    const u = instancier(p, carte);
    if (p.terrainId === 'marais') u.prete = false;   // Marais de Brume : Charge sans effet
    camp.terrain[place] = u;
    ev.uid = u.uid;
    ev.place = place;
    // Capacité unique à l'arrivée
    const unique = UNIQUES[carte.unique];
    if (unique?.arrivee) {
      ev.effet = { nom: unique.nom, texte: unique.texte };
      unique.arrivee(p, qui, u, ev);
    }
    ev.morts = nettoyer(p);
    return ev;
  }
  cast(p, qui, carte, cible, ev);
  camp.tombeau.push(carte);   // un sort joué va au Tombeau
  ev.morts = nettoyer(p);
  return ev;
}

// Effet d'un sort ou d'un objet
function cast(p, qui, carte, cible, ev) {
  const camp = p.camps[qui];
  const adverse = p.camps[autre(qui)];
  switch (carte.fx) {
    case 'unit':
      blesser(p, autre(qui), trouver(adverse, cible.uid), carte.v, ev, qui);
      break;
    case 'face':
      adverse.pv -= carte.v;
      camp.stats.degats += carte.v;
      ev.touches.push({ camp: autre(qui), heros: true, valeur: carte.v });
      break;
    case 'heal':
      soignerHeros(camp, carte.v, qui, ev);
      break;
    case 'buff': {
      const u = trouver(camp, cible.uid);
      u.a += carte.v; u.h += carte.v; u.hMax += carte.v;
      ev.touches.push({ camp: qui, uid: u.uid, valeur: carte.v, buff: true });
      break;
    }
    case 'draw':
      ev.pioche = piocher(camp, carte.v);
      break;
    case 'ready': {
      const u = trouver(camp, cible.uid);
      u.aAttaque = false;
      u.defend = false;
      u.prete = true;
      ev.touches.push({ camp: qui, uid: u.uid, texte: 'Encore une attaque !', buff: true });
      break;
    }
    case 'rage': {
      const u = trouver(camp, cible.uid);
      u.a += carte.v;
      u.h = Math.max(1, u.h - 1);
      ev.touches.push({ camp: qui, uid: u.uid, texte: `+${carte.v} attaque`, buff: true });
      break;
    }
    case 'talisman':
      camp.bonusDe = (camp.bonusDe ?? 0) + carte.v;
      ev.touches.push({ camp: qui, heros: true, texte: `+${carte.v} au prochain d20`, buff: true });
      break;
    case 'coffre':
      ev.pioche = piocher(camp, 1);
      // CORRIGÉ : +1 énergie, sans jamais la faire baisser. Sous 10, plafonné à 10 comme avant ;
      // à 10 ou plus (après une « Fortune » du Destin), +1 quand même. L'ancien moteur la ramenait à 10.
      camp.energie = camp.energie >= ENERGIE_MAX ? camp.energie + 1 : Math.min(ENERGIE_MAX, camp.energie + 1);
      ev.touches.push({ camp: qui, heros: true, texte: '+1 énergie', buff: true });
      break;
    case 'jeton':
      camp.reduction = (camp.reduction ?? 0) + carte.v;
      ev.touches.push({ camp: qui, heros: true, texte: `Prochaine carte -${carte.v}`, buff: true });
      break;
    case 'aoe':
      unites(adverse).forEach((u) => blesser(p, autre(qui), u, carte.v, ev, qui));
      break;
    default: break;
  }
}

// ---------------------------------------------------------------------
//  Défendre (1 action) : l'unité se met en garde jusqu'à ton prochain tour :
//  +2 Défense et Riposte ; elle n'attaque pas ce tour
// ---------------------------------------------------------------------
export function defendre(p, qui, uid) {
  const camp = p.camps[qui];
  const u = trouver(camp, uid);
  if (!libre(p, qui) || camp.actions < 1 || !peutDefendre(u)) return null;
  camp.actions -= 1;
  u.defend = true;
  u.aAttaque = true;
  return { type: 'defense', qui, uid, n: u.n };
}

// ---------------------------------------------------------------------
//  Capacité active d'une grande carte (une fois par tour, de l'énergie ; sans action depuis
//  octobre 2026 : une action coûtait plus qu'elle ne rapportait, les grandes cartes y perdaient)
// ---------------------------------------------------------------------
export const capaciteActive = (u) => UNIQUES[u?.def?.unique]?.actif ?? null;
export function peutActiver(p, qui, uid) {
  const camp = p.camps[qui];
  const u = trouver(camp, uid);
  const act = capaciteActive(u);
  if (!act || !libre(p, qui) || u.capaciteUtilisee || u.bloquee || camp.energie < act.cout) return false;
  return act.cible !== 'ennemi' || unites(p.camps[autre(qui)]).length > 0;
}
export function ciblesCapacite(p, qui, uid) {
  const act = capaciteActive(trouver(p.camps[qui], uid));
  if (act?.cible === 'ennemi') return unites(p.camps[autre(qui)]).map((u) => ({ camp: autre(qui), uid: u.uid }));
  if (act?.cible === 'allie') return unites(p.camps[qui]).map((u) => ({ camp: qui, uid: u.uid }));
  return null;
}
export function activer(p, qui, uid, cible = null) {
  if (!peutActiver(p, qui, uid)) return null;
  const camp = p.camps[qui];
  const u = trouver(camp, uid);
  const act = capaciteActive(u);
  const cibles = ciblesCapacite(p, qui, uid);
  if (cibles && !cibles.some((c) => cible && memeCible(c, cible))) return null;
  camp.energie -= act.cout;
  u.capaciteUtilisee = true;
  const ev = { type: 'capacite', qui, uid, cible, nom: act.nom, texte: act.texte, n: u.n, veine: u.def.veine, touches: [] };
  act.effet(p, qui, u, cible, ev);
  ev.morts = nettoyer(p);
  return ev;
}

// ---------------------------------------------------------------------
//  Défausser (1 énergie, une fois par tour, sans action) : une carte de la main au Tombeau, on en pioche une
// ---------------------------------------------------------------------
export const peutDefausser = (p, qui) => {
  const camp = p.camps[qui];
  return libre(p, qui) && !camp.defausseUtilisee && camp.energie >= COUT_DEFAUSSE && camp.main.length > 0;
};

export function defausser(p, qui, index) {
  if (!peutDefausser(p, qui)) return null;
  const camp = p.camps[qui];
  const carte = camp.main[index];
  if (!carte) return null;
  camp.main.splice(index, 1);
  camp.energie -= COUT_DEFAUSSE;
  camp.defausseUtilisee = true;
  camp.tombeau.push(carte);
  const ev = { type: 'defausse', qui, carte, pioche: piocher(camp, 1) };
  ev.morts = nettoyer(p);
  return ev;
}

// ---------------------------------------------------------------------
//  Méditer (1 énergie, une fois par tour, sans action) : le joueur regarde les 3 premières cartes de
//  son Grimoire (camp.meditation), puis en place une dessous ou n'en place aucune (placerSous).
//  Tant que le choix n'est pas fait, aucune autre action n'est possible.
// ---------------------------------------------------------------------
export const peutMediter = (p, qui) => {
  const camp = p.camps[qui];
  return libre(p, qui) && !camp.mediterUtilise && camp.energie >= COUT_MEDITER && camp.deck.length > 0;
};

export function mediter(p, qui) {
  if (!peutMediter(p, qui)) return null;
  const camp = p.camps[qui];
  camp.energie -= COUT_MEDITER;
  camp.mediterUtilise = true;
  camp.meditation = camp.deck.slice(0, 3);
  return { type: 'mediter', qui, cartes: camp.meditation };
}

// index : 0, 1 ou 2 (la carte à placer sous le Grimoire), ou null pour ne rien changer
export function placerSous(p, qui, index = null) {
  const camp = p.camps[qui];
  if (!camp.meditation || p.actif !== qui) return null;
  let carte = null;
  if (Number.isInteger(index) && index >= 0 && index < camp.meditation.length) {
    [carte] = camp.deck.splice(index, 1);
    camp.deck.push(carte);
  }
  camp.meditation = null;
  return { type: 'placer', qui, sous: !!carte };
}

// ---------------------------------------------------------------------
//  Attaquer
// ---------------------------------------------------------------------
// Cibles d'une attaque :
// - Provocation : les attaques doivent viser ces unités d'abord ;
// - Garde : tant qu'une Garde est en jeu, le héros ne peut pas être visé ;
// - Percée (l'attaquant, uid) : ignore les deux.
export function ciblesAttaque(p, qui, uid = null) {
  const adv = autre(qui);
  const ennemis = unites(p.camps[adv]);
  const perce = uid != null && aCap(trouver(p.camps[qui], uid), 'percee');
  const provoc = perce ? [] : ennemis.filter((u) => aCap(u, 'provocation'));
  const liste = (provoc.length ? provoc : ennemis).map((u) => ({ camp: adv, uid: u.uid }));
  const garde = !perce && ennemis.some((u) => aCap(u, 'garde'));
  if (!provoc.length && !garde) liste.push({ camp: adv, heros: true });
  return liste;
}

// Attaque d'une unité (1 action) : d20 + Attaque contre 8 + Défense de la cible.
// Réactions de la défense : Interception (le héros visé est protégé), Esquive (deux d20, le plus bas),
// Bouclier (premiers dégâts annulés), Riposte (ou posture défensive) : l'Attaque rendue à l'attaquant.
export function attaquer(p, qui, uid, cible) {
  const camp = p.camps[qui];
  const adv = autre(qui);
  const adverse = p.camps[adv];
  const u = trouver(camp, uid);
  if (!libre(p, qui) || camp.actions < 1 || !peutAttaquer(u)) return null;
  if (!cible || !ciblesAttaque(p, qui, uid).some((c) => memeCible(c, cible))) return null;
  camp.actions -= 1;
  u.aAttaque = true;
  const ev = { type: 'attaque', qui, uid, cible, n: u.n, touches: [], riposte: 0 };
  const h = () => hasard(p);

  // Interception : une unité adverse s'interpose devant son héros (une fois par tour adverse)
  if (cible.heros && !aCap(u, 'percee')) {
    const garde = unites(adverse).find((x) => aCap(x, 'interception') && !x.interceptionUtilisee);
    if (garde) {
      garde.interceptionUtilisee = true;
      ev.interception = { uid: garde.uid, n: garde.n };
      cible = { camp: adv, uid: garde.uid };
      ev.cible = cible;
    }
  }
  const t = cible.heros ? null : trouver(adverse, cible.uid);

  // Le jet : Esquive = deux d20, le plus bas ; Plume du Codex = 20 naturel
  let des = [d20(h)];
  if (t && aCap(t, 'esquive') && !t.esquiveUtilisee) { t.esquiveUtilisee = true; des.push(d20(h)); ev.esquive = true; }
  let de = Math.min(...des);
  if (camp.prochainCritique) { de = 20; des = [20]; camp.prochainCritique = false; }
  const bonus = camp.bonusDe ?? 0;
  camp.bonusDe = 0;
  const atk = attaqueDe(p, qui, u);
  const seuil = seuilDe(p, cible);
  const total = de + atk + bonus;
  const echec = de === 1 || (de === 2 && p.terrainId === 'erynedhal');
  // Sous le seuil : un dé de 5 ou plus fait quand même une Éraflure (1 dégât) ; de 2 à 4, c'est raté
  const q = echec ? 'echec' : de === 20 ? 'critique' : total >= seuil + 5 ? 'solide' : total >= seuil ? 'normal' : de >= 5 ? 'eraflure' : 'faible';
  const info = rollInfo(q);
  Object.assign(ev, { de, des, bonus, atk, total, seuil, info, attaque: attaqueJouee(u.def, de) });
  camp.stats.jets += 1;
  if (q === 'critique') camp.stats.critiques += 1;
  if (q === 'echec') camp.stats.echecs += 1;

  let degats = q === 'critique' ? atk * 2 : q === 'solide' ? atk + 1 : q === 'normal' ? atk : q === 'eraflure' ? Math.min(1, atk) : 0;
  if (q === 'echec') { u.expose = true; ev.expose = true; }

  if (degats > 0) {
    if (cible.heros) {
      adverse.pv -= degats;
      camp.stats.degats += degats;
    } else if (t.bouclier) {
      t.bouclier = false;
      ev.bouclier = true;
      degats = 0;
    } else {
      if (encaisser(t, degats)) ev.tenace = { camp: adv, uid: t.uid };
      camp.stats.degats += degats;
    }
  }
  ev.degats = degats;
  // Drain : les dégâts infligés soignent le héros de l'attaquant
  if (degats > 0 && aCap(u, 'drain')) {
    const avant = camp.pv;
    camp.pv = Math.min(camp.pvMax, camp.pv + degats);
    ev.drain = camp.pv - avant;
  }
  // Riposte : la cible encore debout (Riposte, ou en posture défensive) rend son Attaque,
  // même si l'attaque a raté (voulu)
  if (t && t.h > 0 && (aCap(t, 'riposte') || t.defend) && t.a > 0) {
    const coup = attaqueDe(p, adv, t);
    if (u.bouclier) { u.bouclier = false; ev.bouclierAttaquant = true; }
    else {
      if (encaisser(u, coup)) ev.tenaceAttaquant = { camp: qui, uid: u.uid };
      ev.riposte = coup;
    }
  }

  // Esquive : les deux dés sont gardés dans l'historique (le plus bas compte)
  const esquive = des.length > 1 ? `Esquive : ${des.join(' et ')} · ` : '';
  p.jets.unshift({ qui, de, q, label: info.label, quoi: `${u.n} attaque`, detail: `${esquive}${total} contre ${seuil}` });
  p.jets.length = Math.min(p.jets.length, 8);
  ev.morts = nettoyer(p);
  return ev;
}

// ---------------------------------------------------------------------
//  Jet du Destin : 2 énergie, sans action, une fois par tour
// ---------------------------------------------------------------------
export const peutDestin = (p, qui) => libre(p, qui) && !p.camps[qui].destinUtilise
  && p.camps[qui].energie >= COUT_DESTIN;

export function destin(p, qui) {
  if (!peutDestin(p, qui)) return null;
  const camp = p.camps[qui];
  camp.energie -= COUT_DESTIN;
  camp.destinUtilise = true;
  camp.stats.destins += 1;
  camp.stats.jets += 1;

  let de = d20(() => hasard(p));
  if (camp.bonusDe) { de = Math.max(1, Math.min(20, de + camp.bonusDe)); camp.bonusDe = 0; }
  if (de === 20) camp.stats.critiques += 1;
  if (de === 1) camp.stats.echecs += 1;
  const ev = { type: 'destin', qui, de, touches: [] };
  ev.info = appliquerDestin(p, qui, de, ev);
  ev.uid = ev.renfort;   // (le Milicien arrivé, pour son animation)
  p.jets.unshift({ qui, de, q: ev.info.q, label: ev.info.label, quoi: 'Jet du Destin', destin: true });
  p.jets.length = Math.min(p.jets.length, 8);
  ev.morts = nettoyer(p);
  return ev;
}

export { destinInfo };
