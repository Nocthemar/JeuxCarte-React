-- =====================================================================
--  Vérification de la sécurité d'un projet Supabase — LECTURE SEULE (rien n'est modifié)
--  À lancer dans Supabase > SQL Editor, de préférence AVANT puis APRÈS securite.sql, sur le vrai projet.
--  Lance les requêtes une par une (sélectionne-la, puis Run) et lis les repères.
-- =====================================================================

-- 1. La faille de prise de contrôle a-t-elle déjà servi ? Profils rattachés à un compte qui n'est PAS un
--    compte Discord (alors que le profil porte un identifiant Discord). ATTENDU : aucune ligne.
--    (Après securite.sql, les comptes e-mail ont une clé « e_… » : ils n'apparaissent pas ici.)
select p.discord_id, p.username, p.is_mj, u.email, u.created_at as compte_cree_le,
       u.raw_app_meta_data ->> 'provider' as fournisseur
from public.players p join auth.users u on u.id = p.user_id
where coalesce(u.raw_app_meta_data ->> 'provider', '') <> 'discord' and p.discord_id !~ '^e_';

-- 2. Les fonctions qu'un VISITEUR (anon) peut appeler. ATTENDU, après securite.sql : seulement
--    card_attack_is_valid, commerce_normaliser, current_shop_slot, next_shop_refresh, signaler_erreur,
--    stats_joueur, succes_vitrine, valeur_recyclage (et limiter_requete, dans le schéma securite).
--    Toute autre fonction ici (surtout security_definer = true) doit être vérifiée.
select n.nspname as schema_, p.proname as fonction, p.prosecdef as security_definer
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'securite') and has_function_privilege('anon', p.oid, 'execute')
order by 1, 2;

-- 3. Les fonctions security definer qu'un JOUEUR (authenticated) peut appeler et qui prennent un
--    identifiant de joueur en paramètre : elles doivent vérifier elles-mêmes qui appelle (my_discord_id(),
--    is_mj…). ATTENDU : cartes_du_joueur, objets_du_joueur, stats_joueur, succes_vitrine (lecture), grant_card
--    et mj_reset_player (réservées aux MJ). Une fonction du site ou du bot qui donne de l'or ou des objets à
--    un joueur passé en paramètre serait une faille critique.
select p.proname as fonction, pg_get_function_identity_arguments(p.oid) as parametres
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef and has_function_privilege('authenticated', p.oid, 'execute')
  and pg_get_function_identity_arguments(p.oid) ~* '(discord|joueur|player|user)'
order by 1;

-- 4. Les tables sans RLS (lisibles et modifiables selon les seuls droits). ATTENDU : aucune ligne.
select c.relname as table_
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
order by 1;

-- 5. Les règles RLS qui laissent ÉCRIRE un visiteur ou un joueur (insert, update, delete, all).
--    ATTENDU : seulement « je range mes cartes » (player_cards, update de page et slot).
select tablename as table_, policyname as regle, cmd as action, roles
from pg_policies
where schemaname = 'public' and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
order by 1, 2;

-- 6. Les droits d'écriture directs des rôles du navigateur (table ou colonnes).
--    ATTENDU : seulement UPDATE (page, slot) de player_cards pour authenticated.
select table_name as table_, grantee as role, privilege_type as droit, null as colonne
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated') and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
union all
select table_name, grantee, privilege_type, column_name
from information_schema.column_privileges
where table_schema = 'public' and grantee in ('anon', 'authenticated') and privilege_type in ('INSERT', 'UPDATE')
  and (table_name, grantee, privilege_type) not in (select table_name, grantee, privilege_type from information_schema.role_table_grants where table_schema = 'public')
order by 1, 2, 3, 4;

-- 7. Les triggers sur auth.users (création du profil). ATTENDU : creer_profil_joueur et maj_avatar_joueur.
--    Un autre trigger qui lit raw_user_meta_data pour choisir le joueur reproduirait la faille n°1.
select tgname as trigger_, pg_get_triggerdef(t.oid) as definition
from pg_trigger t where tgrelid = 'auth.users'::regclass and not tgisinternal;

-- 8. Le garde-fou des requêtes (limites de débit) est-il branché sur l'API ?
--    ATTENDU : une ligne contenant pgrst.db_pre_request=securite.limiter_requete
select unnest(rolconfig) as reglage from pg_roles where rolname = 'authenticator';

-- 9. Qui est MJ ? (à garder court ; chaque MJ devrait activer la double authentification)
select discord_id, username, user_id is not null as a_un_compte from public.players where is_mj order by username;

-- 10. Les MJ sans double authentification (après avoir activé la double authentification dans Supabase)
select p.username from public.players p
where p.is_mj and not exists (select 1 from auth.mfa_factors f where f.user_id = p.user_id and f.status = 'verified');

-- 11. Les règles sur les messages Realtime (salons du duel en ligne). ATTENDU : seulement les 4 règles « duel : … »
--     de securite.sql (membres, canal privé, hôte). Une autre règle plus large rouvrirait les salons à tous.
select policyname as regle, cmd as action, roles from pg_policies
where schemaname = 'realtime' and tablename = 'messages' order by 1;
