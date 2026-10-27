-- =====================================================================
--  Les amis (écran #/amis, pages/Amis.jsx)
--  À lancer APRÈS schema.sql et securite.sql, dans les deux projets (dev puis le vrai). Relançable sans casse.
--
--  - Devenir amis : une demande, que l'autre accepte ou refuse (personne n'est ami sans le vouloir).
--    Si les deux se demandent en même temps, la seconde demande vaut acceptation.
--  - Être en ligne : le jeu signale « je suis là » toutes les minutes (amis_signal) ; seuls tes amis le voient,
--    et seulement « en ligne », « en duel » ou « vu il y a… » (pas où tu es dans le jeu).
--  - Défier un ami : tu crées un salon privé (son code) et l'ami reçoit le défi dans le jeu pendant 10 minutes ;
--    « Rejoindre » le mène dans ce salon (le duel en ligne habituel, supabase/securite.sql partie 5).
--  Rien ne s'écrit directement depuis le navigateur : tout passe par les fonctions ci-dessous.
-- =====================================================================

-- Les liens entre joueurs : une demande en attente, ou une amitié (une seule ligne par paire, dans un sens ou l'autre)
create table if not exists public.amities (
  de         text not null references public.players(discord_id) on delete cascade,   -- qui a demandé
  vers       text not null references public.players(discord_id) on delete cascade,   -- à qui
  statut     text not null default 'attente' check (statut in ('attente', 'amis')),
  cree_le    timestamptz not null default now(),
  accepte_le timestamptz,
  primary key (de, vers),
  check (de <> vers)
);
create unique index if not exists amities_paire on public.amities (least(de, vers), greatest(de, vers));
create index if not exists amities_vers on public.amities (vers);

-- Quand chaque joueur a été vu pour la dernière fois, et s'il était en duel
create table if not exists public.joueurs_vus (
  discord_id text primary key references public.players(discord_id) on delete cascade,
  vu_le      timestamptz not null default now(),
  en_duel    boolean not null default false
);

-- Les défis en cours (le salon privé où l'ami est attendu)
create table if not exists public.defis (
  id      bigint generated always as identity primary key,
  de      text not null references public.players(discord_id) on delete cascade,
  vers    text not null references public.players(discord_id) on delete cascade,
  salon   text not null check (salon ~ '^[A-Z0-9]{5}$'),
  cree_le timestamptz not null default now()
);
create index if not exists defis_vers on public.defis (vers, cree_le desc);

alter table public.amities    enable row level security;
alter table public.joueurs_vus enable row level security;
alter table public.defis      enable row level security;
revoke all on public.amities, public.joueurs_vus, public.defis from anon, authenticated;


-- ---------------------------------------------------------------------
--  Les outils internes
-- ---------------------------------------------------------------------
create or replace function public.amis_sont(p_a text, p_b text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from amities where statut = 'amis' and ((de = p_a and vers = p_b) or (de = p_b and vers = p_a)))
$$;

-- Un joueur vu par un autre : pseudo, portrait, et (pour un ami seulement) en ligne / en duel / vu le
create or replace function public.amis_fiche(p_qui text, p_ami boolean)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('discord_id', p.discord_id, 'username', p.username, 'avatar_url', p.avatar_url)
    || case when p_ami then jsonb_build_object(
         'en_ligne', coalesce(v.vu_le > now() - interval '2 minutes', false),
         'en_duel', coalesce(v.vu_le > now() - interval '2 minutes' and v.en_duel, false),
         'vu_le', v.vu_le) else '{}'::jsonb end
  from players p left join joueurs_vus v on v.discord_id = p.discord_id
  where p.discord_id = p_qui
$$;

revoke all on function public.amis_sont(text, text), public.amis_fiche(text, boolean) from public, anon, authenticated;


-- ---------------------------------------------------------------------
--  Ce que le navigateur peut demander
-- ---------------------------------------------------------------------
-- Tout ce qu'il faut à l'écran : mes amis, les demandes reçues et envoyées, les défis reçus (moins de 10 min)
create or replace function public.amis_etat()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_moi text := my_discord_id();
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  return jsonb_build_object(
    'amis', coalesce((select jsonb_agg(amis_fiche(case when de = v_moi then vers else de end, true) order by accepte_le desc)
                      from amities where statut = 'amis' and (de = v_moi or vers = v_moi)), '[]'::jsonb),
    'recues', coalesce((select jsonb_agg(amis_fiche(de, false) || jsonb_build_object('le', cree_le) order by cree_le desc)
                        from amities where statut = 'attente' and vers = v_moi), '[]'::jsonb),
    'envoyees', coalesce((select jsonb_agg(amis_fiche(vers, false) || jsonb_build_object('le', cree_le) order by cree_le desc)
                          from amities where statut = 'attente' and de = v_moi), '[]'::jsonb),
    'defis', coalesce((select jsonb_agg(amis_fiche(d.de, false) || jsonb_build_object('id', d.id, 'salon', d.salon, 'le', d.cree_le) order by d.cree_le desc)
                       from defis d where d.vers = v_moi and d.cree_le > now() - interval '10 minutes'), '[]'::jsonb)
  );
end;
$$;

-- Le nombre de choses qui m'attendent (demandes reçues + défis) : la pastille de la barre
create or replace function public.amis_en_attente()
returns int language sql stable security definer set search_path = public as $$
  select (select count(*) from amities where statut = 'attente' and vers = my_discord_id())::int
       + (select count(*) from defis where vers = my_discord_id() and cree_le > now() - interval '10 minutes')::int
$$;

-- Chercher un joueur par son pseudo (8 au plus), avec ce qu'il est pour moi
create or replace function public.amis_chercher(p_texte text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_moi text := my_discord_id();
  v_t   text := trim(coalesce(p_texte, ''));
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  if length(v_t) < 2 then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('discord_id', p.discord_id, 'username', p.username, 'avatar_url', p.avatar_url,
             'lien', (select case when a.statut = 'amis' then 'ami' when a.de = v_moi then 'envoyee' else 'recue' end
                      from amities a where (a.de = v_moi and a.vers = p.discord_id) or (a.de = p.discord_id and a.vers = v_moi))))
    from (select * from players where discord_id <> v_moi and username ilike '%' || replace(replace(v_t, '%', ''), '_', '\_') || '%'
          order by length(username), username limit 8) p), '[]'::jsonb);
