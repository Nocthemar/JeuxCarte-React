// =====================================================================
//  Les amis (supabase/amis.sql) : demandes, amitiés, présence, défis — et ce qu'un tricheur tenterait.
// =====================================================================
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { creerBase } from './base.js';

const ALICE = '11111111-1111-1111-1111-111111111111';   // Discord 111111
const BOB = '22222222-2222-2222-2222-222222222222';     // Discord 222222
const CLARA = '33333333-3333-3333-3333-333333333333';   // Discord 333333
const amis = readFileSync(new URL('../../supabase/amis.sql', import.meta.url), 'utf8');

let b;
const en = async (qui, sql) => (await b.en('authenticated', qui, `select ${sql} as r`))[0].r;
const essai = (qui, sql) => b.essai('authenticated', qui, `select ${sql}`);

beforeAll(async () => {
  b = await creerBase();
  await b.db.exec(amis);
  await b.db.exec(amis);   // relançable sans casse
  await b.compte({ id: ALICE, fournisseur: 'discord', meta: { provider_id: '111111', full_name: 'Alice' } });
  await b.compte({ id: BOB, fournisseur: 'discord', meta: { provider_id: '222222', full_name: 'Bob' } });
  await b.compte({ id: CLARA, fournisseur: 'discord', meta: { provider_id: '333333', full_name: 'Clara' } });
}, 60000);

describe('les amis', () => {
  it('chercher un joueur par son pseudo (jamais soi-même)', async () => {
    const r = await en(ALICE, `amis_chercher('bo')`);
    expect(r.map((x) => x.username)).toEqual(['Bob']);
    expect(await en(ALICE, `amis_chercher('ali')`)).toEqual([]);
    expect(await en(ALICE, `amis_chercher('b')`)).toEqual([]);   // au moins deux lettres
  });

  it('une demande, que l\'autre accepte : ils deviennent amis', async () => {
    expect(await en(ALICE, `amis_demander('222222')`)).toBe('envoyee');
    expect((await essai(ALICE, `amis_demander('222222')`)).erreur).toMatch(/déjà envoyée/);
    expect(await en(BOB, `amis_en_attente()`)).toBe(1);
    expect((await en(BOB, `amis_etat()`)).recues.map((x) => x.username)).toEqual(['Alice']);
    expect(await en(BOB, `amis_repondre('111111', true)`)).toBe('amis');
    expect((await en(ALICE, `amis_etat()`)).amis.map((x) => x.username)).toEqual(['Bob']);
    expect((await en(BOB, `amis_etat()`)).amis.map((x) => x.username)).toEqual(['Alice']);
  });

  it('deux demandes croisées valent acceptation ; refuser efface la demande', async () => {
    expect(await en(CLARA, `amis_demander('111111')`)).toBe('envoyee');
    expect(await en(ALICE, `amis_demander('333333')`)).toBe('amis');
    await en(ALICE, `amis_retirer('333333')`);
    expect((await en(ALICE, `amis_etat()`)).amis).toHaveLength(1);
    await en(CLARA, `amis_demander('222222')`);
    expect(await en(BOB, `amis_repondre('333333', false)`)).toBe('refusee');
    expect((await en(CLARA, `amis_etat()`)).envoyees).toHaveLength(0);
  });

  it('en ligne : seuls les amis le voient', async () => {
    await en(BOB, `amis_signal(true)`);
    const bob = (await en(ALICE, `amis_etat()`)).amis[0];
    expect(bob).toMatchObject({ en_ligne: true, en_duel: true });
    await b.sql(`update joueurs_vus set vu_le = now() - interval '10 minutes'`);
    expect((await en(ALICE, `amis_etat()`)).amis[0]).toMatchObject({ en_ligne: false, en_duel: false });
    // une demande reçue ne dit pas si l'autre est en ligne
    await en(CLARA, `amis_demander('111111')`);
    expect((await en(ALICE, `amis_etat()`)).recues[0].en_ligne).toBeUndefined();
  });

  it('défier un ami : il reçoit le salon, le prend une fois ; pas les autres joueurs', async () => {
    expect((await essai(ALICE, `amis_defier('333333', 'ABCDE')`)).erreur).toMatch(/que tes amis/);
    expect((await essai(ALICE, `amis_defier('222222', 'abc')`)).ok).toBe(false);
    await en(ALICE, `amis_defier('222222', 'ABCDE')`);
    const d = (await en(BOB, `amis_etat()`)).defis;
    expect(d).toMatchObject([{ username: 'Alice', salon: 'ABCDE' }]);
    expect((await essai(CLARA, `amis_defi_repondre(${d[0].id}, true)`)).ok).toBe(false);
    expect(await en(BOB, `amis_defi_repondre(${d[0].id}, true)`)).toBe('ABCDE');
    expect((await essai(BOB, `amis_defi_repondre(${d[0].id}, true)`)).ok).toBe(false);
  });

  it('un défi de plus de 10 minutes a expiré', async () => {
    await en(ALICE, `amis_defier('222222', 'FGHIJ')`);
    await b.sql(`update defis set cree_le = now() - interval '11 minutes'`);
    expect((await en(BOB, `amis_etat()`)).defis).toHaveLength(0);
    const id = (await b.sql(`select id from defis`))[0].id;
    expect((await essai(BOB, `amis_defi_repondre(${id}, true)`)).erreur).toMatch(/expiré/);
  });

  it('un tricheur ne lit ni n\'écrit les tables, et ne se fait pas ami tout seul', async () => {
    for (const t of ['amities', 'joueurs_vus', 'defis']) {
      expect((await b.essai('authenticated', CLARA, `select * from ${t}`)).ok).toBe(false);
    }
    expect((await b.essai('authenticated', CLARA, `insert into amities values ('333333', '222222', 'amis')`)).ok).toBe(false);
    expect((await essai(CLARA, `amis_repondre('222222', true)`)).ok).toBe(false);   // pas de demande de Bob
    expect((await essai(CLARA, `amis_sont('111111', '222222')`)).ok).toBe(false);
    expect((await b.essai('anon', null, `select amis_etat()`)).ok).toBe(false);
  });
});
