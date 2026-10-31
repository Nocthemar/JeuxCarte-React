// =====================================================================
//  Contrôle global de la base, tous les fichiers SQL chargés ensemble (comme sur le vrai projet) :
//  - chaque table du schéma public a sa protection par ligne (RLS) ;
//  - aucune fonction « security definer » n'est exécutable par un visiteur non connecté (anon),
//    sauf celles qui sont publiques exprès ;
//  - un joueur ne peut écrire directement ni dans sa bourse, ni dans ses cartes, ni dans ses succès, ni dans le pass.
// =====================================================================
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { creerBase } from './base.js';

const ALICE = '11111111-1111-1111-1111-111111111111';
const fichier = (n) => readFileSync(new URL(`../../supabase/${n}`, import.meta.url), 'utf8');
const STOCKAGE = `
  create schema if not exists storage;
  create table if not exists storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
  alter table storage.objects enable row level security;
`;
// Les fonctions qu'un visiteur non connecté a le droit d'appeler (lecture publique, ou garde-fou de l'API)
//  signaler_erreur : signaler un bug (même depuis l'écran de connexion, limité en débit) ;
//  stats_joueur, succes_vitrine : les victoires et les badges d'un profil, publics comme sur le site Nocthémar.
const PUBLIQUES_ANON = new Set(['limiter_requete', 'signaler_erreur', 'stats_joueur', 'succes_vitrine']);

let b;
beforeAll(async () => {
  b = await creerBase();
  await b.db.exec(STOCKAGE);
  for (const f of ['caverne.sql', 'amis.sql', 'avatars.sql', 'mj.sql', 'succes.sql']) await b.db.exec(fichier(f));
  await b.compte({ id: ALICE, fournisseur: 'discord', meta: { provider_id: '111111', full_name: 'Alice' } });
}, 90000);

describe('contrôle global de la base', () => {
  it('chaque table du schéma public est protégée par ligne (RLS)', async () => {
    const sans = await b.sql(`select tablename from pg_tables where schemaname = 'public' and not rowsecurity order by 1`);
    expect(sans.map((x) => x.tablename)).toEqual([]);
  });

  it('aucune fonction « security definer » n\'est ouverte aux visiteurs non connectés', async () => {
    const ouvertes = await b.sql(`
      select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'securite') and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')
      order by 1`);
    expect(ouvertes.map((x) => x.proname).filter((x) => !PUBLIQUES_ANON.has(x))).toEqual([]);
  });

  it('un joueur ne peut rien écrire directement dans sa bourse, ses cartes, ses succès ou son pass', async () => {
    for (const sql of [
      `update wallets set balance = 999999, cristaux = 999999`,
      `insert into player_cards (discord_id, card_id) values ('111111', 1)`,
      `insert into player_succes (discord_id, succes_id) values ('111111', 'premier-sang')`,
      `update pass_progression set xp = 999999`,
      `insert into caverne_parties (discord_id, jeu, monnaie, mise) values ('111111', 'pont', 'or', 10)`,
      `insert into caverne_historique (discord_id, jeu, monnaie, mise, gain) values ('111111', 'lac', 'or', 1, 100000)`,
    ]) {
      const r = await b.essai('authenticated', ALICE, sql);
      const touche = r.ok ? (await b.sql(`select (select coalesce(sum(balance), 0) from wallets) as or_total`))[0].or_total : 0;
      expect(r.ok === false || Number(touche) < 999999, sql).toBe(true);
    }
    const caverne = await b.sql(`select count(*)::int n from caverne_historique where gain = 100000`);
    expect(caverne[0].n).toBe(0);
  });
});
