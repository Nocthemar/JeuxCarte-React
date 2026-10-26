// =====================================================================
//  Une base Supabase de test, dans Node (PGlite : un vrai PostgreSQL) : schema.sql, donnees.sql puis
//  securite.sql, avec de quoi imiter Supabase (rôles anon / authenticated / service_role, auth.uid(),
//  auth.jwt(), realtime.topic(), les en-têtes et le chemin des requêtes de l'API).
//
//  const b = await creerBase();
//  await b.compte({ id, fournisseur: 'discord', meta: { provider_id: '111', full_name: 'Alice' } });
//  await b.en('authenticated', id, "select …")      -> lignes, ou lève l'erreur de la base
//  await b.essai('authenticated', id, "select …")   -> { ok, lignes, erreur }
// =====================================================================
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const fichier = (nom) => readFileSync(new URL(`../../supabase/${nom}`, import.meta.url), 'utf8');

const IMITATION_SUPABASE = `
  create role anon; create role authenticated; create role service_role; create role authenticator;
  create schema auth;
  create table auth.users (id uuid primary key, raw_user_meta_data jsonb, raw_app_meta_data jsonb, created_at timestamptz default now());
  create table auth.audit_log_entries (id uuid default gen_random_uuid(), payload jsonb, ip_address text, created_at timestamptz default now());
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('test.jwt', true), ''), '{}')::jsonb $$;
  create schema realtime;
  create table realtime.messages (id bigint generated always as identity, topic text);
  alter table realtime.messages enable row level security;
  create function realtime.topic() returns text language sql stable as $$ select current_setting('test.topic', true) $$;
  grant usage on schema auth, realtime to anon, authenticated;
  grant execute on function auth.uid(), auth.jwt(), realtime.topic() to anon, authenticated;
  grant select, insert on realtime.messages to authenticated;
  -- Comme Supabase : tout ce que crée postgres dans public est d'office ouvert aux trois rôles de l'API
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

export async function creerBase() {
  const db = new PGlite();
  await db.exec(IMITATION_SUPABASE);
  await db.exec(fichier('schema.sql'));
  await db.exec(fichier('donnees.sql'));
  await db.exec(fichier('securite.sql'));
  await db.exec(fichier('securite.sql'));   // relançable sans casse

  // Exécute sql avec un rôle et un compte (uid), et éventuellement un jeton (jwt), un canal (topic)
  const en = async (role, uid, sql, { jwt = null, topic = '' } = {}) => {
    await db.exec(`reset role; select set_config('test.uid', '${uid ?? ''}', false), set_config('test.topic', '${topic}', false),
      set_config('test.jwt', '${JSON.stringify(jwt ?? { amr: [] }).replace(/'/g, "''")}', false); set role ${role};`);
    try { return (await db.query(sql)).rows; } finally { await db.exec('reset role'); }
  };
  const essai = async (...args) => {
    try { return { ok: true, lignes: await en(...args) }; } catch (e) { return { ok: false, erreur: e.message }; }
  };
  // Un nouveau compte Supabase (comme le fait Supabase Auth : l'insertion déclenche la création du profil)
  const compte = ({ id, fournisseur, meta = {} }) => db.query(
    'insert into auth.users (id, raw_user_meta_data, raw_app_meta_data) values ($1, $2, $3)',
    [id, meta, { provider: fournisseur, providers: [fournisseur] }],
  );
  // En administrateur (comme le SQL Editor) ; plusieurs instructions possibles sans paramètres
  const sql = async (texte, params) => (params ? (await db.query(texte, params)).rows : (await db.exec(texte)).at(-1)?.rows ?? []);
  return { db, en, essai, compte, sql };
}
