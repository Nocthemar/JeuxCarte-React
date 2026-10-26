-- =====================================================================
--  Duel des Couronnes — schéma complet de la base Supabase (projet NEUF)
--
--  Recrée en une fois, dans le bon ordre, tout ce que les fichiers ancien/SQL/*.sql avaient installé
--  morceau par morceau : tables, fonctions, règles RLS, triggers, droits, et les règles Realtime des
--  salons privés du duel en ligne.
--
--  À lancer UNE fois dans Supabase > SQL Editor d'un projet VIDE (puis supabase/securite.sql et supabase/donnees.sql).
--  ⚠️ securite.sql REMPLACE plusieurs fonctions d'ici (création des profils, Offrande, recyclage, échanges,
--  salons, MJ, suppression de compte) : ne jamais relancer schema.sql seul sur un projet où securite.sql a tourné
--  sans relancer securite.sql juste après.
--  Relançable sans casse (create … if not exists, create or replace, drop policy if exists).
--
--  ⚠️ PARTIE 1 (tables du site Nocthémar et du bot Discord : players, wallets, transactions, items,
--  inventory, daily_shop et leurs fonctions) : ces objets n'existent dans AUCUN fichier de ancien/SQL.
--  Ils ont été RECONSTITUÉS à partir de ce que le jeu en lit et en écrit. Ils suffisent pour développer,
--  mais peuvent différer du vrai projet (voir supabase/LISEZ-MOI.md pour les comparer).
--
--  Différences voulues avec l'ancienne installation (le résultat final est le même) :
--    - plus de migrations (« Fée » -> « Elfe », rare -> mythique, PNG -> webp…) : on crée directement l'état final ;
--    - plus de blocs qui ajoutent 'histoire', 'pass', 'echange' à transactions.source : la liste est complète d'emblée ;
--    - les fonctions des anciennes lettres d'échange (proposer_echange, accepter_echange, refuser_echange,
--      annuler_echange) ne sont pas recréées : commerce.sql les avait fermées à tout le monde ;
--    - les droits SELECT sont donnés explicitement (partie 14) au lieu de compter sur ceux que Supabase
--      donnait par défaut aux anciens projets.
-- =====================================================================


-- =====================================================================
--  PARTIE 1 — Tables partagées avec le site Nocthémar et le bot Discord (RECONSTITUÉES)
-- =====================================================================

-- Objets et cosmétiques (bannières, titres, thèmes, objets de pouvoir…)
--   kind : banner, title, theme, rp (objet), wallpaper, access, other (libellés de l'ancien JS/commun.js)
--   shop : 'fun' = boutique des apparences ; les objets du marchand du jour sont listés dans daily_shop
--   payload : banner {image}, title {text}, theme {accent, accent2}, autres {image}
create table if not exists public.items (
  id           bigint generated always as identity primary key,
  name         text not null,
  kind         text not null default 'other',
  shop         text,
  price        int check (price is null or price >= 0),
  is_available boolean not null default true,
  description  text,
  payload      jsonb not null default '{}'::jsonb,
  echangeable  boolean not null default true,   -- false : ne peut entrer dans aucun contrat du Marché (commerce.sql)
  created_at   timestamptz not null default now()
);

-- Les joueurs : un compte Discord = une ligne (créée à la première connexion, partie 1 bis)
-- Les noms des clés étrangères comptent : le profil les cite (items!players_banner_item_id_fkey)
create table if not exists public.players (
  discord_id     text primary key,
  user_id        uuid unique references auth.users(id) on delete set null,
  username       text,
  avatar_url     text,
  is_mj          boolean not null default false,
  banner_item_id bigint,
  title_item_id  bigint,
  theme_item_id  bigint,
  created_at     timestamptz not null default now(),
  constraint players_banner_item_id_fkey foreign key (banner_item_id) references public.items(id) on delete set null,
  constraint players_title_item_id_fkey  foreign key (title_item_id)  references public.items(id) on delete set null,
  constraint players_theme_item_id_fkey  foreign key (theme_item_id)  references public.items(id) on delete set null
);

-- La bourse (or du jeu)
create table if not exists public.wallets (
  discord_id text primary key references public.players(discord_id) on delete cascade,
  balance    int not null default 0 check (balance >= 0)
);
-- Les cristaux : la seconde monnaie (affichée, aucun moyen d'en gagner ni d'en dépenser pour l'instant)
alter table public.wallets add column if not exists cristaux int not null default 0 check (cristaux >= 0);

-- L'historique des pièces
create table if not exists public.transactions (
  id         bigint generated always as identity primary key,
  discord_id text not null,
  amount     int  not null,
  source     text not null check (source in (
               'boutique', 'boutique_fun', 'boutique_jour', 'histoire', 'pass', 'echange', 'succes', 'mj', 'bot')),
  reason     text,
  created_at timestamptz not null default now()
);
create index if not exists transactions_joueur on public.transactions (discord_id, created_at desc);

-- Les objets possédés (un exemplaire de chaque objet par joueur)
create table if not exists public.inventory (
  id          bigint generated always as identity primary key,
  discord_id  text   not null references public.players(discord_id) on delete cascade,
  item_id     bigint not null references public.items(id) on delete cascade,
  acquired_at timestamptz not null default now(),
  unique (discord_id, item_id)
);

-- La boutique du marchand : une sélection par créneau (slot), écrite par le bot Discord
create table if not exists public.daily_shop (
  slot    text   not null,
  item_id bigint not null references public.items(id) on delete cascade,
  price   int    not null check (price >= 0),
  stock   int    not null default 1 check (stock >= 0),
  primary key (slot, item_id)
);


-- ---------------------------------------------------------------------
--  1 bis. Le joueur connecté, et la création de son profil à la première connexion Discord
-- ---------------------------------------------------------------------
create or replace function public.my_discord_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select discord_id from players where user_id = auth.uid();
$$;

-- À chaque nouveau compte (auth.users) : son profil players (lié par l'identifiant Discord) et sa bourse.
-- Un profil déjà créé par le bot (même discord_id, sans compte) est simplement rattaché au compte.
create or replace function public.creer_profil_joueur()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_discord text := coalesce(v_meta ->> 'provider_id', v_meta ->> 'sub');
  v_nom text := coalesce(v_meta -> 'custom_claims' ->> 'global_name', v_meta ->> 'full_name', v_meta ->> 'name', 'Aventurier');
begin
  if v_discord is null then return new; end if;   -- pas un compte Discord
  insert into players (discord_id, user_id, username, avatar_url)
  values (v_discord, new.id, v_nom, v_meta ->> 'avatar_url')
  on conflict (discord_id) do update
    set user_id = excluded.user_id,
        username = coalesce(players.username, excluded.username),
        avatar_url = excluded.avatar_url;
  insert into wallets (discord_id) values (v_discord) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists creer_profil_joueur on auth.users;
create trigger creer_profil_joueur
  after insert on auth.users
  for each row execute function public.creer_profil_joueur();

-- L'avatar Discord suit les changements (mis à jour à chaque connexion par Supabase)
create or replace function public.maj_avatar_joueur()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update players set avatar_url = new.raw_user_meta_data ->> 'avatar_url'
  where user_id = new.id and avatar_url is distinct from new.raw_user_meta_data ->> 'avatar_url';
  return new;
end;
$$;

drop trigger if exists maj_avatar_joueur on auth.users;
create trigger maj_avatar_joueur
  after update of raw_user_meta_data on auth.users
  for each row execute function public.maj_avatar_joueur();


-- ---------------------------------------------------------------------
--  1 ter. La boutique (fonctions du site, RECONSTITUÉES)
-- ---------------------------------------------------------------------
-- Le créneau en cours de la boutique du marchand : un par jour (heure de Paris)
create or replace function public.current_shop_slot()
returns text
language sql
stable
as $$
  select to_char((now() at time zone 'Europe/Paris')::date, 'YYYY-MM-DD');
$$;

-- Le prochain renouvellement : minuit, heure de Paris
create or replace function public.next_shop_refresh()
returns timestamptz
language sql
stable
as $$
  select (((now() at time zone 'Europe/Paris')::date + 1)::timestamp) at time zone 'Europe/Paris';
$$;

-- Acheter un objet du marchand du jour (stock, solde et doublon vérifiés ici). Renvoie { item, price }
create or replace function public.buy_daily_item(p_item_id bigint)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi   text := my_discord_id();
  v_ligne daily_shop%rowtype;
  v_item  items%rowtype;
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  select * into v_ligne from daily_shop where slot = current_shop_slot() and item_id = p_item_id for update;
  if not found then raise exception 'Cet objet n''est pas chez le marchand aujourd''hui.'; end if;
  if v_ligne.stock <= 0 then raise exception 'Cet objet est épuisé.'; end if;
  if exists (select 1 from inventory where discord_id = v_moi and item_id = p_item_id) then
    raise exception 'Tu possèdes déjà cet objet.';
  end if;
  select * into v_item from items where id = p_item_id;

  update wallets set balance = balance - v_ligne.price where discord_id = v_moi and balance >= v_ligne.price;
  if not found then raise exception 'Pas assez de pièces.'; end if;
  update daily_shop set stock = stock - 1 where slot = v_ligne.slot and item_id = p_item_id;
  insert into inventory (discord_id, item_id) values (v_moi, p_item_id);
  insert into transactions (discord_id, amount, source, reason)
  values (v_moi, -v_ligne.price, 'boutique_jour', 'Marchand : ' || v_item.name);
  return json_build_object('item', v_item.name, 'price', v_ligne.price);
end;
$$;

-- Acheter un cosmétique de la boutique des apparences. Renvoie { item, price }
create or replace function public.buy_fun_item(p_item_id bigint)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi  text := my_discord_id();
  v_item items%rowtype;
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  select * into v_item from items where id = p_item_id;
  if not found or v_item.shop is distinct from 'fun' or not v_item.is_available or v_item.price is null then
    raise exception 'Cet objet n''est pas en vente.';
  end if;
  perform pg_advisory_xact_lock(hashtext('inventory:' || v_moi));
  if exists (select 1 from inventory where discord_id = v_moi and item_id = p_item_id) then
    raise exception 'Tu possèdes déjà cet objet.';
  end if;

  update wallets set balance = balance - v_item.price where discord_id = v_moi and balance >= v_item.price;
  if not found then raise exception 'Pas assez de pièces.'; end if;
  insert into inventory (discord_id, item_id) values (v_moi, p_item_id);
  insert into transactions (discord_id, amount, source, reason)
  values (v_moi, -v_item.price, 'boutique_fun', v_item.name);
  return json_build_object('item', v_item.name, 'price', v_item.price);
end;
$$;

-- Équiper une bannière, un titre ou un thème possédé
create or replace function public.equip_cosmetic(p_item_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi  text := my_discord_id();
  v_kind text;
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  select i.kind into v_kind from inventory inv join items i on i.id = inv.item_id
  where inv.discord_id = v_moi and inv.item_id = p_item_id;
  if not found then raise exception 'Tu ne possèdes pas cet objet.'; end if;
  if v_kind = 'banner' then update players set banner_item_id = p_item_id where discord_id = v_moi;
  elsif v_kind = 'title' then update players set title_item_id = p_item_id where discord_id = v_moi;
  elsif v_kind = 'theme' then update players set theme_item_id = p_item_id where discord_id = v_moi;
  else raise exception 'Cet objet ne s''équipe pas.';
  end if;
end;
$$;

-- Retirer la bannière, le titre ou le thème équipé
create or replace function public.unequip_cosmetic(p_kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi text := my_discord_id();
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  if p_kind = 'banner' then update players set banner_item_id = null where discord_id = v_moi;
  elsif p_kind = 'title' then update players set title_item_id = null where discord_id = v_moi;
  elsif p_kind = 'theme' then update players set theme_item_id = null where discord_id = v_moi;
  else raise exception 'Type inconnu.';
  end if;
end;
$$;


-- ---------------------------------------------------------------------
--  1 quater. Sécurité des tables du site
--  (les règles vérifiées par ancien/SQL/verifier_droits_site.sql : aucun joueur n'écrit directement)
-- ---------------------------------------------------------------------
alter table public.items        enable row level security;
alter table public.players      enable row level security;
alter table public.wallets      enable row level security;
alter table public.transactions enable row level security;
alter table public.inventory    enable row level security;
alter table public.daily_shop   enable row level security;

drop policy if exists "objets lisibles par tous" on public.items;
create policy "objets lisibles par tous" on public.items for select to anon, authenticated using (true);
drop policy if exists "profils lisibles par tous" on public.players;
create policy "profils lisibles par tous" on public.players for select to anon, authenticated using (true);
drop policy if exists "je lis ma bourse" on public.wallets;
create policy "je lis ma bourse" on public.wallets for select to authenticated using (discord_id = public.my_discord_id());
drop policy if exists "je lis mes transactions" on public.transactions;
create policy "je lis mes transactions" on public.transactions for select to authenticated using (discord_id = public.my_discord_id());
drop policy if exists "je lis mon inventaire" on public.inventory;
create policy "je lis mon inventaire" on public.inventory for select to authenticated using (discord_id = public.my_discord_id());
drop policy if exists "marchand lisible par tous" on public.daily_shop;
create policy "marchand lisible par tous" on public.daily_shop for select to anon, authenticated using (true);


-- =====================================================================
--  PARTIE 2 — Les cartes : catalogue, collection (grimoire), deck du profil
--  (ancien/SQL/cartes_collection.sql, cartes_infos.sql, carte_maitre_du_jeu_infos.sql, doublons.sql)
-- =====================================================================

-- Vérifie une attaque de carte : une Veine connue (ou « destin », le Maître du Jeu) et un nom
create or replace function public.card_attack_is_valid(a jsonb)
returns boolean
language sql
immutable
as $$
  select a is null or (
    jsonb_typeof(a) = 'object'
    and a->>'veine' in ('sang', 'trone', 'regard', 'reve', 'tombeau', 'bete',
                        'forge', 'maree', 'racine', 'esprit', 'ombre', 'chaine',
                        'destin')   -- destin : hors Veines, pouvoirs du Maître du Jeu
    and coalesce(btrim(a->>'nom'), '') <> ''
    and (a->'puissance' is null or jsonb_typeof(a->'puissance') in ('number', 'string', 'null'))
  );
$$;

-- Catalogue des cartes (lisible par tous)
create table if not exists public.cards (
  id           bigint generated always as identity primary key,
  name         text not null,
  image        text,                    -- chemin depuis la racine du jeu, ex : img/Cartes/Dalek-Carte.webp
  rarity       text not null default 'commune'
               constraint cards_rarity_check check (rarity in ('commune', 'eveillee', 'mythique', 'legendaire', 'transcendante')),
  description  text,
  price        integer check (price is null or price >= 0),   -- null = pas en vente
  source       text not null default 'boutique'
               check (source in ('boutique', 'recompense', 'evenement', 'discord')),
  is_available boolean not null default false,
  payload      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  rank         smallint constraint cards_rank_check check (rank is null or rank between 1 and 5),   -- Rang I = le plus puissant
  attack_1     jsonb constraint cards_attack_1_check check (public.card_attack_is_valid(attack_1)),
  attack_2     jsonb constraint cards_attack_2_check check (public.card_attack_is_valid(attack_2))
);

-- Cartes possédées, leur emplacement dans le grimoire (page 1 à 100, 9 pochettes) et leurs exemplaires
create table if not exists public.player_cards (
  discord_id  text     not null references public.players(discord_id) on delete cascade,
  card_id     bigint   not null references public.cards(id) on delete cascade,
  page        smallint not null check (page between 1 and 100),
  slot        smallint not null check (slot between 1 and 9),
  source      text     not null default 'boutique',
  obtained_at timestamptz not null default now(),
  quantite    int      not null default 1 check (quantite >= 1),   -- exemplaires (doublons)
  primary key (discord_id, card_id),
  -- Vérifiée en fin de transaction : permet d'échanger deux cartes de place
  constraint player_cards_emplacement_unique unique (discord_id, page, slot) deferrable initially deferred
);

-- Deck du profil : un nom + 5 emplacements (les favorites)
create table if not exists public.player_decks (
  discord_id text primary key references public.players(discord_id) on delete cascade,
  name       text not null default 'Deck de cartes' check (char_length(name) between 1 and 40),
  updated_at timestamptz not null default now()
);

create table if not exists public.player_deck_cards (
  discord_id text     not null,
  position   smallint not null check (position between 1 and 5),
  card_id    bigint   not null references public.cards(id) on delete cascade,
  primary key (discord_id, position),
  unique (discord_id, card_id),
  -- Une carte du deck doit être possédée ; si elle quitte la collection, elle quitte le deck
  foreign key (discord_id, card_id) references public.player_cards(discord_id, card_id) on delete cascade
);

-- Placement automatique : une nouvelle carte sans emplacement va dans la première pochette libre
create or replace function public.place_new_card()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.page is null or new.slot is null then
    -- Deux cartes reçues en même temps ne doivent pas viser la même pochette
    perform pg_advisory_xact_lock(hashtext('player_cards:' || new.discord_id));

    select p.page, s.slot into new.page, new.slot
    from generate_series(1, 100) as p(page)
    cross join generate_series(1, 9) as s(slot)
    where not exists (
      select 1 from player_cards pc
      where pc.discord_id = new.discord_id and pc.page = p.page and pc.slot = s.slot
    )
    order by p.page, s.slot
    limit 1;

    if new.page is null then
      raise exception 'Le grimoire de ce joueur est plein.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists player_cards_place_new on public.player_cards;
create trigger player_cards_place_new
  before insert on public.player_cards
  for each row execute function public.place_new_card();

alter table public.cards             enable row level security;
alter table public.player_cards      enable row level security;
alter table public.player_decks      enable row level security;
alter table public.player_deck_cards enable row level security;

drop policy if exists "cartes lisibles par tous" on public.cards;
create policy "cartes lisibles par tous" on public.cards
  for select to anon, authenticated using (true);
drop policy if exists "decks lisibles par tous" on public.player_decks;
create policy "decks lisibles par tous" on public.player_decks
  for select to anon, authenticated using (true);
drop policy if exists "cartes des decks lisibles par tous" on public.player_deck_cards;
create policy "cartes des decks lisibles par tous" on public.player_deck_cards
  for select to anon, authenticated using (true);
-- Collection : le joueur lit ses cartes et ne peut modifier QUE leur emplacement
drop policy if exists "je lis mes cartes" on public.player_cards;
create policy "je lis mes cartes" on public.player_cards
  for select to authenticated using (discord_id = public.my_discord_id());
drop policy if exists "je range mes cartes" on public.player_cards;
create policy "je range mes cartes" on public.player_cards
  for update to authenticated
  using (discord_id = public.my_discord_id())
  with check (discord_id = public.my_discord_id());

-- move_card : range une carte dans une pochette ; si elle est occupée, les deux cartes échangent leur place
create or replace function public.move_card(p_card_id bigint, p_page int, p_slot int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi text := my_discord_id();
  v_page smallint;
  v_slot smallint;
begin
  if v_moi is null then
    raise exception 'Connecte-toi d''abord.';
  end if;
  if p_page not between 1 and 100 or p_slot not between 1 and 9 then
    raise exception 'Emplacement invalide.';
  end if;

  select page, slot into v_page, v_slot
  from player_cards
  where discord_id = v_moi and card_id = p_card_id
  for update;

  if not found then
    raise exception 'Tu ne possèdes pas cette carte.';
  end if;
  if v_page = p_page and v_slot = p_slot then
    return;
  end if;

  -- La carte déjà présente (s'il y en a une) prend l'ancienne place
  update player_cards set page = v_page, slot = v_slot
  where discord_id = v_moi and page = p_page and slot = p_slot;

  update player_cards set page = p_page, slot = p_slot
  where discord_id = v_moi and card_id = p_card_id;
end;
$$;

-- set_deck : remplace tout le deck (5 valeurs max, dans l'ordre ; null = emplacement vide)
create or replace function public.set_deck(p_card_ids bigint[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi text := my_discord_id();
begin
  if v_moi is null then
    raise exception 'Connecte-toi d''abord.';
  end if;
  if coalesce(array_length(p_card_ids, 1), 0) > 5 then
    raise exception 'Un deck contient 5 cartes au maximum.';
  end if;
  if (select count(c) <> count(distinct c) from unnest(p_card_ids) c) then
    raise exception 'Une carte ne peut figurer qu''une fois dans le deck.';
  end if;
  if exists (
    select 1 from unnest(p_card_ids) c
    where c is not null
      and not exists (select 1 from player_cards pc where pc.discord_id = v_moi and pc.card_id = c)
  ) then
    raise exception 'Tu ne peux mettre dans ton deck que des cartes que tu possèdes.';
  end if;

  insert into player_decks (discord_id) values (v_moi)
  on conflict (discord_id) do update set updated_at = now();

  delete from player_deck_cards where discord_id = v_moi;

  insert into player_deck_cards (discord_id, position, card_id)
  select v_moi, t.pos, t.c
  from unnest(p_card_ids) with ordinality as t(c, pos)
  where t.c is not null;
end;
$$;

-- rename_deck : nom personnalisé du deck (1 à 40 caractères)
create or replace function public.rename_deck(p_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi text := my_discord_id();
  v_nom text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
begin
  if v_moi is null then
    raise exception 'Connecte-toi d''abord.';
  end if;
  if char_length(v_nom) not between 1 and 40 then
    raise exception 'Le nom du deck doit faire entre 1 et 40 caractères.';
  end if;

  insert into player_decks (discord_id, name) values (v_moi, v_nom)
  on conflict (discord_id) do update set name = excluded.name, updated_at = now();

  return v_nom;
end;
$$;

-- grant_card : donne une carte (récompense, événement, bot, MJ). Réservé au serveur et aux MJ.
-- Renvoie false si le joueur l'avait déjà.
create or replace function public.grant_card(p_discord_id text, p_card_id bigint, p_source text default 'recompense')
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  -- auth.uid() est null pour le bot (service_role) et dans le SQL Editor ; un joueur connecté doit être MJ
  if auth.uid() is not null
     and not exists (select 1 from players where user_id = auth.uid() and is_mj) then
    raise exception 'Réservé aux MJ.';
  end if;
  if not exists (select 1 from cards where id = p_card_id) then
    raise exception 'Carte inconnue.';
  end if;

  insert into player_cards (discord_id, card_id, source)
  values (p_discord_id, p_card_id, coalesce(p_source, 'recompense'))
  on conflict (discord_id, card_id) do nothing;

  return found;
end;
$$;

-- buy_card : achat d'une carte en boutique (solde, disponibilité et doublon vérifiés ici)
create or replace function public.buy_card(p_card_id bigint)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi  text := my_discord_id();
  v_card cards%rowtype;
begin
  if v_moi is null then
    raise exception 'Connecte-toi d''abord.';
  end if;

  select * into v_card from cards where id = p_card_id;
  if not found or not v_card.is_available or v_card.price is null or v_card.source <> 'boutique' then
    raise exception 'Cette carte n''est pas en vente.';
  end if;
  if exists (select 1 from player_cards where discord_id = v_moi and card_id = p_card_id) then
    raise exception 'Tu possèdes déjà cette carte.';
  end if;

  update wallets set balance = balance - v_card.price
  where discord_id = v_moi and balance >= v_card.price;
  if not found then
    raise exception 'Pas assez de pièces.';
  end if;

  insert into transactions (discord_id, amount, source, reason)
  values (v_moi, -v_card.price, 'boutique_fun', 'Carte : ' || v_card.name);

  insert into player_cards (discord_id, card_id, source) values (v_moi, p_card_id, 'boutique');

  return json_build_object('card', v_card.name, 'price', v_card.price);
end;
$$;


-- =====================================================================
--  PARTIE 3 — Boosters (ancien/SQL/boosters.sql, booster_gratuit.sql)
-- =====================================================================
create table if not exists public.boosters (
  id        text primary key,
  nom       text not null,
  prix      int  not null check (prix >= 0),          -- en or du jeu
  nb_cartes int  not null default 3 check (nb_cartes between 1 and 10),
  image     text,
  en_vente  boolean not null default true,
  -- chances (en %) de chaque rareté, pour chaque carte tirée
  chances   jsonb not null default '{"commune": 60, "eveillee": 25, "mythique": 10, "legendaire": 4, "transcendante": 1}'
);

create table if not exists public.booster_cartes (
  booster_id text   not null references public.boosters(id) on delete cascade,
  card_id    bigint not null references public.cards(id) on delete cascade,
  primary key (booster_id, card_id)
);

create table if not exists public.player_boosters (
  discord_id text not null,
  booster_id text not null references public.boosters(id) on delete cascade,
  quantite   int  not null default 0 check (quantite >= 0),
  primary key (discord_id, booster_id)
);

create table if not exists public.booster_ouvertures (
  id         bigint generated always as identity primary key,
  discord_id text not null,
  booster_id text not null,
  cartes     jsonb not null,
  ouvert_le  timestamptz not null default now()
);
create index if not exists booster_ouvertures_joueur on public.booster_ouvertures (discord_id, ouvert_le desc);

-- Le dernier booster gratuit de chaque joueur (un toutes les 10 minutes)
create table if not exists public.player_booster_gratuit (
  discord_id text primary key,
  dernier    timestamptz not null default now()
);

alter table public.boosters               enable row level security;
alter table public.booster_cartes         enable row level security;
alter table public.player_boosters        enable row level security;
alter table public.booster_ouvertures     enable row level security;
alter table public.player_booster_gratuit enable row level security;

drop policy if exists "boosters lisibles par tous" on public.boosters;
create policy "boosters lisibles par tous" on public.boosters
  for select to anon, authenticated using (true);
drop policy if exists "cartes des boosters lisibles par tous" on public.booster_cartes;
create policy "cartes des boosters lisibles par tous" on public.booster_cartes
  for select to anon, authenticated using (true);
drop policy if exists "je lis mes boosters" on public.player_boosters;
create policy "je lis mes boosters" on public.player_boosters
  for select to authenticated using (discord_id = public.my_discord_id());
drop policy if exists "je lis mes ouvertures" on public.booster_ouvertures;
create policy "je lis mes ouvertures" on public.booster_ouvertures
  for select to authenticated using (discord_id = public.my_discord_id());
drop policy if exists "je lis mon booster gratuit" on public.player_booster_gratuit;
create policy "je lis mon booster gratuit" on public.player_booster_gratuit
  for select to authenticated using (discord_id = public.my_discord_id());

-- Acheter des boosters en boutique (or du jeu). Renvoie { booster, quantite, prix }
create or replace function public.acheter_booster(p_booster_id text, p_quantite int default 1)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi     text := my_discord_id();
  v_booster boosters%rowtype;
  v_total   int;
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  if coalesce(p_quantite, 0) not between 1 and 10 then raise exception 'Quantité invalide.'; end if;

  select * into v_booster from boosters where id = p_booster_id;
  if not found or not v_booster.en_vente then raise exception 'Ce booster n''est pas en vente.'; end if;

  v_total := v_booster.prix * p_quantite;
  update wallets set balance = balance - v_total
  where discord_id = v_moi and balance >= v_total;
  if not found then raise exception 'Pas assez de pièces.'; end if;

  insert into transactions (discord_id, amount, source, reason)
  values (v_moi, -v_total, 'boutique_fun',
          v_booster.nom || case when p_quantite > 1 then ' ×' || p_quantite else '' end);

  insert into player_boosters (discord_id, booster_id, quantite) values (v_moi, v_booster.id, p_quantite)
  on conflict (discord_id, booster_id) do update set quantite = player_boosters.quantite + excluded.quantite;

  return json_build_object('booster', v_booster.nom, 'quantite', p_quantite, 'prix', v_total);
end;
$$;

-- Ouvrir un booster (tirage CÔTÉ SERVEUR). Renvoie
-- { booster, cartes: [{ nom, image, rarete, nouvelle, exemplaires, or }], or, xp, meilleure_rarete, restants }
create or replace function public.ouvrir_booster(p_booster_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi      text := my_discord_id();
  v_booster  boosters%rowtype;
  v_raretes  text[] := array['commune', 'eveillee', 'mythique', 'legendaire', 'transcendante'];
  v_dispo    text[];        -- raretés qui ont au moins une carte dans ce booster
  v_total    numeric;
  v_tirage   numeric;
  v_rarete   text;
  v_idx      int;
  v_carte    cards%rowtype;
  v_resultat jsonb := '[]'::jsonb;
  v_nouvelle boolean;
  v_exemplaires int;
  v_meilleur int := 0;
  v_restants int;
  i          int;
  r          text;
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  select * into v_booster from boosters where id = p_booster_id;
  if not found then raise exception 'Booster inconnu.'; end if;

  perform pg_advisory_xact_lock(hashtext('booster:' || v_moi));

  update player_boosters set quantite = quantite - 1
  where discord_id = v_moi and booster_id = p_booster_id and quantite > 0
  returning quantite into v_restants;
  if not found then raise exception 'Tu n''as pas de booster à ouvrir.'; end if;

  select array_agg(distinct c.rarity) into v_dispo
  from booster_cartes bc join cards c on c.id = bc.card_id
  where bc.booster_id = p_booster_id;
  if v_dispo is null then raise exception 'Ce booster ne contient encore aucune carte.'; end if;

  for i in 1 .. v_booster.nb_cartes loop
    -- 1. Rareté, selon les chances du booster
    select coalesce(sum((v_booster.chances ->> x)::numeric), 0) into v_total from unnest(v_raretes) x;
    v_tirage := random() * greatest(v_total, 1);
    v_rarete := 'commune';
    foreach r in array v_raretes loop
      v_tirage := v_tirage - coalesce((v_booster.chances ->> r)::numeric, 0);
      if v_tirage < 0 then v_rarete := r; exit; end if;
    end loop;

    -- 2. Pas de carte de cette rareté dans le booster : on descend d'une rareté (sinon on remonte)
    if not v_rarete = any(v_dispo) then
      v_idx := array_position(v_raretes, v_rarete);
      v_rarete := null;
      for j in reverse v_idx - 1 .. 1 loop
        if v_raretes[j] = any(v_dispo) then v_rarete := v_raretes[j]; exit; end if;
      end loop;
      if v_rarete is null then
        for j in v_idx + 1 .. array_length(v_raretes, 1) loop
          if v_raretes[j] = any(v_dispo) then v_rarete := v_raretes[j]; exit; end if;
        end loop;
      end if;
    end if;

    -- 3. Une carte au hasard de cette rareté
    select c.* into v_carte from booster_cartes bc join cards c on c.id = bc.card_id
    where bc.booster_id = p_booster_id and c.rarity = v_rarete
    order by random() limit 1;

    -- 4. Nouvelle carte, ou un exemplaire de plus (doublon : à recycler dans le grimoire)
    v_nouvelle := not exists (select 1 from player_cards where discord_id = v_moi and card_id = v_carte.id);
    insert into player_cards (discord_id, card_id, source) values (v_moi, v_carte.id, 'recompense')
    on conflict (discord_id, card_id) do update set quantite = player_cards.quantite + 1
    returning quantite into v_exemplaires;
    v_meilleur := greatest(v_meilleur, array_position(v_raretes, v_rarete));

    v_resultat := v_resultat || jsonb_build_object(
      'nom', v_carte.name, 'image', v_carte.image, 'rarete', v_rarete,
      'nouvelle', v_nouvelle, 'exemplaires', v_exemplaires, 'or', 0);
  end loop;

  insert into booster_ouvertures (discord_id, booster_id, cartes) values (v_moi, p_booster_id, v_resultat);

  return json_build_object(
    'booster', v_booster.nom,
    'cartes', v_resultat,
    'or', 0,
    'xp', 0,
    'meilleure_rarete', v_raretes[v_meilleur],
    'restants', v_restants
  );
end;
$$;

-- Temps (en secondes) avant le prochain booster gratuit : 0 = disponible maintenant
create or replace function public.booster_gratuit_etat()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi     text := my_discord_id();
  v_dernier timestamptz;
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  select dernier into v_dernier from player_booster_gratuit where discord_id = v_moi;
  return json_build_object('secondes',
    greatest(0, ceil(extract(epoch from (v_dernier + interval '10 minutes') - now())))::int);
end;
$$;

-- Ouvrir le booster gratuit (si les 10 minutes sont passées : vérifié côté serveur)
create or replace function public.ouvrir_booster_gratuit()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi      text := my_discord_id();
  v_resultat jsonb;
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  perform pg_advisory_xact_lock(hashtext('booster-gratuit:' || v_moi));

  insert into player_booster_gratuit (discord_id, dernier) values (v_moi, now())
  on conflict (discord_id) do update set dernier = now()
  where player_booster_gratuit.dernier <= now() - interval '10 minutes';
  if not found then raise exception 'Ton prochain booster gratuit n''est pas encore prêt.'; end if;

  insert into player_boosters (discord_id, booster_id, quantite) values (v_moi, 'gratuit', 1)
  on conflict (discord_id, booster_id) do update set quantite = player_boosters.quantite + 1;
  v_resultat := ouvrir_booster('gratuit')::jsonb;

  return (v_resultat || jsonb_build_object('secondes', 600))::json;
end;
$$;


-- =====================================================================
--  PARTIE 4 — Doublons et recyclage (ancien/SQL/doublons.sql)
-- =====================================================================
create or replace function public.valeur_recyclage(p_rarete text)
returns int
language sql
immutable
as $$
  select coalesce(('{"commune": 20, "eveillee": 40, "mythique": 80, "legendaire": 150, "transcendante": 300}'::jsonb ->> p_rarete)::int, 20);
$$;

-- Or et XP de pass gagnés (pass_ajouter_xp est créée plus bas : appel dynamique, comme avant)
create or replace function public.crediter_recyclage(p_moi text, p_or int, p_xp int, p_raison text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_or > 0 then
    update wallets set balance = balance + p_or where discord_id = p_moi;
    if not found then insert into wallets (discord_id, balance) values (p_moi, p_or); end if;
    insert into transactions (discord_id, amount, source, reason) values (p_moi, p_or, 'boutique_fun', p_raison);
  end if;
  if p_xp > 0 and to_regprocedure('public.pass_ajouter_xp(text,integer)') is not null then
    execute 'select public.pass_ajouter_xp($1, $2)' using p_moi, p_xp;
  end if;
end;
$$;

-- Recycler des exemplaires d'une carte (on garde toujours le dernier)
create or replace function public.recycler_carte(p_card_id bigint, p_nombre int default 1)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi   text := my_discord_id();
  v_qte   int;
  v_carte cards%rowtype;
  v_or    int;
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  if coalesce(p_nombre, 0) < 1 then raise exception 'Nombre invalide.'; end if;
  select quantite into v_qte from player_cards where discord_id = v_moi and card_id = p_card_id for update;
  if not found then raise exception 'Tu ne possèdes pas cette carte.'; end if;
  if p_nombre > v_qte - 1 then
    raise exception 'Tu peux recycler % exemplaire(s) au plus : le dernier est gardé.', greatest(v_qte - 1, 0);
  end if;
  select * into v_carte from cards where id = p_card_id;

  update player_cards set quantite = quantite - p_nombre where discord_id = v_moi and card_id = p_card_id;
  v_or := valeur_recyclage(v_carte.rarity) * p_nombre;
  perform crediter_recyclage(v_moi, v_or, 10 * p_nombre,
    format('Recyclage : %s ×%s', v_carte.name, p_nombre));
  return json_build_object('exemplaires', p_nombre, 'or', v_or, 'xp', 10 * p_nombre, 'restants', v_qte - p_nombre);
end;
$$;

-- Recycler tous ses doublons d'un coup
create or replace function public.recycler_doublons()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi    text := my_discord_id();
  v_ex     int;
  v_or     int;
  v_cartes int;
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  perform pg_advisory_xact_lock(hashtext('player_cards:' || v_moi));
  select coalesce(sum(pc.quantite - 1), 0), coalesce(sum((pc.quantite - 1) * valeur_recyclage(c.rarity)), 0), count(*)
    into v_ex, v_or, v_cartes
  from player_cards pc join cards c on c.id = pc.card_id
  where pc.discord_id = v_moi and pc.quantite > 1;
  if v_ex = 0 then raise exception 'Tu n''as aucun doublon à recycler.'; end if;

  update player_cards set quantite = 1 where discord_id = v_moi and quantite > 1;
  perform crediter_recyclage(v_moi, v_or, 10 * v_ex, format('Recyclage de %s doublon(s)', v_ex));
  return json_build_object('cartes', v_cartes, 'exemplaires', v_ex, 'or', v_or, 'xp', 10 * v_ex);
end;
$$;


-- =====================================================================
--  PARTIE 5 — Plateaux du duel (ancien/SQL/plateaux.sql)
-- =====================================================================
create table if not exists public.plateaux (
  id          text primary key,                       -- 'automne', 'hiver'… : la classe CSS plateau-<id>
  nom         text not null,
  description text,
  prix        int  not null check (prix >= 0),
  image       text not null,
  miniature   text,
  ordre       int  not null default 0,
  en_vente    boolean not null default true
);

create table if not exists public.joueur_plateaux (
  discord_id text not null,
  plateau_id text not null references public.plateaux(id) on delete cascade,
  equipe     boolean not null default false,
  achete_le  timestamptz not null default now(),
  primary key (discord_id, plateau_id)
);
-- Un seul plateau choisi par joueur
create unique index if not exists joueur_plateaux_un_equipe on public.joueur_plateaux (discord_id) where equipe;

alter table public.plateaux        enable row level security;
alter table public.joueur_plateaux enable row level security;

drop policy if exists "plateaux lisibles par tous" on public.plateaux;
create policy "plateaux lisibles par tous" on public.plateaux
  for select to anon, authenticated using (true);
drop policy if exists "je lis mes plateaux" on public.joueur_plateaux;
create policy "je lis mes plateaux" on public.joueur_plateaux
  for select to authenticated using (discord_id = public.my_discord_id());

-- Acheter un plateau (or du jeu). Renvoie { plateau, prix }
create or replace function public.acheter_plateau(p_plateau_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi     text := my_discord_id();
  v_plateau plateaux%rowtype;
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;

  select * into v_plateau from plateaux where id = p_plateau_id;
  if not found or not v_plateau.en_vente then raise exception 'Ce plateau n''est pas en vente.'; end if;

  perform pg_advisory_xact_lock(hashtext('plateau:' || v_moi));
  if exists (select 1 from joueur_plateaux where discord_id = v_moi and plateau_id = p_plateau_id) then
    raise exception 'Tu possèdes déjà ce plateau.';
  end if;

  update wallets set balance = balance - v_plateau.prix
  where discord_id = v_moi and balance >= v_plateau.prix;
  if not found then raise exception 'Pas assez de pièces.'; end if;

  insert into transactions (discord_id, amount, source, reason)
  values (v_moi, -v_plateau.prix, 'boutique_fun', 'Plateau « ' || v_plateau.nom || ' »');

  insert into joueur_plateaux (discord_id, plateau_id) values (v_moi, v_plateau.id);

  return json_build_object('plateau', v_plateau.nom, 'prix', v_plateau.prix);
end;
$$;

-- Choisir le plateau de ses duels (un plateau possédé), ou null pour le plateau par défaut
create or replace function public.equiper_plateau(p_plateau_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi text := my_discord_id();
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  if p_plateau_id is not null
     and not exists (select 1 from joueur_plateaux where discord_id = v_moi and plateau_id = p_plateau_id) then
    raise exception 'Tu ne possèdes pas ce plateau.';
  end if;

  update joueur_plateaux set equipe = false where discord_id = v_moi and equipe;
  if p_plateau_id is not null then
    update joueur_plateaux set equipe = true where discord_id = v_moi and plateau_id = p_plateau_id;
  end if;
end;
$$;


-- =====================================================================
--  PARTIE 6 — Anciennes lettres d'échange (ancien/SQL/echanges.sql)
--  Gardées : la table (historique lu par les succès, effacée avec le compte) et cartes_du_joueur
--  (Marché, duel en ligne). Les fonctions des lettres, fermées par commerce.sql, ne sont pas recréées.
-- =====================================================================
create table if not exists public.echanges (
  id               bigint generated always as identity primary key,
  de               text not null references public.players(discord_id) on delete cascade,
  pour             text not null references public.players(discord_id) on delete cascade,
  cartes_donnees   bigint[] not null default '{}',
  cartes_demandees bigint[] not null default '{}',
  message          text check (message is null or char_length(message) <= 200),
  statut           text not null default 'en_attente'
                   check (statut in ('en_attente', 'accepte', 'refuse', 'annule', 'impossible')),
  raison           text,
  cree_le          timestamptz not null default now(),
  traite_le        timestamptz,
  check (de <> pour),
  check (cardinality(cartes_donnees) <= 5 and cardinality(cartes_demandees) <= 5),
  check (cardinality(cartes_donnees) + cardinality(cartes_demandees) >= 1)
);
create index if not exists echanges_pour on public.echanges (pour, statut);
create index if not exists echanges_de on public.echanges (de, statut);

alter table public.echanges enable row level security;
drop policy if exists "je lis mes échanges" on public.echanges;
create policy "je lis mes échanges" on public.echanges
  for select to authenticated using (de = public.my_discord_id() or pour = public.my_discord_id());

-- Les cartes d'un joueur (pour choisir quoi lui demander), sans leur rangement
create or replace function public.cartes_du_joueur(p_discord_id text)
returns setof public.cards
language sql
stable
security definer
set search_path = public
as $$
  select c.* from player_cards pc join cards c on c.id = pc.card_id
  where pc.discord_id = p_discord_id and my_discord_id() is not null
  order by c.name;
$$;


-- =====================================================================
--  PARTIE 7 — Commerce : contrats à sceaux, souhaits, tableau de guilde (ancien/SQL/commerce.sql)
-- =====================================================================
create table if not exists public.contrats (
  id          bigint generated always as identity primary key,
  de          text not null references public.players(discord_id) on delete cascade,
  pour        text not null references public.players(discord_id) on delete cascade,
  cartes_de   bigint[] not null default '{}',
  cartes_pour bigint[] not null default '{}',
  or_de       int not null default 0 check (or_de between 0 and 1000000),
  or_pour     int not null default 0 check (or_pour between 0 and 1000000),
  objets_de   text[] not null default '{}',
  objets_pour text[] not null default '{}',
  message     text check (message is null or char_length(message) <= 200),
  statut      text not null default 'ouvert' check (statut in ('ouvert', 'ratifie', 'rompu', 'impossible')),
  sceau_de    boolean not null default false,
  sceau_pour  boolean not null default false,
  version     int not null default 1,
  modifie_par text,
  raison      text,
  cree_le     timestamptz not null default now(),
  maj_le      timestamptz not null default now(),
  ratifie_le  timestamptz,
  check (de <> pour),
  check (cardinality(cartes_de) <= 6 and cardinality(cartes_pour) <= 6),
  check (cardinality(objets_de) <= 4 and cardinality(objets_pour) <= 4)
);
create index if not exists contrats_de on public.contrats (de, statut);
create index if not exists contrats_pour on public.contrats (pour, statut);

create table if not exists public.souhaits (
  discord_id text   not null references public.players(discord_id) on delete cascade,
  card_id    bigint not null references public.cards(id) on delete cascade,
  cree_le    timestamptz not null default now(),
  primary key (discord_id, card_id)
);

create table if not exists public.annonces (
  id         bigint generated always as identity primary key,
  auteur     text   not null references public.players(discord_id) on delete cascade,
  type       text   not null check (type in ('vente', 'recherche')),
  card_id    bigint not null references public.cards(id) on delete cascade,
  prix       int    not null check (prix between 1 and 1000000),
  message    text check (message is null or char_length(message) <= 140),
  statut     text   not null default 'ouverte' check (statut in ('ouverte', 'conclue', 'retiree', 'impossible')),
  conclu_par text,
  raison     text,
  cree_le    timestamptz not null default now(),
  conclu_le  timestamptz
);
create index if not exists annonces_ouvertes on public.annonces (statut, cree_le desc);
create index if not exists annonces_auteur on public.annonces (auteur, statut);

alter table public.contrats enable row level security;
alter table public.souhaits enable row level security;
alter table public.annonces enable row level security;

drop policy if exists "je lis mes contrats" on public.contrats;
create policy "je lis mes contrats" on public.contrats
  for select to authenticated using (de = public.my_discord_id() or pour = public.my_discord_id());
drop policy if exists "souhaits lisibles" on public.souhaits;
create policy "souhaits lisibles" on public.souhaits for select to authenticated using (true);
drop policy if exists "annonces lisibles" on public.annonces;
create policy "annonces lisibles" on public.annonces for select to authenticated using (true);

-- Ce qu'un joueur donne est-il possible ? Renvoie null, ou la raison (en français)
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
begin
  -- Les cartes : possédées, et pas le dernier exemplaire d'une favorite
  select c.name into v_nom from unnest(p_cartes) x join cards c on c.id = x
  where not exists (select 1 from player_cards where discord_id = p_joueur and card_id = x) limit 1;
  if v_nom is not null then return format('%s n''a plus « %s ».', v_qui, v_nom); end if;
  select c.name into v_nom from unnest(p_cartes) x join cards c on c.id = x
  join player_cards pc on pc.discord_id = p_joueur and pc.card_id = x
  where pc.quantite = 1 and exists (select 1 from player_deck_cards d where d.discord_id = p_joueur and d.card_id = x) limit 1;
  if v_nom is not null then
    return format('« %s » est une favorite de %s (dernier exemplaire) : elle doit d''abord quitter les favorites.', v_nom, v_qui);
  end if;
  -- L'or
  if coalesce(p_or, 0) > 0 and coalesce((select balance from wallets where discord_id = p_joueur), 0) < p_or then
    return format('%s n''a pas assez d''or (%s demandés).', v_qui, p_or);
  end if;
  -- Les objets : échangeables, et possédés
  select coalesce(i.name, x) into v_nom from unnest(p_objets) x left join items i on i.id::text = x
  where i.id is null or not i.echangeable limit 1;
  if v_nom is not null then
    return format('L''objet « %s » ne s''échange pas.', v_nom);
  end if;
  select x into v_nom from unnest(p_objets) x
  where not exists (select 1 from inventory where discord_id = p_joueur and item_id::text = x) limit 1;
  if v_nom is not null then
    return format('%s n''a plus l''objet « %s ».', v_qui, coalesce((select name from items where id::text = v_nom), v_nom));
  end if;
  return null;
end;
$$;

-- Un objet que le receveur possède déjà ? Renvoie null, ou la raison
create or replace function public.commerce_objets_deja(p_receveur text, p_objets text[])
returns text
language sql
stable
security definer
set search_path = public
as $$
  select format('%s a déjà « %s ».', coalesce((select username from players where discord_id = p_receveur), 'Ce joueur'),
                coalesce((select name from items where id::text = x), x))
  from unnest(p_objets) x
  where exists (select 1 from inventory where discord_id = p_receveur and item_id::text = x)
  limit 1;
$$;

-- Fait passer un exemplaire de chaque carte, l'or et les objets de « de » à « pour »
create or replace function public.commerce_transferer(p_de text, p_pour text, p_cartes bigint[], p_or int, p_objets text[], p_raison text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  x text;
begin
  -- Cartes : d'abord les derniers exemplaires (qui partent), ensuite les autres (un de moins)
  delete from player_cards where discord_id = p_de and card_id = any(p_cartes) and quantite = 1;
  update player_cards set quantite = quantite - 1 where discord_id = p_de and card_id = any(p_cartes);
  insert into player_cards (discord_id, card_id, source) select p_pour, c, 'echange' from unnest(p_cartes) c
  on conflict (discord_id, card_id) do update set quantite = player_cards.quantite + 1;

  -- Or
  if coalesce(p_or, 0) > 0 then
    update wallets set balance = balance - p_or where discord_id = p_de and balance >= p_or;
    if not found then raise exception 'Pas assez d''or.'; end if;
    update wallets set balance = balance + p_or where discord_id = p_pour;
    if not found then insert into wallets (discord_id, balance) values (p_pour, p_or); end if;
    insert into transactions (discord_id, amount, source, reason) values
      (p_de, -p_or, 'echange', p_raison),
      (p_pour, p_or, 'echange', p_raison);
  end if;

  -- Objets : la ligne d'inventaire change de propriétaire ; l'objet n'est plus équipé par l'ancien
  foreach x in array p_objets loop
    update inventory set discord_id = p_pour
    where ctid = (select ctid from inventory where discord_id = p_de and item_id::text = x limit 1);
    update players set banner_item_id = case when banner_item_id::text = x then null else banner_item_id end,
                       title_item_id  = case when title_item_id::text  = x then null else title_item_id  end,
                       theme_item_id  = case when theme_item_id::text  = x then null else theme_item_id  end
    where discord_id = p_de;
  end loop;
end;
$$;

-- Nettoie et contrôle les champs d'un contrat ; lève une erreur si quelque chose cloche
create or replace function public.commerce_normaliser(
  p_cartes bigint[], p_objets text[], p_or int, out cartes bigint[], out objets text[], out montant int)
language plpgsql
immutable
as $$
begin
  cartes := coalesce((select array_agg(distinct x) from unnest(p_cartes) x where x is not null), '{}');
  objets := coalesce((select array_agg(distinct x) from unnest(p_objets) x where x is not null and x <> ''), '{}');
  montant := greatest(0, coalesce(p_or, 0));
  if cardinality(cartes) > 6 then raise exception '6 cartes au plus de chaque côté.'; end if;
  if cardinality(objets) > 4 then raise exception '4 objets au plus de chaque côté.'; end if;
  if montant > 1000000 then raise exception 'Un million d''or au plus.'; end if;
end;
$$;

-- Les objets et cosmétiques d'un joueur (pour choisir quoi lui demander)
create or replace function public.objets_du_joueur(p_discord_id text)
returns setof public.items
language sql
stable
security definer
set search_path = public
as $$
  select i.* from inventory inv join items i on i.id = inv.item_id
  where inv.discord_id = p_discord_id and my_discord_id() is not null
  order by i.name;
$$;

create or replace function public.ouvrir_contrat(
  p_pour text, p_cartes_de bigint[], p_cartes_pour bigint[], p_or_de int, p_or_pour int,
  p_objets_de text[], p_objets_pour text[], p_message text default null)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi text := my_discord_id();
  a record; b record;
  v_raison text;
  v_id bigint;
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  if p_pour is null or p_pour = v_moi then raise exception 'Choisis un autre joueur.'; end if;
  if not exists (select 1 from players where discord_id = p_pour) then raise exception 'Ce joueur est introuvable.'; end if;
  select * into a from commerce_normaliser(p_cartes_de, p_objets_de, p_or_de);
  select * into b from commerce_normaliser(p_cartes_pour, p_objets_pour, p_or_pour);
  if cardinality(a.cartes) + cardinality(b.cartes) + cardinality(a.objets) + cardinality(b.objets) = 0 then
    raise exception 'Mets au moins une carte ou un objet dans le contrat.';
  end if;
  if (select count(*) from contrats where (de = v_moi or pour = v_moi) and statut = 'ouvert') >= 15 then
    raise exception 'Tu as déjà 15 contrats ouverts : ratifie-les ou romps-en.';
  end if;
  v_raison := coalesce(commerce_verifier(v_moi, a.cartes, a.montant, a.objets), commerce_verifier(p_pour, b.cartes, 0, b.objets),
                       commerce_objets_deja(p_pour, a.objets), commerce_objets_deja(v_moi, b.objets));
  if v_raison is not null then raise exception '%', v_raison; end if;

  insert into contrats (de, pour, cartes_de, cartes_pour, or_de, or_pour, objets_de, objets_pour, message, modifie_par)
  values (v_moi, p_pour, a.cartes, b.cartes, a.montant, b.montant, a.objets, b.objets, nullif(btrim(left(p_message, 200)), ''), v_moi)
  returning id into v_id;
  return v_id;
end;
$$;

-- Modifier un contrat ouvert (l'un ou l'autre des deux joueurs) : les deux sceaux se brisent
create or replace function public.modifier_contrat(
  p_id bigint, p_cartes_de bigint[], p_cartes_pour bigint[], p_or_de int, p_or_pour int,
  p_objets_de text[], p_objets_pour text[], p_message text default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi text := my_discord_id();
  v_c contrats%rowtype;
  a record; b record;
  v_raison text;
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  select * into v_c from contrats where id = p_id for update;
  if not found or v_moi not in (v_c.de, v_c.pour) then raise exception 'Contrat introuvable.'; end if;
  if v_c.statut <> 'ouvert' then raise exception 'Ce contrat n''est plus ouvert.'; end if;
  select * into a from commerce_normaliser(p_cartes_de, p_objets_de, p_or_de);
  select * into b from commerce_normaliser(p_cartes_pour, p_objets_pour, p_or_pour);
  if cardinality(a.cartes) + cardinality(b.cartes) + cardinality(a.objets) + cardinality(b.objets) = 0 then
    raise exception 'Mets au moins une carte ou un objet dans le contrat.';
  end if;
  v_raison := coalesce(commerce_verifier(v_c.de, a.cartes, 0, a.objets), commerce_verifier(v_c.pour, b.cartes, 0, b.objets),
                       commerce_objets_deja(v_c.pour, a.objets), commerce_objets_deja(v_c.de, b.objets));
  if v_raison is not null then raise exception '%', v_raison; end if;

  update contrats set cartes_de = a.cartes, cartes_pour = b.cartes, or_de = a.montant, or_pour = b.montant,
    objets_de = a.objets, objets_pour = b.objets,
    message = coalesce(nullif(btrim(left(p_message, 200)), ''), message),
    sceau_de = false, sceau_pour = false, version = version + 1, modifie_par = v_moi, raison = null, maj_le = now()
  where id = p_id;
  return v_c.version + 1;
end;
$$;

-- Apposer son sceau (sur la version qu'on a lue) ; le second sceau ratifie le contrat
create or replace function public.apposer_sceau(p_id bigint, p_version int)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi text := my_discord_id();
  v_c contrats%rowtype;
  v_raison text;
  v_texte text;
  v_sceau_de boolean;
  v_sceau_pour boolean;
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  select * into v_c from contrats where id = p_id for update;
  if not found or v_moi not in (v_c.de, v_c.pour) then raise exception 'Contrat introuvable.'; end if;
  if v_c.statut <> 'ouvert' then raise exception 'Ce contrat n''est plus ouvert.'; end if;
  if v_c.version <> p_version then raise exception 'Le contrat vient d''être modifié : relis-le avant d''apposer ton sceau.'; end if;

  -- Ce que je donne doit être possible
  v_raison := case when v_moi = v_c.de then commerce_verifier(v_moi, v_c.cartes_de, v_c.or_de, v_c.objets_de)
                   else commerce_verifier(v_moi, v_c.cartes_pour, v_c.or_pour, v_c.objets_pour) end;
  if v_raison is not null then raise exception '%', v_raison; end if;

  v_sceau_de := v_c.sceau_de or v_moi = v_c.de;
  v_sceau_pour := v_c.sceau_pour or v_moi = v_c.pour;
  update contrats set sceau_de = v_sceau_de, sceau_pour = v_sceau_pour, maj_le = now() where id = p_id;
  if not (v_sceau_de and v_sceau_pour) then
    return json_build_object('ratifie', false);
  end if;

  -- Les deux sceaux : ratification. Les deux collections bougent ensemble (verrous dans un ordre fixe)
  perform pg_advisory_xact_lock(hashtext('player_cards:' || least(v_c.de, v_c.pour)));
  perform pg_advisory_xact_lock(hashtext('player_cards:' || greatest(v_c.de, v_c.pour)));
  v_raison := coalesce(commerce_verifier(v_c.de, v_c.cartes_de, v_c.or_de, v_c.objets_de),
                       commerce_verifier(v_c.pour, v_c.cartes_pour, v_c.or_pour, v_c.objets_pour),
                       commerce_objets_deja(v_c.pour, v_c.objets_de), commerce_objets_deja(v_c.de, v_c.objets_pour));
  if v_raison is not null then
    -- Rien ne bouge : les sceaux se brisent, le contrat reste ouvert pour être corrigé
    update contrats set sceau_de = false, sceau_pour = false, raison = v_raison, maj_le = now() where id = p_id;
    return json_build_object('ratifie', false, 'raison', v_raison);
  end if;

  v_texte := format('Contrat n°%s ratifié', p_id);
  perform commerce_transferer(v_c.de, v_c.pour, v_c.cartes_de, v_c.or_de, v_c.objets_de, v_texte);
  perform commerce_transferer(v_c.pour, v_c.de, v_c.cartes_pour, v_c.or_pour, v_c.objets_pour, v_texte);
  update contrats set statut = 'ratifie', ratifie_le = now(), maj_le = now(), raison = null where id = p_id;
  return json_build_object('ratifie', true);
end;
$$;

create or replace function public.rompre_contrat(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update contrats set statut = 'rompu', maj_le = now(), modifie_par = my_discord_id()
  where id = p_id and statut = 'ouvert' and my_discord_id() in (de, pour);
  if not found then raise exception 'Contrat introuvable ou déjà clos.'; end if;
end;
$$;

-- Liste de souhaits : ajoute la carte, ou la retire si elle y est déjà
create or replace function public.basculer_souhait(p_card_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi text := my_discord_id();
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  delete from souhaits where discord_id = v_moi and card_id = p_card_id;
  if found then return false; end if;
  if (select count(*) from souhaits where discord_id = v_moi) >= 30 then raise exception '30 souhaits au plus.'; end if;
  if not exists (select 1 from cards where id = p_card_id) then raise exception 'Carte introuvable.'; end if;
  insert into souhaits (discord_id, card_id) values (v_moi, p_card_id);
  return true;
end;
$$;

-- Le tableau de guilde : annonces de vente et de recherche (14 jours)
create or replace function public.publier_annonce(p_type text, p_card_id bigint, p_prix int, p_message text default null)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi text := my_discord_id();
  v_raison text;
  v_id bigint;
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  if p_type not in ('vente', 'recherche') then raise exception 'Type d''annonce inconnu.'; end if;
  if coalesce(p_prix, 0) < 1 or p_prix > 1000000 then raise exception 'Le prix doit être entre 1 et 1 000 000 d''or.'; end if;
  if not exists (select 1 from cards where id = p_card_id) then raise exception 'Carte introuvable.'; end if;
  if (select count(*) from annonces where auteur = v_moi and statut = 'ouverte' and cree_le > now() - interval '14 days') >= 10 then
    raise exception 'Tu as déjà 10 annonces sur le tableau : retires-en une.';
  end if;
  if exists (select 1 from annonces where auteur = v_moi and statut = 'ouverte' and type = p_type and card_id = p_card_id
             and cree_le > now() - interval '14 days') then
    raise exception 'Tu as déjà une annonce pour cette carte.';
  end if;
  v_raison := case when p_type = 'vente' then commerce_verifier(v_moi, array[p_card_id], 0, '{}')
                   else commerce_verifier(v_moi, '{}', p_prix, '{}') end;
  if v_raison is not null then raise exception '%', v_raison; end if;
  insert into annonces (auteur, type, card_id, prix, message)
  values (v_moi, p_type, p_card_id, p_prix, nullif(btrim(left(p_message, 140)), ''))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.retirer_annonce(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update annonces set statut = 'retiree', conclu_le = now() where id = p_id and auteur = my_discord_id() and statut = 'ouverte';
  if not found then raise exception 'Annonce introuvable ou déjà close.'; end if;
end;
$$;

-- Conclure une annonce : acheter (vente) ou fournir la carte recherchée (recherche)
create or replace function public.conclure_annonce(p_id bigint)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi text := my_discord_id();
  v_a annonces%rowtype;
  v_vendeur text; v_acheteur text;
  v_raison text;
  v_nom text;
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  select * into v_a from annonces where id = p_id for update;
  if not found then raise exception 'Annonce introuvable.'; end if;
  if v_a.statut <> 'ouverte' or v_a.cree_le < now() - interval '14 days' then raise exception 'Cette annonce n''est plus sur le tableau.'; end if;
  if v_a.auteur = v_moi then raise exception 'C''est ta propre annonce.'; end if;

  v_vendeur  := case when v_a.type = 'vente' then v_a.auteur else v_moi end;
  v_acheteur := case when v_a.type = 'vente' then v_moi else v_a.auteur end;
  perform pg_advisory_xact_lock(hashtext('player_cards:' || least(v_vendeur, v_acheteur)));
  perform pg_advisory_xact_lock(hashtext('player_cards:' || greatest(v_vendeur, v_acheteur)));

  -- L'auteur peut-il encore tenir son annonce ? Sinon elle quitte le tableau
  v_raison := case when v_a.type = 'vente' then commerce_verifier(v_a.auteur, array[v_a.card_id], 0, '{}')
                   else commerce_verifier(v_a.auteur, '{}', v_a.prix, '{}') end;
  if v_raison is not null then
    update annonces set statut = 'impossible', raison = v_raison, conclu_le = now() where id = p_id;
    return json_build_object('ok', false, 'raison', v_raison);
  end if;
  -- Et moi, ai-je l'or (achat) ou la carte (recherche) ?
  v_raison := case when v_a.type = 'vente' then commerce_verifier(v_moi, '{}', v_a.prix, '{}')
                   else commerce_verifier(v_moi, array[v_a.card_id], 0, '{}') end;
  if v_raison is not null then return json_build_object('ok', false, 'raison', v_raison); end if;

  select name into v_nom from cards where id = v_a.card_id;
  perform commerce_transferer(v_vendeur, v_acheteur, array[v_a.card_id], 0, '{}', format('Tableau de guilde : « %s »', v_nom));
  perform commerce_transferer(v_acheteur, v_vendeur, '{}', v_a.prix, '{}', format('Tableau de guilde : « %s »', v_nom));
  update annonces set statut = 'conclue', conclu_par = v_moi, conclu_le = now() where id = p_id;
  return json_build_object('ok', true, 'carte', v_nom, 'prix', v_a.prix, 'type', v_a.type);
end;
$$;


-- =====================================================================
--  PARTIE 8 — Mode Histoire (ancien/SQL/mode_histoire.sql)
--  (les chapitres et niveaux eux-mêmes sont dans supabase/donnees.sql)
-- =====================================================================
create table if not exists public.histoire_chapitres (
  id    text primary key,
  nom   text not null,
  ordre int  not null unique
);

create table if not exists public.histoire_niveaux (
  id          text primary key,
  chapitre_id text not null references public.histoire_chapitres(id) on delete cascade,
  ordre       int  not null,
  nom         text not null,
  est_boss    boolean not null default false,
  or_gagne    int not null default 0 check (or_gagne >= 0),
  xp_gagne    int not null default 0 check (xp_gagne >= 0),
  carte_aleatoire boolean not null default false,
  or_si_collection_complete int not null default 100,
  unique (chapitre_id, ordre)
);

create table if not exists public.histoire_progression (
  discord_id  text not null,
  chapitre_id text not null references public.histoire_chapitres(id) on delete cascade,
  niveau_id   text not null references public.histoire_niveaux(id) on delete cascade,
  termine_le  timestamptz not null default now(),
  primary key (discord_id, niveau_id)
);
create index if not exists histoire_progression_joueur on public.histoire_progression (discord_id);

-- L'XP de pass sans saison (ancienne table, gardée)
create table if not exists public.player_pass (
  discord_id text primary key,
  xp         int not null default 0 check (xp >= 0),
  maj_le     timestamptz not null default now()
);

-- Le niveau en cours de chaque joueur (anti-triche : 45 secondes à 3 heures de duel)
create table if not exists public.histoire_tentatives (
  discord_id  text primary key,
  niveau_id   text not null references public.histoire_niveaux(id) on delete cascade,
  commence_le timestamptz not null default now()
);

alter table public.histoire_chapitres   enable row level security;
alter table public.histoire_niveaux     enable row level security;
alter table public.histoire_progression enable row level security;
alter table public.player_pass          enable row level security;
alter table public.histoire_tentatives  enable row level security;   -- aucune règle : personne ne la lit

drop policy if exists "chapitres lisibles par tous" on public.histoire_chapitres;
create policy "chapitres lisibles par tous" on public.histoire_chapitres
  for select to anon, authenticated using (true);
drop policy if exists "niveaux lisibles par tous" on public.histoire_niveaux;
create policy "niveaux lisibles par tous" on public.histoire_niveaux
  for select to anon, authenticated using (true);
drop policy if exists "je lis ma progression" on public.histoire_progression;
create policy "je lis ma progression" on public.histoire_progression
  for select to authenticated using (discord_id = public.my_discord_id());
drop policy if exists "je lis mon xp de pass" on public.player_pass;
create policy "je lis mon xp de pass" on public.player_pass
  for select to authenticated using (discord_id = public.my_discord_id());

-- Au début du duel d'un niveau (remplace le niveau en cours)
create or replace function public.histoire_commencer(p_niveau_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi text := my_discord_id();
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  if not exists (select 1 from histoire_niveaux where id = p_niveau_id) then raise exception 'Niveau inconnu.'; end if;
  insert into histoire_tentatives (discord_id, niveau_id) values (v_moi, p_niveau_id)
  on conflict (discord_id) do update set niveau_id = excluded.niveau_id, commence_le = now();
end;
$$;

-- Après une victoire en mode Histoire. Renvoie { deja, or, xp, carte, carte_image, chapitre_termine }
create or replace function public.valider_niveau_histoire(p_niveau_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi    text := my_discord_id();
  v_niveau histoire_niveaux%rowtype;
  v_ordre_chapitre int;
  v_boss_precedent text;
  v_carte  cards%rowtype;
  v_or     int;
begin
  if v_moi is null then
    raise exception 'Connecte-toi d''abord.';
  end if;

  select * into v_niveau from histoire_niveaux where id = p_niveau_id;
  if not found then
    raise exception 'Niveau inconnu.';
  end if;

  -- Une validation à la fois par joueur (deux onglets ne donnent pas deux fois la récompense)
  perform pg_advisory_xact_lock(hashtext('histoire:' || v_moi));

  -- Déjà terminé : on peut rejouer, mais sans récompense
  if exists (select 1 from histoire_progression where discord_id = v_moi and niveau_id = p_niveau_id) then
    return json_build_object('deja', true, 'or', 0, 'xp', 0, 'carte', null, 'carte_image', null,
                             'chapitre_termine', false);
  end if;

  -- Le duel de ce niveau a-t-il vraiment été joué ? (commencé par histoire_commencer, 45 s à 3 h)
  delete from histoire_tentatives
  where discord_id = v_moi and niveau_id = p_niveau_id
    and commence_le between now() - interval '3 hours' and now() - interval '45 seconds';
  if not found then
    raise exception 'Victoire non reconnue : le duel de ce niveau n''a pas été joué en entier.';
  end if;

  -- Le niveau est-il débloqué ?
  if v_niveau.ordre > 1 then
    if not exists (
      select 1 from histoire_progression hp
      join histoire_niveaux n on n.id = hp.niveau_id
      where hp.discord_id = v_moi and n.chapitre_id = v_niveau.chapitre_id and n.ordre = v_niveau.ordre - 1
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
      select 1 from histoire_progression where discord_id = v_moi and niveau_id = v_boss_precedent
    ) then
      raise exception 'Termine d''abord le chapitre précédent.';
    end if;
  end if;

  insert into histoire_progression (discord_id, chapitre_id, niveau_id)
  values (v_moi, v_niveau.chapitre_id, v_niveau.id);

  v_or := v_niveau.or_gagne;

  -- Boss : une carte au hasard que le joueur n'a pas encore (sinon de l'or en plus)
  if v_niveau.carte_aleatoire then
    select c.* into v_carte from cards c
    where c.is_available and c.image is not null
      and c.description is distinct from 'Carte d''exemple'
      and not exists (select 1 from player_cards pc where pc.discord_id = v_moi and pc.card_id = c.id)
    order by random()
    limit 1;
    if found then
      insert into player_cards (discord_id, card_id, source) values (v_moi, v_carte.id, 'recompense');
    else
      v_or := v_or + v_niveau.or_si_collection_complete;
    end if;
  end if;

  if v_or > 0 then
    update wallets set balance = balance + v_or where discord_id = v_moi;
    if not found then
      insert into wallets (discord_id, balance) values (v_moi, v_or);
    end if;
    insert into transactions (discord_id, amount, source, reason)
    values (v_moi, v_or, 'histoire', 'Mode Histoire : ' || v_niveau.nom);
  end if;

  if v_niveau.xp_gagne > 0 then
    insert into player_pass (discord_id, xp) values (v_moi, v_niveau.xp_gagne)
    on conflict (discord_id) do update set xp = player_pass.xp + excluded.xp, maj_le = now();
    if to_regprocedure('public.pass_ajouter_xp(text,integer)') is not null then
      execute 'select public.pass_ajouter_xp($1, $2)' using v_moi, v_niveau.xp_gagne;
    end if;
  end if;

  return json_build_object(
    'deja', false,
    'or', v_or,
    'xp', v_niveau.xp_gagne,
    'carte', v_carte.name,
    'carte_image', v_carte.image,
    'chapitre_termine', v_niveau.est_boss
  );
end;
$$;


-- =====================================================================
--  PARTIE 9 — Pass de saison (ancien/SQL/pass_saison.sql)
--  (la saison 1 et ses paliers sont dans supabase/donnees.sql)
-- =====================================================================
create table if not exists public.saisons (
  id            bigint generated always as identity primary key,
  nom           text not null,
  date_debut    timestamptz not null,
  date_fin      timestamptz not null,
  active        boolean not null default false,
  prix_premium  int not null default 1500 check (prix_premium >= 0),
  xp_par_palier int not null default 1000 check (xp_par_palier > 0),
  nb_paliers    int not null default 30 check (nb_paliers > 0),
  check (date_fin > date_debut)
);
create unique index if not exists saisons_une_seule_active on public.saisons (active) where active;

create table if not exists public.pass_paliers (
  saison_id       bigint not null references public.saisons(id) on delete cascade,
  numero          int    not null check (numero >= 1),
  piste           text   not null check (piste in ('gratuite', 'premium')),
  type_recompense text   not null constraint pass_paliers_type_recompense_check check (type_recompense in
                    ('or', 'carte', 'carte_rarete', 'booster', 'dos_carte', 'cadre_portrait', 'titre', 'fond_plateau')),
  valeur          jsonb  not null default '{}'::jsonb,
  primary key (saison_id, numero, piste)
);

create table if not exists public.pass_progression (
  discord_id        text   not null,
  saison_id         bigint not null references public.saisons(id) on delete cascade,
  xp                int    not null default 0 check (xp >= 0),
  premium           boolean not null default false,
  reclames_gratuite int[]  not null default '{}',
  reclames_premium  int[]  not null default '{}',
  jour_ia           date,
  xp_ia_jour        int not null default 0,
  jour_ami          date,
  xp_ami_jour       int not null default 0,
  maj_le            timestamptz not null default now(),
  primary key (discord_id, saison_id)
);

create table if not exists public.pass_parties (
  id          uuid primary key default gen_random_uuid(),
  discord_id  text not null,
  mode        text not null check (mode in ('ia', 'ami')),
  salon       text,
  commence_le timestamptz not null default now(),
  termine_le  timestamptz,
  victoire    boolean,
  xp          int not null default 0,
  difficulte  text not null default 'normal' check (difficulte in ('facile', 'normal', 'difficile'))
);
create index if not exists pass_parties_joueur on public.pass_parties (discord_id, commence_le desc);
create index if not exists pass_parties_salon on public.pass_parties (salon, commence_le desc) where salon is not null;

create table if not exists public.pass_cosmetiques (
  discord_id text not null,
  type       text not null check (type in ('dos_carte', 'cadre_portrait', 'titre', 'fond_plateau')),
  nom        text not null,
  saison_id  bigint references public.saisons(id) on delete set null,
  obtenu_le  timestamptz not null default now(),
  primary key (discord_id, type, nom)
);

alter table public.saisons          enable row level security;
alter table public.pass_paliers     enable row level security;
alter table public.pass_progression enable row level security;
alter table public.pass_parties     enable row level security;   -- aucune règle : personne ne la lit
alter table public.pass_cosmetiques enable row level security;

drop policy if exists "saisons lisibles par tous" on public.saisons;
create policy "saisons lisibles par tous" on public.saisons
  for select to anon, authenticated using (true);
drop policy if exists "paliers lisibles par tous" on public.pass_paliers;
create policy "paliers lisibles par tous" on public.pass_paliers
  for select to anon, authenticated using (true);
drop policy if exists "je lis ma progression de pass" on public.pass_progression;
create policy "je lis ma progression de pass" on public.pass_progression
  for select to authenticated using (discord_id = public.my_discord_id());
drop policy if exists "je lis mes cosmetiques de pass" on public.pass_cosmetiques;
create policy "je lis mes cosmetiques de pass" on public.pass_cosmetiques
  for select to authenticated using (discord_id = public.my_discord_id());

-- La saison en cours (active et dans ses dates), ou null
create or replace function public.pass_saison_en_cours()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select id from saisons where active and now() between date_debut and date_fin limit 1;
$$;

-- Ajoute de l'XP au joueur dans la saison en cours ; renvoie son XP totale (ou null sans saison)
create or replace function public.pass_ajouter_xp(p_discord_id text, p_xp int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_saison bigint := pass_saison_en_cours();
  v_xp int;
begin
  if v_saison is null or p_discord_id is null or coalesce(p_xp, 0) <= 0 then
    return null;
  end if;
  insert into pass_progression (discord_id, saison_id, xp) values (p_discord_id, v_saison, p_xp)
  on conflict (discord_id, saison_id) do update
    set xp = pass_progression.xp + excluded.xp, maj_le = now()
  returning xp into v_xp;
  return v_xp;
end;
$$;

-- Ajoute de l'or au joueur et le note dans l'historique
create or replace function public.pass_donner_or(p_discord_id text, p_montant int, p_raison text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(p_montant, 0) <= 0 then return; end if;
  update wallets set balance = balance + p_montant where discord_id = p_discord_id;
  if not found then
    insert into wallets (discord_id, balance) values (p_discord_id, p_montant);
  end if;
  insert into transactions (discord_id, amount, source, reason)
  values (p_discord_id, p_montant, 'pass', p_raison);
end;
$$;

-- Début d'un duel : renvoie un ticket (uuid), ou null s'il n'y a pas de saison en cours
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
  if p_mode not in ('ia', 'ami') then raise exception 'Mode inconnu.'; end if;
  if p_mode = 'ami' and coalesce(p_salon, '') !~ '^[A-Z0-9]{5}$' then raise exception 'Salon invalide.'; end if;
  if pass_saison_en_cours() is null then return null; end if;

  perform pg_advisory_xact_lock(hashtext('pass:' || v_moi));
  if (select count(*) from pass_parties where discord_id = v_moi and commence_le > now() - interval '1 hour') >= 60 then
    raise exception 'Trop de duels commencés en une heure : réessaie un peu plus tard.';
  end if;
  delete from pass_parties
  where discord_id = v_moi and victoire is null and termine_le < now() - interval '1 day';

  -- Un seul ticket ouvert par joueur : le précédent est annulé (sans XP)
  update pass_parties set termine_le = now(), victoire = null, xp = 0
  where discord_id = v_moi and termine_le is null;

  insert into pass_parties (discord_id, mode, salon, difficulte)
  values (v_moi, p_mode, case when p_mode = 'ami' then p_salon end,
          case when p_difficulte in ('facile', 'normal', 'difficile') then p_difficulte else 'normal' end)
  returning id into v_id;
  return v_id;
end;
$$;

-- Fin d'un duel : l'XP selon le mode et le résultat, dans la limite du jour.
-- Renvoie { xp, or, raison, victoire, xp_total, palier }
create or replace function public.pass_fin_partie(p_ticket uuid, p_victoire boolean)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi     text := my_discord_id();
  v_partie  pass_parties%rowtype;
  v_adverse pass_parties%rowtype;
  v_vict_salon int;
  v_joueurs_salon int;
  v_saison  saisons%rowtype;
  v_prog    pass_progression%rowtype;
  v_jour    date := (now() at time zone 'Europe/Paris')::date;
  v_vict    boolean := coalesce(p_victoire, false);
  v_xp      int;
  v_deja    int;
  v_plafond int;
  v_total   int;
  v_raison  text := null;
  v_or      int := 0;
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;

  perform pg_advisory_xact_lock(hashtext('pass:' || v_moi));

  select * into v_partie from pass_parties where id = p_ticket and discord_id = v_moi for update;
  if not found or v_partie.termine_le is not null then
    return json_build_object('xp', 0, 'raison', 'ticket');
  end if;

  select * into v_saison from saisons where id = pass_saison_en_cours();
  if not found then
    update pass_parties set termine_le = now() where id = p_ticket;
    return json_build_object('xp', 0, 'raison', 'saison');
  end if;

  if now() - v_partie.commence_le > interval '3 hours' then
    update pass_parties set termine_le = now(), victoire = v_vict where id = p_ticket;
    return json_build_object('xp', 0, 'raison', 'ticket');
  end if;
  if now() - v_partie.commence_le < interval '45 seconds' then
    update pass_parties set termine_le = now(), victoire = null, xp = 0 where id = p_ticket;
    return json_build_object('xp', 0, 'raison', 'court');
  end if;

  if v_partie.mode = 'ami' then
    perform pg_advisory_xact_lock(hashtext('pass-salon:' || v_partie.salon));
    select * into v_adverse from pass_parties
    where salon = v_partie.salon and mode = 'ami' and discord_id <> v_moi
      and abs(extract(epoch from (commence_le - v_partie.commence_le))) < 600
    order by abs(extract(epoch from (commence_le - v_partie.commence_le)))
    limit 1;
    if not found then
      update pass_parties set termine_le = now(), victoire = v_vict where id = p_ticket;
      return json_build_object('xp', 0, 'raison', 'adversaire');
    end if;
    -- Autant de victoires que de joueurs dans l'équipe gagnante (1 en 1v1, 2 en 2v2)
    if v_vict then
      select count(*) filter (where victoire is true and id <> p_ticket), count(*)
      into v_vict_salon, v_joueurs_salon
      from pass_parties
      where salon = v_partie.salon and mode = 'ami'
        and abs(extract(epoch from (commence_le - v_partie.commence_le))) < 600;
      if v_vict_salon >= greatest(1, v_joueurs_salon / 2) then v_vict := false; end if;
    end if;
    v_xp := case when v_vict then 150 else 50 end;
    v_plafond := 1500;
  else
    v_xp := case when v_vict then 100 else 30 end;
    v_plafond := 1000;
  end if;

  insert into pass_progression (discord_id, saison_id) values (v_moi, v_saison.id)
  on conflict (discord_id, saison_id) do nothing;
  select * into v_prog from pass_progression where discord_id = v_moi and saison_id = v_saison.id for update;
  if v_partie.mode = 'ami' then
    v_deja := case when v_prog.jour_ami = v_jour then v_prog.xp_ami_jour else 0 end;
  else
    v_deja := case when v_prog.jour_ia = v_jour then v_prog.xp_ia_jour else 0 end;
  end if;
  if v_deja + v_xp > v_plafond then
    v_xp := greatest(0, v_plafond - v_deja);
    v_raison := 'plafond';
  end if;

  if v_partie.mode = 'ami' then
    update pass_progression set jour_ami = v_jour, xp_ami_jour = v_deja + v_xp
    where discord_id = v_moi and saison_id = v_saison.id;
  else
    update pass_progression set jour_ia = v_jour, xp_ia_jour = v_deja + v_xp
    where discord_id = v_moi and saison_id = v_saison.id;
  end if;

  update pass_parties set termine_le = now(), victoire = v_vict, xp = v_xp where id = p_ticket;
  v_total := coalesce(pass_ajouter_xp(v_moi, v_xp), v_prog.xp);

  -- Victoire contre l'Ombre : de l'or selon la difficulté (2 / 5 / 10)
  if v_partie.mode = 'ia' and v_vict and v_xp > 0 then
    v_or := case v_partie.difficulte when 'facile' then 2 when 'difficile' then 10 else 5 end;
    perform pass_donner_or(v_moi, v_or, 'Victoire contre l''Ombre');
  end if;

  return json_build_object(
    'xp', v_xp,
    'or', v_or,
    'raison', v_raison,
    'victoire', v_vict,
    'xp_total', v_total,
    'palier', least(v_saison.nb_paliers, v_total / v_saison.xp_par_palier)
  );
end;
$$;

-- Réclamer la récompense d'un palier atteint
create or replace function public.pass_reclamer(p_numero int, p_piste text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi    text := my_discord_id();
  v_saison saisons%rowtype;
  v_prog   pass_progression%rowtype;
  v_palier pass_paliers%rowtype;
  v_carte  cards%rowtype;
  v_or     int := 0;
  v_deja   boolean := false;
  v_nom    text;
  v_rarete text;
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  select * into v_saison from saisons where id = pass_saison_en_cours();
  if not found then raise exception 'Aucune saison en cours.'; end if;

  perform pg_advisory_xact_lock(hashtext('pass:' || v_moi));

  select * into v_palier from pass_paliers
  where saison_id = v_saison.id and numero = p_numero and piste = p_piste;
  if not found then raise exception 'Palier inconnu.'; end if;

  select * into v_prog from pass_progression where discord_id = v_moi and saison_id = v_saison.id for update;
  if not found or v_prog.xp < p_numero * v_saison.xp_par_palier then
    raise exception 'Ce palier n''est pas encore atteint.';
  end if;
  if p_piste = 'premium' and not v_prog.premium then
    raise exception 'Débloque d''abord la piste premium.';
  end if;
  if (p_piste = 'gratuite' and p_numero = any(v_prog.reclames_gratuite))
     or (p_piste = 'premium' and p_numero = any(v_prog.reclames_premium)) then
    raise exception 'Récompense déjà réclamée.';
  end if;

  v_nom := v_palier.valeur ->> 'nom';

  if v_palier.type_recompense = 'or' then
    v_or := coalesce((v_palier.valeur ->> 'montant')::int, 0);

  elsif v_palier.type_recompense = 'carte' then
    select * into v_carte from cards where name = v_nom limit 1;
    if not found then raise exception 'Carte introuvable : %', v_nom; end if;
    if exists (select 1 from player_cards where discord_id = v_moi and card_id = v_carte.id) then
      v_deja := true;
      v_or := coalesce((v_palier.valeur ->> 'or_si_deja')::int, 200);
    else
      insert into player_cards (discord_id, card_id, source) values (v_moi, v_carte.id, 'recompense');
    end if;

  elsif v_palier.type_recompense = 'carte_rarete' then
    v_rarete := coalesce(v_palier.valeur ->> 'rarete', 'mythique');
    select c.* into v_carte from cards c
    where c.rarity = v_rarete and c.is_available and c.image is not null
      and c.description is distinct from 'Carte d''exemple'
      and not exists (select 1 from player_cards pc where pc.discord_id = v_moi and pc.card_id = c.id)
    order by random() limit 1;
    if found then
      insert into player_cards (discord_id, card_id, source) values (v_moi, v_carte.id, 'recompense');
    else
      -- Il les a toutes : un exemplaire de plus d'une d'elles (à recycler dans le grimoire)
      select c.* into v_carte from cards c
      where c.rarity = v_rarete and c.is_available and c.image is not null
        and c.description is distinct from 'Carte d''exemple'
      order by random() limit 1;
      v_deja := true;
      if not found then
        v_nom := 'Carte ' || v_rarete;
        v_or := coalesce((v_palier.valeur ->> 'or_si_deja')::int, 200);
      else
        update player_cards set quantite = quantite + 1 where discord_id = v_moi and card_id = v_carte.id;
      end if;
    end if;

  elsif v_palier.type_recompense = 'booster' then
    select nom into v_nom from boosters where id = coalesce(v_palier.valeur ->> 'booster', 'cendres');
    if not found then raise exception 'Booster introuvable.'; end if;
    insert into player_boosters (discord_id, booster_id, quantite)
    values (v_moi, coalesce(v_palier.valeur ->> 'booster', 'cendres'), coalesce((v_palier.valeur ->> 'quantite')::int, 1))
    on conflict (discord_id, booster_id) do update set quantite = player_boosters.quantite + excluded.quantite;

  elsif v_palier.type_recompense = 'fond_plateau' and v_palier.valeur ? 'plateau' then
    select nom into v_nom from plateaux where id = v_palier.valeur ->> 'plateau';
    if not found then raise exception 'Plateau introuvable.'; end if;
    if exists (select 1 from joueur_plateaux where discord_id = v_moi and plateau_id = v_palier.valeur ->> 'plateau') then
      v_deja := true;
      v_or := coalesce((v_palier.valeur ->> 'or_si_deja')::int, 500);
    else
      insert into joueur_plateaux (discord_id, plateau_id) values (v_moi, v_palier.valeur ->> 'plateau');
    end if;

  else
    -- Cosmétique : enregistré (son affichage viendra plus tard)
    insert into pass_cosmetiques (discord_id, type, nom, saison_id)
    values (v_moi, v_palier.type_recompense, coalesce(v_nom, 'Sans nom'), v_saison.id)
    on conflict do nothing;
  end if;

  perform pass_donner_or(v_moi, v_or,
    'Pass de saison : palier ' || p_numero || case when p_piste = 'premium' then ' (premium)' else '' end);

  if p_piste = 'gratuite' then
    update pass_progression set reclames_gratuite = array_append(reclames_gratuite, p_numero), maj_le = now()
    where discord_id = v_moi and saison_id = v_saison.id;
  else
    update pass_progression set reclames_premium = array_append(reclames_premium, p_numero), maj_le = now()
    where discord_id = v_moi and saison_id = v_saison.id;
  end if;

  return json_build_object(
    'type', v_palier.type_recompense,
    'nom', coalesce(v_carte.name, v_nom),
    'or', v_or,
    'carte_image', v_carte.image,
    'rarete', coalesce(v_carte.rarity, v_rarete),
    'deja_possedee', v_deja,
    'quantite', case when v_palier.type_recompense = 'booster' then coalesce((v_palier.valeur ->> 'quantite')::int, 1) end
  );
end;
$$;

-- Débloquer la piste premium : payée avec l'or du jeu, une fois par saison
create or replace function public.pass_debloquer_premium()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi    text := my_discord_id();
  v_saison saisons%rowtype;
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  select * into v_saison from saisons where id = pass_saison_en_cours();
  if not found then raise exception 'Aucune saison en cours.'; end if;

  perform pg_advisory_xact_lock(hashtext('pass:' || v_moi));

  if exists (select 1 from pass_progression where discord_id = v_moi and saison_id = v_saison.id and premium) then
    raise exception 'La piste premium est déjà débloquée.';
  end if;

  update wallets set balance = balance - v_saison.prix_premium
  where discord_id = v_moi and balance >= v_saison.prix_premium;
  if not found then
    raise exception 'Pas assez d''or : il en faut %.', v_saison.prix_premium;
  end if;
  insert into transactions (discord_id, amount, source, reason)
  values (v_moi, -v_saison.prix_premium, 'pass', 'Pass de saison : piste premium (' || v_saison.nom || ')');

  insert into pass_progression (discord_id, saison_id, premium) values (v_moi, v_saison.id, true)
  on conflict (discord_id, saison_id) do update set premium = true, maj_le = now();

  return json_build_object('prix', v_saison.prix_premium);
end;
$$;


-- =====================================================================
--  PARTIE 10 — Le classé en ligne, 1v1 et 2v2 (ancien/SQL/classe.sql)
-- =====================================================================
create table if not exists public.rangs (
  discord_id text primary key references public.players(discord_id) on delete cascade,
  cote       int  not null default 1000,
  victoires  int  not null default 0,
  defaites   int  not null default 0,
  maj_le     timestamptz not null default now()
);

create table if not exists public.file_classee (
  discord_id text primary key references public.players(discord_id) on delete cascade,
  mode       text not null default '1v1' check (mode in ('1v1', '2v2')),
  cote       int  not null default 1000,
  entree     timestamptz not null default now(),
  vu_le      timestamptz not null default now(),
  salon      text,
  role       text check (role in ('hote', 'invite')),
  equipe     text check (equipe in ('A', 'B'))
);

create table if not exists public.parties_classees (
  id         bigint generated always as identity primary key,
  salon      text not null,
  discord_id text not null,
  victoire   boolean not null,
  compte     boolean not null default false,
  cree_le    timestamptz not null default now(),
  unique (salon, discord_id)
);
create index if not exists parties_classees_salon on public.parties_classees (salon);

create table if not exists public.salons_classes (
  salon      text not null,
  discord_id text not null,
  mode       text not null default '2v2',
  equipe     text,
  ecart      int,
  cree_le    timestamptz not null default now(),
  primary key (salon, discord_id)
);

alter table public.rangs            enable row level security;
alter table public.file_classee     enable row level security;
alter table public.parties_classees enable row level security;   -- aucune règle
alter table public.salons_classes   enable row level security;   -- aucune règle

drop policy if exists "rangs lisibles" on public.rangs;
create policy "rangs lisibles" on public.rangs for select to anon, authenticated using (true);
drop policy if exists "je lis ma place dans la file" on public.file_classee;
create policy "je lis ma place dans la file" on public.file_classee
  for select to authenticated using (discord_id = public.my_discord_id());

-- Compte une partie (Elo par équipe, K = 32, 4 points au moins) ; p_gagnante null = litige
create or replace function public.classe_compter(p_salon text, p_gagnante text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cote_a  numeric;
  v_cote_b  numeric;
  v_gain_a  int;
  v_gain_b  int;
begin
  insert into rangs (discord_id) select discord_id from salons_classes where salon = p_salon on conflict do nothing;
  perform 1 from rangs where discord_id in (select discord_id from salons_classes where salon = p_salon)
  order by discord_id for update;
  select avg(r.cote) into v_cote_a from rangs r join salons_classes s on s.discord_id = r.discord_id
  where s.salon = p_salon and s.equipe = 'A';
  select avg(r.cote) into v_cote_b from rangs r join salons_classes s on s.discord_id = r.discord_id
  where s.salon = p_salon and s.equipe = 'B';
  v_gain_a := greatest(4, round(32 * (1 - 1 / (1 + power(10, (v_cote_b - v_cote_a) / 400.0))))::int);
  v_gain_b := greatest(4, round(32 * (1 - 1 / (1 + power(10, (v_cote_a - v_cote_b) / 400.0))))::int);

  update salons_classes set ecart = case
      when p_gagnante is null then -(case when equipe = 'A' then v_gain_b else v_gain_a end)
      when equipe = p_gagnante then (case when equipe = 'A' then v_gain_a else v_gain_b end)
      else -(case when p_gagnante = 'A' then v_gain_a else v_gain_b end)
    end
  where salon = p_salon;
  update rangs r set cote = greatest(0, r.cote + s.ecart),
    victoires = r.victoires + (s.ecart > 0)::int,
    defaites  = r.defaites + (s.ecart < 0)::int,
    maj_le = now()
  from salons_classes s where s.salon = p_salon and s.discord_id = r.discord_id;
  update parties_classees set compte = true where salon = p_salon;
end;
$$;

-- Les parties où un seul camp a déclaré son résultat depuis plus de 10 minutes : la déclaration reçue compte
create or replace function public.classe_regler_en_suspens()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r        record;
  v_vict   boolean;
  v_equipe text;
begin
  for r in
    select s.salon from salons_classes s
    group by s.salon
    having not exists (select 1 from parties_classees pc where pc.salon = s.salon and pc.compte)
       and (select min(pc.cree_le) from parties_classees pc where pc.salon = s.salon) < now() - interval '10 minutes'
    order by s.salon
  loop
    perform pg_advisory_xact_lock(hashtext('classe:' || r.salon));
    continue when exists (select 1 from parties_classees where salon = r.salon and compte);
    v_equipe := null;
    select pc.victoire, sc.equipe into v_vict, v_equipe
    from parties_classees pc join salons_classes sc on sc.salon = pc.salon and sc.discord_id = pc.discord_id
    where pc.salon = r.salon order by pc.cree_le limit 1;
    continue when v_equipe is null;
    continue when exists (
      select 1 from parties_classees pc join salons_classes sc on sc.salon = pc.salon and sc.discord_id = pc.discord_id
      where pc.salon = r.salon and sc.equipe <> v_equipe);
    perform classe_compter(r.salon, case when v_vict then v_equipe when v_equipe = 'A' then 'B' else 'A' end);
  end loop;
end;
$$;

-- Chercher (ou continuer à chercher) une partie classée
create or replace function public.chercher_classee(p_mode text default '1v1')
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi    text := my_discord_id();
  v_moi_f  file_classee%rowtype;
  v_adv    file_classee%rowtype;
  v_cote   int;
  v_ecart  int;
  v_code   text;
  v_lettres text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_autres text[];
  v_nb     int;
  v_role   text;
  v_equipe text;
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  if p_mode not in ('1v1', '2v2') then raise exception 'Mode de partie classée inconnu.'; end if;

  perform pg_advisory_xact_lock(hashtext('file_classee'));
  delete from file_classee where (salon is null and vu_le < now() - interval '20 seconds')
    or (salon is not null and vu_le < now() - interval '3 hours');
  delete from salons_classes where cree_le < now() - interval '7 days';
  delete from parties_classees where cree_le < now() - interval '30 days';
  perform classe_regler_en_suspens();

  insert into rangs (discord_id) values (v_moi) on conflict do nothing;
  select cote into v_cote from rangs where discord_id = v_moi;

  insert into file_classee (discord_id, mode, cote) values (v_moi, p_mode, v_cote)
  on conflict (discord_id) do update set vu_le = now(), mode = excluded.mode,
    entree = case when file_classee.salon is not null and file_classee.vu_le < now() - interval '60 seconds' then now() else file_classee.entree end,
    salon = case when file_classee.vu_le < now() - interval '60 seconds' then null else file_classee.salon end,
    role = case when file_classee.vu_le < now() - interval '60 seconds' then null else file_classee.role end,
    equipe = case when file_classee.vu_le < now() - interval '60 seconds' then null else file_classee.equipe end;
  select * into v_moi_f from file_classee where discord_id = v_moi;

  if v_moi_f.salon is not null then
    return json_build_object('salon', v_moi_f.salon, 'role', v_moi_f.role, 'equipe', v_moi_f.equipe);
  end if;

  -- L'écart de cote accepté grandit avec l'attente : 100, puis +25 toutes les 5 secondes (500 au plus)
  v_ecart := least(500, 100 + 25 * floor(extract(epoch from (now() - v_moi_f.entree)) / 5)::int);

  if p_mode = '2v2' then
    select array_agg(t.discord_id order by t.entree) into v_autres from (
      select discord_id, entree from file_classee
      where discord_id <> v_moi and mode = '2v2' and salon is null and abs(cote - v_cote) <= v_ecart
      order by entree limit 3
    ) t;
    v_nb := coalesce(array_length(v_autres, 1), 0);
    if v_nb < 3 then
      return json_build_object('attente', true, 'ecart', v_ecart, 'trouves', v_nb);
    end if;
    loop
      v_code := '';
      for i in 1..5 loop v_code := v_code || substr(v_lettres, 1 + floor(random() * length(v_lettres))::int, 1); end loop;
      exit when not exists (select 1 from file_classee where salon = v_code)
        and not exists (select 1 from parties_classees where salon = v_code)
        and not exists (select 1 from salons_classes where salon = v_code);
    end loop;
    update file_classee f set salon = v_code, role = 'invite',
      equipe = case when q.rang in (1, 4) then 'A' else 'B' end
    from (
      select discord_id, row_number() over (order by cote desc, entree) as rang
      from file_classee where discord_id = any (v_autres || v_moi)
    ) q
    where f.discord_id = q.discord_id;
    update file_classee set role = 'hote'
    where discord_id = (select discord_id from file_classee where salon = v_code order by entree limit 1);
    insert into salons_classes (salon, discord_id, mode, equipe)
    select salon, discord_id, '2v2', equipe from file_classee where salon = v_code;
    select role, equipe into v_role, v_equipe from file_classee where discord_id = v_moi;
    return json_build_object('salon', v_code, 'role', v_role, 'equipe', v_equipe);
  end if;

  select * into v_adv from file_classee
  where discord_id <> v_moi and mode = p_mode and salon is null and abs(cote - v_cote) <= v_ecart
  order by entree limit 1;
  if not found then
    return json_build_object('attente', true, 'ecart', v_ecart);
  end if;

  loop
    v_code := '';
    for i in 1..5 loop v_code := v_code || substr(v_lettres, 1 + floor(random() * length(v_lettres))::int, 1); end loop;
    exit when not exists (select 1 from file_classee where salon = v_code)
      and not exists (select 1 from parties_classees where salon = v_code)
      and not exists (select 1 from salons_classes where salon = v_code);
  end loop;
  update file_classee set salon = v_code, role = case when discord_id = v_adv.discord_id then 'hote' else 'invite' end
  where discord_id in (v_moi, v_adv.discord_id);
  insert into salons_classes (salon, discord_id, mode, equipe) values
    (v_code, v_adv.discord_id, '1v1', 'A'), (v_code, v_moi, '1v1', 'B');
  return json_build_object('salon', v_code, 'role', 'invite');
end;
$$;

create or replace function public.quitter_classee()
returns void
language sql
security definer
set search_path = public
as $$
  delete from file_classee where discord_id = my_discord_id();
$$;

-- Fin d'une partie classée : chacun déclare son résultat
create or replace function public.resultat_classe(p_salon text, p_victoire boolean)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi      text := my_discord_id();
  v_vict     boolean := coalesce(p_victoire, false);
  v_equipe   text;
  v_adv_vict boolean;
  v_cote     int;
  v_ecart    int;
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  if coalesce(p_salon, '') !~ '^[A-Z0-9]{5}$' then raise exception 'Salon invalide.'; end if;
  select equipe into v_equipe from salons_classes where salon = p_salon and discord_id = v_moi;
  if v_equipe is null then raise exception 'Cette partie n''est pas une partie classée.'; end if;

  perform pg_advisory_xact_lock(hashtext('classe:' || p_salon));
  insert into parties_classees (salon, discord_id, victoire) values (p_salon, v_moi, v_vict)
  on conflict (salon, discord_id) do nothing;
  delete from file_classee where discord_id = v_moi;

  if exists (select 1 from parties_classees where salon = p_salon and compte) then
    select cote into v_cote from rangs where discord_id = v_moi;
    select ecart into v_ecart from salons_classes where salon = p_salon and discord_id = v_moi;
    return json_build_object('ok', true, 'cote', coalesce(v_cote, 1000), 'ecart', v_ecart, 'deja', true);
  end if;

  select pc.victoire into v_adv_vict
  from parties_classees pc
  join salons_classes sc on sc.salon = pc.salon and sc.discord_id = pc.discord_id
  where pc.salon = p_salon and sc.equipe <> v_equipe
  order by pc.cree_le limit 1;
  if not found then return json_build_object('attente', true); end if;

  if v_adv_vict = v_vict and not v_vict then
    update parties_classees set compte = true where salon = p_salon;
    return json_build_object('ok', false, 'raison', 'Les deux camps ont déclaré une défaite : la partie n''est pas comptée.');
  end if;

  perform classe_compter(p_salon,
    case when v_adv_vict = v_vict then null              -- deux victoires : litige
         when v_vict then v_equipe
         when v_equipe = 'A' then 'B' else 'A' end);
  select cote into v_cote from rangs where discord_id = v_moi;
  select ecart into v_ecart from salons_classes where salon = p_salon and discord_id = v_moi;
  return json_build_object('ok', true, 'cote', v_cote, 'ecart', v_ecart, 'litige', v_adv_vict = v_vict);
end;
$$;


-- =====================================================================
--  PARTIE 11 — Succès (ancien/SQL/succes.sql ; la liste des succès est dans supabase/donnees.sql)
-- =====================================================================
create table if not exists public.succes (
  id          text primary key,
  categorie   text not null,
  nom         text not null,
  description text not null,
  icone       text not null default '✦',
  mesure      text not null,
  objectif    int  not null default 1 check (objectif >= 0),   -- 0 = « tout » (collection, histoire)
  recompense  int  not null default 0 check (recompense >= 0),
  ordre       int  not null default 0,
  rarete      text not null default 'commun' constraint succes_rarete_check check (rarete in ('commun', 'rare', 'epique', 'legendaire'))
);

create table if not exists public.player_succes (
  discord_id text not null,
  succes_id  text not null references public.succes(id) on delete cascade,
  reclame_le timestamptz not null default now(),
  vitrine    smallint check (vitrine between 1 and 3),   -- badge épinglé sur le profil (place 1, 2 ou 3)
  primary key (discord_id, succes_id)
);
create unique index if not exists player_succes_vitrine on public.player_succes (discord_id, vitrine) where vitrine is not null;

alter table public.succes        enable row level security;
alter table public.player_succes enable row level security;
drop policy if exists "succès lisibles par tous" on public.succes;
create policy "succès lisibles par tous" on public.succes for select to anon, authenticated using (true);
drop policy if exists "je lis mes succès" on public.player_succes;
create policy "je lis mes succès" on public.player_succes
  for select to authenticated using (discord_id = public.my_discord_id());

-- Les chiffres d'un joueur (une table absente compte pour 0)
create or replace function public.succes_stats(p_discord_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s     jsonb := '{}'::jsonb;
  n     int;
  m     int;
  leg   int;
  trans int;
begin
  if to_regclass('public.pass_parties') is not null then
    execute 'select count(*) filter (where victoire), count(*) filter (where victoire and mode = ''ia'')
             from public.pass_parties where discord_id = $1 and termine_le is not null'
      into n, m using p_discord_id;
    s := s || jsonb_build_object('victoires', n, 'victoires_ia', m, 'victoires_joueurs', n - m);
  end if;

  if to_regclass('public.rangs') is not null then
    execute 'select coalesce(max(victoires), 0), coalesce(max(cote), 0) from public.rangs where discord_id = $1'
      into n, m using p_discord_id;
    s := s || jsonb_build_object('classe_victoires', n, 'cote', m);
  end if;

  select count(*), coalesce(sum(pc.quantite), 0),
         count(*) filter (where c.rarity = 'legendaire'),
         count(*) filter (where c.rarity = 'transcendante')
    into n, m, leg, trans
    from player_cards pc join cards c on c.id = pc.card_id
    where pc.discord_id = p_discord_id;
  s := s || jsonb_build_object('cartes', n, 'exemplaires', m, 'legendaires', leg, 'transcendantes', trans);

  select count(*) into n from cards c
    where c.is_available and c.image is not null and c.description is distinct from 'Carte d''exemple'
      and exists (select 1 from player_cards pc where pc.discord_id = p_discord_id and pc.card_id = c.id);
  s := s || jsonb_build_object('collection', n);

  if to_regclass('public.booster_ouvertures') is not null then
    execute 'select count(*) from public.booster_ouvertures where discord_id = $1' into n using p_discord_id;
    s := s || jsonb_build_object('boosters', n);
  end if;

  if to_regclass('public.histoire_progression') is not null then
    execute 'select count(*) from public.histoire_progression where discord_id = $1' into n using p_discord_id;
    s := s || jsonb_build_object('histoire', n);
  end if;

  n := 0;
  if to_regclass('public.echanges') is not null then
    execute 'select count(*) from public.echanges where statut = ''accepte'' and (de = $1 or pour = $1)'
      into m using p_discord_id;
    n := n + m;
  end if;
  if to_regclass('public.contrats') is not null then
    execute 'select count(*) from public.contrats where statut = ''ratifie'' and (de = $1 or pour = $1)'
      into m using p_discord_id;
    n := n + m;
  end if;
  s := s || jsonb_build_object('echanges', n);
  if to_regclass('public.annonces') is not null then
    execute 'select count(*) from public.annonces where statut = ''conclue'' and type = ''vente'' and auteur = $1'
      into n using p_discord_id;
    s := s || jsonb_build_object('ventes', n);
  end if;

  return s;
end;
$$;

-- Objectif réel d'un succès : 0 = « tout » (toutes les cartes du catalogue, tous les niveaux)
create or replace function public.succes_objectif(p_mesure text, p_objectif int)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare n int;
begin
  if p_objectif > 0 then return p_objectif; end if;
  if p_mesure = 'collection' then
    select count(*) into n from cards c
      where c.is_available and c.image is not null and c.description is distinct from 'Carte d''exemple';
    return greatest(n, 1);
  end if;
  if p_mesure = 'histoire' and to_regclass('public.histoire_niveaux') is not null then
    execute 'select count(*) from public.histoire_niveaux' into n;
    return greatest(n, 1);
  end if;
  return 1;
end;
$$;

-- La part des joueurs (ceux qui ont au moins une carte) qui ont obtenu chaque succès
create or replace function public.succes_pourcentages()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(s.id, round(100.0 * coalesce(o.n, 0) / t.total, 1)), '{}'::jsonb)
  from succes s
  cross join (select greatest(count(distinct discord_id), 1) as total from player_cards) t
  left join (select succes_id, count(*) as n from player_succes group by succes_id) o on o.succes_id = s.id;
$$;

-- La liste des succès avec la progression du joueur connecté
create or replace function public.mes_succes()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi   text := my_discord_id();
  v_stats jsonb;
  v_pct   jsonb;
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  v_stats := succes_stats(v_moi);
  v_pct := succes_pourcentages();
  return coalesce((
    select json_agg(json_build_object(
      'id', s.id, 'categorie', s.categorie, 'nom', s.nom, 'description', s.description, 'icone', s.icone,
      'rarete', s.rarete, 'objectif', o.objectif, 'recompense', s.recompense,
      'progression', least(coalesce((v_stats ->> s.mesure)::int, 0), o.objectif),
      'atteint', coalesce((v_stats ->> s.mesure)::int, 0) >= o.objectif,
      'reclame', ps.succes_id is not null, 'reclame_le', ps.reclame_le, 'vitrine', ps.vitrine,
      'pourcentage', coalesce((v_pct ->> s.id)::numeric, 0)
    ) order by s.ordre, s.id)
    from succes s
    cross join lateral (select succes_objectif(s.mesure, s.objectif) as objectif) o
    left join player_succes ps on ps.discord_id = v_moi and ps.succes_id = s.id
  ), '[]'::json);
end;
$$;

-- Les badges épinglés sur le profil d'un joueur (public)
create or replace function public.succes_vitrine(p_discord_id text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_pct jsonb := succes_pourcentages();
begin
  return coalesce((
    select json_agg(json_build_object(
      'id', s.id, 'nom', s.nom, 'description', s.description, 'icone', s.icone, 'rarete', s.rarete,
      'reclame_le', ps.reclame_le, 'pourcentage', coalesce((v_pct ->> s.id)::numeric, 0)
    ) order by ps.vitrine)
    from player_succes ps join succes s on s.id = ps.succes_id
    where ps.discord_id = p_discord_id and ps.vitrine is not null
  ), '[]'::json);
end;
$$;

-- Choisir les badges de sa vitrine : jusqu'à 3 succès OBTENUS, dans l'ordre donné
create or replace function public.choisir_vitrine_succes(p_ids text[])
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi text := my_discord_id();
  i     int;
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  p_ids := coalesce(p_ids, '{}');
  if cardinality(p_ids) > 3 then raise exception 'Trois badges au plus sur ton profil.'; end if;
  if (select count(distinct x) from unnest(p_ids) x) <> cardinality(p_ids) then raise exception 'Badge en double.'; end if;
  if exists (select 1 from unnest(p_ids) x
             where not exists (select 1 from player_succes where discord_id = v_moi and succes_id = x)) then
    raise exception 'Tu ne peux épingler que des succès obtenus.';
  end if;

  update player_succes set vitrine = null where discord_id = v_moi and vitrine is not null;
  for i in 1 .. cardinality(p_ids) loop
    update player_succes set vitrine = i where discord_id = v_moi and succes_id = p_ids[i];
  end loop;
  return succes_vitrine(v_moi);
end;
$$;

-- Réclamer la récompense d'un succès atteint (objectif revérifié côté serveur)
create or replace function public.reclamer_succes(p_succes_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
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

  v_valeur := coalesce((succes_stats(v_moi) ->> v_succes.mesure)::int, 0);
  if v_valeur < succes_objectif(v_succes.mesure, v_succes.objectif) then
    raise exception 'Ce succès n''est pas encore atteint.';
  end if;

  insert into player_succes (discord_id, succes_id) values (v_moi, p_succes_id);

  if v_succes.recompense > 0 then
    update wallets set balance = balance + v_succes.recompense where discord_id = v_moi;
    if not found then
      insert into wallets (discord_id, balance) values (v_moi, v_succes.recompense);
    end if;
    begin
      insert into transactions (discord_id, amount, source, reason)
      values (v_moi, v_succes.recompense, 'succes', 'Succès : ' || v_succes.nom);
    exception when others then null;
    end;
  end if;

  return json_build_object('id', v_succes.id, 'nom', v_succes.nom, 'description', v_succes.description,
    'icone', v_succes.icone, 'rarete', v_succes.rarete, 'recompense', v_succes.recompense,
    'pourcentage', coalesce((succes_pourcentages() ->> v_succes.id)::numeric, 0));
end;
$$;


-- =====================================================================
--  PARTIE 12 — Profil et compte (ancien/SQL/stats_profil.sql, compte.sql, mj_reset_joueur.sql)
-- =====================================================================
-- Totaux PUBLICS d'un joueur (victoires, défaites, cartes)
create or replace function public.stats_joueur(p_discord_id text)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'victoires',         count(*) filter (where victoire),
    'defaites',          count(*) filter (where not victoire),
    'ia_victoires',      count(*) filter (where victoire and mode = 'ia'),
    'ia_defaites',       count(*) filter (where not victoire and mode = 'ia'),
    'joueurs_victoires', count(*) filter (where victoire and mode = 'ami'),
    'joueurs_defaites',  count(*) filter (where not victoire and mode = 'ami'),
    'cartes',            (select count(*) from player_cards where discord_id = p_discord_id),
    'exemplaires',       (select coalesce(sum(quantite), 0) from player_cards where discord_id = p_discord_id)
  )
  from pass_parties
  where discord_id = p_discord_id and termine_le is not null and victoire is not null;
$$;

-- Suppression DÉFINITIVE de son compte (il faut passer le mot « SUPPRIMER »)
create or replace function public.supprimer_mon_compte(p_confirmation text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi    text := my_discord_id();
  v_uid    uuid := auth.uid();
  v_table  text;
begin
  if v_moi is null or v_uid is null then raise exception 'Connecte-toi d''abord.'; end if;
  if p_confirmation is distinct from 'SUPPRIMER' then
    raise exception 'Pour supprimer ton compte, tape SUPPRIMER en majuscules.';
  end if;

  foreach v_table in array array[
    'player_deck_cards', 'player_decks', 'player_cards', 'player_boosters', 'booster_ouvertures',
    'pass_progression', 'pass_parties', 'pass_cosmetiques', 'histoire_progression', 'player_pass', 'histoire_tentatives',
    'joueur_plateaux', 'souhaits', 'rangs', 'file_classee', 'parties_classees', 'salons_classes',
    'inventory', 'wallets', 'transactions'
  ] loop
    if to_regclass('public.' || v_table) is not null then
      execute format('delete from public.%I where discord_id = $1', v_table) using v_moi;
    end if;
  end loop;
  if to_regclass('public.echanges') is not null then
    delete from public.echanges where de = v_moi or pour = v_moi;
  end if;
  if to_regclass('public.contrats') is not null then
    delete from public.contrats where de = v_moi or pour = v_moi;
  end if;
  if to_regclass('public.annonces') is not null then
    delete from public.annonces where auteur = v_moi;
  end if;

  delete from public.players where discord_id = v_moi;
  delete from auth.users where id = v_uid;
end;
$$;

-- Réinitialisation complète d'un joueur depuis le panneau MJ du site (réservé aux MJ)
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
  if not exists (select 1 from players where user_id = auth.uid() and is_mj) then
    raise exception 'Réservé aux MJ.';
  end if;
  if not exists (select 1 from players where discord_id = p_discord_id) then
    raise exception 'Joueur introuvable.';
  end if;
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
    'inventory', 'transactions'
  ] loop
    if to_regclass('public.' || v_table) is not null then
      execute format('delete from public.%I where discord_id = $1', v_table) using p_discord_id;
      get diagnostics v_effaces = row_count;
      v_total := v_total + v_effaces;
    end if;
  end loop;

  if to_regclass('public.echanges') is not null then
    delete from echanges where de = p_discord_id or pour = p_discord_id;
  end if;
  if to_regclass('public.contrats') is not null then
    delete from contrats where de = p_discord_id or pour = p_discord_id;
  end if;
  if to_regclass('public.annonces') is not null then
    delete from annonces where auteur = p_discord_id;
  end if;

  update wallets set balance = 0 where discord_id = p_discord_id;
  update players set banner_item_id = null, title_item_id = null, theme_item_id = null
  where discord_id = p_discord_id;

  return json_build_object('joueur', p_discord_id, 'lignes_effacees', v_total);
end;
$$;


-- =====================================================================
--  PARTIE 13 — Realtime : salons PRIVÉS du duel en ligne (ancien/SQL/salons_prives.sql)
--  Seuls les joueurs connectés qui ont un profil écoutent et parlent dans les canaux « duel-CODE ».
--  (Le jeu n'utilise que Broadcast et Presence : aucune table à ajouter à la publication Realtime.)
-- =====================================================================
drop policy if exists "duel : les joueurs connectés écoutent les salons" on realtime.messages;
create policy "duel : les joueurs connectés écoutent les salons" on realtime.messages
  for select to authenticated
  using (realtime.topic() like 'duel-%' and public.my_discord_id() is not null);

drop policy if exists "duel : les joueurs connectés parlent dans les salons" on realtime.messages;
create policy "duel : les joueurs connectés parlent dans les salons" on realtime.messages
  for insert to authenticated
  with check (realtime.topic() like 'duel-%' and public.my_discord_id() is not null);

-- 2 contre 2 : le canal privé de chaque joueur, « main-CODE-<discord_id> » (la partie vue de sa place,
-- envoyée par l'hôte) : seul ce joueur l'écoute ; l'hôte y écrit sans l'écouter.
drop policy if exists "duel : chacun écoute son canal privé" on realtime.messages;
create policy "duel : chacun écoute son canal privé" on realtime.messages
  for select to authenticated
  using (realtime.topic() like 'main-%' and split_part(realtime.topic(), '-', 3) = public.my_discord_id());

drop policy if exists "duel : les joueurs connectés écrivent dans les canaux privés" on realtime.messages;
create policy "duel : les joueurs connectés écrivent dans les canaux privés" on realtime.messages
  for insert to authenticated
  with check (realtime.topic() like 'main-%' and public.my_discord_id() is not null);


-- =====================================================================
--  PARTIE 14 — Droits des rôles du navigateur (anon = visiteur, authenticated = joueur connecté)
--  Les joueurs ne font que LIRE les tables (les règles RLS ci-dessus choisissent quelles lignes) ;
--  toutes les écritures passent par les fonctions security definer.
-- =====================================================================
grant usage on schema public to anon, authenticated;

-- Tables : on retire tout, puis on rouvre la lecture
do $$
declare t text;
begin
  foreach t in array array[
    'items', 'players', 'wallets', 'transactions', 'inventory', 'daily_shop',
    'cards', 'player_cards', 'player_decks', 'player_deck_cards',
    'boosters', 'booster_cartes', 'player_boosters', 'booster_ouvertures', 'player_booster_gratuit',
    'plateaux', 'joueur_plateaux', 'echanges', 'contrats', 'souhaits', 'annonces',
    'histoire_chapitres', 'histoire_niveaux', 'histoire_progression', 'player_pass', 'histoire_tentatives',
    'saisons', 'pass_paliers', 'pass_progression', 'pass_parties', 'pass_cosmetiques',
    'rangs', 'file_classee', 'parties_classees', 'salons_classes',
    'succes', 'player_succes'
  ] loop
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
  -- Lecture (filtrée par les règles RLS) ; personne ne lit histoire_tentatives, pass_parties,
  -- parties_classees ni salons_classes depuis le navigateur
  foreach t in array array[
    'items', 'players', 'wallets', 'transactions', 'inventory', 'daily_shop',
    'cards', 'player_cards', 'player_decks', 'player_deck_cards',
    'boosters', 'booster_cartes', 'player_boosters', 'booster_ouvertures', 'player_booster_gratuit',
    'plateaux', 'joueur_plateaux', 'echanges', 'contrats', 'souhaits', 'annonces',
    'histoire_chapitres', 'histoire_niveaux', 'histoire_progression', 'player_pass',
    'saisons', 'pass_paliers', 'pass_progression', 'pass_cosmetiques',
    'rangs', 'file_classee', 'succes', 'player_succes'
  ] loop
    execute format('grant select on public.%I to anon, authenticated', t);
  end loop;
end $$;
-- Le grimoire : le joueur range ses cartes (seulement page et pochette, et seulement les siennes : RLS)
grant update (page, slot) on public.player_cards to authenticated;

-- Fonctions internes : appelables par personne depuis le navigateur
revoke all on function
  public.creer_profil_joueur(), public.maj_avatar_joueur(), public.place_new_card(),
  public.crediter_recyclage(text, int, int, text),
  public.commerce_verifier(text, bigint[], int, text[]), public.commerce_objets_deja(text, text[]),
  public.commerce_transferer(text, text, bigint[], int, text[], text),
  public.pass_saison_en_cours(), public.pass_ajouter_xp(text, int), public.pass_donner_or(text, int, text),
  public.classe_compter(text, text), public.classe_regler_en_suspens(),
  public.succes_stats(text), public.succes_objectif(text, int), public.succes_pourcentages()
from public, anon, authenticated;

-- Fonctions des joueurs connectés
revoke all on function
  public.my_discord_id(), public.buy_daily_item(bigint), public.buy_fun_item(bigint),
  public.equip_cosmetic(bigint), public.unequip_cosmetic(text),
  public.move_card(bigint, int, int), public.set_deck(bigint[]), public.rename_deck(text),
  public.grant_card(text, bigint, text), public.buy_card(bigint),
  public.acheter_booster(text, int), public.ouvrir_booster(text),
  public.booster_gratuit_etat(), public.ouvrir_booster_gratuit(),
  public.recycler_carte(bigint, int), public.recycler_doublons(),
  public.acheter_plateau(text), public.equiper_plateau(text),
  public.cartes_du_joueur(text), public.objets_du_joueur(text),
  public.ouvrir_contrat(text, bigint[], bigint[], int, int, text[], text[], text),
  public.modifier_contrat(bigint, bigint[], bigint[], int, int, text[], text[], text),
  public.apposer_sceau(bigint, int), public.rompre_contrat(bigint), public.basculer_souhait(bigint),
  public.publier_annonce(text, bigint, int, text), public.retirer_annonce(bigint), public.conclure_annonce(bigint),
  public.histoire_commencer(text), public.valider_niveau_histoire(text),
  public.pass_commencer_partie(text, text, text), public.pass_fin_partie(uuid, boolean),
  public.pass_reclamer(int, text), public.pass_debloquer_premium(),
  public.chercher_classee(text), public.quitter_classee(), public.resultat_classe(text, boolean),
  public.mes_succes(), public.reclamer_succes(text), public.choisir_vitrine_succes(text[]),
  public.supprimer_mon_compte(text), public.mj_reset_player(text)
from public, anon;
grant execute on function
  public.my_discord_id(), public.buy_daily_item(bigint), public.buy_fun_item(bigint),
  public.equip_cosmetic(bigint), public.unequip_cosmetic(text),
  public.move_card(bigint, int, int), public.set_deck(bigint[]), public.rename_deck(text),
  public.grant_card(text, bigint, text),            -- vérifie is_mj
  public.buy_card(bigint),
  public.acheter_booster(text, int), public.ouvrir_booster(text),
  public.booster_gratuit_etat(), public.ouvrir_booster_gratuit(),
  public.recycler_carte(bigint, int), public.recycler_doublons(),
  public.acheter_plateau(text), public.equiper_plateau(text),
  public.cartes_du_joueur(text), public.objets_du_joueur(text),
  public.ouvrir_contrat(text, bigint[], bigint[], int, int, text[], text[], text),
  public.modifier_contrat(bigint, bigint[], bigint[], int, int, text[], text[], text),
  public.apposer_sceau(bigint, int), public.rompre_contrat(bigint), public.basculer_souhait(bigint),
  public.publier_annonce(text, bigint, int, text), public.retirer_annonce(bigint), public.conclure_annonce(bigint),
  public.histoire_commencer(text), public.valider_niveau_histoire(text),
  public.pass_commencer_partie(text, text, text), public.pass_fin_partie(uuid, boolean),
  public.pass_reclamer(int, text), public.pass_debloquer_premium(),
  public.chercher_classee(text), public.quitter_classee(), public.resultat_classe(text, boolean),
  public.mes_succes(), public.reclamer_succes(text), public.choisir_vitrine_succes(text[]),
  public.supprimer_mon_compte(text),
  public.mj_reset_player(text)                       -- vérifie is_mj
to authenticated;

-- Fonctions publiques (visiteurs compris) : profils publics et boutique du marchand
grant execute on function
  public.stats_joueur(text), public.succes_vitrine(text),
  public.current_shop_slot(), public.next_shop_refresh(),
  public.card_attack_is_valid(jsonb), public.valeur_recyclage(text), public.commerce_normaliser(bigint[], text[], int)
to anon, authenticated;

-- =====================================================================
--  PARTIE 15 — Journal des erreurs du jeu (aussi dans supabase/erreurs.sql)
--  Le jeu y signale les écrans qui plantent ; on lit la table erreurs_jeu dans le Table Editor.
-- =====================================================================
create table if not exists public.erreurs_jeu (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  discord_id text,                 -- vide pour un visiteur non connecté
  message    text not null,
  pile       text,                 -- où le code a planté (stack)
  origine    text,                 -- ecran, global, promesse…
  page       text,                 -- l'écran (#/duel, #/boutique…)
  navigateur text,
  version    text                  -- le commit publié (« local » en développement)
);
create index if not exists erreurs_jeu_date on public.erreurs_jeu (created_at);
alter table public.erreurs_jeu enable row level security;
revoke all on public.erreurs_jeu from anon, authenticated;

create or replace function public.signaler_erreur(
  p_message text, p_pile text, p_origine text, p_page text, p_navigateur text, p_version text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(p_message, '') = '' then return; end if;
  -- Une avalanche (boucle de plantage, abus) : on n'enregistre plus rien pendant la minute
  if (select count(*) from erreurs_jeu where created_at > now() - interval '1 minute') >= 30 then return; end if;
  -- Le journal ne garde que les 60 derniers jours
  delete from erreurs_jeu where created_at < now() - interval '60 days';
  insert into erreurs_jeu (discord_id, message, pile, origine, page, navigateur, version)
  values (my_discord_id(), left(p_message, 500), left(p_pile, 4000), left(p_origine, 40),
          left(p_page, 200), left(p_navigateur, 300), left(p_version, 40));
end;
$$;
revoke all on function public.signaler_erreur(text, text, text, text, text, text) from public;
grant execute on function public.signaler_erreur(text, text, text, text, text, text) to anon, authenticated;


notify pgrst, 'reload schema';
