-- =====================================================================
--  La Caverne aux Trésors : cinq jeux de hasard, avec l'or ou les cristaux du jeu (écran #/caverne)
--  À lancer APRÈS schema.sql et securite.sql, dans les deux projets (dev puis le vrai). Relançable sans casse.
--
--  Tout se décide ici, jamais dans le navigateur : le serveur prend la mise, tire le hasard (le réveil du
--  dragon, les cristaux maudits, les planches qui cèdent, la prise au bout de la ligne, les coups du Roi Liche),
--  le garde secret, et paie le gain.
--  Le navigateur ne fait qu'afficher ; il ne voit le secret qu'une fois la partie finie.
--
--   I.   Le Dragon Dormant : le butin grossit (×e^(0,12 t)) jusqu'au réveil, tiré au départ ; fuir avant.
--   II.  Les Bourses du Marchand : 25 bourses, 1 à 12 cristaux maudits ; chaque bourse sûre augmente le gain.
--   III. Le Pont Maudit : 12 planches, de plus en plus fragiles ; avancer d'une ou deux, ou encaisser.
--   IV.  Le Lac des Esprits : une prise cachée (poisson ×0,3, pièce ×1,2, cristal ×2,4, créature géante ×10) ;
--        5 tirages pour la sortir de l'eau, chacun peut casser la ligne ; seule la tension trahit la prise.
--        Couper la ligne rend la moitié de la mise.
--   V.   Le Roi Liche : 5 manches (×1,2 ×2,4 ×4,8 ×9,6 ×19,2) ; attaquer, se défendre ou se soigner (3 potions).
--        Fuir garde le gain des manches gagnées (la moitié de la mise avant la première) ; mourir perd tout.
--  La maison garde 3 % en moyenne, même face à un joueur parfait (calculé pour le Lac et le Roi Liche) ;
--  le gain d'une partie est limité à 100 fois la mise.
--  Une seule partie à la fois par joueur. Une partie laissée en plan (onglet fermé) est réglée au début
--  de la suivante, comme si le joueur avait encaissé à ce moment-là (ou perdu, si le dragon s'est réveillé).
-- =====================================================================

-- La partie en cours de chaque joueur (secrète : aucun accès depuis le navigateur)
create table if not exists public.caverne_parties (
  discord_id  text primary key references public.players(discord_id) on delete cascade,
  jeu         text not null check (jeu in ('dragon', 'bourses', 'pont')),
  monnaie     text not null check (monnaie in ('or', 'cristaux')),
  mise        int  not null check (mise > 0),
  etat        jsonb not null default '{}'::jsonb,   -- dragon : réveil, auto ; bourses : maudites, ouvertes ; pont : position
  commence_le timestamptz not null default clock_timestamp()
);
alter table public.caverne_parties enable row level security;
revoke all on public.caverne_parties from anon, authenticated;
-- (les jeux ajoutés depuis : le Lac et le Roi Liche)
alter table public.caverne_parties drop constraint if exists caverne_parties_jeu_check;
alter table public.caverne_parties add constraint caverne_parties_jeu_check check (jeu in ('dragon', 'bourses', 'pont', 'lac', 'liche'));

-- Les parties finies (le joueur voit les siennes)
create table if not exists public.caverne_historique (
  id             bigint generated always as identity primary key,
  discord_id     text not null references public.players(discord_id) on delete cascade,
  jeu            text not null,
  monnaie        text not null,
  mise           int  not null,
  gain           int  not null,                 -- ce qui revient au joueur (0 : mise perdue)
  multiplicateur numeric(8,2),
  joue_le        timestamptz not null default now()
);
create index if not exists caverne_historique_joueur on public.caverne_historique (discord_id, joue_le desc);
alter table public.caverne_historique enable row level security;
revoke all on public.caverne_historique from anon, authenticated;
grant select on public.caverne_historique to authenticated;
drop policy if exists caverne_historique_lire on public.caverne_historique;
create policy caverne_historique_lire on public.caverne_historique
  for select to authenticated using (discord_id = public.my_discord_id());


-- ---------------------------------------------------------------------
--  Les règles (les mêmes nombres que src/lib/caverne/regles.js)
-- ---------------------------------------------------------------------
-- Mise minimale et maximale, par monnaie
create or replace function public.caverne_bornes(p_monnaie text)
returns int[] language sql immutable as $$
  select case p_monnaie when 'or' then array[10, 1000] when 'cristaux' then array[5, 250] end
$$;

-- Le Pont : la chance de casser de chaque planche (1 à 12)
create or replace function public.caverne_pont_risque(p_planche int)
returns numeric language sql immutable as $$
  select (array[.08, .10, .12, .14, .17, .20, .24, .29, .35, .42, .48, .55]::numeric[])[p_planche]
$$;

-- Le multiplicateur d'une partie, selon le jeu et son état (arrondi au centième, plafonné à ×100)
create or replace function public.caverne_multiplicateur(p_jeu text, p_etat jsonb, p_secondes double precision default 0)
returns numeric language plpgsql immutable as $$
declare
  v_m numeric := 1;
  v_n int;
  v_k int;
begin
  if p_jeu = 'dragon' then
    v_m := exp(0.12 * greatest(p_secondes, 0))::numeric;
  elsif p_jeu = 'bourses' then
    v_n := (p_etat ->> 'maudites_nb')::int;
    v_k := jsonb_array_length(p_etat -> 'ouvertes');
    if v_k = 0 then return 1; end if;
    for i in 0 .. v_k - 1 loop v_m := v_m * (25 - i) / (25 - v_n - i); end loop;
    v_m := v_m * 0.97;
  elsif p_jeu = 'pont' then
    v_k := (p_etat ->> 'position')::int;
    if v_k = 0 then return 1; end if;
    for i in 1 .. v_k loop v_m := v_m * (1 - caverne_pont_risque(i)); end loop;
    v_m := 0.97 / v_m;
  elsif p_jeu = 'lac' then
    v_m := 0.5;   -- couper la ligne
  elsif p_jeu = 'liche' then
    v_m := (array[.5, 1.2, 2.4, 4.8, 9.6, 19.2]::numeric[])[(p_etat ->> 'manche')::int + 1];
  end if;
  return least(floor(v_m * 100) / 100, 100);
end;
$$;


-- ---------------------------------------------------------------------
--  Les mouvements de la bourse (internes : jamais appelables depuis le navigateur)
-- ---------------------------------------------------------------------
create or replace function public.caverne_bourse(p_moi text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('or', coalesce(w.balance, 0), 'cristaux', coalesce(w.cristaux, 0))
  from (select 1) x left join wallets w on w.discord_id = p_moi
$$;

create or replace function public.caverne_bouger(p_moi text, p_monnaie text, p_montant int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_montant = 0 then return; end if;
  if p_monnaie = 'or' then
    update wallets set balance = balance + p_montant where discord_id = p_moi and balance + p_montant >= 0;
  else
    update wallets set cristaux = cristaux + p_montant where discord_id = p_moi and cristaux + p_montant >= 0;
  end if;
  if not found then
    if p_montant > 0 then
      insert into wallets (discord_id, balance, cristaux)
      values (p_moi, case when p_monnaie = 'or' then p_montant else 0 end, case when p_monnaie = 'cristaux' then p_montant else 0 end);
    else
      raise exception 'Ta bourse n''est pas assez garnie pour cette mise.';
    end if;
  end if;
end;
$$;

-- Ferme la partie : paie le gain (0 : perdu), l'inscrit dans l'historique, et dit au navigateur ce qui s'est passé
-- (avec le secret de la partie, qu'il peut enfin montrer)
create or replace function public.caverne_clore(p_p public.caverne_parties, p_mult numeric, p_infos jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_gain int := case when p_mult is null then 0 else floor(p_p.mise * p_mult)::int end;
begin
  perform caverne_bouger(p_p.discord_id, p_p.monnaie, v_gain);
  insert into caverne_historique (discord_id, jeu, monnaie, mise, gain, multiplicateur)
  values (p_p.discord_id, p_p.jeu, p_p.monnaie, p_p.mise, v_gain, p_mult);
  delete from caverne_parties where discord_id = p_p.discord_id;
  return jsonb_build_object('fini', true, 'jeu', p_p.jeu, 'monnaie', p_p.monnaie, 'mise', p_p.mise, 'gain', v_gain,
    'multiplicateur', p_mult, 'bourse', caverne_bourse(p_p.discord_id)) || p_infos;
end;
$$;

-- Le Dragon : où en est la partie maintenant ? null s'il dort encore (et que l'encaissement auto n'est pas atteint)
create or replace function public.caverne_dragon_bilan(p_p public.caverne_parties, p_fuir boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_t      double precision := extract(epoch from clock_timestamp() - p_p.commence_le);
  v_reveil numeric := (p_p.etat ->> 'reveil')::numeric;
  v_auto   numeric := (p_p.etat ->> 'auto')::numeric;
  v_fin    double precision := greatest(.55, ln(v_reveil) / 0.12);   -- l'instant du réveil (secondes)
  v_m      numeric;
begin
  -- l'encaissement automatique passe avant le réveil, s'il tombe avant
  if v_auto is not null and v_auto <= v_reveil and v_t >= ln(v_auto) / 0.12 then
    return caverne_clore(p_p, v_auto, jsonb_build_object('reveil', v_reveil, 'auto', true));
  end if;
  if v_t >= v_fin then
    return caverne_clore(p_p, null, jsonb_build_object('reveil', v_reveil));
  end if;
  if not p_fuir then return null; end if;
  v_m := least(caverne_multiplicateur('dragon', p_p.etat, v_t), v_reveil);
  return caverne_clore(p_p, v_m, jsonb_build_object('reveil', v_reveil));
end;
$$;

-- Règle une partie laissée en plan : comme un encaissement maintenant (ou la perte, si le dragon s'est réveillé)
create or replace function public.caverne_regler(p_p public.caverne_parties)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if p_p.jeu = 'dragon' then return caverne_dragon_bilan(p_p, true); end if;
  return caverne_clore(p_p, caverne_multiplicateur(p_p.jeu, p_p.etat));
end;
$$;

revoke all on function public.caverne_bourse(text), public.caverne_bouger(text, text, int),
  public.caverne_clore(public.caverne_parties, numeric, jsonb), public.caverne_dragon_bilan(public.caverne_parties, boolean),
  public.caverne_regler(public.caverne_parties) from public, anon, authenticated;


-- ---------------------------------------------------------------------
--  Ce que le navigateur peut demander
-- ---------------------------------------------------------------------
-- Commencer une partie. p_option : le dragon, l'encaissement auto (×, ou null) ; les bourses, le nombre de cristaux maudits.
-- Renvoie la partie (sans son secret), la bourse, et « reglee » si une ancienne partie vient d'être réglée.
create or replace function public.caverne_commencer(p_jeu text, p_monnaie text, p_mise int, p_option numeric default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_moi    text := my_discord_id();
  v_bornes int[] := caverne_bornes(p_monnaie);
  v_vieille caverne_parties;
  v_reglee jsonb;
  v_etat   jsonb;
  v_maudites int[];
  v_n      int;
  v_r      double precision;
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  if p_jeu not in ('dragon', 'bourses', 'pont', 'lac', 'liche') then raise exception 'Jeu inconnu.'; end if;
  if v_bornes is null then raise exception 'Monnaie inconnue.'; end if;
  if p_mise is null or p_mise < v_bornes[1] or p_mise > v_bornes[2] then
    raise exception 'La mise doit être entre % et %.', v_bornes[1], v_bornes[2];
  end if;

  perform pg_advisory_xact_lock(hashtext('caverne:' || v_moi));
  select * into v_vieille from caverne_parties where discord_id = v_moi for update;
  if found then v_reglee := caverne_regler(v_vieille); end if;

  if p_jeu = 'dragon' then
    if p_option is not null and (p_option < 1.01 or p_option > 100) then raise exception 'L''encaissement automatique va de ×1,01 à ×100.'; end if;
    -- le réveil : ×0,97/(1-r), au centième, de ×1 à ×100 (1 chance sur 100 environ de se réveiller tout de suite)
    v_etat := jsonb_build_object('reveil', least(greatest(floor(97 / (1 - random())) / 100, 1), 100),
                                 'auto', round(p_option, 2));
  elsif p_jeu = 'bourses' then
    v_n := coalesce(p_option, 3)::int;
    if v_n not in (1, 3, 5, 8, 12) then raise exception 'Choisis 1, 3, 5, 8 ou 12 cristaux maudits.'; end if;
    select array_agg(c) into v_maudites from (select c from generate_series(0, 24) c order by random() limit v_n) x;
    v_etat := jsonb_build_object('maudites_nb', v_n, 'maudites', to_jsonb(v_maudites), 'ouvertes', '[]'::jsonb);
  elsif p_jeu = 'pont' then
    v_etat := jsonb_build_object('position', 0);
  elsif p_jeu = 'lac' then
    -- la prise (secrète) : 1 poisson (45 %), 2 pièce (30 %), 3 cristal (18 %), 4 créature géante (7 %)
    v_r := random();
    v_n := case when v_r < .45 then 1 when v_r < .75 then 2 when v_r < .93 then 3 else 4 end;
    v_etat := jsonb_build_object('prise', v_n, 'tirages', 0, 'tension', 0);
  else
    v_etat := jsonb_build_object('manche', 0, 'pv', 100, 'pv_liche', 85, 'potions', 3,
                                 'intention', case when random() < .3 then 1 else 0 end);
  end if;

  perform caverne_bouger(v_moi, p_monnaie, -p_mise);
  insert into caverne_parties (discord_id, jeu, monnaie, mise, etat) values (v_moi, p_jeu, p_monnaie, p_mise, v_etat);
  return jsonb_build_object('jeu', p_jeu, 'monnaie', p_monnaie, 'mise', p_mise, 'bourse', caverne_bourse(v_moi), 'reglee', v_reglee,
    -- le Roi Liche : tout est à la vue du joueur (PV, potions, ce qu'il prépare)
    'liche', case when p_jeu = 'liche' then v_etat || jsonb_build_object('pv_liche_max', 85) end);
end;
$$;

-- Le Dragon : s'est-il réveillé ? (le navigateur demande régulièrement) -> { fini: false } ou la fin de la partie
create or replace function public.caverne_dragon_voir()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_p caverne_parties;
begin
  select * into v_p from caverne_parties where discord_id = my_discord_id() and jeu = 'dragon' for update;
  if not found then return jsonb_build_object('fini', true, 'absente', true); end if;
  return coalesce(caverne_dragon_bilan(v_p, false), jsonb_build_object('fini', false));
end;
$$;

-- Les Bourses : ouvrir la bourse p_case (0 à 24)
create or replace function public.caverne_bourse_ouvrir(p_case int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_p caverne_parties;
  v_m numeric;
begin
  if p_case is null or p_case not between 0 and 24 then raise exception 'Bourse inconnue.'; end if;
  select * into v_p from caverne_parties where discord_id = my_discord_id() and jeu = 'bourses' for update;
  if not found then raise exception 'Pose d''abord ta mise.'; end if;
  if v_p.etat -> 'ouvertes' @> to_jsonb(p_case) then raise exception 'Cette bourse est déjà ouverte.'; end if;

  if v_p.etat -> 'maudites' @> to_jsonb(p_case) then
    return caverne_clore(v_p, null, jsonb_build_object('maudite', true, 'maudites', v_p.etat -> 'maudites'));
  end if;
  v_p.etat := jsonb_set(v_p.etat, '{ouvertes}', (v_p.etat -> 'ouvertes') || to_jsonb(p_case));
  v_m := caverne_multiplicateur('bourses', v_p.etat);
  -- toutes les bourses sûres ouvertes : on encaisse d'office
  if jsonb_array_length(v_p.etat -> 'ouvertes') >= 25 - (v_p.etat ->> 'maudites_nb')::int then
    return caverne_clore(v_p, v_m, jsonb_build_object('maudite', false, 'maudites', v_p.etat -> 'maudites'));
  end if;
  update caverne_parties set etat = v_p.etat where discord_id = v_p.discord_id;
  return jsonb_build_object('fini', false, 'maudite', false, 'ouvertes', jsonb_array_length(v_p.etat -> 'ouvertes'), 'multiplicateur', v_m);
end;
$$;

-- Le Pont : avancer d'une planche ou en sauter deux (chacune peut céder)
create or replace function public.caverne_pont_avancer(p_pas int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_p   caverne_parties;
  v_pos int;
  v_but int;
begin
  if p_pas not in (1, 2) then raise exception 'On avance d''une planche, ou on en saute deux.'; end if;
  select * into v_p from caverne_parties where discord_id = my_discord_id() and jeu = 'pont' for update;
  if not found then raise exception 'Pose d''abord ta mise.'; end if;
  v_pos := (v_p.etat ->> 'position')::int;
  v_but := v_pos + p_pas;
  if v_but > 12 then raise exception 'Il ne reste plus assez de planches.'; end if;

  for i in v_pos + 1 .. v_but loop
    if random() < caverne_pont_risque(i) then
      return caverne_clore(v_p, null, jsonb_build_object('tombe', true, 'planche', v_but));
    end if;
  end loop;
  v_p.etat := jsonb_set(v_p.etat, '{position}', to_jsonb(v_but));
  if v_but = 12 then   -- le trésor, de l'autre côté
    return caverne_clore(v_p, caverne_multiplicateur('pont', v_p.etat), jsonb_build_object('tombe', false, 'position', 12));
  end if;
  update caverne_parties set etat = v_p.etat where discord_id = v_p.discord_id;
  return jsonb_build_object('fini', false, 'tombe', false, 'position', v_but, 'multiplicateur', caverne_multiplicateur('pont', v_p.etat));
end;
$$;

-- Le Lac : un tirage de plus. La ligne peut casser (selon la prise) ; sinon la tension monte, d'autant plus
-- que la prise est lourde (8, 13, 19 ou 27 par tirage, à 4 près). Au 5e tirage, la prise sort de l'eau.
create or replace function public.caverne_lac_tirer()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_p       caverne_parties;
  v_prise   int;
  v_n       int;
  v_tension int;
  v_hausse  int;
begin
  select * into v_p from caverne_parties where discord_id = my_discord_id() and jeu = 'lac' for update;
  if not found then raise exception 'Lance d''abord ta ligne.'; end if;
  v_prise := (v_p.etat ->> 'prise')::int;
  v_n := (v_p.etat ->> 'tirages')::int + 1;
  v_tension := (v_p.etat ->> 'tension')::int;

  if random() < (array[.01, .04, .10, .22])[v_prise] then
    return caverne_clore(v_p, null, jsonb_build_object('casse', true, 'prise', v_prise, 'tirages', v_n, 'tension', v_tension));
  end if;
  v_hausse := (array[8, 13, 19, 27])[v_prise] + floor(random() * 9)::int - 4;
  v_tension := v_tension + v_hausse;
  v_p.etat := v_p.etat || jsonb_build_object('tirages', v_n, 'tension', v_tension);
  if v_n >= 5 then   -- la prise sort de l'eau
    return caverne_clore(v_p, (array[.3, 1.2, 2.4, 10]::numeric[])[v_prise],
      jsonb_build_object('casse', false, 'prise', v_prise, 'tirages', v_n, 'tension', v_tension, 'hausse', v_hausse));
  end if;
  update caverne_parties set etat = v_p.etat where discord_id = v_p.discord_id;
  return jsonb_build_object('fini', false, 'tirages', v_n, 'tension', v_tension, 'hausse', v_hausse);
end;
$$;

-- Le Roi Liche : un échange. p_action : 'attaque' (12 à 24, 1 chance sur 10 de doubler), 'defense' (riposte de 5 à 10,
-- et ses coups ne font qu'un quart), 'soin' (une potion : +20 à 30 PV). Puis il frappe s'il tient encore debout :
-- 24 à 36 (+2 par manche), ×2,2 s'il préparait un sort (annoncé d'avance, 3 fois sur 10).
-- Manche gagnée : ses PV remontent (85, 90, 95, 100, 105), les tiens aussi (100). À 0 PV, tout est perdu.
create or replace function public.caverne_liche_agir(p_action text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_p      caverne_parties;
  v_manche int;
  v_pv     int;
  v_pvl    int;
  v_sort   int;
  v_pot    int;
  v_degats int := 0;
  v_crit   boolean := false;
  v_soin   int := 0;
  v_recu   int := 0;
  v_gagnee boolean := false;
  v_infos  jsonb;
begin
  if p_action is null or p_action not in ('attaque', 'defense', 'soin') then raise exception 'Attaque, défense ou soin.'; end if;
  select * into v_p from caverne_parties where discord_id = my_discord_id() and jeu = 'liche' for update;
  if not found then raise exception 'Défie d''abord le Roi Liche.'; end if;
  v_manche := (v_p.etat ->> 'manche')::int;
  v_pv := (v_p.etat ->> 'pv')::int;
  v_pvl := (v_p.etat ->> 'pv_liche')::int;
  v_sort := (v_p.etat ->> 'intention')::int;
  v_pot := (v_p.etat ->> 'potions')::int;

  if p_action = 'attaque' then
    v_degats := 12 + floor(random() * 13)::int;
    if random() < .1 then v_degats := v_degats * 2; v_crit := true; end if;
  elsif p_action = 'defense' then
    v_degats := 5 + floor(random() * 6)::int;
  else
    if v_pot <= 0 then raise exception 'Tu n''as plus de potion.'; end if;
    if v_pv >= 100 then raise exception 'Tu es déjà en pleine forme.'; end if;
    v_soin := least(100, v_pv + 20 + floor(random() * 11)::int) - v_pv;
    v_pv := v_pv + v_soin;
    v_pot := v_pot - 1;
  end if;
  v_pvl := v_pvl - v_degats;
  if v_pvl > 0 then
    v_recu := round((24 + 2 * v_manche + floor(random() * 13))::numeric
                    * case when v_sort = 1 then 2.2 else 1 end * case when p_action = 'defense' then .25 else 1 end)::int;
    v_pv := v_pv - v_recu;
  end if;
  v_infos := jsonb_build_object('action', p_action, 'degats', v_degats, 'critique', v_crit, 'soin', v_soin,
                                'recu', v_recu, 'sort', v_sort = 1);

  if v_pv <= 0 then
    return caverne_clore(v_p, null, v_infos || jsonb_build_object('mort', true, 'manche', v_manche, 'pv', 0, 'pv_liche', v_pvl, 'potions', v_pot));
  end if;
  if v_pvl <= 0 then
    v_manche := v_manche + 1;
    v_gagnee := true;
    if v_manche = 5 then
      return caverne_clore(v_p, 19.2, v_infos || jsonb_build_object('victoire', true, 'manche', 5, 'pv', v_pv, 'pv_liche', 0, 'potions', v_pot));
    end if;
    v_pv := 100;
    v_pvl := (array[85, 90, 95, 100, 105])[v_manche + 1];
  end if;
  v_p.etat := jsonb_build_object('manche', v_manche, 'pv', v_pv, 'pv_liche', v_pvl, 'potions', v_pot,
                                 'intention', case when random() < .3 then 1 else 0 end);
  update caverne_parties set etat = v_p.etat where discord_id = v_p.discord_id;
  return jsonb_build_object('fini', false, 'manche_gagnee', v_gagnee, 'pv_liche_max', (array[85, 90, 95, 100, 105])[v_manche + 1],
    'multiplicateur', caverne_multiplicateur('liche', v_p.etat)) || v_infos || v_p.etat;
end;
$$;

-- Encaisser (tous les jeux) : le dragon, au multiplicateur du moment (s'il dort encore) ; le lac, couper la ligne ;
-- le Roi Liche, fuir ; les autres, au gain actuel
create or replace function public.caverne_encaisser()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_p caverne_parties;
begin
  select * into v_p from caverne_parties where discord_id = my_discord_id() for update;
  if not found then return jsonb_build_object('fini', true, 'absente', true); end if;
  if v_p.jeu = 'bourses' and jsonb_array_length(v_p.etat -> 'ouvertes') = 0 then raise exception 'Ouvre d''abord une bourse.'; end if;
  if v_p.jeu = 'pont' and (v_p.etat ->> 'position')::int = 0 then raise exception 'Avance d''abord d''une planche.'; end if;
  if v_p.jeu = 'bourses' then
    return caverne_clore(v_p, caverne_multiplicateur('bourses', v_p.etat), jsonb_build_object('maudites', v_p.etat -> 'maudites'));
  end if;
  return caverne_regler(v_p);
end;
$$;

revoke all on function public.caverne_commencer(text, text, int, numeric), public.caverne_dragon_voir(),
  public.caverne_bourse_ouvrir(int), public.caverne_pont_avancer(int), public.caverne_lac_tirer(),
  public.caverne_liche_agir(text), public.caverne_encaisser() from public, anon;
grant execute on function public.caverne_commencer(text, text, int, numeric), public.caverne_dragon_voir(),
  public.caverne_bourse_ouvrir(int), public.caverne_pont_avancer(int), public.caverne_lac_tirer(),
  public.caverne_liche_agir(text), public.caverne_encaisser() to authenticated;


-- ---------------------------------------------------------------------
--  Surveillance (SQL Editor) : select * from admin.caverne_bilan;
--  Par joueur sur 7 jours : ce qu'il a misé, ce qui lui est revenu, et le solde pour lui
-- ---------------------------------------------------------------------
create or replace view admin.caverne_bilan as
  select discord_id, monnaie, count(*) as parties, sum(mise) as mise, sum(gain) as gains, sum(gain) - sum(mise) as solde
  from public.caverne_historique where joue_le > now() - interval '7 days'
  group by discord_id, monnaie order by solde desc;
revoke all on admin.caverne_bilan from public, anon, authenticated;
