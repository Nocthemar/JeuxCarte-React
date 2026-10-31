// =====================================================================
//  L'arbitre du serveur (serveur/arbitrage.js) : il rejoue la partie à partir des seules actions du joueur.
//  Un « joueur » automatique (l'IA qui choisit les coups du joueur, sans toucher au hasard de la partie)
//  joue des duels entiers comme le ferait le navigateur ; l'arbitre doit trouver le même vainqueur,
//  et refuser les parties truquées.
// =====================================================================
import { describe, it, expect } from 'vitest';
import { appliquerAction, preparerSolo, tourOmbre, actionJournal } from '../../src/moteur/index.js';
import { ai } from '../../src/moteur/ia.js';
import { uniteDepuisCarte, objetDepuisNom } from '../../src/moteur/cartes.js';
import { reserve, cartesChoisies, cleCarte } from '../../src/lib/grimoire.js';
import { trouverNiveau } from '../../src/data/histoire.js';
import { arbitrer } from '../../serveur/arbitrage.js';
import { preparerNiveau, actionGemmes } from '../../src/moteur/histoireGemmes.js';
import { appliquer, choixOmbre } from '../../src/moteur/gemmes.js';
import { generateur } from '../../src/moteur/hasard.js';
import { reserveGemmes, cartesDuChoix, carteGemmes } from '../../src/lib/gemmes/choix.js';
import { CATALOGUE } from '../moteur/catalogue.js';

const CARTES = CATALOGUE.map((c) => ({ ...c, image: `img/Cartes/${c.id}.webp`, is_available: true }));
const POSSEDEES = CARTES.filter((c) => [5, 6, 8, 12, 13].includes(c.id));
const OBJETS = ['Potion de soin'];

// Le Grimoire choisi dans le navigateur (des cartes possédées, des troupes du Codex, un objet)
function grimoireDuNavigateur() {
  const res = reserve(POSSEDEES.map(uniteDepuisCarte), OBJETS.map(objetDepuisNom));
  const choix = ['u5', 'u5', 'u6', 'u8', 'u12', 'u13', 't-garde', 't-archer', 'o-potion'];
  return cartesChoisies(choix, res.toutes).map(cleCarte);
}

// Joue un duel entier comme DuelSolo : le joueur (ici automatique), puis l'Ombre quand elle a la main
function jouerUnDuel({ graine, difficulte = 'normal', niveau = null, elan = 0, grimoire, abandonAuTour = null }) {
  const catalogue = CARTES.map(uniteDepuisCarte);
  const res = reserve(POSSEDEES.map(uniteDepuisCarte), OBJETS.map(objetDepuisNom));
  const cartes = cartesChoisies(grimoire, res.toutes);
  let e = preparerSolo({ cartes, catalogue, difficulte, niveau, elan, graine, nom: 'Testeur' });
  const journal = [];
  const agir = (action) => {
    journal.push(actionJournal(action));
    e = appliquerAction(e, { ...action, qui: 'joueur' });
    if (!e.fini && e.actif === 'adverse') for (const suivant of tourOmbre(e, difficulte)) e = suivant;
  };
  agir({ type: 'renvoi', indices: [0] });
  for (let i = 0; i < 2000 && !e.fini; i++) {
    if (abandonAuTour && e.tour >= abandonAuTour) { agir({ type: 'abandon' }); break; }
    // Le choix du joueur, calculé sur une copie : un humain ne fait pas avancer le hasard de la partie
    const choix = ai(structuredClone(e), 'joueur', 'difficile');
    agir(choix ? actionJournal(choix) : { type: 'fin' });
  }
  return { fin: e, journal };
}

const duelServeur = (plus) => ({ mode: 'ia', difficulte: 'normal', niveau_id: null, elan: 0, objets: OBJETS, ...plus });

