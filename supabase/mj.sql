-- =====================================================================
--  Le panneau MJ du jeu de cartes (écran #/mj, pages/Mj.jsx)
--  À lancer APRÈS schema.sql, securite.sql et caverne.sql, dans les deux projets. Relançable sans casse.
--
--  Chaque fonction vérifie côté serveur que la personne connectée est MJ (securite.exiger_mj) et note
--  ce qu'elle a fait dans securite.journal. Cacher l'écran ne suffirait pas : c'est la base qui protège.
--   - mj_jeu_stats()                       : la vue d'ensemble du jeu
--   - mj_jeu_joueur(joueur)                : la fiche complète d'un joueur
--   - mj_jeu_or / mj_jeu_cristaux          : donner (+) ou retirer (-) de l'or, des cristaux
--   - mj_jeu_carte / mj_jeu_booster        : donner ou retirer des exemplaires d'une carte, des boosters
--   - mj_jeu_badge / mj_jeu_acces_caverne  : des badges de la Caverne, ou du temps d'accès direct
--   - mj_jeu_pass                          : de l'XP du Pass de la saison, le premium
--   - mj_jeu_role                          : nommer ou retirer un MJ
--  (Réinitialiser un joueur : mj_reset_player, dans schema.sql.)
-- =====================================================================

-- Le joueur doit exister
create or replace function public.mj_jeu_verifier(p_discord_id text)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  perform securite.exiger_mj();
  if not exists (select 1 from players where discord_id = p_discord_id) then raise exception 'Joueur introuvable.'; end if;
end;
$$;


-- ---------------------------------------------------------------------
--  La vue d'ensemble
-- ---------------------------------------------------------------------
create or replace function public.mj_jeu_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_saison bigint := pass_saison_en_cours();
begin
  perform securite.exiger_mj();
  return jsonb_build_object(
    'joueurs',          (select count(*) from players),
    'nouveaux_7j',      (select count(*) from players where created_at > now() - interval '7 days'),
    'or_total',         (select coalesce(sum(balance), 0) from wallets),
    'cristaux_total',   (select coalesce(sum(cristaux), 0) from wallets),
    'exemplaires',      (select coalesce(sum(quantite), 0) from player_cards),
    'duels_7j',         (select count(*) from duels where commence_le > now() - interval '7 days'),
    'boosters_7j',      (select count(*) from booster_ouvertures where ouvert_le > now() - interval '7 days'),
    'premium',          (select count(*) from pass_progression where saison_id = v_saison and premium),
    'caverne_ouverte',  (select count(*) from caverne_acces where jusqu_a > now()),
    'caverne_7j', coalesce((
      select jsonb_object_agg(monnaie, jsonb_build_object('parties', parties, 'mises', mises, 'gains', gains))
      from (select monnaie, count(*) as parties, sum(mise) as mises, sum(gain) as gains
            from caverne_historique where joue_le > now() - interval '7 days' group by monnaie) x), '{}'::jsonb)
  );
end;
$$;


-- ---------------------------------------------------------------------
--  La fiche d'un joueur
-- ---------------------------------------------------------------------
create or replace function public.mj_jeu_joueur(p_discord_id text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_saison saisons;
  v_prog   pass_progression;
begin
  perform mj_jeu_verifier(p_discord_id);
  select * into v_saison from saisons where id = pass_saison_en_cours();
  select * into v_prog from pass_progression where discord_id = p_discord_id and saison_id = v_saison.id;
  return jsonb_build_object(
    'joueur', (select jsonb_build_object('discord_id', discord_id, 'username', username, 'avatar_url', avatar_url,
                 'is_mj', is_mj, 'cree_le', created_at, 'email', (select to_jsonb(u) ->> 'email' from auth.users u where u.id = p.user_id))
               from players p where discord_id = p_discord_id),
    'bourse', (select jsonb_build_object('or', coalesce(w.balance, 0), 'cristaux', coalesce(w.cristaux, 0))
               from (select 1) x left join wallets w on w.discord_id = p_discord_id),
    'cartes', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'nom', c.name, 'rarete', c.rarity, 'image', c.image,
                 'quantite', pc.quantite) order by c.rarity, c.name)
               from player_cards pc join cards c on c.id = pc.card_id where pc.discord_id = p_discord_id), '[]'::jsonb),
    'boosters', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'nom', b.nom, 'quantite', coalesce(pb.quantite, 0)) order by b.prix)
               from boosters b left join player_boosters pb on pb.booster_id = b.id and pb.discord_id = p_discord_id
               where b.id <> 'gratuit'), '[]'::jsonb),
    'caverne', jsonb_build_object(
      'jusqu_a', (select jusqu_a from caverne_acces where discord_id = p_discord_id and jusqu_a > now()),
      'badges', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'nom', t.nom, 'image', t.image, 'nombre', coalesce(cb.nombre, 0)) order by t.ordre)
                 from caverne_badges_types t left join caverne_badges cb on cb.badge_id = t.id and cb.discord_id = p_discord_id), '[]'::jsonb),
      'parties_7j', (select count(*) from caverne_historique where discord_id = p_discord_id and joue_le > now() - interval '7 days')),
    'pass', case when v_saison.id is null then null else jsonb_build_object(
      'saison', v_saison.nom, 'xp', coalesce(v_prog.xp, 0), 'premium', coalesce(v_prog.premium, false),
      'xp_par_palier', v_saison.xp_par_palier, 'nb_paliers', v_saison.nb_paliers) end,
    'succes', jsonb_build_object(
      'obtenus', (select count(*) from player_succes where discord_id = p_discord_id),
      'total', (select count(*) from succes)),
    'duels', stats_joueur(p_discord_id)::jsonb
  );
