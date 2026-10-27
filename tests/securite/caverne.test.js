// =====================================================================
//  La Caverne aux Trésors (supabase/caverne.sql) : le serveur tient la mise, le hasard et le gain.
//  Testée comme un tricheur s'y prendrait : lire le secret, rejouer une bourse, miser sans le sou…
// =====================================================================
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { creerBase } from './base.js';

const ALICE = '11111111-1111-1111-1111-111111111111';    // Discord 111111
const caverne = readFileSync(new URL('../../supabase/caverne.sql', import.meta.url), 'utf8');

let b;
const rpc = async (sql) => (await b.en('authenticated', ALICE, `select ${sql} as r`))[0].r;
const bourse = async () => (await b.sql(`select balance, cristaux from wallets where discord_id = '111111'`))[0];
const partie = async () => (await b.sql(`select * from caverne_parties where discord_id = '111111'`))[0];

beforeAll(async () => {
  b = await creerBase();
  await b.db.exec(caverne);
  await b.db.exec(caverne);   // relançable sans casse
  await b.compte({ id: ALICE, fournisseur: 'discord', meta: { provider_id: '111111', full_name: 'Alice' } });
  await b.sql(`update wallets set balance = 1000, cristaux = 100 where discord_id = '111111'`);
  await b.sql(`insert into caverne_acces values ('111111', now() + interval '1 day')`);   // un badge activé
}, 60000);

