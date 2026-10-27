// =====================================================================
//  Le panneau MJ du jeu (supabase/mj.sql) : réservé aux MJ, et chaque outil fait ce qu'il dit.
// =====================================================================
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { creerBase } from './base.js';

const MJ = '11111111-1111-1111-1111-111111111111';       // Discord 111111
const JOUEUSE = '22222222-2222-2222-2222-222222222222';  // Discord 222222
const fichier = (nom) => readFileSync(new URL(`../../supabase/${nom}`, import.meta.url), 'utf8');

let b;
const mj = async (sql) => (await b.en('authenticated', MJ, `select ${sql} as r`))[0].r;
const essaiJoueuse = (sql) => b.essai('authenticated', JOUEUSE, `select ${sql}`);

beforeAll(async () => {
  b = await creerBase();
  await b.db.exec(fichier('caverne.sql'));
  await b.db.exec(fichier('mj.sql'));
  await b.db.exec(fichier('mj.sql'));   // relançable sans casse
  await b.compte({ id: MJ, fournisseur: 'discord', meta: { provider_id: '111111', full_name: 'Maître' } });
  await b.compte({ id: JOUEUSE, fournisseur: 'discord', meta: { provider_id: '222222', full_name: 'Joueuse' } });
  await b.sql(`update players set is_mj = true where discord_id = '111111'`);
}, 60000);

describe('le panneau MJ du jeu', () => {
  it('un joueur qui n\'est pas MJ est refusé partout', async () => {
    for (const f of [`mj_jeu_stats()`, `mj_jeu_joueur('222222')`, `mj_jeu_or('222222', 1000)`, `mj_jeu_cristaux('222222', 50)`,
      `mj_jeu_booster('222222', 'cendres', 5)`, `mj_jeu_badge('222222', '3mois', 1)`, `mj_jeu_acces_caverne('222222', 100)`,
      `mj_jeu_pass('222222', 5000, true)`, `mj_jeu_role('222222', true)`]) {
      expect((await essaiJoueuse(f)).ok, f).toBe(false);
    }
    expect((await b.essai('anon', null, `select mj_jeu_stats()`)).ok).toBe(false);
  });

  it('la vue d\'ensemble et la fiche d\'un joueur', async () => {
    const s = await mj('mj_jeu_stats()');
    expect(Number(s.joueurs)).toBe(2);
    const f = await mj(`mj_jeu_joueur('222222')`);
    expect(f.joueur.username).toBe('Joueuse');
    expect(f.bourse).toEqual({ or: 0, cristaux: 0 });
    expect(f.caverne.badges).toHaveLength(4);
    expect((await b.essai('authenticated', MJ, `select mj_jeu_joueur('inconnu')`)).ok).toBe(false);
  });

  it('l\'or et les cristaux : donnés, retirés, jamais sous zéro ; l\'or est noté dans le journal', async () => {
    expect(await mj(`mj_jeu_or('222222', 500, 'Tournoi')`)).toBe(500);
    expect(await mj(`mj_jeu_or('222222', -800)`)).toBe(0);
    const tx = await b.sql(`select amount, source from transactions where discord_id = '222222' order by id`);
    expect(tx.map((t) => t.amount)).toEqual([500, -500]);
    expect(tx.every((t) => t.source === 'mj')).toBe(true);
    expect(await mj(`mj_jeu_cristaux('222222', 40)`)).toBe(40);
    expect(await mj(`mj_jeu_cristaux('222222', -100)`)).toBe(0);
  });

  it('les cartes : donner des exemplaires, en retirer, jusqu\'à l\'enlever de la collection', async () => {
    const id = (await b.sql(`select id from cards order by id limit 1`))[0].id;
    expect(await mj(`mj_jeu_carte('222222', ${id}, 3)`)).toBe(3);
    expect(await mj(`mj_jeu_carte('222222', ${id}, -1)`)).toBe(2);
    expect(await mj(`mj_jeu_carte('222222', ${id}, -5)`)).toBe(0);
    expect(await b.sql(`select * from player_cards where discord_id = '222222'`)).toHaveLength(0);
  });

  it('les boosters, les badges et l\'accès à la Caverne', async () => {
    expect(await mj(`mj_jeu_booster('222222', 'cendres', 2)`)).toBe(2);
    expect(await mj(`mj_jeu_booster('222222', 'cendres', -5)`)).toBe(0);
    expect(await mj(`mj_jeu_badge('222222', '1semaine', 2)`)).toBe(2);
    expect(await mj(`mj_jeu_acces_caverne('222222', 48)`)).not.toBeNull();
    expect((await b.essai('authenticated', JOUEUSE, `select caverne_commencer('pont', 'or', 10)`)).erreur).not.toMatch(/scellée/);
    expect(await mj(`mj_jeu_acces_caverne('222222', 0)`)).toBeNull();
    expect((await b.essai('authenticated', JOUEUSE, `select caverne_commencer('pont', 'or', 10)`)).erreur).toMatch(/scellée/);
  });

  it('retirer du temps d\'accès à la Caverne ; en retirer plus qu\'il n\'en reste la referme', async () => {
    const reste = async () => Number((await b.sql(`select extract(epoch from jusqu_a - now()) / 3600 as h from caverne_acces where discord_id = '222222'`))[0]?.h ?? 0);
    await mj(`mj_jeu_acces_caverne('222222', 168)`);
    await mj(`mj_jeu_acces_caverne('222222', -24)`);
    expect(await reste()).toBeCloseTo(144, 1);
    expect(await mj(`mj_jeu_acces_caverne('222222', -720)`)).toBeNull();
    expect((await b.essai('authenticated', JOUEUSE, `select caverne_commencer('pont', 'or', 10)`)).erreur).toMatch(/scellée/);
  });

  it('le rôle de MJ : nommer, retirer, mais pas se retirer soi-même', async () => {
    expect(await mj(`mj_jeu_role('222222', true)`)).toBe(true);
    expect(await mj(`mj_jeu_role('222222', false)`)).toBe(false);
    expect((await b.essai('authenticated', MJ, `select mj_jeu_role('111111', false)`)).ok).toBe(false);
  });

  it('chaque geste du MJ est noté dans le journal de sécurité', async () => {
    const n = (await b.sql(`select count(*)::int as n from securite.journal where action like 'mj_jeu_%'`))[0].n;
    expect(n).toBeGreaterThan(5);
  });
});
