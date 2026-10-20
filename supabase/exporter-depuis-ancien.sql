-- =====================================================================
--  À lancer dans l'ANCIEN projet Supabase (celui du vrai jeu) : Supabase > SQL Editor.
--  LECTURE SEULE : rien n'est modifié dans l'ancien projet. Aucune donnée de joueur n'est exportée
--  (pas de players, wallets, inventory, transactions, cartes possédées…).
--
--  Lance chaque requête SÉPARÉMENT (sélectionne-la, puis « Run »).
-- =====================================================================


-- =====================================================================
--  PARTIE A — Comparer les tables du site avec supabase/schema.sql (partie 1, reconstituée)
--  Copie les résultats et donne-les-moi : j'ajusterai schema.sql pour qu'il soit identique.
-- =====================================================================

-- A1. Les colonnes des tables du site
select table_name, ordinal_position, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('players', 'wallets', 'transactions', 'items', 'inventory', 'daily_shop')
order by table_name, ordinal_position;

-- A2. Leurs contraintes (clés, valeurs autorisées, par exemple transactions.source)
select conrelid::regclass as table_, conname as contrainte, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid::regclass::text in ('players', 'wallets', 'transactions', 'items', 'inventory', 'daily_shop')
order by 1, 2;

-- A3. Les fonctions du site utilisées par le jeu (et celles qu'on ne connaît pas encore)
select p.proname as fonction, pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('current_shop_slot', 'next_shop_refresh', 'buy_daily_item', 'buy_fun_item',
                    'equip_cosmetic', 'unequip_cosmetic', 'handle_new_user')
order by 1;

-- A4. Ce qui crée le profil « players » à la connexion Discord (trigger sur auth.users)
select tgname as trigger_, pg_get_triggerdef(t.oid) as definition
from pg_trigger t
where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal;

-- A5. Toutes les fonctions du schéma public qui ne viennent PAS des fichiers SQL du jeu
--     (faites à la main dans l'interface, ou par le site / le bot)
select p.proname as fonction, pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname not in (
    'my_discord_id', 'place_new_card', 'move_card', 'set_deck', 'rename_deck', 'grant_card', 'buy_card',
    'card_attack_is_valid', 'acheter_booster', 'ouvrir_booster', 'booster_gratuit_etat', 'ouvrir_booster_gratuit',
    'valeur_recyclage', 'crediter_recyclage', 'recycler_carte', 'recycler_doublons', 'acheter_plateau', 'equiper_plateau',
    'cartes_du_joueur', 'proposer_echange', 'accepter_echange', 'refuser_echange', 'annuler_echange',
    'commerce_verifier', 'commerce_objets_deja', 'commerce_transferer', 'commerce_normaliser', 'objets_du_joueur',
    'ouvrir_contrat', 'modifier_contrat', 'apposer_sceau', 'rompre_contrat', 'basculer_souhait',
    'publier_annonce', 'retirer_annonce', 'conclure_annonce', 'histoire_commencer', 'valider_niveau_histoire',
    'pass_saison_en_cours', 'pass_ajouter_xp', 'pass_donner_or', 'pass_commencer_partie', 'pass_fin_partie',
    'pass_reclamer', 'pass_debloquer_premium', 'chercher_classee', 'quitter_classee', 'classe_compter',
    'classe_regler_en_suspens', 'resultat_classe', 'succes_stats', 'succes_objectif', 'succes_pourcentages',
    'mes_succes', 'succes_vitrine', 'choisir_vitrine_succes', 'reclamer_succes', 'stats_joueur',
    'supprimer_mon_compte', 'mj_reset_player')
order by 1;

-- A6. Toutes les tables du schéma public (pour repérer celles qu'aucun fichier ne crée)
select c.relname as table_, c.relrowsecurity as rls
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by 1;

-- A7. Les règles RLS des tables du site
select tablename as table_, policyname as regle, cmd as action, roles, qual as condition, with_check
from pg_policies
where schemaname = 'public' and tablename in ('players', 'wallets', 'transactions', 'items', 'inventory', 'daily_shop')
order by 1, 3;


-- =====================================================================
--  PARTIE B — Les données de référence, EXACTEMENT comme dans le vrai jeu
--  Cette requête ne renvoie qu'UNE case : un script SQL complet. Copie-la entièrement (ou « Export »
--  -> CSV, puis ouvre le fichier), colle-la dans le SQL Editor du NOUVEAU projet et lance-la,
--  à la place de supabase/donnees.sql, sur un projet où viennent d'être lancés schema.sql puis rien d'autre.
--  Les identifiants (id) des cartes et des objets sont gardés : les Grimoires enregistrés restent valables.
-- =====================================================================
select string_agg(bloc, E'\n\n' order by ordre) as script_a_copier from (
  select 1 as ordre, format($s$
insert into public.cards (id, name, image, rarity, description, price, source, is_available, payload, created_at, rank, attack_1, attack_2)
overriding system value
select id, name, image, rarity, description, price, source, is_available, coalesce(payload, '{}'), coalesce(created_at, now()), rank, attack_1, attack_2
from jsonb_populate_recordset(null::public.cards, %L)
on conflict (id) do update set name = excluded.name, image = excluded.image, rarity = excluded.rarity,
  description = excluded.description, price = excluded.price, source = excluded.source, is_available = excluded.is_available,
  payload = excluded.payload, rank = excluded.rank, attack_1 = excluded.attack_1, attack_2 = excluded.attack_2;
select setval(pg_get_serial_sequence('public.cards', 'id'), greatest((select max(id) from public.cards), 1));$s$,
    (select jsonb_agg(to_jsonb(c)) from public.cards c)) as bloc
  union all
  select 2, format($s$
insert into public.items (id, name, kind, shop, price, is_available, description, payload, echangeable)
overriding system value
select id, name, coalesce(kind, 'other'), shop, price, coalesce(is_available, true), description, coalesce(payload, '{}'), coalesce(echangeable, true)
from jsonb_populate_recordset(null::public.items, %L)
on conflict (id) do update set name = excluded.name, kind = excluded.kind, shop = excluded.shop, price = excluded.price,
  is_available = excluded.is_available, description = excluded.description, payload = excluded.payload, echangeable = excluded.echangeable;
select setval(pg_get_serial_sequence('public.items', 'id'), greatest((select max(id) from public.items), 1));$s$,
    (select jsonb_agg(to_jsonb(i)) from public.items i))
  union all
  select 3, format($s$
insert into public.boosters select * from jsonb_populate_recordset(null::public.boosters, %L)
on conflict (id) do update set nom = excluded.nom, prix = excluded.prix, nb_cartes = excluded.nb_cartes,
  image = excluded.image, en_vente = excluded.en_vente, chances = excluded.chances;$s$,
    (select jsonb_agg(to_jsonb(b)) from public.boosters b))
  union all
  select 4, format($s$
insert into public.booster_cartes select * from jsonb_populate_recordset(null::public.booster_cartes, %L)
on conflict do nothing;$s$,
    (select jsonb_agg(to_jsonb(bc)) from public.booster_cartes bc))
  union all
  select 5, format($s$
insert into public.plateaux select * from jsonb_populate_recordset(null::public.plateaux, %L)
on conflict (id) do update set nom = excluded.nom, description = excluded.description, prix = excluded.prix,
  image = excluded.image, miniature = excluded.miniature, ordre = excluded.ordre, en_vente = excluded.en_vente;$s$,
    (select jsonb_agg(to_jsonb(p)) from public.plateaux p))
  union all
  select 6, format($s$
insert into public.histoire_chapitres select * from jsonb_populate_recordset(null::public.histoire_chapitres, %L)
on conflict (id) do update set nom = excluded.nom, ordre = excluded.ordre;
insert into public.histoire_niveaux select * from jsonb_populate_recordset(null::public.histoire_niveaux, %L)
on conflict (id) do update set chapitre_id = excluded.chapitre_id, ordre = excluded.ordre, nom = excluded.nom,
  est_boss = excluded.est_boss, or_gagne = excluded.or_gagne, xp_gagne = excluded.xp_gagne,
  carte_aleatoire = excluded.carte_aleatoire, or_si_collection_complete = excluded.or_si_collection_complete;$s$,
    (select jsonb_agg(to_jsonb(h)) from public.histoire_chapitres h),
    (select jsonb_agg(to_jsonb(n)) from public.histoire_niveaux n))
  union all
  select 7, format($s$
insert into public.saisons (id, nom, date_debut, date_fin, active, prix_premium, xp_par_palier, nb_paliers)
overriding system value
select id, nom, date_debut, date_fin, active, prix_premium, xp_par_palier, nb_paliers
from jsonb_populate_recordset(null::public.saisons, %L)
on conflict (id) do update set nom = excluded.nom, date_debut = excluded.date_debut, date_fin = excluded.date_fin,
  active = excluded.active, prix_premium = excluded.prix_premium, xp_par_palier = excluded.xp_par_palier, nb_paliers = excluded.nb_paliers;
select setval(pg_get_serial_sequence('public.saisons', 'id'), greatest((select max(id) from public.saisons), 1));
insert into public.pass_paliers select * from jsonb_populate_recordset(null::public.pass_paliers, %L)
on conflict (saison_id, numero, piste) do update set type_recompense = excluded.type_recompense, valeur = excluded.valeur;$s$,
    (select jsonb_agg(to_jsonb(s)) from public.saisons s),
    (select jsonb_agg(to_jsonb(pp)) from public.pass_paliers pp))
  union all
  select 8, format($s$
insert into public.succes (id, categorie, nom, description, icone, mesure, objectif, recompense, ordre, rarete)
select id, categorie, nom, description, icone, mesure, objectif, recompense, ordre, rarete
from jsonb_populate_recordset(null::public.succes, %L)
on conflict (id) do update set categorie = excluded.categorie, nom = excluded.nom, description = excluded.description,
  icone = excluded.icone, mesure = excluded.mesure, objectif = excluded.objectif,
  recompense = excluded.recompense, ordre = excluded.ordre, rarete = excluded.rarete;
notify pgrst, 'reload schema';$s$,
    (select jsonb_agg(to_jsonb(su)) from public.succes su))
) t;
