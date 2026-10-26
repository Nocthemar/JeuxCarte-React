-- =====================================================================
--  Cosmétiques de test pour le profil — À EXÉCUTER DANS LE PROJET DE DÉVELOPPEMENT SEULEMENT
--  (https://wdzftdqdgcqladvmrweh.supabase.co, SQL Editor), jamais dans le vrai projet.
--
--  La base de développement n'a ni bannière ni titre (les vrais sont dans le vrai projet) : ce script
--  crée 3 bannières et 4 titres marqués « (test) », les donne à un joueur avec les thèmes existants,
--  et lui équipe une bannière, un titre et un thème. Ensuite, on les change dans la Boutique
--  (l'armoire du profil). Le script peut être relancé sans rien dupliquer.
--  Le joueur : 568371989547319296 (ton ID Discord ; à remplacer partout pour un autre compte).
--  Bannières : les images de fond du jeu en ligne (adresses complètes).
-- =====================================================================

-- 1. Les bannières et les titres de test
insert into public.items (name, kind, shop, price, is_available, description, payload)
select n.name, n.kind, 'fun', 0, true, 'Pour les tests du profil.', n.payload::jsonb
from (values
  ('Bannière « Devanture » (test)', 'banner', '{"image": "https://nocthemar.github.io/JeuxCarte-React/img/Fond/Boutique_fond.png"}'),
  ('Bannière « Champ de blé » (test)', 'banner', '{"image": "https://nocthemar.github.io/JeuxCarte-React/img/Fond/campagne_fond.png"}'),
  ('Bannière « Aurore » (test)', 'banner', '{"image": "https://nocthemar.github.io/JeuxCarte-React/img/Fond/Duel.png?v=4"}'),
  ('Titre « Le Brave » (test)', 'title', '{"text": "Le Brave"}'),
  ('Titre « Briseur d’Ombres » (test)', 'title', '{"text": "Briseur d’Ombres"}'),
  ('Titre « Gardien de Pravorn » (test)', 'title', '{"text": "Gardien de Pravorn"}'),
  ('Titre « Maître du Grimoire » (test)', 'title', '{"text": "Maître du Grimoire"}')
) as n(name, kind, payload)
where not exists (select 1 from public.items i where i.name = n.name);

-- 2. Tous les thèmes, et les bannières et titres de test, dans l'inventaire du joueur
insert into public.inventory (discord_id, item_id)
select '568371989547319296', i.id from public.items i
where i.kind = 'theme' or (i.kind in ('banner', 'title') and i.name like '%(test)')
on conflict (discord_id, item_id) do nothing;

-- 3. Équipés : la première bannière, le premier titre et le premier thème
update public.players set
  banner_item_id = (select id from public.items where kind = 'banner' and name like '%(test)' order by id limit 1),
  title_item_id  = (select id from public.items where kind = 'title'  and name like '%(test)' order by id limit 1),
  theme_item_id  = (select id from public.items where kind = 'theme' order by id limit 1)
where discord_id = '568371989547319296';

-- Vérification
select p.username, b.name as banniere, t.name as titre, th.name as theme
from public.players p
left join public.items b on b.id = p.banner_item_id
left join public.items t on t.id = p.title_item_id
left join public.items th on th.id = p.theme_item_id
where p.discord_id = '568371989547319296';
