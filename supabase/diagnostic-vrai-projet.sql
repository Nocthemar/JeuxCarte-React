-- =====================================================================
--  Diagnostic du VRAI projet avant securite.sql — LECTURE SEULE (rien n'est modifié, aucune donnée de joueur)
--  Montre seulement la STRUCTURE : quelles tables, colonnes et fonctions existent, et le code des
--  fonctions du site et du bot qui touchent aux comptes. Lancer en entier, puis Export > Copy as CSV
--  (ou une capture) pour l'envoyer.
-- =====================================================================
with
fonctions_attendues(nom) as (values
  ('my_discord_id'), ('creer_profil_joueur'), ('maj_avatar_joueur'), ('grant_card'), ('mj_reset_player'),
  ('supprimer_mon_compte'), ('ouvrir_booster_gratuit'), ('booster_gratuit_etat'), ('ouvrir_booster'),
  ('crediter_recyclage'), ('commerce_verifier'), ('pass_commencer_partie'), ('pass_ajouter_xp'),
  ('pass_donner_or'), ('pass_saison_en_cours'), ('next_shop_refresh'), ('histoire_commencer'),
  ('valider_niveau_histoire'), ('signaler_erreur')
),
tables_attendues(nom) as (values
  ('players'), ('wallets'), ('transactions'), ('inventory'), ('items'), ('cards'), ('player_cards'),
  ('player_deck_cards'), ('player_boosters'), ('player_booster_gratuit'), ('histoire_niveaux'),
  ('histoire_chapitres'), ('histoire_progression'), ('player_pass'), ('saisons'), ('pass_progression'),
  ('pass_parties'), ('salons_classes'), ('file_classee'), ('echanges'), ('contrats'), ('annonces'), ('erreurs_jeu')
)
-- 1. Les fonctions que securite.sql remplace ou utilise : existent-elles, avec quels paramètres ?
select 1 as ordre, 'fonction' as quoi, f.nom as nom,
       coalesce(string_agg(pg_get_function_arguments(p.oid) || '  ->  ' || pg_get_function_result(p.oid), ' | '), 'ABSENTE') as detail
from fonctions_attendues f
left join pg_proc p on p.proname = f.nom and p.pronamespace = 'public'::regnamespace
group by f.nom
union all
-- 2. Les tables utilisées : existent-elles, avec quelles colonnes ?
select 2, 'table', t.nom,
       coalesce((select string_agg(column_name || ' ' || data_type, ', ' order by ordinal_position)
                 from information_schema.columns where table_schema = 'public' and table_name = t.nom), 'ABSENTE')
from tables_attendues t
union all
-- 3. Les triggers sur les comptes (auth.users)
select 3, 'trigger auth.users', tgname, pg_get_triggerdef(oid)
from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal
union all
-- 4. Le code des fonctions du site / du bot que le jeu ne connaît pas
select 4, 'code', p.proname, pg_get_functiondef(p.oid)
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('handle_auth_user', 'create_wallet_for_player', 'current_discord_id', 'est_mj',
                    'ignorer_ecritures_bot_daily_shop', 'creer_profil_joueur')
order by 1, 3;
