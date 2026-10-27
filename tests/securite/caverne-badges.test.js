// =====================================================================
//  Les badges de la Caverne (fin de supabase/caverne.sql) : sans badge activé, la Caverne est scellée.
//  Acheter, activer, cumuler le temps ; les badges gagnés (succès, Pass) ; et ce qu'un tricheur tenterait.
// =====================================================================
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { creerBase } from './base.js';

const ALICE = '11111111-1111-1111-1111-111111111111';    // Discord 111111
const caverne = readFileSync(new URL('../../supabase/caverne.sql', import.meta.url), 'utf8');

let b;
const rpc = async (sql) => (await b.en('authenticated', ALICE, `select ${sql} as r`))[0].r;
const essai = (sql) => b.essai('authenticated', ALICE, `select ${sql}`);
const solde = async () => (await b.sql(`select balance from wallets where discord_id = '111111'`))[0].balance;
const badges = async () => Object.fromEntries((await rpc('caverne_badges_etat()')).badges.map((x) => [x.id, x.nombre]));
const resteJours = async () => Number((await b.sql(`select extract(epoch from jusqu_a - now()) / 86400 as j from caverne_acces where discord_id = '111111'`))[0]?.j ?? 0);

beforeAll(async () => {
  b = await creerBase();
  await b.db.exec(caverne);
  await b.db.exec(caverne);   // relançable sans casse
  await b.compte({ id: ALICE, fournisseur: 'discord', meta: { provider_id: '111111', full_name: 'Alice' } });
  await b.sql(`update wallets set balance = 2000 where discord_id = '111111'`);
}, 60000);

describe('les badges de la Caverne', () => {
  it('sans badge activé, la Caverne est scellée', async () => {
    const r = await essai(`caverne_commencer('pont', 'or', 10)`);
    expect(r.ok).toBe(false);
    expect(r.erreur).toMatch(/scellée/);
    expect((await rpc('caverne_badges_etat()')).jusqu_a).toBeNull();
  });

  it('acheter un badge prend son prix en or ; sans assez d\'or, rien ne se passe', async () => {
    const r = await rpc(`caverne_badge_acheter('1semaine')`);
    expect(r.achete).toBe('1 semaine');
    expect(await solde()).toBe(800);
    expect((await badges())['1semaine']).toBe(1);
    expect((await essai(`caverne_badge_acheter('1mois')`)).ok).toBe(false);   // 4000 > 800
    expect(await solde()).toBe(800);
    expect((await badges())['1mois']).toBe(0);
  });

  it('activer ouvre la Caverne pour la durée du badge, et le badge est consommé', async () => {
    await rpc(`caverne_badge_activer('1semaine')`);
    expect((await badges())['1semaine']).toBe(0);
    expect(await resteJours()).toBeCloseTo(7, 2);
    expect((await essai(`caverne_commencer('pont', 'or', 10)`)).ok).toBe(true);
    await rpc('caverne_encaisser()').catch(() => {});
    await b.sql(`delete from caverne_parties`);
    expect((await essai(`caverne_badge_activer('1semaine')`)).ok).toBe(false);   // plus de badge
  });

  it('activer pendant que l\'accès court ajoute le temps au temps restant', async () => {
    await rpc(`caverne_badge_acheter('24h')`);
    await rpc(`caverne_badge_activer('24h')`);
    expect(await resteJours()).toBeCloseTo(8, 2);
  });

  it('un accès expiré ne compte plus ; le badge suivant repart de maintenant', async () => {
    await b.sql(`update caverne_acces set jusqu_a = now() - interval '3 days'`);
    expect((await essai(`caverne_commencer('pont', 'or', 10)`)).ok).toBe(false);
    await b.sql(`insert into caverne_badges values ('111111', '24h', 1) on conflict (discord_id, badge_id) do update set nombre = 1`);
    await rpc(`caverne_badge_activer('24h')`);
    expect(await resteJours()).toBeCloseTo(1, 2);
  });

  it('les badges se gagnent : un succès qui en donne un, un palier du Pass', async () => {
    const id = (await b.sql(`select id from succes order by ordre limit 1`))[0].id;
    await b.sql(`update succes set badge_caverne = '1mois' where id = '${id}'`);
    await b.sql(`insert into player_succes (discord_id, succes_id) values ('111111', '${id}')`);
    expect((await badges())['1mois']).toBe(1);
    await b.sql(`insert into pass_cosmetiques (discord_id, type, nom) values ('111111', 'badge_caverne', '3mois')`);
    expect((await badges())['3mois']).toBe(1);
    expect(await b.sql(`select * from pass_cosmetiques where type = 'badge_caverne'`)).toHaveLength(0);
  });

  it('un tricheur ne peut ni se donner un badge, ni s\'ouvrir la Caverne, ni lire ceux des autres', async () => {
    for (const f of [`caverne_badge_donner('111111', '3mois')`, `caverne_a_acces('111111')`]) {
      expect((await essai(f)).ok).toBe(false);
    }
    expect((await b.essai('authenticated', ALICE, `insert into caverne_acces values ('111111', now() + interval '1 year')`)).ok).toBe(false);
    expect((await b.essai('authenticated', ALICE, `update caverne_badges set nombre = 99`)).ok).toBe(false);
    expect((await b.essai('authenticated', ALICE, `update caverne_badges_types set prix = 0`)).ok).toBe(false);
    expect((await b.sql(`select prix from caverne_badges_types where id = '24h'`))[0].prix).toBe(250);
    expect((await b.essai('anon', null, `select caverne_badge_acheter('24h')`)).ok).toBe(false);
  });

  it('un MJ aussi a besoin d\'un badge', async () => {
    await b.sql(`delete from caverne_parties; delete from caverne_acces; update players set is_mj = true where discord_id = '111111'`);
    expect((await essai(`caverne_commencer('pont', 'or', 10)`)).ok).toBe(false);
    await b.sql(`insert into caverne_badges values ('111111', '24h', 1) on conflict (discord_id, badge_id) do update set nombre = 1`);
    await rpc(`caverne_badge_activer('24h')`);
    expect((await essai(`caverne_commencer('pont', 'or', 10)`)).ok).toBe(true);
  });
});
