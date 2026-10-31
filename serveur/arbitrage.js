// =====================================================================
//  L'arbitrage d'un duel contre l'Ombre ou d'un niveau du mode Histoire (côté serveur, sans réseau)
//
//  Le navigateur envoie seulement la liste de SES actions. L'arbitre reconstruit la partie de départ à
//  partir de ce que le serveur a noté au début (graine, Grimoire choisi, cartes et objets possédés, élan),
//  rejoue toutes les actions avec le moteur du jeu (l'Ombre rejoue les mêmes coups), et lit le vainqueur.
//  Un navigateur qui ment (victoire inventée, carte qu'il n'a pas, dés truqués) obtient une autre partie :
//  elle n'est pas finie, ou il l'a perdue.
//  Contre l'Ombre : un duel du Duel des Couronnes ; un niveau du mode Histoire : une partie de Gemmes
//  (moteur/histoireGemmes.js, journal d'actions { t: 'echange' | 'carte' | 'fin' | 'abandon' }).
//
//  arbitrer({ duel, catalogueBrut, possedeesBrutes, journal, nom }) -> { resultat, details }
//    duel            : la ligne de la table duels
//    catalogueBrut   : les cartes disponibles (table cards, is_available, triées par id : comme le navigateur)
//    possedeesBrutes : les lignes de cards des cartes possédées au début du duel (duel.cartes)
//    resultat        : 'joueur' (victoire), 'adverse', 'egalite' ou 'invalide'
// =====================================================================
import { preparerSolo, rejouerSolo, uniteDepuisCarte, objetDepuisNom, ACTIONS_JOUEUR } from '../src/moteur/index.js';
import { preparerNiveau, rejouerNiveau, ACTIONS_GEMMES } from '../src/moteur/histoireGemmes.js';
import { reserve, cartesChoisies } from '../src/lib/grimoire.js';
import { reserveGemmes, cartesDuChoix, carteGemmes } from '../src/lib/gemmes/choix.js';
import { trouverNiveau } from '../src/data/histoire.js';
import { DIFFICULTES } from '../src/data/regles.js';

export const JOURNAL_MAX = 3000;
export const TAILLE_MAX = 400000;   // caractères (JSON) : une très longue partie en fait moins de 100 000

// Seulement les vraies cartes illustrées (pas la carte d'exemple), comme lib/donneesDuel.js
const jouable = (c) => c?.image && c.description !== "Carte d'exemple";

// La forme du journal (le moteur refuse de lui-même les actions impossibles)
export function journalValide(journal) {
  if (!Array.isArray(journal) || journal.length > JOURNAL_MAX) return false;
  return journal.every((a) => a && typeof a === 'object' && !Array.isArray(a) && ACTIONS_JOUEUR.has(a.type));
}

const invalide = (raison, plus = {}) => ({ resultat: 'invalide', details: { raison, ...plus } });

// ---------------------------------------------------------------------
//  Un niveau du mode Histoire : une partie de Gemmes (moteur/histoireGemmes.js). Le grimoire noté au début :
//  les clés (id de la table cards) des trois cartes choisies ; seulement celles que le joueur pouvait prendre
//  (sa collection, ou les cartes que le Codex lui prête pour une rareté qui lui manque).
// ---------------------------------------------------------------------
export function journalGemmesValide(journal) {
  if (!Array.isArray(journal) || journal.length > JOURNAL_MAX) return false;
  return journal.every((a) => a && typeof a === 'object' && !Array.isArray(a) && ACTIONS_GEMMES.has(a.t));
}

function arbitrerNiveau({ duel, catalogueBrut, possedeesBrutes, journal, nom }) {
  if (!journalGemmesValide(journal)) return invalide('journal');
  const trouve = trouverNiveau(duel.niveau_id);
  if (!trouve) return invalide('niveau');
  const { niveau } = trouve;
  if (!DIFFICULTES[niveau.difficulte]) return invalide('difficulte');
  try {
    const catalogue = (catalogueBrut ?? []).filter(jouable).map(uniteDepuisCarte);
    const collection = (possedeesBrutes ?? []).filter(jouable).map(uniteDepuisCarte);
    const cles = (duel.grimoire ?? []).map(Number).filter(Number.isInteger);
    const mesCartes = cartesDuChoix(cles, reserveGemmes(collection, catalogue))
      .map(({ cle, n, image, rarete }) => ({ cle, n, image, rarete }));
    if (mesCartes.length < 3) return invalide('cartes');
    const depart = preparerNiveau({ niveau, mesCartes, catalogue: catalogue.map(carteGemmes), graine: Number(duel.graine), nom });
    const fin = rejouerNiveau(depart, journal, niveau.difficulte);
    if (!fin.fin) return invalide(fin.invalide ? 'action' : 'inachevee', { tour: fin.tour, actions: journal.length });
    return { resultat: fin.fin, details: { jeu: 'gemmes', tour: fin.tour, actions: journal.length, ...(fin.abandon ? { abandon: true } : {}) } };
  } catch (e) {
    return invalide('rejeu', { erreur: String(e?.message ?? e).slice(0, 200) });
  }
}

export function arbitrer({ duel, catalogueBrut, possedeesBrutes, journal, nom = 'Toi' }) {
  if (duel.mode === 'histoire') return arbitrerNiveau({ duel, catalogueBrut, possedeesBrutes, journal, nom });
  if (!journalValide(journal)) return invalide('journal');

  const difficulte = duel.difficulte;
  if (!DIFFICULTES[difficulte]) return invalide('difficulte');

  try {
    const catalogue = (catalogueBrut ?? []).filter(jouable).map(uniteDepuisCarte);
    const collection = (possedeesBrutes ?? []).filter(jouable).map(uniteDepuisCarte);
    const objets = (duel.objets ?? []).map(objetDepuisNom).filter(Boolean);
    // Les cartes du Grimoire : seulement celles que le joueur possédait, dans les limites du jeu
    const cartes = cartesChoisies(duel.grimoire ?? [], reserve(collection, objets).toutes);
    const depart = preparerSolo({
      cartes, catalogue, difficulte, niveau: null, elan: duel.elan ?? 0, graine: Number(duel.graine), nom,
    });
    const fin = rejouerSolo(depart, journal, difficulte);
    if (!fin.fini) return invalide('inachevee', { tour: fin.tour, actions: journal.length });
    // (la dernière action jouée : celle qui a fini la partie)
    const abandon = fin.fini === 'adverse' && fin.evenements?.[0]?.type === 'abandon';
    return { resultat: fin.fini, details: { tour: fin.tour, actions: journal.length, ...(abandon ? { abandon: true } : {}) } };
  } catch (e) {
    return invalide('rejeu', { erreur: String(e?.message ?? e).slice(0, 200) });
  }
}