describe('arbitre des duels contre l\'Ombre', () => {
  it('retrouve le même vainqueur que le navigateur, sur plusieurs parties', () => {
    const grimoire = grimoireDuNavigateur();
    const vus = new Set();
    for (const graine of [1, 42, 123456, 987654321, 4294967295]) {
      for (const difficulte of ['facile', 'difficile']) {
        const { fin, journal } = jouerUnDuel({ graine, difficulte, grimoire, elan: 2 });
        expect(fin.fini).toBeTruthy();
        vus.add(fin.fini);
        const r = arbitrer({ duel: duelServeur({ graine, difficulte, grimoire, elan: 2 }), catalogueBrut: CARTES, possedeesBrutes: POSSEDEES, journal });
        expect(r.resultat).toBe(fin.fini);
      }
    }
    expect(vus.has('joueur')).toBe(true);   // le test couvre bien des victoires
  });

  it('un abandon est une défaite (sans récompense)', () => {
    const grimoire = grimoireDuNavigateur();
    const { journal } = jouerUnDuel({ graine: 5, grimoire, abandonAuTour: 3 });
    const r = arbitrer({ duel: duelServeur({ graine: 5, grimoire }), catalogueBrut: CARTES, possedeesBrutes: POSSEDEES, journal });
    expect(r).toMatchObject({ resultat: 'adverse', details: { abandon: true } });
  });

  it('refuse une victoire inventée, une autre graine, ou des cartes non possédées', () => {
    const grimoire = grimoireDuNavigateur();
    // Une victoire : on cherche une graine que le joueur automatique gagne
    let partie; let graine = 1000;
    do { partie = jouerUnDuel({ graine: ++graine, grimoire }); } while (partie.fin.fini !== 'joueur');
    const base = { catalogueBrut: CARTES, possedeesBrutes: POSSEDEES };
    expect(arbitrer({ ...base, duel: duelServeur({ graine, grimoire }), journal: partie.journal }).resultat).toBe('joueur');

    // « J'ai gagné » sans avoir joué
    expect(arbitrer({ ...base, duel: duelServeur({ graine, grimoire }), journal: [] }).resultat).toBe('invalide');
    // Le navigateur a joué avec ses propres dés : rejouée avec la graine du serveur, la partie diverge
    expect(arbitrer({ ...base, duel: duelServeur({ graine: graine + 1, grimoire }), journal: partie.journal }).resultat).not.toBe('joueur');
    // Des cartes qu'il ne possède pas (Kaéliss, Dalek) : elles ne sont pas dans son Grimoire
    const triche = jouerUnDuel({ graine, grimoire: ['u1', 'u2', ...grimoire] });
    expect(arbitrer({ ...base, duel: duelServeur({ graine, grimoire: ['u1', 'u2', ...grimoire] }), journal: triche.journal }).resultat)
      .toBe(arbitrer({ ...base, duel: duelServeur({ graine, grimoire }), journal: triche.journal }).resultat);
    // Faire jouer l'Ombre à sa place, ou un journal mal formé
    expect(arbitrer({ ...base, duel: duelServeur({ graine, grimoire }), journal: [{ type: 'ia' }] }).resultat).toBe('invalide');
    expect(arbitrer({ ...base, duel: duelServeur({ graine, grimoire }), journal: 'gagné' }).resultat).toBe('invalide');
    expect(arbitrer({ ...base, duel: duelServeur({ graine, grimoire }), journal: [{ type: 'jouer', index: { __proto__: 1 } }] }).resultat).toBe('invalide');
  });
});

// ---------------------------------------------------------------------
//  Le mode Histoire : chaque niveau est une partie de Gemmes (moteur/histoireGemmes.js)
// ---------------------------------------------------------------------
// Joue un niveau comme la page des Gemmes : le joueur (ici automatique, avec son propre hasard), puis
// l'adversaire avec le hasard de la partie
function jouerUnNiveau({ idNiveau, graine, cles, abandonAuTour = null, maladroit = false }) {
  const { niveau } = trouverNiveau(idNiveau);
  const catalogue = CARTES.map(uniteDepuisCarte);
  const mesCartes = cartesDuChoix(cles, reserveGemmes(POSSEDEES.map(uniteDepuisCarte), catalogue))
    .map(({ cle, n, image, rarete }) => ({ cle, n, image, rarete }));
  const depart = preparerNiveau({ niveau, mesCartes, catalogue: catalogue.map(carteGemmes), graine, nom: 'Testeur' });
  const monHasard = generateur(graine + 1);
  let e = depart.etat;
  const journal = [];
  for (let i = 0; i < 5000 && !e.fin; i++) {
    if (e.actif === depart.moi) {
      if (abandonAuTour && e.tour >= abandonAuTour) { journal.push({ t: 'abandon' }); return { journal, gagnant: 'adverse' }; }
      const choix = maladroit ? { t: 'fin' } : choixOmbre(e, depart.moi, 'difficile', monHasard);
      journal.push(actionGemmes(choix));
      e = appliquer(e, depart.moi, choix).etat;
    } else {
      const res = appliquer(e, e.actif, choixOmbre(e, e.actif, niveau.difficulte, depart.h));
      if (res) e = res.etat;
    }
  }
  return { journal, gagnant: e.fin ? (e.fin.gagnant === depart.moi ? 'joueur' : 'adverse') : null };
}
const CLES = POSSEDEES.map((c) => c.id);
const niveauServeur = (idNiveau, graine, cles = CLES) => duelServeur({ mode: 'histoire', difficulte: null, niveau_id: idNiveau, graine, grimoire: cles.map(String) });

