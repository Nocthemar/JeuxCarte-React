// =====================================================================
//  Le duel contre l'Ombre (ou d'un niveau du mode Histoire), sans écran : sa préparation et son déroulé.
//  Le MÊME code sert au navigateur (components/duel/DuelSolo.jsx) et à l'arbitre du serveur
//  (serveur/arbitrage.js), qui rejoue la partie pour décider lui-même du vainqueur :
//  même graine + mêmes Grimoires + mêmes actions du joueur = même partie, coup pour coup.
//
//    preparerSolo({ cartes, catalogue, difficulte, niveau, elan, graine, nom }) -> l'état de départ
//    tourOmbre(e, difficulte)                -> les états successifs du tour de l'Ombre (un par action)
//    rejouerSolo(depart, journal, difficulte) -> l'état final (journal : les actions du joueur, dans l'ordre)
// =====================================================================
import { DIFFICULTES } from '../data/regles.js';
import { TROUPES } from '../data/cartes.js';
import { appliquerAction } from './actions.js';
import { creerPartie } from './partie.js';
import { grimoire, construireDeck, objetDepuisNom } from './cartes.js';
import { grimoireOmbre, pvElan } from './ombre.js';
import { choixRenvoiIA } from './ia.js';
import { generateur, melanger } from './hasard.js';

export const NOM_OMBRE = "L'Ombre du Codex";
// L'Ombre joue au plus 30 actions par tour, puis finit son tour
export const OMBRE_MAX = 30;
// Les actions qu'un joueur peut faire (jamais « ia » : l'Ombre ne joue pas à sa place)
export const ACTIONS_JOUEUR = new Set(['renvoi', 'jouer', 'attaque', 'defendre', 'capacite', 'destin', 'defausser', 'mediter', 'placer', 'fin', 'abandon']);

const cleNom = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, "'").trim().toLowerCase();

// Le Grimoire de l'adversaire d'un niveau : chaque carte du niveau en 2 exemplaires (cartes du catalogue,
// troupes du Codex ou objets, par leur nom ; un nom inconnu est ignoré), le reste en cartes de base
export function deckHistoire(noms, catalogue, h) {
  const unites = [];
  const objets = [];
  for (const nom of noms ?? []) {
    const k = cleNom(nom);
    const u = catalogue.find((x) => cleNom(x.n) === k) ?? TROUPES.find((x) => cleNom(x.n) === k);
    if (u) { unites.push(u); continue; }
    const o = objetDepuisNom(nom);
    if (o) objets.push(o);
  }
  return construireDeck([...unites, ...objets].flatMap((c) => [c, c]), h);
}

// La partie de départ : Grimoires, terrain, premier joueur, et le renvoi de main de l'Ombre
//   cartes : les cartes choisies par le joueur ; niveau : celui du mode Histoire (ou null) ;
//   elan : le niveau caché de l'Ombre (-3 à 3) ; graine : celle tirée par le serveur
export function preparerSolo({ cartes, catalogue, difficulte, niveau = null, elan = 0, graine, nom = 'Toi' }) {
  const h = generateur(graine ^ 0x9e3779b9);   // le hasard de la préparation (Grimoire de l'Ombre, premier joueur)
  const monGrimoire = grimoire(cartes);
  // Contre l'Ombre : un Grimoire en miroir du tien, ajusté par ton élan ; en Histoire : celui du niveau
  const deckAdverse = niveau ? deckHistoire(niveau.deck, catalogue, h) : grimoireOmbre(monGrimoire, catalogue, elan, h);
  const premier = h() < 0.5 ? 'joueur' : 'adverse';
  const options = niveau ? { pvAdverse: niveau.pv, energieBonusAdverse: niveau.energieBonus, terrain: niveau.terrain, graine }
    : { pvAdverse: DIFFICULTES[difficulte].pv + pvElan(elan), graine };
  const e = creerPartie(melanger(monGrimoire, h), deckAdverse, nom, niveau ? niveau.adversaire : NOM_OMBRE, premier, options);
  return appliquerAction(e, { type: 'renvoi', qui: 'adverse', indices: choixRenvoiIA(e.camps.adverse) });
}

// L'Ombre a-t-elle fini (partie finie, tour passé, ou rien de possible) après cet état ?
export const ombreAFini = (e) => !!e.fini || e.evenements?.[0]?.ia?.type === 'fin' || e.evenements?.[0]?.type === 'refus';

// Le tour de l'Ombre, une action à la fois : un itérateur des états successifs
// (le navigateur anime chacun ; l'arbitre les enchaîne)
export function* tourOmbre(e, difficulte) {
  let etat = e;
  for (let i = 0; i < OMBRE_MAX; i++) {
    etat = appliquerAction(etat, { type: 'ia', qui: 'adverse', difficulte });
    yield etat;
    if (ombreAFini(etat)) return;
  }
  // 30 actions : elle finit son tour
  yield appliquerAction(etat, { type: 'fin', qui: 'adverse' });
}

// Une action du joueur, telle qu'on la garde dans le journal (seulement les champs connus)
export function actionJournal(a) {
  const x = { type: a.type };
  for (const k of ['index', 'uid', 'cible', 'indices', 'raison']) if (a[k] !== undefined) x[k] = a[k];
  return x;
}

// Rejoue une partie entière : chaque action du joueur, puis, quand la main passe à l'Ombre, son tour
export function rejouerSolo(depart, journal, difficulte) {
  let e = depart;
  for (const brute of journal) {
    if (e.fini) break;
    e = appliquerAction(e, { ...actionJournal(brute), qui: 'joueur' });
    if (!e.fini && e.actif === 'adverse') for (const suivant of tourOmbre(e, difficulte)) e = suivant;
  }
  return e;
}
