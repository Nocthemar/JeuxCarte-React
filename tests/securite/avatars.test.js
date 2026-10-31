// =====================================================================
//  Le portrait choisi par le joueur (supabase/avatars.sql) : seulement dans son dossier, seulement une image
//  à soi ; un compte Discord aussi, que Discord n'écrase plus, et qui peut reprendre celui de Discord. Le stockage de Supabase est imité (storage.buckets, storage.objects).
// =====================================================================
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { creerBase } from './base.js';

const EMAIL = '66666666-6666-6666-6666-666666666666';
const AUTRE = '77777777-7777-7777-7777-777777777777';
const DISCORD = '11111111-1111-1111-1111-111111111111';
const avatars = readFileSync(new URL('../../supabase/avatars.sql', import.meta.url), 'utf8');
const STOCKAGE = `
  create schema if not exists storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
  alter table storage.objects enable row level security;
  grant usage on schema storage to authenticated;
  grant select, insert, delete on storage.objects to authenticated;
`;
const URL_PUBLIQUE = 'https://abcd.supabase.co/storage/v1/object/public/avatars/';

let b, moi, autre;
const deposer = (uid, nom) => b.essai('authenticated', uid, `insert into storage.objects (bucket_id, name) values ('avatars', '${nom}')`);
const changer = (uid, url) => b.essai('authenticated', uid, `select changer_avatar(${url === null ? 'null' : `'${url}'`}) as r`);

beforeAll(async () => {
  b = await creerBase();
  await b.db.exec(STOCKAGE);
  await b.db.exec(avatars);
  await b.db.exec(avatars);   // relançable sans casse
  await b.compte({ id: EMAIL, fournisseur: 'email', meta: {} });
  await b.compte({ id: AUTRE, fournisseur: 'email', meta: {} });
  await b.compte({ id: DISCORD, fournisseur: 'discord', meta: { provider_id: '111111', full_name: 'Alice', avatar_url: 'https://cdn.discordapp.com/avatars/111111/a.png' } });
  moi = 'e_' + EMAIL.replace(/-/g, '');
  autre = 'e_' + AUTRE.replace(/-/g, '');
}, 60000);

describe('le portrait choisi par le joueur', () => {
  it('le stockage « avatars » est public, limité à 512 ko et aux images', async () => {
    const [s] = await b.sql(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'avatars'`);
    expect({ ...s, file_size_limit: Number(s.file_size_limit) }).toEqual({ public: true, file_size_limit: 524288, allowed_mime_types: ['image/webp', 'image/png'] });
  });

  it('un compte e-mail dépose dans son dossier, jamais dans celui d\'un autre ni un autre type de fichier', async () => {
    expect((await deposer(EMAIL, `${moi}/a1.webp`)).ok).toBe(true);
    expect((await deposer(EMAIL, `${autre}/pirate.webp`)).ok).toBe(false);
    expect((await deposer(EMAIL, `${moi}/page.html`)).ok).toBe(false);
    expect((await deposer(EMAIL, `${moi}/../x.webp`)).ok).toBe(false);
    expect((await deposer(DISCORD, '111111/a.webp')).ok).toBe(true);    // un compte Discord aussi, dans son dossier
    expect((await deposer(DISCORD, `${moi}/d.webp`)).ok).toBe(false);
  });

  it('pas plus de 5 images à la fois', async () => {
    for (const n of ['a2', 'a3', 'a4', 'a5']) expect((await deposer(EMAIL, `${moi}/${n}.png`)).ok).toBe(true);
    expect((await deposer(EMAIL, `${moi}/a6.png`)).ok).toBe(false);
    expect((await b.essai('authenticated', EMAIL, `delete from storage.objects where name like '${moi}/a_.png'`)).ok).toBe(true);
    expect((await b.sql(`select count(*)::int n from storage.objects where name like '${moi}/%'`))[0].n).toBe(1);
  });

  it('changer_avatar : seulement une image à soi, déjà déposée', async () => {
    expect((await changer(EMAIL, `${URL_PUBLIQUE}${moi}/a1.webp`)).ok).toBe(true);
    expect((await b.sql(`select avatar_url from players where discord_id = '${moi}'`))[0].avatar_url).toBe(`${URL_PUBLIQUE}${moi}/a1.webp`);
    expect((await changer(EMAIL, `${URL_PUBLIQUE}${moi}/inconnue.webp`)).ok).toBe(false);            // pas déposée
    expect((await changer(AUTRE, `${URL_PUBLIQUE}${moi}/a1.webp`)).ok).toBe(false);                  // l'image d'un autre
    expect((await changer(EMAIL, 'https://pirate.example/a1.webp')).ok).toBe(false);
    expect((await changer(EMAIL, `${URL_PUBLIQUE}${moi}/a1.webp?x=<script>`)).ok).toBe(false);
    expect((await changer(DISCORD, `${URL_PUBLIQUE}${moi}/a1.webp`)).ok).toBe(false);                // l'image d'un autre
    // retirer son portrait
    expect((await changer(EMAIL, null)).ok).toBe(true);
    expect((await b.sql(`select avatar_url from players where discord_id = '${moi}'`))[0].avatar_url).toBeNull();
  });

  it('un compte Discord choisit son portrait, Discord ne l\'écrase plus, et il peut reprendre celui de Discord', async () => {
    const DISCORD_IMG = 'https://cdn.discordapp.com/avatars/111111/';
    const portrait = async () => (await b.sql(`select avatar_url, avatar_perso from players where discord_id = '111111'`))[0];
    const reconnexion = (img) => b.sql(`update auth.users set raw_user_meta_data = raw_user_meta_data || '{"avatar_url": "${DISCORD_IMG}${img}"}' where id = '${DISCORD}'`);
    expect(await portrait()).toEqual({ avatar_url: `${DISCORD_IMG}a.png`, avatar_perso: false });
    expect((await changer(DISCORD, `${URL_PUBLIQUE}111111/a.webp`)).ok).toBe(true);
    expect(await portrait()).toEqual({ avatar_url: `${URL_PUBLIQUE}111111/a.webp`, avatar_perso: true });
    // une reconnexion à Discord (nouvelles métadonnées) ne remplace pas le portrait choisi
    await reconnexion('b.png');
    expect((await portrait()).avatar_url).toBe(`${URL_PUBLIQUE}111111/a.webp`);
    // reprendre celui de Discord (le plus récent), qui suit de nouveau Discord
    expect((await changer(DISCORD, null)).ok).toBe(true);
    expect(await portrait()).toEqual({ avatar_url: `${DISCORD_IMG}b.png`, avatar_perso: false });
    await reconnexion('c.png');
    expect((await portrait()).avatar_url).toBe(`${DISCORD_IMG}c.png`);
  });

  it('on ne voit ni n\'efface les images des autres', async () => {
    await b.sql(`insert into storage.objects (bucket_id, name) values ('avatars', '${autre}/b.webp')`);
    expect(await b.en('authenticated', EMAIL, `select name from storage.objects where name like '${autre}/%'`)).toEqual([]);
    await b.en('authenticated', EMAIL, `delete from storage.objects where name = '${autre}/b.webp'`);
    expect((await b.sql(`select count(*)::int n from storage.objects where name = '${autre}/b.webp'`))[0].n).toBe(1);
  });
});
