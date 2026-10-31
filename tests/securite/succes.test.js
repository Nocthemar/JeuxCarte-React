// =====================================================================
//  Les succès (supabase/succes.sql) : secrets masqués par le serveur, cristaux, nouvelles mesures,
//  et toujours une seule récompense par succès.
// =====================================================================
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { creerBase } from './base.js';

const ALICE = '11111111-1111-1111-1111-111111111111';    // Discord 111111
const BOB = '22222222-2222-2222-2222-222222222222';      // Discord 222222
const fichier = (n) => readFileSync(new URL(`../../supabase/${n}`, import.meta.url), 'utf8');

let b;
const succesDe = async (uid) => (await b.en('authenticated', uid, 'select mes_succes() as r'))[0].r;
const bourse = async () => (await b.sql(`select balance, cristaux from wallets where discord_id = '111111'`))[0];

beforeAll(async () => {
  b = await creerBase();
  for (const f of ['caverne.sql', 'amis.sql', 'succes.sql', 'succes.sql']) await b.db.exec(fichier(f));   // (relançable)
  await b.compte({ id: ALICE, fournisseur: 'discord', meta: { provider_id: '111111', full_name: 'Alice' } });
  await b.compte({ id: BOB, fournisseur: 'discord', meta: { provider_id: '222222', full_name: 'Bob' } });
  await b.sql(`update wallets set balance = 0, cristaux = 0`);
}, 60000);

describe('les succès', () => {
  it('un succès secret non atteint arrive masqué : ni son nom ni sa condition', async () => {
    const s = (await succesDe(ALICE)).find((x) => x.id === 'secret-lac');
    expect(s).toMatchObject({ secret: true, cache: true, nom: 'Succès secret', icone: '?', progression: 0, atteint: false });
    expect(JSON.stringify(s)).not.toContain('créature');
  });

  it('les nouvelles catégories existent, les victoires en ligne sont dans « Multijoueur »', async () => {
    const liste = await succesDe(ALICE);
    const cats = new Set(liste.map((x) => x.categorie));
    for (const c of ['Caverne', 'Multijoueur', 'Secrets']) expect(cats.has(c)).toBe(true);
    expect(liste.find((x) => x.id === 'premier-rival').categorie).toBe('Multijoueur');
  });

  it('la Caverne compte les parties ; le secret se dévoile une fois atteint, et donne or + cristaux une seule fois', async () => {
    await b.sql(`insert into caverne_historique (discord_id, jeu, monnaie, mise, gain, multiplicateur)
                 values ('111111', 'lac', 'or', 100, 1000, 10), ('111111', 'pont', 'or', 10, 0, null)`);
    const liste = await succesDe(ALICE);
    expect(liste.find((x) => x.id === 'caverne-1')).toMatchObject({ atteint: true, progression: 1 });
    expect(liste.find((x) => x.id === 'caverne-25')).toMatchObject({ atteint: false, progression: 2, objectif: 25 });
    expect(liste.find((x) => x.id === 'caverne-gros').atteint).toBe(true);
    const lac = liste.find((x) => x.id === 'secret-lac');
    expect(lac).toMatchObject({ cache: false, atteint: true, nom: 'Ce qui dort sous le lac', cristaux: 20 });

    const r = (await b.en('authenticated', ALICE, `select reclamer_succes('secret-lac') as r`))[0].r;
    expect(r).toMatchObject({ recompense: 200, cristaux: 20 });
    expect(await bourse()).toEqual({ balance: 200, cristaux: 20 });
    expect((await b.essai('authenticated', ALICE, `select reclamer_succes('secret-lac')`)).ok).toBe(false);
    expect((await b.essai('authenticated', ALICE, `select reclamer_succes('secret-pont')`)).ok).toBe(false);   // pas atteint
    expect(await bourse()).toEqual({ balance: 200, cristaux: 20 });
  });

  it('les amis comptent (seulement les amitiés acceptées)', async () => {
    await b.sql(`insert into amities (de, vers, statut) values ('111111', '222222', 'amis')`);
    expect((await succesDe(ALICE)).find((x) => x.id === 'ami-1').atteint).toBe(true);
    expect((await succesDe(BOB)).find((x) => x.id === 'ami-1').atteint).toBe(true);
  });

  it('le calcul interne des mesures n\'est pas appelable depuis le navigateur', async () => {
    expect((await b.essai('authenticated', ALICE, `select succes_stats_plus('222222')`)).ok).toBe(false);
  });
});
