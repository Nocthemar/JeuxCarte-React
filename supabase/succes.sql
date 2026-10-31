-- =====================================================================
--  Les succès, version jeu vidéo (30/10/2026)
--  À lancer APRÈS schema.sql, securite.sql, caverne.sql et amis.sql, dans les deux projets (dev puis le vrai).
--  Relançable sans casse.
--
--  - Succès SECRETS : tant qu'ils ne sont pas atteints, le serveur cache leur nom et leur description
--    (le navigateur ne reçoit qu'un indice) ;
--  - récompense en CRISTAUX (la seconde monnaie), en plus de l'or ;
--  - de nouvelles mesures : la Caverne (parties, gros gains, la créature du lac, le pont traversé) et les amis ;
--  - de nouveaux succès : catégories « Caverne », « Multijoueur » et « Secrets ».
--  Les récompenses restent cosmétiques ou modestes : rien qui rende le jeu injuste.
-- =====================================================================

alter table public.succes add column if not exists secret boolean not null default false;
alter table public.succes add column if not exists cristaux int not null default 0 check (cristaux >= 0);
alter table public.succes add column if not exists indice text;   -- ce que montre un succès secret encore caché

-- Les nouvelles mesures (ajoutées à celles de succes_stats, schema.sql)
create or replace function public.succes_stats_plus(p_discord_id text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  s jsonb := '{}'::jsonb;
  a int; b int; c int; d int;
begin
  if to_regclass('public.caverne_historique') is not null then
    execute 'select count(*),
                    count(*) filter (where gain >= mise * 5),
                    count(*) filter (where jeu = ''lac'' and multiplicateur >= 10),
                    count(*) filter (where jeu = ''pont'' and multiplicateur >= 48)
             from public.caverne_historique where discord_id = $1'
      into a, b, c, d using p_discord_id;
    s := s || jsonb_build_object('caverne_parties', a, 'caverne_gros_gains', b, 'caverne_creature', c, 'caverne_pont', d);
  end if;
  if to_regclass('public.amities') is not null then
    execute 'select count(*) from public.amities where statut = ''amis'' and (de = $1 or vers = $1)' into a using p_discord_id;
    s := s || jsonb_build_object('amis', a);
  end if;
  return s;
end;
$$;

-- La liste des succès du joueur connecté (les secrets non atteints arrivent masqués)
create or replace function public.mes_succes()
returns json language plpgsql security definer set search_path = public as $$
declare
  v_moi   text := my_discord_id();
  v_stats jsonb;
  v_pct   jsonb;
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  v_stats := succes_stats(v_moi) || succes_stats_plus(v_moi);
  v_pct := succes_pourcentages();
  return coalesce((
    select json_agg(json_build_object(
      'id', s.id, 'categorie', s.categorie,
      'nom', case when cache then 'Succès secret' else s.nom end,
      'description', case when cache then coalesce(s.indice, 'Un secret de Nocthémar. Continue d''explorer…') else s.description end,
      'icone', case when cache then '?' else s.icone end,
      'secret', s.secret, 'cache', cache,
      'rarete', s.rarete, 'objectif', case when cache then 1 else o.objectif end,
      'recompense', s.recompense, 'cristaux', s.cristaux,
      'progression', case when cache then 0 else least(valeur, o.objectif) end,
      'atteint', valeur >= o.objectif,
      'reclame', ps.succes_id is not null, 'reclame_le', ps.reclame_le, 'vitrine', ps.vitrine,
      'pourcentage', coalesce((v_pct ->> s.id)::numeric, 0)
    ) order by s.ordre, s.id)
    from succes s
    cross join lateral (select succes_objectif(s.mesure, s.objectif) as objectif) o
    cross join lateral (select coalesce((v_stats ->> s.mesure)::int, 0) as valeur) v
    cross join lateral (select s.secret and v.valeur < o.objectif as cache) k
    left join player_succes ps on ps.discord_id = v_moi and ps.succes_id = s.id
  ), '[]'::json);
end;
$$;

-- Réclamer un succès atteint : l'or et les cristaux (objectif revérifié côté serveur, une seule fois)
create or replace function public.reclamer_succes(p_succes_id text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_moi    text := my_discord_id();
  v_succes succes%rowtype;
  v_valeur int;
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  perform pg_advisory_xact_lock(hashtext('succes:' || v_moi));

  select * into v_succes from succes where id = p_succes_id;
  if not found then raise exception 'Succès inconnu.'; end if;
  if exists (select 1 from player_succes where discord_id = v_moi and succes_id = p_succes_id) then
    raise exception 'Tu as déjà réclamé ce succès.';
  end if;
  v_valeur := coalesce(((succes_stats(v_moi) || succes_stats_plus(v_moi)) ->> v_succes.mesure)::int, 0);
  if v_valeur < succes_objectif(v_succes.mesure, v_succes.objectif) then
    raise exception 'Ce succès n''est pas encore atteint.';
  end if;

  insert into player_succes (discord_id, succes_id) values (v_moi, p_succes_id);
  if v_succes.recompense > 0 or v_succes.cristaux > 0 then
    update wallets set balance = balance + v_succes.recompense, cristaux = cristaux + v_succes.cristaux where discord_id = v_moi;
    if not found then
      insert into wallets (discord_id, balance, cristaux) values (v_moi, v_succes.recompense, v_succes.cristaux);
    end if;
  end if;
  if v_succes.recompense > 0 then
    begin
      insert into transactions (discord_id, amount, source, reason)
      values (v_moi, v_succes.recompense, 'succes', 'Succès : ' || v_succes.nom);
    exception when others then null;
    end;
  end if;

  return json_build_object('id', v_succes.id, 'nom', v_succes.nom, 'description', v_succes.description,
    'icone', v_succes.icone, 'rarete', v_succes.rarete, 'recompense', v_succes.recompense, 'cristaux', v_succes.cristaux,
    'pourcentage', coalesce((succes_pourcentages() ->> v_succes.id)::numeric, 0));
end;
$$;

revoke all on function public.succes_stats_plus(text) from public, anon, authenticated;
revoke all on function public.mes_succes(), public.reclamer_succes(text) from public, anon;
grant execute on function public.mes_succes(), public.reclamer_succes(text) to authenticated;

-- ---------------------------------------------------------------------
--  Les catégories : les victoires contre d'autres joueurs passent dans « Multijoueur »
-- ---------------------------------------------------------------------
update public.succes set categorie = 'Multijoueur' where id in ('premier-rival', 'terreur-salons');

-- ---------------------------------------------------------------------
--  Les nouveaux succès (la récompense en or et les cristaux restent modestes)
-- ---------------------------------------------------------------------
insert into public.succes (id, categorie, nom, description, icone, mesure, objectif, recompense, cristaux, ordre, rarete, secret, indice) values
  ('caverne-1',      'Caverne',     'Première mise',          'Joue une partie dans la Caverne aux Trésors.',         '🪙', 'caverne_parties',      1,  50,  0, 70, 'commun',     false, null),
  ('caverne-25',     'Caverne',     'Habitué de la Caverne',  'Joue 25 parties dans la Caverne aux Trésors.',         '🎲', 'caverne_parties',     25, 150,  5, 71, 'rare',       false, null),
  ('caverne-100',    'Caverne',     'Pilier de la Caverne',   'Joue 100 parties dans la Caverne aux Trésors.',        '🏛', 'caverne_parties',    100, 300, 15, 72, 'epique',     false, null),
  ('caverne-gros',   'Caverne',     'Coup de maître',         'Remporte au moins cinq fois ta mise en une partie.',   '💰', 'caverne_gros_gains',   1, 100,  5, 73, 'rare',       false, null),
  ('ami-1',          'Multijoueur', 'Compagnon d''armes',     'Ajoute un premier ami.',                                '🤝', 'amis',                 1,  50,  0, 17, 'commun',     false, null),
  ('amis-5',         'Multijoueur', 'La Compagnie',           'Compte cinq amis.',                                     '🛡', 'amis',                 5, 150,  5, 18, 'rare',       false, null),
  ('secret-lac',     'Secrets',     'Ce qui dort sous le lac', 'Sors la créature du Lac des Esprits.',                 '🐉', 'caverne_creature',     1, 200, 20, 90, 'legendaire', true,  'Certaines eaux sont plus profondes qu''elles n''en ont l''air…'),
  ('secret-pont',    'Secrets',     'De l''autre côté',        'Traverse le Pont Maudit jusqu''au bout.',              '🌉', 'caverne_pont',         1, 200, 20, 91, 'legendaire', true,  'Douze pas séparent le prudent du légendaire…')
on conflict (id) do update set categorie = excluded.categorie, nom = excluded.nom, description = excluded.description,
  icone = excluded.icone, mesure = excluded.mesure, objectif = excluded.objectif, recompense = excluded.recompense,
  cristaux = excluded.cristaux, ordre = excluded.ordre, rarete = excluded.rarete, secret = excluded.secret, indice = excluded.indice;
