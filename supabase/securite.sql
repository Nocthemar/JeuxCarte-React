-- =====================================================================
--  Sécurité du Duel des Couronnes (passes 2 et 3 de l'audit du 26/10/2026)
--
--  À lancer dans Supabase > SQL Editor APRÈS schema.sql (projet de développement), et tel quel sur le
--  vrai projet. Relançable sans casse. Ne supprime aucune donnée de joueur.
--
--  Ce que ce fichier change :
--    1. Identité : le profil d'un nouveau compte ne se fie plus aux métadonnées envoyées par le navigateur
--       (faille : prise de contrôle de n'importe quel compte, MJ compris). Comptes e-mail : clé « e_… ».
--    2. Combats contre l'Ombre et mode Histoire : la victoire est décidée par l'arbitre (Edge Function
--       « arbitre », qui rejoue la partie), plus par le navigateur. L'élan de l'Ombre est gardé ici.
--    3. Économie : 24 Offrandes par jour, 1000 XP de recyclage par jour, comptes de moins de 24 h
--       sans échanges sortants.
--    4. Salons du duel en ligne : seuls leurs membres les écoutent ; seul l'hôte écrit dans les canaux privés.
--    5. Limites de débit de l'API (toutes les requêtes du navigateur), par joueur ou par adresse IP.
--    6. Journal de sécurité, vues d'administration (schéma admin), double authentification des MJ (réglable),
--       suppression de compte seulement après une connexion récente.
--    7. Les nouvelles fonctions ne sont plus exécutables par tout le monde par défaut.
-- =====================================================================


-- =====================================================================
--  0. Les schémas privés (jamais exposés par l'API : seul « public » l'est)
-- =====================================================================
create schema if not exists securite;   -- limites de débit, journal (fonctions appelées par le jeu)
create schema if not exists admin;      -- vues de surveillance, lues dans le SQL Editor seulement
revoke all on schema admin from public, anon, authenticated;
-- service_role : le bot Discord passe aussi par le garde-fou des requêtes (partie 7), qui le laisse passer
grant usage on schema securite to anon, authenticated, service_role;

-- Réglages de sécurité modifiables à la main (SQL Editor) : update securite.reglages set valeur = 'true' where cle = …
create table if not exists securite.reglages (
  cle    text primary key,
  valeur text not null
);
insert into securite.reglages (cle, valeur) values
  ('mfa_mj', 'false'),            -- true : grant_card et mj_reset_player exigent la double authentification
  ('offrandes_par_jour', '24'),
  ('xp_recyclage_par_jour', '1000'),
  ('age_min_echanges_heures', '24')
on conflict (cle) do nothing;
revoke all on securite.reglages from public, anon, authenticated;

create or replace function securite.reglage(p_cle text, p_defaut text)
returns text language sql stable security definer set search_path = securite as $$
  select coalesce((select valeur from securite.reglages where cle = p_cle), p_defaut);
$$;
revoke all on function securite.reglage(text, text) from public, anon, authenticated;


-- =====================================================================
--  1. Journal de sécurité
-- =====================================================================
create table if not exists securite.journal (
  id         bigint generated always as identity primary key,
  quand      timestamptz not null default now(),
  discord_id text,
  user_id    uuid,
  action     text not null,
  details    jsonb not null default '{}'::jsonb
);
create index if not exists journal_quand on securite.journal (quand desc);
create index if not exists journal_action on securite.journal (action, quand desc);
revoke all on securite.journal from public, anon, authenticated;

create or replace function securite.journaliser(p_action text, p_details jsonb default '{}'::jsonb, p_discord_id text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into securite.journal (discord_id, user_id, action, details)
  values (coalesce(p_discord_id, my_discord_id()), auth.uid(), left(p_action, 60), coalesce(p_details, '{}'::jsonb));
  -- Le journal garde un an
  if random() < 0.01 then delete from securite.journal where quand < now() - interval '365 days'; end if;
end;
$$;
revoke all on function securite.journaliser(text, jsonb, text) from public, anon, authenticated;


-- =====================================================================
--  2. Identité : création du profil à la première connexion (Discord ou e-mail)
--
--  AVANT : l'identifiant Discord venait de raw_user_meta_data, que le navigateur remplit lui-même à
--  l'inscription par e-mail (options.data) : n'importe qui pouvait se rattacher le profil d'un autre.
--  MAINTENANT :
--    - le fournisseur vient de raw_app_meta_data (écrit par Supabase seul) ;
--    - Discord : l'identifiant vient des données de Discord (connexion OAuth : le navigateur n'y écrit rien) ;
--    - e-mail : une clé à part, « e_ » + l'identifiant du compte (jamais un identifiant Discord) ;
--    - un profil déjà rattaché à un compte existant n'est JAMAIS rattaché à un autre.
-- =====================================================================
alter table public.players add column if not exists fournisseur text;
alter table public.players add column if not exists pseudo_a_choisir boolean not null default false;

create or replace function public.creer_profil_joueur()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fournisseur text := coalesce(new.raw_app_meta_data, '{}'::jsonb) ->> 'provider';
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_id text;
  v_nom text;
  v_avatar text;
  v_titulaire uuid;
begin
  if v_fournisseur = 'discord' then
    v_id := coalesce(v_meta ->> 'provider_id', v_meta ->> 'sub');
    if v_id is null or v_id !~ '^[0-9]{5,25}$' then return new; end if;
    v_nom := left(coalesce(v_meta -> 'custom_claims' ->> 'global_name', v_meta ->> 'full_name', v_meta ->> 'name', 'Aventurier'), 40);
    v_avatar := case when v_meta ->> 'avatar_url' ~ '^https://cdn\.discordapp\.com/' then v_meta ->> 'avatar_url' end;
  elsif v_fournisseur = 'email' then
    v_id := 'e_' || replace(new.id::text, '-', '');
    v_nom := 'Aventurier-' || upper(substr(replace(new.id::text, '-', ''), 1, 4));
  else
    return new;   -- compte anonyme, téléphone… : pas de profil de joueur
  end if;

  select user_id into v_titulaire from players where discord_id = v_id for update;
  if found then
    -- Déjà rattaché à un compte qui existe encore : on n'y touche pas (le nouveau compte reste sans profil)
    if v_titulaire is not null and v_titulaire <> new.id and exists (select 1 from auth.users where id = v_titulaire) then
      perform securite.journaliser('profil_refuse', jsonb_build_object('fournisseur', v_fournisseur, 'compte', new.id), v_id);
      return new;
    end if;
    -- Profil créé par le bot (sans compte), ou compte disparu : rattaché
    update players set user_id = new.id, fournisseur = v_fournisseur,
      username = coalesce(username, v_nom), avatar_url = coalesce(v_avatar, avatar_url)
    where discord_id = v_id;
  else
    insert into players (discord_id, user_id, username, avatar_url, fournisseur, pseudo_a_choisir)
    values (v_id, new.id, v_nom, v_avatar, v_fournisseur, v_fournisseur = 'email');
  end if;
  insert into wallets (discord_id) values (v_id) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists creer_profil_joueur on auth.users;
create trigger creer_profil_joueur
  after insert on auth.users
  for each row execute function public.creer_profil_joueur();

-- L'avatar suit Discord, mais seulement une image de Discord (le joueur peut réécrire ses métadonnées)
create or replace function public.maj_avatar_joueur()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_avatar text := new.raw_user_meta_data ->> 'avatar_url';
begin
  if coalesce(new.raw_app_meta_data, '{}'::jsonb) ->> 'provider' is distinct from 'discord'
     or v_avatar is null or v_avatar !~ '^https://cdn\.discordapp\.com/' then
    return new;
  end if;
  update players set avatar_url = v_avatar
  where user_id = new.id and fournisseur is distinct from 'email' and avatar_url is distinct from v_avatar;
  return new;
end;
$$;

drop trigger if exists maj_avatar_joueur on auth.users;
create trigger maj_avatar_joueur
  after update of raw_user_meta_data on auth.users
  for each row execute function public.maj_avatar_joueur();

-- Le vrai projet avait son propre trigger (on_auth_user_changed -> handle_auth_user, du site) : il choisissait
-- le joueur d'après raw_user_meta_data ->> 'provider_id', écrit par le navigateur à l'inscription ET à chaque
-- supabase.auth.updateUser({ data }) : la même faille, encore plus simple. Retiré ; la fonction ne fait plus rien
-- (au cas où un autre trigger l'appellerait encore). creer_profil_joueur et maj_avatar_joueur font son travail.
drop trigger if exists on_auth_user_changed on auth.users;
do $$
begin
  if to_regprocedure('public.handle_auth_user()') is not null then
    execute $f$create or replace function public.handle_auth_user() returns trigger
      language plpgsql security definer set search_path = public as $b$ begin return new; end $b$ $f$;
    execute 'revoke all on function public.handle_auth_user() from public, anon, authenticated';
  end if;
end $$;

-- Un autre trigger sur auth.users (créé à la main, par le site…) pourrait refaire la même erreur : on le signale
do $$
declare t record;
begin
  for t in select tgname from pg_trigger
           where tgrelid = 'auth.users'::regclass and not tgisinternal
             and tgname not in ('creer_profil_joueur', 'maj_avatar_joueur')
  loop
    raise warning 'Autre trigger sur auth.users : % (vérifie qu''il ne lit pas raw_user_meta_data pour choisir le joueur)', t.tgname;
  end loop;
end $$;

-- Le pseudo d'un compte e-mail (choisi une fois, à la première connexion)
create or replace function public.choisir_pseudo(p_nom text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi text := my_discord_id();
  v_nom text := btrim(regexp_replace(coalesce(p_nom, ''), '\s+', ' ', 'g'));
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  if not exists (select 1 from players where discord_id = v_moi and pseudo_a_choisir) then
    raise exception 'Ton pseudo est déjà choisi.';
  end if;
  if char_length(v_nom) not between 3 and 20 then raise exception 'Ton pseudo doit faire entre 3 et 20 caractères.'; end if;
  if v_nom !~ '^[A-Za-zÀ-ÖØ-öø-ÿ0-9][A-Za-zÀ-ÖØ-öø-ÿ0-9 _''’.-]*$' then
    raise exception 'Ton pseudo ne peut contenir que des lettres, des chiffres, des espaces et - _ '' .';
  end if;
  if lower(v_nom) ~ '\m(mj|admins?|administrat\w*|modos?|mod[eé]rat\w*|staff|support|nocth[eé]mar|syst[eè]me)\M'
     or lower(v_nom) like '%ombre du codex%' then
    raise exception 'Ce pseudo est réservé.';
  end if;
  if exists (select 1 from players where lower(username) = lower(v_nom) and discord_id <> v_moi) then
    raise exception 'Ce pseudo est déjà pris.';
  end if;
  update players set username = v_nom, pseudo_a_choisir = false where discord_id = v_moi;
  perform securite.journaliser('pseudo_choisi', jsonb_build_object('pseudo', v_nom));
  return v_nom;
end;
$$;
revoke all on function public.choisir_pseudo(text) from public, anon;
grant execute on function public.choisir_pseudo(text) to authenticated;


-- =====================================================================
--  3. Duels contre l'Ombre et mode Histoire : arbitrés par le serveur
--
--  duel_commencer (le navigateur) : le serveur tire la graine du hasard, note le Grimoire choisi et ce que
--    le joueur possède à cet instant, et l'élan de l'Ombre. Renvoie { id, graine, elan }.
--  Edge Function « arbitre » (supabase/functions/arbitre) : à la fin, elle reçoit la liste des actions du
--    joueur, rejoue TOUTE la partie avec le moteur du jeu (même graine, mêmes Grimoires, l'Ombre rejoue
--    les mêmes coups), et appelle duel_terminer avec le vrai résultat.
--  duel_terminer (réservé à l'arbitre, rôle service_role) : récompenses (Pass, or, mode Histoire), élan.
-- =====================================================================
create table if not exists public.player_elan (
  discord_id text primary key references public.players(discord_id) on delete cascade,
  elan       int not null default 0 check (elan between -3 and 3),
  maj_le     timestamptz not null default now()
);

create table if not exists public.duels (
  id          uuid primary key default gen_random_uuid(),
  discord_id  text not null references public.players(discord_id) on delete cascade,
  mode        text not null check (mode in ('ia', 'histoire')),
  difficulte  text check (difficulte in ('facile', 'normal', 'difficile')),
  niveau_id   text,
  graine      bigint not null check (graine between 0 and 4294967295),
  elan        int not null default 0,
  grimoire    jsonb not null default '[]'::jsonb,    -- les clés des cartes choisies (u12, t-garde, o-potion…)
  cartes      bigint[] not null default '{}',        -- les cartes possédées au début du duel
  objets      text[] not null default '{}',          -- les objets possédés au début du duel (noms)
  commence_le timestamptz not null default now(),
  termine_le  timestamptz,
  resultat    text check (resultat in ('joueur', 'adverse', 'egalite', 'invalide', 'annule')),
  details     jsonb
);
create index if not exists duels_joueur on public.duels (discord_id, commence_le desc);

alter table public.player_elan enable row level security;
alter table public.duels       enable row level security;
revoke all on public.player_elan, public.duels from anon, authenticated;
grant select on public.player_elan to authenticated;
drop policy if exists "je lis mon élan" on public.player_elan;
create policy "je lis mon élan" on public.player_elan for select to authenticated using (discord_id = public.my_discord_id());

create or replace function public.duel_commencer(p_mode text, p_difficulte text default null, p_niveau text default null, p_grimoire jsonb default '[]'::jsonb)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi    text := my_discord_id();
  v_graine bigint;
  v_elan   int;
  v_id     uuid;
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  if p_mode not in ('ia', 'histoire') then raise exception 'Mode inconnu.'; end if;
  if p_mode = 'ia' and coalesce(p_difficulte, '') not in ('facile', 'normal', 'difficile') then raise exception 'Difficulté inconnue.'; end if;
  if p_mode = 'histoire' and not exists (select 1 from histoire_niveaux where id = p_niveau) then raise exception 'Niveau inconnu.'; end if;
  if jsonb_typeof(coalesce(p_grimoire, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_grimoire, '[]'::jsonb)) > 20
     or exists (select 1 from jsonb_array_elements(coalesce(p_grimoire, '[]'::jsonb)) x
                where jsonb_typeof(x) <> 'string' or (x #>> '{}') !~ '^[a-z0-9-]{1,40}$') then
    raise exception 'Grimoire invalide.';
  end if;

  perform pg_advisory_xact_lock(hashtext('duel:' || v_moi));
  if (select count(*) from duels where discord_id = v_moi and commence_le > now() - interval '1 hour') >= 60 then
    raise exception 'Trop de duels commencés en une heure : réessaie un peu plus tard.';
  end if;
  -- Un seul duel ouvert à la fois : le précédent est annulé (sans récompense)
  update duels set termine_le = now(), resultat = 'annule' where discord_id = v_moi and termine_le is null;
  delete from duels where discord_id = v_moi and commence_le < now() - interval '30 days';

  v_graine := ('x' || substr(md5(gen_random_uuid()::text), 1, 8))::bit(32)::bigint;
  select elan into v_elan from player_elan where discord_id = v_moi;

  insert into duels (discord_id, mode, difficulte, niveau_id, graine, elan, grimoire, cartes, objets)
  values (v_moi, p_mode, case when p_mode = 'ia' then p_difficulte end, case when p_mode = 'histoire' then p_niveau end,
          v_graine, coalesce(v_elan, 0), coalesce(p_grimoire, '[]'::jsonb),
          coalesce((select array_agg(card_id order by card_id) from player_cards where discord_id = v_moi), '{}'),
          coalesce((select array_agg(i.name order by i.name) from inventory inv join items i on i.id = inv.item_id where inv.discord_id = v_moi), '{}'))
  returning id into v_id;
  return json_build_object('id', v_id, 'graine', v_graine, 'elan', coalesce(v_elan, 0));
end;
$$;

-- Les récompenses d'un niveau du mode Histoire gagné (l'ancien valider_niveau_histoire, pour un joueur donné ;
-- la preuve de la partie jouée est maintenant le rejeu de l'arbitre)
create or replace function public.histoire_valider_pour(p_moi text, p_niveau_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_niveau histoire_niveaux%rowtype;
  v_ordre_chapitre int;
  v_boss_precedent text;
  v_carte  cards%rowtype;
  v_or     int;
begin
  select * into v_niveau from histoire_niveaux where id = p_niveau_id;
  if not found then raise exception 'Niveau inconnu.'; end if;
  perform pg_advisory_xact_lock(hashtext('histoire:' || p_moi));

  if exists (select 1 from histoire_progression where discord_id = p_moi and niveau_id = p_niveau_id) then
    return json_build_object('deja', true, 'or', 0, 'xp', 0, 'carte', null, 'carte_image', null, 'chapitre_termine', false);
  end if;

  if v_niveau.ordre > 1 then
    if not exists (
      select 1 from histoire_progression hp join histoire_niveaux n on n.id = hp.niveau_id
      where hp.discord_id = p_moi and n.chapitre_id = v_niveau.chapitre_id and n.ordre = v_niveau.ordre - 1
    ) then
      raise exception 'Ce niveau n''est pas encore débloqué.';
    end if;
  else
    select ordre into v_ordre_chapitre from histoire_chapitres where id = v_niveau.chapitre_id;
    select n.id into v_boss_precedent
    from histoire_niveaux n join histoire_chapitres c on c.id = n.chapitre_id
    where n.est_boss and c.ordre = (select max(ordre) from histoire_chapitres where ordre < v_ordre_chapitre)
    limit 1;
    if v_boss_precedent is not null and not exists (
      select 1 from histoire_progression where discord_id = p_moi and niveau_id = v_boss_precedent
    ) then
      raise exception 'Termine d''abord le chapitre précédent.';
    end if;
  end if;

  insert into histoire_progression (discord_id, chapitre_id, niveau_id) values (p_moi, v_niveau.chapitre_id, v_niveau.id);
  v_or := v_niveau.or_gagne;

  if v_niveau.carte_aleatoire then
    select c.* into v_carte from cards c
    where c.is_available and c.image is not null and c.description is distinct from 'Carte d''exemple'
      and not exists (select 1 from player_cards pc where pc.discord_id = p_moi and pc.card_id = c.id)
    order by random() limit 1;
    if found then
      insert into player_cards (discord_id, card_id, source) values (p_moi, v_carte.id, 'recompense');
    else
      v_or := v_or + v_niveau.or_si_collection_complete;
    end if;
  end if;

  if v_or > 0 then
    update wallets set balance = balance + v_or where discord_id = p_moi;
    if not found then insert into wallets (discord_id, balance) values (p_moi, v_or); end if;
    insert into transactions (discord_id, amount, source, reason) values (p_moi, v_or, 'histoire', 'Mode Histoire : ' || v_niveau.nom);
  end if;

  if v_niveau.xp_gagne > 0 then
    insert into player_pass (discord_id, xp) values (p_moi, v_niveau.xp_gagne)
    on conflict (discord_id) do update set xp = player_pass.xp + excluded.xp, maj_le = now();
    perform pass_ajouter_xp(p_moi, v_niveau.xp_gagne);
  end if;

  return json_build_object('deja', false, 'or', v_or, 'xp', v_niveau.xp_gagne, 'carte', v_carte.name,
                           'carte_image', v_carte.image, 'chapitre_termine', v_niveau.est_boss);
end;
$$;

-- La fin d'un duel, appelée par l'arbitre seulement. p_resultat : 'joueur' (victoire), 'adverse', 'egalite',
-- ou 'invalide' (le rejeu ne correspond pas : partie truquée ou données incohérentes).
-- Renvoie, contre l'Ombre : { xp, or, raison, victoire, elan } ; en Histoire : { victoire, recompenses } ou { raison }.
create or replace function public.duel_terminer(p_duel uuid, p_resultat text, p_details jsonb default '{}'::jsonb)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_d      duels%rowtype;
  v_vict   boolean := p_resultat = 'joueur';
  v_saison saisons%rowtype;
  v_prog   pass_progression%rowtype;
  v_jour   date := (now() at time zone 'Europe/Paris')::date;
  v_xp     int := 0;
  v_deja   int;
  v_or     int := 0;
  v_raison text := null;
  v_elan   int;
  v_histoire json;
begin
  if p_resultat not in ('joueur', 'adverse', 'egalite', 'invalide') then raise exception 'Résultat inconnu.'; end if;
  select * into v_d from duels where id = p_duel for update;
  if not found or v_d.termine_le is not null then return json_build_object('xp', 0, 'raison', 'ticket'); end if;

  update duels set termine_le = now(), resultat = p_resultat, details = p_details where id = p_duel;

  if p_resultat = 'invalide' then
    perform securite.journaliser('duel_refuse', jsonb_build_object('duel', p_duel, 'mode', v_d.mode) || coalesce(p_details, '{}'::jsonb), v_d.discord_id);
    return json_build_object('xp', 0, 'raison', 'invalide');
  end if;
  if now() - v_d.commence_le > interval '3 hours' then return json_build_object('xp', 0, 'raison', 'ticket'); end if;
  if now() - v_d.commence_le < interval '45 seconds' then return json_build_object('xp', 0, 'raison', 'court'); end if;

  -- Mode Histoire : les récompenses du niveau à la première victoire
  if v_d.mode = 'histoire' then
    if not v_vict then return json_build_object('victoire', false); end if;
    v_histoire := histoire_valider_pour(v_d.discord_id, v_d.niveau_id);
    return json_build_object('victoire', true, 'recompenses', v_histoire);
  end if;

  -- Contre l'Ombre : l'élan (niveau caché de l'Ombre), sauf égalité
  if p_resultat <> 'egalite' then
    insert into player_elan (discord_id, elan) values (v_d.discord_id, case when v_vict then 1 else -1 end)
    on conflict (discord_id) do update
      set elan = greatest(-3, least(3, player_elan.elan + case when v_vict then 1 else -1 end)), maj_le = now()
    returning elan into v_elan;
  end if;

  -- Les statistiques du profil et les succès comptent les parties de pass_parties
  select * into v_saison from saisons where id = pass_saison_en_cours();
  if found then
    -- (un abandon ne rapporte rien, comme avant)
    v_xp := case when coalesce((p_details ->> 'abandon')::boolean, false) then 0 when v_vict then 100 else 30 end;
    insert into pass_progression (discord_id, saison_id) values (v_d.discord_id, v_saison.id) on conflict do nothing;
    select * into v_prog from pass_progression where discord_id = v_d.discord_id and saison_id = v_saison.id for update;
    v_deja := case when v_prog.jour_ia = v_jour then v_prog.xp_ia_jour else 0 end;
    if v_deja + v_xp > 1000 then v_xp := greatest(0, 1000 - v_deja); v_raison := 'plafond'; end if;
    update pass_progression set jour_ia = v_jour, xp_ia_jour = v_deja + v_xp
    where discord_id = v_d.discord_id and saison_id = v_saison.id;
    perform pass_ajouter_xp(v_d.discord_id, v_xp);
    if v_vict and v_xp > 0 then
      v_or := case v_d.difficulte when 'facile' then 2 when 'difficile' then 10 else 5 end;
      perform pass_donner_or(v_d.discord_id, v_or, 'Victoire contre l''Ombre');
    end if;
  end if;
  insert into pass_parties (discord_id, mode, commence_le, termine_le, victoire, xp, difficulte)
  values (v_d.discord_id, 'ia', v_d.commence_le, now(), case when p_resultat = 'egalite' then null else v_vict end,
          v_xp, coalesce(v_d.difficulte, 'normal'));

  return json_build_object('xp', v_xp, 'or', v_or, 'raison', v_raison, 'victoire', v_vict, 'elan', v_elan);
end;
$$;

-- Contre l'Ombre, le ticket de Pass passe maintenant par duel_commencer (l'ancien ticket croyait le navigateur)
create or replace function public.pass_commencer_partie(p_mode text, p_salon text default null, p_difficulte text default 'normal')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi text := my_discord_id();
  v_id  uuid;
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  if p_mode = 'ia' then raise exception 'Les duels contre l''Ombre sont arbitrés par le serveur (duel_commencer).'; end if;
  if p_mode <> 'ami' then raise exception 'Mode inconnu.'; end if;
  if coalesce(p_salon, '') !~ '^[A-Z0-9]{5}$' then raise exception 'Salon invalide.'; end if;
  if pass_saison_en_cours() is null then return null; end if;

  perform pg_advisory_xact_lock(hashtext('pass:' || v_moi));
  if (select count(*) from pass_parties where discord_id = v_moi and commence_le > now() - interval '1 hour') >= 60 then
    raise exception 'Trop de duels commencés en une heure : réessaie un peu plus tard.';
  end if;
  delete from pass_parties where discord_id = v_moi and victoire is null and termine_le < now() - interval '1 day';
  update pass_parties set termine_le = now(), victoire = null, xp = 0 where discord_id = v_moi and termine_le is null;

  insert into pass_parties (discord_id, mode, salon, difficulte) values (v_moi, 'ami', p_salon, 'normal')
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.duel_commencer(text, text, text, jsonb) from public, anon;
grant execute on function public.duel_commencer(text, text, text, jsonb) to authenticated;
revoke all on function public.duel_terminer(uuid, text, jsonb), public.histoire_valider_pour(text, text) from public, anon, authenticated;
grant execute on function public.duel_terminer(uuid, text, jsonb) to service_role;
-- L'ancienne validation du mode Histoire (le navigateur déclarait sa victoire) : fermée
-- (le vrai projet n'a pas forcément ces deux fonctions)
do $$
declare f text;
begin
  foreach f in array array['public.histoire_commencer(text)', 'public.valider_niveau_histoire(text)'] loop
    if to_regprocedure(f) is not null then
      execute format('revoke all on function %s from public, anon, authenticated', f);
    end if;
  end loop;
end $$;


-- =====================================================================
--  4. Économie : ce qu'un script pouvait produire sans fin
-- =====================================================================
alter table public.player_booster_gratuit add column if not exists jour date;
alter table public.player_booster_gratuit add column if not exists nb int not null default 0;

-- L'Offrande du Voyageur : toutes les 10 minutes, et 24 par jour au plus (heure de Paris)
create or replace function public.ouvrir_booster_gratuit()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi      text := my_discord_id();
  v_jour     date := (now() at time zone 'Europe/Paris')::date;
  v_max      int := securite.reglage('offrandes_par_jour', '24')::int;
  v_ligne    player_booster_gratuit%rowtype;
  v_resultat jsonb;
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  perform pg_advisory_xact_lock(hashtext('booster-gratuit:' || v_moi));

  select * into v_ligne from player_booster_gratuit where discord_id = v_moi;
  if found and v_ligne.dernier > now() - interval '10 minutes' then
    raise exception 'Ton prochain booster gratuit n''est pas encore prêt.';
  end if;
  if found and v_ligne.jour = v_jour and v_ligne.nb >= v_max then
    raise exception 'Tu as reçu tes % Offrandes du jour : reviens demain.', v_max;
  end if;
  insert into player_booster_gratuit (discord_id, dernier, jour, nb) values (v_moi, now(), v_jour, 1)
  on conflict (discord_id) do update set dernier = now(), jour = v_jour,
    nb = case when player_booster_gratuit.jour = v_jour then player_booster_gratuit.nb + 1 else 1 end;

  insert into player_boosters (discord_id, booster_id, quantite) values (v_moi, 'gratuit', 1)
  on conflict (discord_id, booster_id) do update set quantite = player_boosters.quantite + 1;
  v_resultat := ouvrir_booster('gratuit')::jsonb;

  return (v_resultat || jsonb_build_object('secondes', 600)
    || case when (select nb from player_booster_gratuit where discord_id = v_moi) >= v_max
            then jsonb_build_object('secondes', greatest(600, ceil(extract(epoch from next_shop_refresh() - now()))::int))
            else '{}'::jsonb end)::json;
end;
$$;

-- Temps avant la prochaine Offrande : 10 minutes, ou jusqu'à minuit (Paris) si celles du jour sont reçues
create or replace function public.booster_gratuit_etat()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi   text := my_discord_id();
  v_ligne player_booster_gratuit%rowtype;
  v_max   int := securite.reglage('offrandes_par_jour', '24')::int;
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  select * into v_ligne from player_booster_gratuit where discord_id = v_moi;
  if found and v_ligne.jour = (now() at time zone 'Europe/Paris')::date and v_ligne.nb >= v_max then
    return json_build_object('secondes', greatest(0, ceil(extract(epoch from next_shop_refresh() - now())))::int, 'restantes', 0);
  end if;
  return json_build_object('secondes',
    greatest(0, ceil(extract(epoch from (v_ligne.dernier + interval '10 minutes') - now())))::int,
    'restantes', v_max - case when v_ligne.jour = (now() at time zone 'Europe/Paris')::date then v_ligne.nb else 0 end);
end;
$$;

-- Recyclage : l'or ne change pas ; l'XP de pass du recyclage est plafonnée par jour
create table if not exists public.recyclage_jour (
  discord_id text not null,
  jour       date not null,
  xp         int  not null default 0,
  primary key (discord_id, jour)
);
alter table public.recyclage_jour enable row level security;
revoke all on public.recyclage_jour from anon, authenticated;

create or replace function public.crediter_recyclage(p_moi text, p_or int, p_xp int, p_raison text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jour  date := (now() at time zone 'Europe/Paris')::date;
  v_max   int := securite.reglage('xp_recyclage_par_jour', '1000')::int;
  v_deja  int;
  v_xp    int;
begin
  if p_or > 0 then
    update wallets set balance = balance + p_or where discord_id = p_moi;
    if not found then insert into wallets (discord_id, balance) values (p_moi, p_or); end if;
    insert into transactions (discord_id, amount, source, reason) values (p_moi, p_or, 'boutique_fun', p_raison);
  end if;
  if p_xp > 0 then
    select xp into v_deja from recyclage_jour where discord_id = p_moi and jour = v_jour for update;
    v_xp := least(p_xp, greatest(0, v_max - coalesce(v_deja, 0)));
    if v_xp > 0 then
      insert into recyclage_jour (discord_id, jour, xp) values (p_moi, v_jour, v_xp)
      on conflict (discord_id, jour) do update set xp = recyclage_jour.xp + excluded.xp;
      perform pass_ajouter_xp(p_moi, v_xp);
    end if;
    delete from recyclage_jour where jour < v_jour - 7;
  end if;
end;
$$;

-- Échanges : un compte de moins de 24 h ne peut encore rien céder (cartes, or, objets). Sinon, un script
-- crée des comptes, ouvre leurs Offrandes et vide tout vers un seul compte.
create or replace function public.commerce_verifier(p_joueur text, p_cartes bigint[], p_or int, p_objets text[])
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_nom   text;
  v_qui   text := coalesce((select username from players where discord_id = p_joueur), 'Un joueur');
  v_age   int := securite.reglage('age_min_echanges_heures', '24')::int;
begin
  if (cardinality(coalesce(p_cartes, '{}')) > 0 or coalesce(p_or, 0) > 0 or cardinality(coalesce(p_objets, '{}')) > 0)
     and (select created_at from players where discord_id = p_joueur) > now() - make_interval(hours => v_age) then
    return format('%s a un compte de moins de %s h : il ne peut encore rien céder.', v_qui, v_age);
  end if;
  select c.name into v_nom from unnest(p_cartes) x join cards c on c.id = x
  where not exists (select 1 from player_cards where discord_id = p_joueur and card_id = x) limit 1;
  if v_nom is not null then return format('%s n''a plus « %s ».', v_qui, v_nom); end if;
  select c.name into v_nom from unnest(p_cartes) x join cards c on c.id = x
  join player_cards pc on pc.discord_id = p_joueur and pc.card_id = x
  where pc.quantite = 1 and exists (select 1 from player_deck_cards d where d.discord_id = p_joueur and d.card_id = x) limit 1;
  if v_nom is not null then
    return format('« %s » est une favorite de %s (dernier exemplaire) : elle doit d''abord quitter les favorites.', v_nom, v_qui);
  end if;
  if coalesce(p_or, 0) > 0 and coalesce((select balance from wallets where discord_id = p_joueur), 0) < p_or then
    return format('%s n''a pas assez d''or (%s demandés).', v_qui, p_or);
  end if;
  select coalesce(i.name, x) into v_nom from unnest(p_objets) x left join items i on i.id::text = x
  -- (la colonne echangeable n'existe pas sur le vrai projet : tout objet y est échangeable)
  where i.id is null or not coalesce((to_jsonb(i) ->> 'echangeable')::boolean, true) limit 1;
  if v_nom is not null then return format('L''objet « %s » ne s''échange pas.', v_nom); end if;
  select x into v_nom from unnest(p_objets) x
  where not exists (select 1 from inventory where discord_id = p_joueur and item_id::text = x) limit 1;
  if v_nom is not null then
    return format('%s n''a plus l''objet « %s ».', v_qui, coalesce((select name from items where id::text = v_nom), v_nom));
  end if;
  return null;
end;
$$;

revoke all on function public.crediter_recyclage(text, int, int, text), public.commerce_verifier(text, bigint[], int, text[]) from public, anon, authenticated;


-- =====================================================================
--  5. Salons du duel en ligne : des membres enregistrés par le serveur
--
--  AVANT : tout joueur connecté pouvait écouter n'importe quel salon « duel-CODE » (et voir la main de
--  l'invité) et écrire dans le canal privé de n'importe qui.
--  MAINTENANT : salon_entrer(code, hote) inscrit le joueur (4 au plus) ; seuls les membres écoutent et parlent
--  dans « duel-CODE » ; seul l'hôte du salon écrit dans les canaux privés « main-CODE-<joueur> ».
-- =====================================================================
create table if not exists public.salons (
  code    text primary key check (code ~ '^[A-Z0-9]{5}$'),
  hote    text not null,
  classe  boolean not null default false,
  cree_le timestamptz not null default now(),
  vu_le   timestamptz not null default now()
);
create table if not exists public.salons_membres (
  code       text not null references public.salons(code) on delete cascade,
  discord_id text not null,
  entre_le   timestamptz not null default now(),
  primary key (code, discord_id)
);
alter table public.salons         enable row level security;
alter table public.salons_membres enable row level security;
revoke all on public.salons, public.salons_membres from anon, authenticated;

create or replace function public.salon_entrer(p_code text, p_hote boolean default false)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi    text := my_discord_id();
  v_salon  salons%rowtype;
  v_hote_c text;
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  if coalesce(p_code, '') !~ '^[A-Z0-9]{5}$' then raise exception 'Code de salon invalide.'; end if;
  perform pg_advisory_xact_lock(hashtext('salon:' || p_code));
  if random() < 0.05 then delete from salons where vu_le < now() - interval '12 hours'; end if;

  select * into v_salon from salons where code = p_code and vu_le > now() - interval '12 hours';
  if not found then
    delete from salons where code = p_code;
    if exists (select 1 from salons_classes where salon = p_code) then
      -- Partie classée : seuls les joueurs choisis par la file y entrent ; l'hôte est celui de la file
      if not exists (select 1 from salons_classes where salon = p_code and discord_id = v_moi) then
        raise exception 'Cette partie classée ne te concerne pas.';
      end if;
      select discord_id into v_hote_c from file_classee where salon = p_code and role = 'hote' limit 1;
      insert into salons (code, hote, classe) values (p_code, coalesce(v_hote_c, v_moi), true) returning * into v_salon;
    elsif p_hote then
      insert into salons (code, hote) values (p_code, v_moi) returning * into v_salon;
    else
      raise exception 'Ce salon n''existe pas (ou plus) : demande un nouveau lien à ton adversaire.';
    end if;
  end if;

  if v_salon.classe and not exists (select 1 from salons_classes where salon = p_code and discord_id = v_moi) then
    raise exception 'Cette partie classée ne te concerne pas.';
  end if;
  if p_hote and v_salon.hote <> v_moi then raise exception 'Ce code de salon est déjà pris : crée un nouveau salon.'; end if;
  if not exists (select 1 from salons_membres where code = p_code and discord_id = v_moi) then
    if (select count(*) from salons_membres where code = p_code) >= 4 then raise exception 'Ce salon est complet.'; end if;
    insert into salons_membres (code, discord_id) values (p_code, v_moi);
  end if;
  update salons set vu_le = now() where code = p_code;
  return json_build_object('code', p_code, 'hote', v_salon.hote = v_moi);
end;
$$;
revoke all on function public.salon_entrer(text, boolean) from public, anon;
grant execute on function public.salon_entrer(text, boolean) to authenticated;

-- Les règles lues par Realtime (security definer : les tables des salons ne sont pas lisibles par les joueurs)
create or replace function public.membre_du_salon(p_code text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from salons_membres m join salons s on s.code = m.code
                 where m.code = p_code and m.discord_id = my_discord_id() and s.vu_le > now() - interval '12 hours');
$$;
create or replace function public.hote_du_salon(p_code text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from salons where code = p_code and hote = my_discord_id() and vu_le > now() - interval '12 hours');
$$;
revoke all on function public.membre_du_salon(text), public.hote_du_salon(text) from public, anon;
grant execute on function public.membre_du_salon(text), public.hote_du_salon(text) to authenticated;

drop policy if exists "duel : les joueurs connectés écoutent les salons" on realtime.messages;
drop policy if exists "duel : les joueurs connectés parlent dans les salons" on realtime.messages;
drop policy if exists "duel : chacun écoute son canal privé" on realtime.messages;
drop policy if exists "duel : les joueurs connectés écrivent dans les canaux privés" on realtime.messages;
drop policy if exists "duel : les membres écoutent leur salon" on realtime.messages;
drop policy if exists "duel : les membres parlent dans leur salon" on realtime.messages;
drop policy if exists "duel : chacun écoute son canal privé (membre)" on realtime.messages;
drop policy if exists "duel : seul l'hôte écrit dans les canaux privés" on realtime.messages;

create policy "duel : les membres écoutent leur salon" on realtime.messages
  for select to authenticated
  using (realtime.topic() like 'duel-%' and public.membre_du_salon(split_part(realtime.topic(), '-', 2)));
create policy "duel : les membres parlent dans leur salon" on realtime.messages
  for insert to authenticated
  with check (realtime.topic() like 'duel-%' and public.membre_du_salon(split_part(realtime.topic(), '-', 2)));
create policy "duel : chacun écoute son canal privé (membre)" on realtime.messages
  for select to authenticated
  using (realtime.topic() like 'main-%' and split_part(realtime.topic(), '-', 3) = public.my_discord_id()
         and public.membre_du_salon(split_part(realtime.topic(), '-', 2)));
create policy "duel : seul l'hôte écrit dans les canaux privés" on realtime.messages
  for insert to authenticated
  with check (realtime.topic() like 'main-%' and public.hote_du_salon(split_part(realtime.topic(), '-', 2)));

-- Les règles s'additionnent : une autre règle (plus large) sur realtime.messages annulerait celles-ci. On la signale
do $$
declare r record;
begin
  for r in select policyname from pg_policies
           where schemaname = 'realtime' and tablename = 'messages'
             and policyname not in ('duel : les membres écoutent leur salon', 'duel : les membres parlent dans leur salon',
                                    'duel : chacun écoute son canal privé (membre)', 'duel : seul l''hôte écrit dans les canaux privés')
  loop
    raise warning 'Autre règle sur realtime.messages : « % » (vérifie qu''elle n''ouvre pas les salons du duel à tous)', r.policyname;
  end loop;
end $$;


-- =====================================================================
--  6. Administration : MJ (double authentification réglable), journal, suppression de compte protégée
-- =====================================================================
-- Un MJ : is_mj, et si le réglage mfa_mj est à true, une session validée par la double authentification
create or replace function securite.exiger_mj()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from players where user_id = auth.uid() and is_mj) then
    raise exception 'Réservé aux MJ.';
  end if;
  if securite.reglage('mfa_mj', 'false') = 'true' and coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then
    raise exception 'Réservé aux MJ : valide d''abord ta double authentification.';
  end if;
end;
$$;
revoke all on function securite.exiger_mj() from public, anon, authenticated;

create or replace function public.grant_card(p_discord_id text, p_card_id bigint, p_source text default 'recompense')
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nouvelle boolean;
begin
  -- auth.uid() est null pour le bot (service_role) et dans le SQL Editor ; un joueur connecté doit être MJ
  if auth.uid() is not null then perform securite.exiger_mj(); end if;
  if not exists (select 1 from cards where id = p_card_id) then raise exception 'Carte inconnue.'; end if;
  insert into player_cards (discord_id, card_id, source)
  values (p_discord_id, p_card_id, coalesce(left(p_source, 40), 'recompense'))
  on conflict (discord_id, card_id) do nothing;
  v_nouvelle := found;
  if auth.uid() is not null then
    perform securite.journaliser('mj_grant_card', jsonb_build_object('joueur', p_discord_id, 'carte', p_card_id, 'nouvelle', v_nouvelle));
  end if;
  return v_nouvelle;
end;
$$;

create or replace function public.mj_reset_player(p_discord_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table   text;
  v_effaces int;
  v_total   int := 0;
begin
  perform securite.exiger_mj();
  if not exists (select 1 from players where discord_id = p_discord_id) then raise exception 'Joueur introuvable.'; end if;
  perform pg_advisory_xact_lock(hashtext('reset:' || p_discord_id));

  foreach v_table in array array[
    'player_deck_cards', 'player_decks', 'player_cards',
    'player_boosters', 'booster_ouvertures', 'player_booster_gratuit',
    'pass_progression', 'pass_parties', 'pass_cosmetiques', 'player_pass',
    'histoire_progression', 'histoire_tentatives',
    'joueur_plateaux',
    'rangs', 'file_classee', 'parties_classees', 'salons_classes',
    'souhaits',
    'player_succes',
    'inventory', 'transactions',
    'duels', 'player_elan', 'recyclage_jour'
  ] loop
    if to_regclass('public.' || v_table) is not null then
      execute format('delete from public.%I where discord_id = $1', v_table) using p_discord_id;
      get diagnostics v_effaces = row_count;
      v_total := v_total + v_effaces;
    end if;
  end loop;
  delete from echanges where de = p_discord_id or pour = p_discord_id;
  delete from contrats where de = p_discord_id or pour = p_discord_id;
  delete from annonces where auteur = p_discord_id;
  update wallets set balance = 0 where discord_id = p_discord_id;
  update players set banner_item_id = null, title_item_id = null, theme_item_id = null where discord_id = p_discord_id;

  perform securite.journaliser('mj_reset_player', jsonb_build_object('joueur', p_discord_id, 'lignes', v_total));
  return json_build_object('joueur', p_discord_id, 'lignes_effacees', v_total);
end;
$$;

-- Suppression DÉFINITIVE de son compte : le mot « SUPPRIMER », et une connexion de moins de 10 minutes
-- (un jeton volé ne suffit plus à tout effacer)
create or replace function public.supprimer_mon_compte(p_confirmation text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi   text := my_discord_id();
  v_uid   uuid := auth.uid();
  v_table text;
begin
  if v_moi is null or v_uid is null then raise exception 'Connecte-toi d''abord.'; end if;
  if p_confirmation is distinct from 'SUPPRIMER' then
    raise exception 'Pour supprimer ton compte, tape SUPPRIMER en majuscules.';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) x
    where (x ->> 'timestamp')::numeric > extract(epoch from now() - interval '10 minutes')
  ) then
    raise exception 'REAUTH: Par sécurité, reconnecte-toi juste avant de supprimer ton compte.';
  end if;

  foreach v_table in array array[
    'player_deck_cards', 'player_decks', 'player_cards', 'player_boosters', 'booster_ouvertures',
    'pass_progression', 'pass_parties', 'pass_cosmetiques', 'histoire_progression', 'player_pass', 'histoire_tentatives',
    'joueur_plateaux', 'souhaits', 'rangs', 'file_classee', 'parties_classees', 'salons_classes',
    'inventory', 'wallets', 'transactions', 'duels', 'player_elan', 'recyclage_jour'
  ] loop
    if to_regclass('public.' || v_table) is not null then
      execute format('delete from public.%I where discord_id = $1', v_table) using v_moi;
    end if;
  end loop;
  delete from public.echanges where de = v_moi or pour = v_moi;
  delete from public.contrats where de = v_moi or pour = v_moi;
  delete from public.annonces where auteur = v_moi;

  perform securite.journaliser('compte_supprime', '{}'::jsonb, v_moi);
  delete from public.players where discord_id = v_moi;
  delete from auth.users where id = v_uid;
end;
$$;

-- Le profil complet du joueur connecté (le navigateur n'a plus besoin de lire is_mj dans la table)
create or replace function public.mon_profil()
returns json language sql stable security definer set search_path = public as $$
  select row_to_json(p) from (
    select discord_id, username, avatar_url, is_mj, banner_item_id, title_item_id, theme_item_id, created_at,
           fournisseur, pseudo_a_choisir
    from players where user_id = auth.uid()
  ) p;
$$;
revoke all on function public.mon_profil() from public, anon;
grant execute on function public.mon_profil() to authenticated;


-- =====================================================================
--  7. Limites de débit de l'API (passe 3)
--
--  Une fonction appelée par l'API (PostgREST) AVANT chaque requête du navigateur : au-delà de la limite,
--  la requête est refusée (HTTP 429). Par joueur connecté, sinon par adresse IP.
--  Le bot Discord (service_role) n'est jamais limité.
-- =====================================================================
create table if not exists securite.quotas (
  cle    text not null,
  action text not null,
  debut  timestamptz not null default now(),
  n      int not null default 0,
  primary key (cle, action)
);
revoke all on securite.quotas from public, anon, authenticated;

-- Une limite : au plus p_max requêtes par fenêtre de p_secondes ; renvoie false si elle est dépassée
create or replace function securite.compter(p_cle text, p_action text, p_max int, p_secondes int)
returns boolean language plpgsql security definer set search_path = securite as $$
declare v_n int;
begin
  insert into securite.quotas as q (cle, action, debut, n) values (p_cle, p_action, now(), 1)
  on conflict (cle, action) do update
    set n = case when q.debut < now() - make_interval(secs => p_secondes) then 1 else q.n + 1 end,
        debut = case when q.debut < now() - make_interval(secs => p_secondes) then now() else q.debut end
  returning n into v_n;
  return v_n <= p_max;
end;
$$;
revoke all on function securite.compter(text, text, int, int) from public, anon, authenticated;

create or replace function securite.limiter_requete()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_claims jsonb;
  v_role   text;
  v_uid    text;
  v_ip     text;
  v_cle    text;
  v_chemin text;
  v_rpc    text;
  v_max    int;
  v_fen    int;
  v_ok     boolean := true;
begin
  begin
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    v_role := coalesce(v_claims ->> 'role', 'anon');
    if v_role = 'service_role' then return; end if;
    v_uid := v_claims ->> 'sub';
    v_ip := btrim(split_part(coalesce(
      nullif(current_setting('request.headers', true), '')::jsonb ->> 'cf-connecting-ip',
      nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for', '?'), ',', 1));
    v_cle := coalesce('u:' || v_uid, 'ip:' || v_ip);
    v_chemin := coalesce(current_setting('request.path', true), '');

    -- Toutes les requêtes : 600 par minute (joueur), 300 (visiteur)
    v_ok := securite.compter(v_cle, '*', case when v_uid is null then 300 else 600 end, 60);

    if v_ok and v_chemin like '/rpc/%' then
      v_rpc := substr(v_chemin, 6);
      select m, f into v_max, v_fen from (values
        ('signaler_erreur', 10, 60),
        ('ouvrir_contrat', 20, 3600), ('modifier_contrat', 60, 3600), ('rompre_contrat', 60, 3600),
        ('apposer_sceau', 60, 3600), ('publier_annonce', 20, 3600), ('retirer_annonce', 40, 3600),
        ('conclure_annonce', 60, 3600), ('basculer_souhait', 30, 60), ('choisir_pseudo', 10, 3600),
        ('supprimer_mon_compte', 5, 3600), ('salon_entrer', 30, 60), ('chercher_classee', 60, 60),
        ('resultat_classe', 10, 60), ('duel_commencer', 20, 60), ('pass_commencer_partie', 20, 60),
        ('pass_fin_partie', 20, 60), ('ouvrir_booster', 90, 60), ('move_card', 120, 60),
        ('cartes_du_joueur', 30, 60), ('objets_du_joueur', 30, 60)
      ) as t(nom, m, f) where nom = v_rpc;
      v_ok := securite.compter(v_cle, 'rpc:' || v_rpc, coalesce(v_max, 60), coalesce(v_fen, 60));
    end if;

    -- Le ménage des vieux compteurs, de temps en temps
    if random() < 0.002 then delete from securite.quotas where debut < now() - interval '1 day'; end if;
  exception when others then
    return;   -- une panne de ce garde-fou ne doit jamais bloquer le jeu
  end;
  if not v_ok then
    raise sqlstate 'PT429' using message = 'Trop de demandes : patiente un instant avant de réessayer.';
  end if;
end;
$$;
revoke all on function securite.limiter_requete() from public;
grant execute on function securite.limiter_requete() to anon, authenticated, service_role;

-- Branché sur l'API (si le projet le permet ; sinon un avertissement s'affiche)
do $$
begin
  execute 'alter role authenticator set pgrst.db_pre_request = ''securite.limiter_requete''';
exception when others then
  raise warning 'Limites de débit non branchées (%). Lance à la main : alter role authenticator set pgrst.db_pre_request = ''securite.limiter_requete'';', sqlerrm;
end $$;


-- =====================================================================
--  8. Surveillance (schéma admin : SQL Editor seulement)
--    select * from admin.gains_suspects;     select * from admin.duels_refuses;
--    select * from admin.inscriptions_par_ip;  select * from admin.journal_recent;
-- =====================================================================
create or replace view admin.journal_recent as
  select quand, action, discord_id, details from securite.journal order by quand desc limit 500;

-- Les joueurs qui ont gagné beaucoup d'or en 24 h (hors achats)
create or replace view admin.gains_suspects as
  select discord_id, sum(amount) as or_gagne_24h, count(*) as gains, array_agg(distinct source) as sources
  from public.transactions
  where amount > 0 and created_at > now() - interval '24 hours'
  group by discord_id having sum(amount) >= 3000
  order by 2 desc;

-- Les duels dont le rejeu ne correspond pas (triche ou bug) sur 7 jours
create or replace view admin.duels_refuses as
  select discord_id, count(*) as refus, max(quand) as dernier
  from securite.journal where action = 'duel_refuse' and quand > now() - interval '7 days'
  group by discord_id order by 2 desc;

-- Beaucoup de comptes créés depuis la même adresse (fabrique de comptes)
create or replace view admin.inscriptions_par_ip as
  select ip_address, count(*) as comptes, min(created_at) as premier, max(created_at) as dernier
  from auth.audit_log_entries
  where payload ->> 'action' = 'user_signedup' and created_at > now() - interval '7 days'
  group by ip_address having count(*) >= 3
  order by 2 desc;

revoke all on all tables in schema admin from public, anon, authenticated;


-- =====================================================================
--  9. Plus de fonctions exécutables par tout le monde par défaut
--  (Supabase donne d'office le droit d'exécuter chaque NOUVELLE fonction aux visiteurs et aux joueurs :
--  une fonction oubliée du site ou du bot qui donne de l'or serait ouverte à tous). Désormais, chaque
--  nouvelle fonction doit recevoir ses droits explicitement : grant execute on function … to authenticated;
-- =====================================================================
-- (PUBLIC reçoit ce droit de PostgreSQL lui-même, pour tous les schémas : il se retire sans « in schema »)
do $$
begin
  execute 'alter default privileges for role postgres revoke execute on functions from public';
  execute 'alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated';
exception when others then
  raise warning 'Droits par défaut non modifiés : %', sqlerrm;
end $$;


notify pgrst, 'reload schema';
notify pgrst, 'reload config';
