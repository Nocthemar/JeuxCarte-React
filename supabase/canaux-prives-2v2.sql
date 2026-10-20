-- =====================================================================
--  Canaux privés du 2 contre 2 (étape 10 de la migration, mains masquées)
--  À lancer UNE fois dans le SQL Editor du projet Supabase (déjà inclus dans schema.sql, partie 13).
--
--  En 2 contre 2, l'hôte envoie à chaque joueur la partie vue de sa place, sur un canal privé
--  « main-CODE-<discord_id> » : seul ce joueur peut l'écouter (les autres ne voient jamais sa main).
--  L'hôte y écrit sans l'écouter : tout joueur connecté peut écrire dans ces canaux.
-- =====================================================================
drop policy if exists "duel : chacun écoute son canal privé" on realtime.messages;
create policy "duel : chacun écoute son canal privé" on realtime.messages
  for select to authenticated
  using (realtime.topic() like 'main-%' and split_part(realtime.topic(), '-', 3) = public.my_discord_id());

drop policy if exists "duel : les joueurs connectés écrivent dans les canaux privés" on realtime.messages;
create policy "duel : les joueurs connectés écrivent dans les canaux privés" on realtime.messages
  for insert to authenticated
  with check (realtime.topic() like 'main-%' and public.my_discord_id() is not null);