describe('la Caverne aux Trésors', () => {
  it('le secret de la partie et l\'historique des autres restent cachés', async () => {
    await rpc(`caverne_commencer('bourses', 'or', 100, 3)`);
    expect((await b.essai('authenticated', ALICE, 'select * from caverne_parties')).ok).toBe(false);
    expect((await b.essai('anon', null, `select caverne_commencer('pont', 'or', 10)`)).ok).toBe(false);
    for (const f of [`caverne_clore((select p from caverne_parties p limit 1), 100)`, `caverne_bouger('111111', 'or', 5000)`]) {
      expect((await b.essai('authenticated', ALICE, `select ${f}`)).ok).toBe(false);
    }
    await rpc('caverne_encaisser()').catch(() => {});
    await b.sql(`delete from caverne_parties`);
  });

  it('la mise est prise par le serveur, dans les bornes, et jamais à découvert', async () => {
    await b.sql(`update wallets set balance = 1000 where discord_id = '111111'`);
    expect((await b.essai('authenticated', ALICE, `select caverne_commencer('pont', 'or', 5)`)).ok).toBe(false);
    expect((await b.essai('authenticated', ALICE, `select caverne_commencer('pont', 'or', 1001)`)).ok).toBe(false);
    expect((await b.essai('authenticated', ALICE, `select caverne_commencer('pont', 'cristaux', 101)`)).ok).toBe(false);   // 100 cristaux
    const r = await rpc(`caverne_commencer('pont', 'cristaux', 50)`);
    expect(r.bourse).toEqual({ or: 1000, cristaux: 50 });
  });

  it('les Bourses : une bourse sûre fait monter le gain, une maudite prend la mise ; pas deux fois la même', async () => {
    await b.sql(`delete from caverne_parties; update wallets set balance = 1000 where discord_id = '111111'`);
    await rpc(`caverne_commencer('bourses', 'or', 100, 3)`);
    const maudites = (await partie()).etat.maudites;
    expect(maudites).toHaveLength(3);
    const sure = [...Array(25).keys()].find((i) => !maudites.includes(i));
    const r = await rpc(`caverne_bourse_ouvrir(${sure})`);
    expect(r).toMatchObject({ fini: false, maudite: false, ouvertes: 1 });
    expect(Number(r.multiplicateur)).toBe(1.1);   // 25/22 × 0,97
    expect((await b.essai('authenticated', ALICE, `select caverne_bourse_ouvrir(${sure})`)).ok).toBe(false);
    const fin = await rpc(`caverne_bourse_ouvrir(${maudites[0]})`);
    expect(fin).toMatchObject({ fini: true, maudite: true, gain: 0 });
    expect((await bourse()).balance).toBe(900);
    expect(await partie()).toBeUndefined();
  });

  it('les Bourses : encaisser paie le gain actuel', async () => {
    await b.sql(`update wallets set balance = 1000 where discord_id = '111111'`);
    await rpc(`caverne_commencer('bourses', 'or', 100, 12)`);
    const maudites = (await partie()).etat.maudites;
    const sure = [...Array(25).keys()].find((i) => !maudites.includes(i));
    await rpc(`caverne_bourse_ouvrir(${sure})`);
    const fin = await rpc('caverne_encaisser()');
    expect(fin.gain).toBe(186);   // 25/13 × 0,97 = 1,865… → ×1,86
    expect((await bourse()).balance).toBe(1086);
  });

  it('le Dragon : fuir avant le réveil paie le butin du moment ; après, tout est perdu', async () => {
    await b.sql(`update wallets set balance = 1000 where discord_id = '111111'`);
    await rpc(`caverne_commencer('dragon', 'or', 100)`);
    // 5 secondes de vol, réveil à ×10 (19 s) : ×e^0,6 = 1,82
    await b.sql(`update caverne_parties set etat = '{"reveil": 10, "auto": null}', commence_le = clock_timestamp() - interval '5 seconds'`);
    expect(await rpc('caverne_dragon_voir()')).toEqual({ fini: false });
    const fin = await rpc('caverne_encaisser()');
    expect(fin.gain).toBeGreaterThanOrEqual(182);
    expect(fin.gain).toBeLessThan(184);
    expect(Number(fin.reveil)).toBe(10);

    await rpc(`caverne_commencer('dragon', 'or', 100)`);
    await b.sql(`update caverne_parties set etat = '{"reveil": 2, "auto": null}', commence_le = clock_timestamp() - interval '6 seconds'`);
    expect(await rpc('caverne_encaisser()')).toMatchObject({ fini: true, gain: 0 });
    expect((await bourse()).balance).toBe(1000 - 100 + fin.gain - 100);
  });

  it('le Dragon : l\'encaissement automatique passe avant le réveil', async () => {
    await b.sql(`update wallets set balance = 1000 where discord_id = '111111'`);
    await rpc(`caverne_commencer('dragon', 'or', 100, 1.5)`);
    await b.sql(`update caverne_parties set etat = '{"reveil": 3, "auto": 1.5}', commence_le = clock_timestamp() - interval '20 seconds'`);
    expect(await rpc('caverne_dragon_voir()')).toMatchObject({ fini: true, gain: 150, auto: true });
  });

  it('le Pont : chaque pas est tiré par le serveur ; une partie laissée en plan est réglée à la suivante', async () => {
    await b.sql(`update wallets set balance = 1000 where discord_id = '111111'`);
    await rpc(`caverne_commencer('pont', 'or', 100)`);
    expect((await b.essai('authenticated', ALICE, 'select caverne_encaisser()')).ok).toBe(false);   // pas encore avancé
    await b.sql(`update caverne_parties set etat = '{"position": 3}'`);
    expect((await b.essai('authenticated', ALICE, 'select caverne_pont_avancer(3)')).ok).toBe(false);
    // on part sans encaisser : la partie suivante paie d'abord les 3 planches (×1,33)
    const r = await rpc(`caverne_commencer('bourses', 'or', 100, 1)`);
    expect(r.reglee).toMatchObject({ jeu: 'pont', gain: 133 });
    expect(r.bourse.or).toBe(1000 - 100 + 133 - 100);
    const h = await b.en('authenticated', ALICE, 'select jeu, gain from caverne_historique order by id desc limit 1');
    expect(h[0]).toEqual({ jeu: 'pont', gain: 133 });
  });

  it('le Lac : la prise reste secrète, la tension monte selon elle, 5 tirages la sortent ; couper rend la moitié', async () => {
    await b.sql(`delete from caverne_parties; update wallets set balance = 1000 where discord_id = '111111'`);
    const r = await rpc(`caverne_commencer('lac', 'or', 100)`);
    expect(JSON.stringify(r)).not.toContain('prise');
    // une créature géante (casse 22 % par tirage) : on rejoue jusqu'à la sortir, pour voir la tension et le gain
    let fin = null;
    for (let essai = 0; essai < 60 && !(fin && !fin.casse); essai++) {
      if (essai) {
        await b.sql(`update wallets set balance = 1000 where discord_id = '111111'`);
        await rpc(`caverne_commencer('lac', 'or', 100)`);
      }
      await b.sql(`update caverne_parties set etat = '{"prise": 4, "tirages": 0, "tension": 0}'`);
      let t;
      for (let k = 0; k < 5; k++) {
        t = await rpc('caverne_lac_tirer()');
        if (t.fini !== false) break;
        expect(t.hausse).toBeGreaterThanOrEqual(23);
        expect(t.hausse).toBeLessThanOrEqual(31);
        expect(JSON.stringify(t)).not.toContain('prise');
      }
      fin = t;
    }
    expect(fin).toMatchObject({ fini: true, casse: false, prise: 4, tirages: 5, gain: 1000 });
    expect(fin.tension).toBeGreaterThanOrEqual(115);

    await rpc(`caverne_commencer('lac', 'cristaux', 10)`);
    expect(await rpc('caverne_encaisser()')).toMatchObject({ fini: true, jeu: 'lac', gain: 5 });
    expect((await b.essai('authenticated', ALICE, 'select caverne_lac_tirer()')).ok).toBe(false);
  });

  it('le Roi Liche est retiré : on ne peut plus le défier, et une partie en cours est réglée en relançant le fichier', async () => {
    await b.sql(`delete from caverne_parties; update wallets set balance = 1000 where discord_id = '111111'`);
    expect((await b.essai('authenticated', ALICE, `select caverne_commencer('liche', 'or', 100)`)).erreur).toMatch(/Jeu inconnu/);
    expect((await b.essai('authenticated', ALICE, `select caverne_liche_agir('attaque')`)).ok).toBe(false);
    // une partie commencée avant le retrait, une manche gagnée (×1,2)
    await b.sql(`insert into caverne_parties (discord_id, jeu, monnaie, mise, etat) values ('111111', 'liche', 'or', 100, '{"manche": 1}')`);
    await b.db.exec(caverne);
    expect(await partie()).toBeUndefined();
    expect((await bourse()).balance).toBe(1120);
  });
});