end;
$$;


-- ---------------------------------------------------------------------
--  Les monnaies : + donne, - retire (jamais sous zéro). Renvoie le nouveau solde.
-- ---------------------------------------------------------------------
create or replace function public.mj_jeu_or(p_discord_id text, p_montant int, p_raison text default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_avant int;
  v_apres int;
begin
  perform mj_jeu_verifier(p_discord_id);
  if coalesce(p_montant, 0) = 0 then raise exception 'Indique un montant.'; end if;
  insert into wallets (discord_id, balance) values (p_discord_id, 0) on conflict (discord_id) do nothing;
  select balance into v_avant from wallets where discord_id = p_discord_id for update;
  v_apres := greatest(0, v_avant + p_montant);
  update wallets set balance = v_apres where discord_id = p_discord_id;
  insert into transactions (discord_id, amount, source, reason)
  values (p_discord_id, v_apres - v_avant, 'mj', coalesce(nullif(trim(p_raison), ''), 'Geste du MJ'));
  perform securite.journaliser('mj_jeu_or', jsonb_build_object('joueur', p_discord_id, 'montant', v_apres - v_avant));
  return v_apres;
end;
$$;

create or replace function public.mj_jeu_cristaux(p_discord_id text, p_montant int)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_apres int;
begin
  perform mj_jeu_verifier(p_discord_id);
  if coalesce(p_montant, 0) = 0 then raise exception 'Indique un montant.'; end if;
  insert into wallets (discord_id, balance) values (p_discord_id, 0) on conflict (discord_id) do nothing;
  update wallets set cristaux = greatest(0, cristaux + p_montant) where discord_id = p_discord_id returning cristaux into v_apres;
  perform securite.journaliser('mj_jeu_cristaux', jsonb_build_object('joueur', p_discord_id, 'montant', p_montant));
  return v_apres;
end;
$$;


-- ---------------------------------------------------------------------
--  Les cartes et les boosters : p_nombre > 0 donne, < 0 retire. Renvoie combien il en a ensuite.
-- ---------------------------------------------------------------------
create or replace function public.mj_jeu_carte(p_discord_id text, p_card_id bigint, p_nombre int default 1)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_q int;
begin
  perform mj_jeu_verifier(p_discord_id);
  if coalesce(p_nombre, 0) = 0 then raise exception 'Indique un nombre.'; end if;
  if not exists (select 1 from cards where id = p_card_id) then raise exception 'Carte inconnue.'; end if;
  if p_nombre > 0 then
    if grant_card(p_discord_id, p_card_id, 'evenement') then
      if p_nombre > 1 then update player_cards set quantite = quantite + p_nombre - 1 where discord_id = p_discord_id and card_id = p_card_id; end if;
    else
      update player_cards set quantite = quantite + p_nombre where discord_id = p_discord_id and card_id = p_card_id;
    end if;
  else
    update player_cards set quantite = quantite + p_nombre
    where discord_id = p_discord_id and card_id = p_card_id and quantite + p_nombre >= 1;
    if not found then delete from player_cards where discord_id = p_discord_id and card_id = p_card_id; end if;
  end if;
  select quantite into v_q from player_cards where discord_id = p_discord_id and card_id = p_card_id;
  perform securite.journaliser('mj_jeu_carte', jsonb_build_object('joueur', p_discord_id, 'carte', p_card_id, 'nombre', p_nombre));
  return coalesce(v_q, 0);
end;
$$;

create or replace function public.mj_jeu_booster(p_discord_id text, p_booster_id text, p_nombre int default 1)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_q int;
begin
  perform mj_jeu_verifier(p_discord_id);
  if coalesce(p_nombre, 0) = 0 then raise exception 'Indique un nombre.'; end if;
  if not exists (select 1 from boosters where id = p_booster_id) then raise exception 'Booster inconnu.'; end if;
  insert into player_boosters (discord_id, booster_id, quantite) values (p_discord_id, p_booster_id, greatest(p_nombre, 0))
  on conflict (discord_id, booster_id) do update set quantite = greatest(0, player_boosters.quantite + p_nombre)
  returning quantite into v_q;
  perform securite.journaliser('mj_jeu_booster', jsonb_build_object('joueur', p_discord_id, 'booster', p_booster_id, 'nombre', p_nombre));
  return v_q;
end;
$$;


-- ---------------------------------------------------------------------
--  La Caverne : des badges (à activer par le joueur), ou du temps d'accès direct (en heures ; 0 : la refermer)
-- ---------------------------------------------------------------------
create or replace function public.mj_jeu_badge(p_discord_id text, p_badge text, p_nombre int default 1)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_q int;
begin
  perform mj_jeu_verifier(p_discord_id);
  if coalesce(p_nombre, 0) = 0 then raise exception 'Indique un nombre.'; end if;
  if not exists (select 1 from caverne_badges_types where id = p_badge) then raise exception 'Badge inconnu.'; end if;
  insert into caverne_badges (discord_id, badge_id, nombre) values (p_discord_id, p_badge, greatest(p_nombre, 0))
  on conflict (discord_id, badge_id) do update set nombre = greatest(0, caverne_badges.nombre + p_nombre)
  returning nombre into v_q;
  perform securite.journaliser('mj_jeu_badge', jsonb_build_object('joueur', p_discord_id, 'badge', p_badge, 'nombre', p_nombre));
  return v_q;
end;
$$;

create or replace function public.mj_jeu_acces_caverne(p_discord_id text, p_heures int)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  v_fin timestamptz;
begin
  perform mj_jeu_verifier(p_discord_id);
  if p_heures is null then raise exception 'Indique un nombre d''heures.'; end if;
  if p_heures = 0 then
    delete from caverne_acces where discord_id = p_discord_id;
  else
    insert into caverne_acces (discord_id, jusqu_a) values (p_discord_id, now() + make_interval(hours => p_heures))
    on conflict (discord_id) do update set jusqu_a = greatest(caverne_acces.jusqu_a, now()) + make_interval(hours => p_heures);
  end if;
  select jusqu_a into v_fin from caverne_acces where discord_id = p_discord_id and jusqu_a > now();
  perform securite.journaliser('mj_jeu_acces_caverne', jsonb_build_object('joueur', p_discord_id, 'heures', p_heures));
  return v_fin;
end;
$$;


-- ---------------------------------------------------------------------
--  Le Pass de la saison en cours : de l'XP (+/-), et le premium (null : inchangé)
-- ---------------------------------------------------------------------
create or replace function public.mj_jeu_pass(p_discord_id text, p_xp int default 0, p_premium boolean default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_saison bigint := pass_saison_en_cours();
  v_prog   pass_progression;
begin
  perform mj_jeu_verifier(p_discord_id);
  if v_saison is null then raise exception 'Aucune saison en cours.'; end if;
  insert into pass_progression (discord_id, saison_id) values (p_discord_id, v_saison) on conflict (discord_id, saison_id) do nothing;
  update pass_progression set xp = greatest(0, xp + coalesce(p_xp, 0)), premium = coalesce(p_premium, premium), maj_le = now()
  where discord_id = p_discord_id and saison_id = v_saison
  returning * into v_prog;
  perform securite.journaliser('mj_jeu_pass', jsonb_build_object('joueur', p_discord_id, 'xp', p_xp, 'premium', p_premium));
  return jsonb_build_object('xp', v_prog.xp, 'premium', v_prog.premium);
end;
$$;


-- ---------------------------------------------------------------------
--  Nommer ou retirer un MJ (pas soi-même : un MJ ne peut pas se retirer par erreur)
-- ---------------------------------------------------------------------
create or replace function public.mj_jeu_role(p_discord_id text, p_mj boolean)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform mj_jeu_verifier(p_discord_id);
  if p_discord_id = my_discord_id() and not p_mj then raise exception 'Tu ne peux pas te retirer toi-même le rôle de MJ.'; end if;
  update players set is_mj = p_mj where discord_id = p_discord_id;
  perform securite.journaliser('mj_jeu_role', jsonb_build_object('joueur', p_discord_id, 'mj', p_mj));
  return p_mj;
end;
$$;


revoke all on function public.mj_jeu_verifier(text) from public, anon, authenticated;
revoke all on function public.mj_jeu_stats(), public.mj_jeu_joueur(text), public.mj_jeu_or(text, int, text),
  public.mj_jeu_cristaux(text, int), public.mj_jeu_carte(text, bigint, int), public.mj_jeu_booster(text, text, int),
  public.mj_jeu_badge(text, text, int), public.mj_jeu_acces_caverne(text, int), public.mj_jeu_pass(text, int, boolean),
  public.mj_jeu_role(text, boolean) from public, anon;
grant execute on function public.mj_jeu_stats(), public.mj_jeu_joueur(text), public.mj_jeu_or(text, int, text),
  public.mj_jeu_cristaux(text, int), public.mj_jeu_carte(text, bigint, int), public.mj_jeu_booster(text, text, int),
  public.mj_jeu_badge(text, text, int), public.mj_jeu_acces_caverne(text, int), public.mj_jeu_pass(text, int, boolean),
  public.mj_jeu_role(text, boolean) to authenticated;