describe('arbitre du mode Histoire (Gemmes)', () => {
  it('retrouve le même vainqueur que le navigateur, niveau après niveau', () => {
    const vus = new Set();
    for (const idNiveau of ['pravorn-1', 'pravorn-4', 'pravorn-boss']) {
      for (const graine of [3, 2024, 4294967295]) {
        const { journal, gagnant } = jouerUnNiveau({ idNiveau, graine, cles: CLES });
        expect(gagnant).toBeTruthy();
        vus.add(gagnant);
        const r = arbitrer({ duel: niveauServeur(idNiveau, graine), catalogueBrut: CARTES, possedeesBrutes: POSSEDEES, journal });
        expect(r.resultat).toBe(gagnant);
        expect(r.details.jeu).toBe('gemmes');
      }
    }
    expect(vus.has('joueur')).toBe(true);
  });

  it('un abandon est une défaite ; une partie inachevée ou truquée est refusée', () => {
    const base = { catalogueBrut: CARTES, possedeesBrutes: POSSEDEES };
    const abandon = jouerUnNiveau({ idNiveau: 'pravorn-2', graine: 9, cles: CLES, abandonAuTour: 2 });
    expect(arbitrer({ ...base, duel: niveauServeur('pravorn-2', 9), journal: abandon.journal })).toMatchObject({ resultat: 'adverse', details: { abandon: true } });

    let partie; let graine = 500;
    do { partie = jouerUnNiveau({ idNiveau: 'pravorn-1', graine: ++graine, cles: CLES }); } while (partie.gagnant !== 'joueur');
    expect(arbitrer({ ...base, duel: niveauServeur('pravorn-1', graine), journal: partie.journal }).resultat).toBe('joueur');
    // « J'ai gagné » sans jouer, ou en s'arrêtant avant la fin
    expect(arbitrer({ ...base, duel: niveauServeur('pravorn-1', graine), journal: [] }).resultat).toBe('invalide');
    expect(arbitrer({ ...base, duel: niveauServeur('pravorn-1', graine), journal: partie.journal.slice(0, -3) }).resultat).toBe('invalide');
    // Une autre graine : la grille n'est plus la même, les échanges notés ne marchent plus
    expect(arbitrer({ ...base, duel: niveauServeur('pravorn-1', graine + 1), journal: partie.journal }).resultat).not.toBe('joueur');
    // Une carte « qui frappe tout de suite » ou un journal mal formé
    expect(arbitrer({ ...base, duel: niveauServeur('pravorn-1', graine), journal: [{ t: 'carte', k: 0 }] }).resultat).toBe('invalide');
    expect(arbitrer({ ...base, duel: niveauServeur('pravorn-1', graine), journal: [{ type: 'jouer' }] }).resultat).toBe('invalide');
    expect(arbitrer({ ...base, duel: niveauServeur('pravorn-1', graine), journal: 'gagné' }).resultat).toBe('invalide');
    // Un niveau inconnu
    expect(arbitrer({ ...base, duel: niveauServeur('pravorn-99', graine), journal: partie.journal }).resultat).toBe('invalide');
  });

  it('les cartes du joueur : seulement celles de sa collection (ou prêtées), pas celles qu\'il n\'a pas', () => {
    const base = { catalogueBrut: CARTES, possedeesBrutes: POSSEDEES };
    const pasAMoi = CARTES.map((c) => c.id).filter((id) => !CLES.includes(id)).slice(0, 3);
    // Le journal d'une partie jouée avec les cartes possédées, envoyé en déclarant d'autres cartes : la partie
    // rejouée est celle des cartes possédées (les autres sont ignorées), donc le même vainqueur
    const { journal, gagnant } = jouerUnNiveau({ idNiveau: 'pravorn-3', graine: 11, cles: CLES });
    const r = arbitrer({ ...base, duel: niveauServeur('pravorn-3', 11, [...pasAMoi, ...CLES]), journal });
    expect(r.resultat).toBe(gagnant);
  });
});
