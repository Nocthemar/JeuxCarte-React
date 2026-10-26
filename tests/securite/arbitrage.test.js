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

  it('mode Histoire : le niveau (deck, PV, difficulté) vient des données du jeu, pas du navigateur', () => {
    const grimoire = grimoireDuNavigateur();
    const { niveau } = trouverNiveau('pravorn-1');
    const { fin, journal } = jouerUnDuel({ graine: 77, difficulte: niveau.difficulte, niveau, grimoire });
    const r = arbitrer({ duel: duelServeur({ mode: 'histoire', difficulte: null, niveau_id: 'pravorn-1', graine: 77, grimoire }), catalogueBrut: CARTES, possedeesBrutes: POSSEDEES, journal });
    expect(r.resultat).toBe(fin.fini);
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
