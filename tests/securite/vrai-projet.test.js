// =====================================================================
//  securite.sql sur une base comme le VRAI projet (supabase/diagnostic-vrai-projet.sql, 26/10/2026) :
//  le trigger du site on_auth_user_changed -> handle_auth_user (qui choisissait le joueur d'après
//  raw_user_meta_data, à l'inscription et à chaque mise à jour), pas de histoire_commencer, pas de
//  colonne items.echangeable.
// =====================================================================
import { describe, test, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { creerBase } from './base.js';

const VICTIME = '00000000-0000-4000-8000-000000000001';
const PIRATE = '00000000-0000-4000-8000-000000000002';

const COMME_LE_VRAI_PROJET = `
  create or replace function public.handle_auth_user() returns trigger language plpgsql security definer
  set search_path to 'public' as $f$
  declare v_discord_id text := new.raw_user_meta_data ->> 'provider_id';
  begin
    if v_discord_id is null then return new; end if;
    insert into players (discord_id, user_id, username, avatar_url)
    values (v_discord_id, new.id, new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'avatar_url')
    on conflict (discord_id) do update set user_id = excluded.user_id;
    return new;
  end $f$;
  create trigger on_auth_user_changed after insert or update of raw_user_meta_data on auth.users
    for each row execute function handle_auth_user();
  drop function public.histoire_commencer(text);
  alter table public.items drop column echangeable;
`;

describe('securite.sql sur le vrai projet', () => {
  let b;
  beforeAll(async () => {
    b = await creerBase();
    await b.db.exec(COMME_LE_VRAI_PROJET);
    // Le vrai projet n'a jamais vu securite.sql : on le relance par-dessus, comme l'utilisateur le fera
    await b.db.exec(readFileSync(new URL('../../supabase/securite.sql', import.meta.url), 'utf8'));
  }, 60000);

  test('le trigger du site est retiré, sa fonction ne fait plus rien', async () => {
    const triggers = await b.sql("select tgname from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal order by 1");
    expect(triggers.map((t) => t.tgname)).toEqual(['creer_profil_joueur', 'maj_avatar_joueur']);
  });

  test('réécrire ses métadonnées ne rattache plus le profil d\'un autre', async () => {
    await b.compte({ id: VICTIME, fournisseur: 'discord', meta: { provider_id: '123456789012', full_name: 'Victime' } });
    await b.compte({ id: PIRATE, fournisseur: 'email', meta: {} });
    // Ce que fait supabase.auth.updateUser({ data: { provider_id } }) : une mise à jour des métadonnées
    await b.sql(`update auth.users set raw_user_meta_data = '{"provider_id":"123456789012"}' where id = '${PIRATE}'`);
    const [p] = await b.sql("select user_id from players where discord_id = '123456789012'");
    expect(p.user_id).toBe(VICTIME);
  });

  test('les échanges d\'objets marchent sans la colonne echangeable', async () => {
    const [joueur] = await b.sql(`select discord_id from players where user_id = '${VICTIME}'`);
    await b.sql(`update players set created_at = now() - interval '2 days' where discord_id = '${joueur.discord_id}'`);
    const [objet] = await b.sql("insert into items (name) values ('Objet du test') returning id");
    await b.sql(`insert into inventory (discord_id, item_id) values ('${joueur.discord_id}', ${objet.id})`);
    const [r] = await b.sql(`select public.commerce_verifier('${joueur.discord_id}', '{}', 0, array['${objet.id}']) as raison`);
    expect(r.raison).toBeNull();
  });
});
