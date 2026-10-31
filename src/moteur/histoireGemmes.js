// =====================================================================
//  Un niveau du mode Histoire, joué aux Gemmes du Codex (moteur/gemmes.js)
//
//  Le navigateur (pages/Gemmes.jsx) et l'arbitre du serveur (serveur/arbitrage.js) préparent la partie de la
//  même façon, à partir de la graine tirée par le serveur au début (duel_commencer) :
//  - les trois cartes de l'adversaire : une par rareté demandée par le niveau (niveau.ombre), prises dans le
//    catalogue, chacune chargée par une gemme tirée au hasard ;
//  - qui commence ;
//  - les choix de l'adversaire pendant la partie (choixOmbre).
//  Ces tirages viennent d'un second générateur (graine de la partie mêlée à une constante), à part de celui de
//  la grille : même graine + mêmes actions du joueur = même partie, au coup près. L'arbitre rejoue ainsi la
//  partie avec les seules actions du joueur (son journal) et lit le vainqueur.
// =====================================================================
import { nouvellePartie, appliquer, choixOmbre, SORTES } from './gemmes.js';
import { generateur, melanger } from './hasard.js';

export const NOM_ADVERSAIRE = 'L’Ombre';
// Les actions que le joueur peut noter dans son journal
export const ACTIONS_GEMMES = new Set(['echange', 'carte', 'fin', 'abandon']);
const PAS_MAX = 20000;   // garde-fou du rejeu (une longue partie en fait quelques centaines)

// Le second générateur : celui de l'adversaire (ses cartes, qui commence, ses coups)
export const hasardAdversaire = (graine) => generateur(((graine >>> 0) ^ 0x5bd1e995) >>> 0);

// Les cartes de l'adversaire d'un niveau : une carte du catalogue par rareté de niveau.ombre (la même rareté
// absente du catalogue : une carte sans image de cette rareté), chacune chargée par une gemme au hasard
// catalogue : des cartes du mode { cle, n, image, rarete } (lib/gemmes/choix.js, carteGemmes)
export function cartesAdversaire(niveau, catalogue, h) {
  const toutes = melanger(catalogue ?? [], h);
  const gemmes = melanger(SORTES, h);
  return (niveau.ombre ?? ['commune', 'eveillee', 'mythique']).slice(0, 3).map((rarete, k) => ({
    ...(toutes.find((c) => c.rarete === rarete) ?? { cle: 0, n: 'Ombre', image: null, rarete }), gemme: gemmes[k],
  }));
}

// La partie de départ d'un niveau : { etat, moi (ma place, 0 ou 1), h (le hasard de l'adversaire, pour la suite) }
//   mesCartes : mes trois cartes { cle, n, image, rarete } ; avatar : mon portrait (affichage seulement)
export function preparerNiveau({ niveau, mesCartes, catalogue, graine, nom = 'Toi', avatar = null }) {
  const h = hasardAdversaire(graine);
  const adversaire = { nom: niveau.adversaire ?? NOM_ADVERSAIRE, avatar: null, pv: niveau.pv, cartes: cartesAdversaire(niveau, catalogue, h) };
  const moi = { nom, avatar, cartes: mesCartes };
  const jeCommence = h() < 0.5;
  const combattants = jeCommence ? [moi, adversaire] : [adversaire, moi];
  return { combattants, etat: nouvellePartie(combattants, graine), moi: jeCommence ? 0 : 1, h };
}

// Rejoue la partie : mes actions dans l'ordre (journal), l'adversaire choisit les siennes avec le même hasard.
// -> { fin: 'joueur' | 'adverse' | null (partie inachevée), tour, abandon?, invalide? }
export function rejouerNiveau({ etat, moi, h }, journal, difficulte) {
  let e = etat;
  let lu = 0;
  for (let pas = 0; pas < PAS_MAX; pas += 1) {
    if (e.fin) return { fin: e.fin.gagnant === moi ? 'joueur' : 'adverse', tour: e.tour };
    if (e.actif === moi) {
      if (lu >= journal.length) return { fin: null, tour: e.tour };
      const action = journal[lu];
      lu += 1;
      if (action.t === 'abandon') return { fin: 'adverse', tour: e.tour, abandon: true };
      const res = appliquer(e, moi, action);
      if (!res) return { fin: null, tour: e.tour, invalide: true };
      e = res.etat;
    } else {
      // (un coup refusé : l'adversaire choisit de nouveau, comme dans le navigateur)
      const res = appliquer(e, e.actif, choixOmbre(e, e.actif, difficulte, h));
      if (res) e = res.etat;
    }
  }
  return { fin: null, tour: e.tour };
}

// Une action du joueur, telle qu'elle part dans le journal (seulement ce que l'arbitre lit)
export function actionGemmes(action) {
  if (action.t === 'echange') return { t: 'echange', a: action.a, b: action.b };
  if (action.t === 'carte') return { t: 'carte', k: action.k };
  return { t: action.t };
}
