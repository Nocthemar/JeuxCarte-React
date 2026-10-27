-- =====================================================================
--  Le portrait des comptes e-mail : une image choisie par le joueur (Paramètres > Compte)
--  À lancer APRÈS schema.sql et securite.sql, dans les deux projets (dev puis le vrai). Relançable sans casse.
--
--  Les comptes Discord gardent le portrait de Discord (maj_avatar_joueur, securite.sql).
--  Les comptes e-mail déposent une image dans le stockage « avatars » (public en lecture) :
--   - le navigateur la recadre en carré de 256 px (webp, ou png si le navigateur ne sait pas faire de webp) ;
--   - elle va dans le dossier du joueur : avatars/<discord_id>/<nom au hasard>.webp, 512 ko au plus ;
--   - changer_avatar(url) vérifie que l'image est bien à lui, dans son dossier, puis la met sur son profil.
--  Le joueur peut aussi retirer son portrait (changer_avatar(null)).
-- =====================================================================

-- Le stockage « avatars » : lisible par tous (les portraits s'affichent partout), 512 ko, images seulement
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 524288, array['image/webp', 'image/png'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
                               allowed_mime_types = excluded.allowed_mime_types;

-- Déposer : un compte e-mail, dans son propre dossier, un nom simple, 5 images au plus
drop policy if exists avatars_deposer on storage.objects;
create policy avatars_deposer on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and name ~ '^[a-z0-9_]+/[a-z0-9-]+\.(webp|png)$'
    and split_part(name, '/', 1) = public.my_discord_id()
    and exists (select 1 from public.players p where p.discord_id = public.my_discord_id() and p.fournisseur = 'email')
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
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord.'; end if;
  if not exists (select 1 from players where discord_id = v_moi and fournisseur = 'email') then
    raise exception 'Ton portrait vient de Discord : change-le sur Discord.';
  end if;
  if p_url is null then
    update players set avatar_url = null where discord_id = v_moi;
    return null;
  end if;
  v_nom := substring(p_url from '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/avatars/([a-z0-9_]+/[a-z0-9-]+\.(?:webp|png))$');
  if v_nom is null or split_part(v_nom, '/', 1) <> v_moi then raise exception 'Cette image ne peut pas servir de portrait.'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'avatars' and name = v_nom) then
    raise exception 'Image introuvable : réessaie.';
  end if;
  update players set avatar_url = p_url where discord_id = v_moi;
  perform securite.journaliser('avatar_change', jsonb_build_object('image', v_nom));
  return p_url;
end;
$$;
revoke all on function public.changer_avatar(text) from public, anon;
grant execute on function public.changer_avatar(text) to authenticated;