end;
$$;

-- Demander quelqu'un en ami (s'il m'avait déjà demandé, c'est accepté)
create or replace function public.amis_demander(p_discord_id text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_moi text := my_discord_id();
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  if p_discord_id is null or p_discord_id = v_moi then raise exception 'Choisis un autre joueur.'; end if;
  if not exists (select 1 from players where discord_id = p_discord_id) then raise exception 'Joueur introuvable.'; end if;
  perform pg_advisory_xact_lock(hashtext('amis:' || least(v_moi, p_discord_id) || greatest(v_moi, p_discord_id)));
  if amis_sont(v_moi, p_discord_id) then raise exception 'Vous êtes déjà amis.'; end if;
  if exists (select 1 from amities where de = p_discord_id and vers = v_moi) then
    update amities set statut = 'amis', accepte_le = now() where de = p_discord_id and vers = v_moi;
    return 'amis';
  end if;
  if exists (select 1 from amities where de = v_moi and vers = p_discord_id) then raise exception 'Ta demande est déjà envoyée.'; end if;
  if (select count(*) from amities where de = v_moi and statut = 'attente') >= 50 then
    raise exception 'Trop de demandes en attente : attends qu''on te réponde.';
  end if;
  insert into amities (de, vers) values (v_moi, p_discord_id);
  return 'envoyee';
end;
$$;

-- Répondre à une demande reçue
create or replace function public.amis_repondre(p_de text, p_accepter boolean)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_moi text := my_discord_id();
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  if p_accepter then
    update amities set statut = 'amis', accepte_le = now() where de = p_de and vers = v_moi and statut = 'attente';
  else
    delete from amities where de = p_de and vers = v_moi and statut = 'attente';
  end if;
  if not found then raise exception 'Cette demande n''existe plus.'; end if;
  return case when p_accepter then 'amis' else 'refusee' end;
end;
$$;

-- Retirer un ami, ou annuler une demande envoyée (les défis entre vous disparaissent aussi)
create or replace function public.amis_retirer(p_discord_id text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_moi text := my_discord_id();
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  delete from amities where (de = v_moi and vers = p_discord_id) or (de = p_discord_id and vers = v_moi);
  delete from defis where (de = v_moi and vers = p_discord_id) or (de = p_discord_id and vers = v_moi);
end;
$$;

-- « Je suis là » (le jeu l'envoie toutes les minutes), et si je suis en duel
create or replace function public.amis_signal(p_en_duel boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_moi text := my_discord_id();
begin
  if v_moi is null then return; end if;
  insert into joueurs_vus (discord_id, vu_le, en_duel) values (v_moi, now(), coalesce(p_en_duel, false))
  on conflict (discord_id) do update set vu_le = now(), en_duel = coalesce(p_en_duel, false);
end;
$$;

-- Défier un ami dans un salon privé que je viens de créer (un seul défi en cours par ami)
create or replace function public.amis_defier(p_ami text, p_salon text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_moi text := my_discord_id();
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  if not amis_sont(v_moi, p_ami) then raise exception 'Tu ne peux défier que tes amis.'; end if;
  if coalesce(p_salon, '') !~ '^[A-Z0-9]{5}$' then raise exception 'Code de salon invalide.'; end if;
  delete from defis where de = v_moi and vers = p_ami;
  if random() < 0.1 then delete from defis where cree_le < now() - interval '1 day'; end if;
  insert into defis (de, vers, salon) values (v_moi, p_ami, p_salon);
end;
$$;

-- Répondre à un défi : le refuser, ou le prendre (renvoie le code du salon à rejoindre)
create or replace function public.amis_defi_repondre(p_id bigint, p_accepter boolean)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_moi text := my_discord_id();
  v_d   defis;
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  delete from defis where id = p_id and vers = v_moi returning * into v_d;
  if v_d.id is null then raise exception 'Ce défi n''existe plus.'; end if;
  if not p_accepter then return null; end if;
  if v_d.cree_le < now() - interval '10 minutes' then raise exception 'Ce défi a expiré : demande-lui d''en lancer un nouveau.'; end if;
  return v_d.salon;
end;
$$;

revoke all on function public.amis_etat(), public.amis_en_attente(), public.amis_chercher(text), public.amis_demander(text),
  public.amis_repondre(text, boolean), public.amis_retirer(text), public.amis_signal(boolean), public.amis_defier(text, text),
  public.amis_defi_repondre(bigint, boolean) from public, anon;
grant execute on function public.amis_etat(), public.amis_en_attente(), public.amis_chercher(text), public.amis_demander(text),
  public.amis_repondre(text, boolean), public.amis_retirer(text), public.amis_signal(boolean), public.amis_defier(text, text),
  public.amis_defi_repondre(bigint, boolean) to authenticated;
