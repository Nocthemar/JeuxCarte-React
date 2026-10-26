-- =====================================================================
--  Nouvelle carte : Elyan, l'ami des Dragons (Mythique) — à exécuter dans le projet de DÉVELOPPEMENT
--  pour tester, puis dans le VRAI projet pour qu'elle existe en ligne (SQL Editor, Run).
--  Ajoute la carte (ou la met à jour si elle existe déjà), puis la met dans les 4 boosters.
--  Son image (public/img/Cartes/Elyan-Carte.webp) et son Trait (Charge, src/data/regles.js) sont dans le jeu.
--  Peut être relancé sans rien dupliquer.
-- =====================================================================

-- 1. La carte
with nouvelle (name, image, rarity, description, attack_1, attack_2) as (values (
  'Elyan, l''ami des Dragons', 'img/Cartes/Elyan-Carte.webp', 'mythique',
  'Sur les falaises au bord de la mer, Elyan guette l''horizon sous sa capuche d''écailles. Les dragons ne l''ont jamais chassé : ils le reconnaissent comme l''un des leurs.',
  '{"veine": "bete", "nom": "Morsure d''Écailles", "effet": "La capuche de dragon s''anime et referme ses crocs sur la cible.", "puissance": 50}',
  '{"veine": "maree", "nom": "Appel des Dragons", "effet": "Un cri porté par le vent du large : au loin, quelque chose de gigantesque lui répond.", "puissance": 60}'
)),
maj as (
  update public.cards c
  set image = n.image, rarity = n.rarity, description = n.description,
      attack_1 = n.attack_1::jsonb, attack_2 = n.attack_2::jsonb, is_available = true
  from nouvelle n
  where c.name = n.name
  returning c.id
)
insert into public.cards (name, image, rarity, description, source, is_available, rank, attack_1, attack_2)
select n.name, n.image, n.rarity, n.description, 'recompense', true, null, n.attack_1::jsonb, n.attack_2::jsonb
from nouvelle n
where not exists (select 1 from public.cards c where c.name = n.name);

-- 2. Dans les 4 boosters (Éclat, Booster et Grand Booster des Cendres, Offrande du Voyageur)
insert into public.booster_cartes (booster_id, card_id)
select b.id, c.id
from public.cards c cross join (values ('eclat'), ('cendres'), ('grand'), ('gratuit')) as b(id)
where c.name = 'Elyan, l''ami des Dragons'
on conflict do nothing;

-- Vérification : la carte et ses boosters
select c.id, c.name, c.rarity, c.image, string_agg(bc.booster_id, ', ' order by bc.booster_id) as boosters
from public.cards c
left join public.booster_cartes bc on bc.card_id = c.id
where c.name = 'Elyan, l''ami des Dragons'
group by c.id, c.name, c.rarity, c.image;
