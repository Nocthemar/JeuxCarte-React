// =====================================================================
//  Le moteur du Duel des Couronnes : JavaScript pur (aucun affichage, aucun React, aucun réseau)
//
//  Pour les écrans, l'essentiel tient en deux fonctions :
//    creerPartie(...) / creerPartieEquipes(...)  -> l'état d'une nouvelle partie
//    appliquerAction(etat, action)               -> le nouvel état (etat.evenements : quoi animer)
//  Les autres fonctions exportées ne font que LIRE l'état (peutJouer, ciblesAttaque…) : l'écran
//  s'en sert pour savoir quoi proposer au joueur.
// =====================================================================
export { appliquerAction } from './actions.js';
export {
  creerPartie, creerPartieEquipes, renvoiFini, membreDe, ramenerDuTombeau,
  peutJouer, raisonInjouable, ciblesSort, ciblesAttaque, capaciteActive, peutActiver, ciblesCapacite,
  peutDefausser, peutMediter, peutDestin,
} from './partie.js';
export {
  autre, unites, trouver, attaqueDe, defenseDe, seuilDe, chanceDeToucher, peutAttaquer, peutDefendre,
} from './base.js';
export {
  actionsDuTour, uniteDepuisCarte, objetDepuisNom, estObjet, estTranscendante, copiesMax, peutAjouter,
  grimoire, construireDeck, coutDe, actionsDe, capsDe, aCap, rollInfo, destinInfo, terrainDe, attaqueJouee,
} from './cartes.js';
export { UNIQUES } from './uniques.js';
export { choixRenvoiIA } from './ia.js';
export { grimoireOmbre, pvElan, elanApres, ELAN_MAX } from './ombre.js';
export { alleger, miroir, vueEquipe, vueEvEquipe } from './vues.js';
export { nouvelleGraine, generateur, melanger, faceD20 } from './hasard.js';
export { preparerSolo, tourOmbre, rejouerSolo, actionJournal, deckHistoire, ombreAFini, ACTIONS_JOUEUR, NOM_OMBRE } from './solo.js';
