-- =====================================================================
--  Journal des erreurs du jeu (déjà inclus dans schema.sql, partie 15)
--  À lancer UNE fois dans le SQL Editor du projet Supabase.
--
--  Quand un écran plante chez un joueur, le jeu appelle signaler_erreur() : le message arrive
--  dans la table erreurs_jeu (Table Editor), avec la page, le navigateur et la version du jeu.
--  Personne ne lit cette table depuis le navigateur ; on y écrit seulement par la fonction,
--  qui coupe les textes trop longs et refuse les avalanches (30 erreurs par minute au plus).
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
