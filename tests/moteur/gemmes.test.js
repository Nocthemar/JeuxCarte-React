// =====================================================================
//  Les règles des Gemmes du Codex (src/moteur/gemmes.js)
// =====================================================================
import { describe, it, expect } from 'vitest';
import {
  nouvellePartie, appliquer, alignements, coupsPossibles, choixOmbre, effetCarte,
  TAILLE, PV_DEPART, ECHANGES_PAR_TOUR, SORTES,
} from '../../src/moteur/gemmes.js';

const CARTES = [{ n: 'A', rarete: 'commune' }, { n: 'B', rarete: 'mythique' }, { n: 'C', rarete: 'legendaire' }];
const partie = (graine = 42) => nouvellePartie([{ nom: 'Moi', cartes: CARTES }, { nom: 'Ombre', cartes: CARTES }], graine);
// Une grille d'après une liste de sortes (indices de SORTES)
const grilleDe = (sortes) => sortes.map((s, i) => ({ id: 1000 + i, s }));
// Une grille sans alignement : un damier d'os et de pierre
const motif = (i) => ((Math.floor(i / TAILLE) + (i % TAILLE)) % 2 ? 3 : 4);

describe('les Gemmes du Codex', () => {
  it('une nouvelle partie : mêmes PV, aucune gemme déjà alignée, au moins un échange possible', () => {
    const e = partie();
    expect(e.joueurs.map((j) => j.pv)).toEqual([PV_DEPART, PV_DEPART]);
    expect(e.grille).toHaveLength(TAILLE * TAILLE);
    expect(alignements(e.grille).size).toBe(0);
    expect(coupsPossibles(e.grille).length).toBeGreaterThan(0);
    expect(e.echanges).toBe(ECHANGES_PAR_TOUR - 1);   // celui qui commence : un échange de moins
  });

  it('même graine + mêmes actions = même partie (le jeu en ligne en dépend)', () => {
    const jouer = () => {
      let e = partie(7);
      for (let n = 0; n < 12 && !e.fin; n += 1) e = appliquer(e, e.actif, choixOmbre(e, e.actif, 'normal', () => 0.5)).etat;
      return e;
    };
    expect(jouer()).toEqual(jouer());
  });

  it('un échange qui n\'aligne rien, ou entre cases non voisines, est refusé', () => {
    const e = partie();
    const bons = new Set(coupsPossibles(e.grille).map(([a, b]) => `${a}-${b}`));
    let mauvais = null;
    for (let i = 0; i < TAILLE * TAILLE - 1 && !mauvais; i += 1) if ((i + 1) % TAILLE && !bons.has(`${i}-${i + 1}`)) mauvais = [i, i + 1];
    expect(appliquer(e, 0, { t: 'echange', a: mauvais[0], b: mauvais[1] })).toBeNull();
    expect(appliquer(e, 0, { t: 'echange', a: 0, b: 2 })).toBeNull();
    expect(appliquer(e, 1, { t: 'echange', a: 0, b: 1 })).toBeNull();   // pas son tour
  });

  it('aligner 3 Sang charge la jauge de Sang de 3, 4 gemmes de 4 (×4 charge plus que ×3), sans blesser personne', () => {
    for (const n of [3, 4]) {
      const e = partie();
      const sortes = Array.from({ length: TAILLE * TAILLE }, (_, i) => motif(i));
      // ligne du bas : n-1 Sang avec un trou en 2e case, où glisser le dernier Sang depuis au-dessus
      for (let c = 0; c < n; c += 1) sortes[7 * TAILLE + c] = 0;
      sortes[7 * TAILLE + 1] = 3;
      sortes[6 * TAILLE + 1] = 0;
      e.grille = grilleDe(sortes);
      e.tirages = Array(200).fill(0.7);   // les gemmes qui tombent : toutes « os » (qui ne chargent rien)
      expect(alignements(e.grille).size).toBe(0);
      const r = appliquer(e, 0, { t: 'echange', a: 6 * TAILLE + 1, b: 7 * TAILLE + 1 });
      expect(r).not.toBeNull();
      expect(r.etapes[0].gains.sang).toBe(n);
      expect(r.etat.joueurs.map((j) => j.pv)).toEqual([PV_DEPART, PV_DEPART]);   // les gemmes ne blessent pas
      expect(r.etat.joueurs[0].cartes[0].jauge).toBe(n);
      expect(r.etat.echanges).toBe(e.echanges - 1);
    }
  });

  it('trois échanges, puis le tour passe ; « fin » le passe plus tôt', () => {
    let e = partie(3);
    e = appliquer(e, 0, { t: 'fin' }).etat;
    expect(e.actif).toBe(1);
    for (let n = 0; n < ECHANGES_PAR_TOUR; n += 1) {
      const [a, b] = coupsPossibles(e.grille)[0];
      e.joueurs[1].cartes.forEach((c) => { c.jauge = 0; });
      e = appliquer(e, 1, { t: 'echange', a, b }).etat;
      e.joueurs[1].cartes.forEach((c) => { c.jauge = 0; });
    }
    expect(e.actif === 0 || e.fin).toBeTruthy();
  });

  it('une carte pleine se déclenche : Sang frappe 1,5 × sa force, Azur soigne, Ambre rend un échange', () => {
    const e = partie();
    e.joueurs[0].pv = 50;
    e.joueurs[0].cartes.forEach((c) => { c.jauge = c.max; });
    const sang = appliquer(e, 0, { t: 'carte', k: 0 });
    expect(sang.etat.joueurs[1].pv).toBe(PV_DEPART - effetCarte({ couleur: 'sang', rarete: 'commune' }).degats);
    expect(sang.etat.joueurs[0].cartes[0].jauge).toBe(0);
    const ambre = appliquer(sang.etat, 0, { t: 'carte', k: 1 });
    expect(ambre.etat.echanges).toBe(e.echanges + 1);
    const azur = appliquer(ambre.etat, 0, { t: 'carte', k: 2 });
    expect(azur.etat.joueurs[0].pv).toBe(50 + effetCarte({ couleur: 'azur', rarete: 'legendaire' }).soin);
    expect(appliquer(azur.etat, 0, { t: 'carte', k: 2 })).toBeNull();   // vide
  });

  it('la partie s\'arrête à 0 PV, et plus rien ne se joue', () => {
    const e = partie();
    e.joueurs[1].pv = 5;
    e.joueurs[0].cartes[0].jauge = e.joueurs[0].cartes[0].max;
    const r = appliquer(e, 0, { t: 'carte', k: 0 });
    expect(r.etat.fin).toEqual({ gagnant: 0 });
    expect(r.etat.joueurs[1].pv).toBe(0);
    expect(appliquer(r.etat, 0, { t: 'fin' })).toBeNull();
  });

  it('l\'Ombre joue toujours un coup permis, et une partie entre deux Ombres se termine', () => {
    for (const d of ['facile', 'normal', 'difficile']) {
      let e = partie(11);
      for (let n = 0; n < 2000 && !e.fin; n += 1) {
        const r = appliquer(e, e.actif, choixOmbre(e, e.actif, d));
        expect(r).not.toBeNull();
        e = r.etat;
      }
      expect(e.fin).not.toBeNull();
      expect(SORTES.length).toBe(5);
    }
  });
});
