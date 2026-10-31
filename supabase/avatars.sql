-- =====================================================================
--  Le portrait choisi par le joueur (Paramètres > Compte), pour tous les comptes (e-mail et Discord)
--  À lancer APRÈS schema.sql et securite.sql, dans les deux projets (dev puis le vrai). Relançable sans casse.
--
--  Le joueur dépose une image dans le stockage « avatars » (public en lecture) :
--   - le navigateur la recadre en carré de 256 px (webp, ou png si le navigateur ne sait pas faire de webp) ;
--   - elle va dans le dossier du joueur : avatars/<discord_id>/<nom au hasard>.webp, 512 ko au plus ;
--   - changer_avatar(url) vérifie que l'image est bien à lui, dans son dossier, puis la met sur son profil.
--  Le joueur peut aussi retirer son portrait (changer_avatar(null)) : un compte Discord reprend alors celui de Discord.
--  Un compte Discord qui a choisi son portrait (players.avatar_perso) ne le voit plus remplacé par celui de Discord
--  à chaque connexion (maj_avatar_joueur, redéfinie ici).
-- =====================================================================

alter table public.players add column if not exists avatar_perso boolean not null default false;

-- L'avatar suit Discord (une image de Discord seulement), sauf si le joueur a choisi le sien.
-- (même fonction que securite.sql, qui la définit aussi : avatar_perso y est lu sans en dépendre, au cas où
-- securite.sql serait relancé avant ce fichier)
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
  update players p set avatar_url = v_avatar
  where p.user_id = new.id and p.fournisseur is distinct from 'email' and p.avatar_url is distinct from v_avatar
    and coalesce((to_jsonb(p) ->> 'avatar_perso')::boolean, false) = false;
  return new;
end;
$$;

-- Le stockage « avatars » : lisible par tous (les portraits s'affichent partout), 512 ko, images seulement
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 524288, array['image/webp', 'image/png'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
                               allowed_mime_types = excluded.allowed_mime_types;

-- Déposer : dans son propre dossier, un nom simple, 5 images au plus
drop policy if exists avatars_deposer on storage.objects;
create policy avatars_deposer on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and name ~ '^[a-z0-9_]+/[a-z0-9-]+\.(webp|png)$'
    and split_part(name, '/', 1) = public.my_discord_id()
    and (select count(*) from storage.objects o
         where o.bucket_id = 'avatars' and split_part(o.name, '/', 1) = public.my_discord_id()) < 5
  );
-- Voir et effacer : seulement son dossier (pour ranger les anciens portraits)
drop policy if exists avatars_voir on storage.objects;
create policy avatars_voir on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and split_part(name, '/', 1) = public.my_discord_id());
drop policy if exists avatars_effacer on storage.objects;
create policy avatars_effacer on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and split_part(name, '/', 1) = public.my_discord_id());

-- Mettre une image de son dossier sur son profil (ou retirer son portrait : null)
create or replace function public.changer_avatar(p_url text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_moi text := my_discord_id();
  v_nom text;
  v_discord text;
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  if p_url is null then
    -- un compte Discord reprend le portrait de Discord ; un compte e-mail n'en a plus
    select u.raw_user_meta_data ->> 'avatar_url' into v_discord
    from players p join auth.users u on u.id = p.user_id
    where p.discord_id = v_moi and p.fournisseur is distinct from 'email';
    if v_discord !~ '^https://cdn\.discordapp\.com/' then v_discord := null; end if;
    update players set avatar_url = v_discord, avatar_perso = false where discord_id = v_moi;
    return v_discord;
  end if;
  v_nom := substring(p_url from '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/avatars/([a-z0-9_]+/[a-z0-9-]+\.(?:webp|png))$');
  if v_nom is null or split_part(v_nom, '/', 1) <> v_moi then raise exception 'Cette image ne peut pas servir de portrait.'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'avatars' and name = v_nom) then
    raise exception 'Image introuvable : réessaie.';
  end if;
  update players set avatar_url = p_url, avatar_perso = true where discord_id = v_moi;
  perform securite.journaliser('avatar_change', jsonb_build_object('image', v_nom));
  return p_url;
end;
$$;
revoke all on function public.changer_avatar(text) from public, anon;
grant execute on function public.changer_avatar(text) to authenticated;
