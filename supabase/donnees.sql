-- =====================================================================
--  Duel des Couronnes — données de référence (projet de DÉVELOPPEMENT)
--
--  À lancer dans Supabase > SQL Editor APRÈS supabase/schema.sql. Relançable : une ligne déjà présente
--  (même nom, même id) est mise à jour, jamais dupliquée.
--
--  Contenu, reconstitué à partir des fichiers ancien/SQL/*.sql (leur état final) :
--    1. le catalogue des cartes (18 cartes et la carte d'exemple)
--    2. les boosters et leurs cartes
--    3. les plateaux
--    4. le mode Histoire (chapitre Pravorn, 7 niveaux)
--    5. le Pass de saison (saison 1 et ses 60 paliers)
--    6. les succès
--    7. les thèmes de la boutique des apparences
--  Ce qui a pu être changé à la main dans l'interface de l'ancien projet (prix, nouvelles cartes,
--  bannières et titres du site…) n'est PAS ici : pour une copie exacte, voir
--  supabase/exporter-depuis-ancien.sql et supabase/LISEZ-MOI.md.
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. Le catalogue des cartes
-- ---------------------------------------------------------------------
with nouvelles (name, image, rarity, description, rank, attack_1, attack_2) as (values
  ('Kaéliss', 'img/Cartes/Kaéliss-Carte.webp', 'legendaire',
   'La Déesse du Sang, détentrice de la Veine du Sang — Rang I, Cœur Immuable.', 1,
   '{"veine": "sang", "nom": "Maître du Flot", "effet": "Vide ou remplit le sang d''une cible à distance.", "puissance": 80}',
   '{"veine": "sang", "nom": "Cœur Immuable", "effet": "Prend le contrôle total de tout ennemi qui saigne.", "puissance": 120}'),
  ('Dalek', 'img/Cartes/Dalek-Carte.webp', 'legendaire',
   'Le Dieu du Rêve, détenteur de la Veine du Rêve — Rang I, Seigneurs des Rêves.', 1,
   '{"veine": "reve", "nom": "Marcheur d''Esprit", "effet": "Plonge une cible éveillée dans un sommeil forcé.", "puissance": 70}',
   '{"veine": "reve", "nom": "Seigneur des Rêves", "effet": "Un rêve partagé dont les blessures suivent le réveil.", "puissance": 110}'),
  ('Maître du Jeu', 'img/Cartes/Maitre du jeux.webp', 'transcendante',
   'Celui qui tisse les destins de Nocthémar.', null,
   '{"veine": "destin", "nom": "Coup du Sort", "effet": "Relance n''importe quel dé, allié ou ennemi.", "puissance": 99}',
   '{"veine": "destin", "nom": "Plume du Codex", "effet": "Réécrit une règle du monde, le temps d''une scène.", "puissance": "∞"}'),
  ('Veilleuse Écarlate', 'img/Cartes/Kaéliss-Carte.webp', 'legendaire',
   'Carte d''exemple', 2,
   '{"veine": "sang", "nom": "Saignée Pourpre", "effet": "Draine la vie de la cible et soigne la Veilleuse.", "puissance": 60}',
   '{"veine": "ombre", "nom": "Voile de Cendres", "effet": "Disparaît dans l''ombre jusqu''au prochain tour.", "puissance": 30}'),
  ('Mange-cœur', 'img/Cartes/Mange-coeur-Carte.webp', 'eveillee',
   'Prédateur humanoïde qui éventre ses victimes et consomme leur cœur.', null,
   '{"veine": "bete", "nom": "Éventrement", "effet": "Ouvre la poitrine de sa proie pour lui arracher le cœur.", "puissance": 50}',
   '{"veine": "tombeau", "nom": "Voix du Défunt", "effet": "Imite la voix d''une personne récemment tuée.", "puissance": 20}'),
  ('Slime', 'img/Cartes/Slime-Carte.webp', 'commune',
   'Petite masse gélatineuse translucide se déplaçant lentement. Inoffensive tant qu''on ne la dérange pas, elle se nourrit de matières en décomposition.', null,
   '{"veine": "racine", "nom": "Masse gélatineuse", "effet": "Se répand en travers du passage et englue ceux qui la touchent.", "puissance": 20}',
   '{"veine": "maree", "nom": "Englobement", "effet": "Engloutit une petite proie et la dissout lentement.", "puissance": 30}'),
  ('Seigneur des Marais', 'img/Cartes/Marais-carte.png', 'legendaire',
   'Nul ne sait d''où il vient. Les marais, eux, se souviennent. Divinité méconnue, il porte une Veine qu''aucun registre ne recense.', null,
   '{"veine": "racine", "nom": "Étreinte de la Vase", "effet": "La vase se referme sur la cible et la retient au fond des eaux.", "puissance": 60}',
   '{"veine": "maree", "nom": "Brume Stagnante", "effet": "Une brume épaisse monte des eaux mortes et étouffe tout ce qu''elle touche.", "puissance": 75}'),
  ('Elfe des Neiges', 'img/Cartes/féedesneiges-bleux.png', 'mythique',
   'Elle danse dans les tempêtes d''Erynedhal, et la neige tombe là où elle passe. Ceux qui la suivent ne retrouvent jamais leur chemin.', null,
   '{"veine": "maree", "nom": "Souffle de Givre", "effet": "Un souffle glacé fige la cible sous une fine couche de givre.", "puissance": 45}',
   '{"veine": "reve", "nom": "Berceuse des Neiges", "effet": "Un chant doux plonge la cible dans le sommeil froid de l''hiver.", "puissance": 55}'),
  ('Elfe des Neiges dorée', 'img/Cartes/féedesneiges.png', 'transcendante',
   'Une nuit par siècle, l''Elfe des Neiges s''éveille sous l''aurore d''Erynedhal. Ses larmes deviennent cristal, et l''hiver entier lui obéit.', null,
   '{"veine": "reve", "nom": "Larmes de Cristal", "effet": "Ses larmes se changent en éclats de cristal qui transpercent la cible.", "puissance": 80}',
   '{"veine": "maree", "nom": "Blizzard d''Erynedhal", "effet": "Le blizzard éternel des montagnes s''abat sur le champ de bataille.", "puissance": 120}'),
  ('Garde d''Erynedhal', 'img/Cartes/Garde-Erynedhal-Carte.webp', 'commune',
   'Seule sur les crêtes d''Erynedhal, la gardienne ne laisse aucune trace dans la neige. Sous la capuche et le heaume d''acier, ses yeux d''elfe voient venir l''ennemi bien avant qu''il ne l''aperçoive.', null,
   '{"veine": "maree", "nom": "Pique Glacée", "effet": "La pointe de sa lance, givrée par le vent des cimes, mord la cible d''un froid qui engourdit.", "puissance": 35}',
   '{"veine": "regard", "nom": "Œil des Cimes", "effet": "Elle a repéré la faille bien avant le combat : son coup tombe là où l''armure cède.", "puissance": 45}'),
  ('Gardes d''Erynedhal', 'img/Cartes/Garde-Elfes-Carte.webp', 'eveillee',
   'Nul ne franchit les cols d''Erynedhal sans qu''elles le sachent. Encapuchonnées de noir, le visage caché derrière l''acier, les gardiennes elfes veillent sur les neiges éternelles et sur le sommeil de l''Elfe des Neiges.', null,
   '{"veine": "maree", "nom": "Lance de Givre", "effet": "Une lance trempée dans les eaux gelées d''Erynedhal : elle transperce et glace la cible.", "puissance": 45}',
   '{"veine": "ombre", "nom": "Embuscade des Neiges", "effet": "Surgies du blizzard, les gardiennes frappent avant même d''avoir été vues.", "puissance": 55}'),
  ('Garde de Pravorn', 'img/Cartes/Garde-Pravorn-Carte.webp', 'commune',
   'Ils sont des milliers à veiller sur les routes du plus vaste royaume du continent. Sous la cape verte de Pravorn, un garde ne recule jamais : il tient sa place jusqu''à la relève, ou jusqu''à la mort.', null,
   '{"veine": "forge", "nom": "Écu levé", "effet": "Le garde lève son bouclier et encaisse le coup à la place de ceux qu''il protège.", "puissance": 35}',
   '{"veine": "trone", "nom": "Estocade du Serment", "effet": "Une estocade portée au nom de la Couronne de Pravorn.", "puissance": 45}'),
  ('Gardes de Pravorn', 'img/Cartes/Gardes-Pravorn-Carte.webp', 'eveillee',
   'Quand la cloche des remparts sonne, ils se rangent épaule contre épaule. Lance, épée et bouclier : ensemble, les gardes de Pravorn forment un mur qu''aucun champion du Grand Tournoi n''a jamais franchi.', null,
   '{"veine": "chaine", "nom": "Mur de Boucliers", "effet": "Les boucliers se serrent les uns contre les autres : nul ne passe tant que la garde tient.", "puissance": 40}',
   '{"veine": "trone", "nom": "Charge de la Garde", "effet": "Lances baissées, la garde charge d''un même pas, comme un seul homme.", "puissance": 60}'),
  ('Garde d''Aelkor', 'img/Cartes/Garde-Aelkor-Carte.webp', 'commune',
   'Forgée dans les ateliers d''Aelkor, son armure ne craint ni la lame ni le feu. Le garde nain ne sert ni roi ni dynastie : marteau en main, il veille sur les trois élus du peuple.', null,
   '{"veine": "forge", "nom": "Coup de Marteau", "effet": "Un marteau de guerre nain s''abat de tout son poids : l''acier plie, la pierre se fend.", "puissance": 40}',
   '{"veine": "trone", "nom": "Serment des Trois", "effet": "Le garde frappe au nom des trois élus d''Aelkor, et son serment lui donne la force de deux.", "puissance": 50}'),
  ('Gardes d''Aelkor', 'img/Cartes/Gardes-Aelkor-Carte.webp', 'eveillee',
   'Quand les cloches des forges se taisent, la garde d''Aelkor descend les escaliers de pierre. Trois marteaux, un même pas : les nains ne reculent jamais devant ce qu''ils ont juré de protéger.', null,
   '{"veine": "forge", "nom": "Marteaux en Cadence", "effet": "Les marteaux tombent l''un après l''autre, au rythme des enclumes d''Aelkor.", "puissance": 45}',
   '{"veine": "chaine", "nom": "Rang d''Acier", "effet": "Épaule contre épaule, la garde avance comme un mur de métal que rien ne fait plier.", "puissance": 55}'),
  ('Vultoff', 'img/Cartes/Vultoff-Carte.webp', 'legendaire',
   'Assis sur un autel en ruine, sous la lune, Vultoff tient sa propre tête au creux de la main. Nul ne sait qui l''a décapité, ni pourquoi la mort a refusé de le prendre.', null,
   '{"veine": "tombeau", "nom": "Sentence du Sans-Tête", "effet": "Le regard de la tête tranchée se pose sur la cible : la mort qu''il a refusée, il la rend.", "puissance": 70}',
   '{"veine": "sang", "nom": "Moisson Pourpre", "effet": "Ses haillons rouges se déploient et boivent le sang de tout ce qu''ils touchent.", "puissance": 80}'),
  ('Les Veines', 'img/Cartes/Veines-Carte.webp', 'transcendante',
   'Les forces fondamentales du monde, rendues perceptibles sous la forme de leurs Entités : des silhouettes astrales qui ne servent personne, car chacune est la Veine elle-même.', null,
   '{"veine": "esprit", "nom": "Éveil des Entités", "effet": "Les Entités prennent forme autour du monde : leur seule présence fait plier la réalité.", "puissance": 90}',
   '{"veine": "trone", "nom": "Convergence des Douze", "effet": "Les douze Veines s''unissent un instant en un seul flot de pouvoir qui balaie tout.", "puissance": 120}'),
  ('Astris, Reine de Pravorn', 'img/Cartes/Astris-Carte.webp', 'mythique',
   'Héritière de la lignée née du grand tournoi, Astris règne sur le plus vaste royaume du continent. Sur son trône d''émeraude, elle n''élève jamais la voix : à Pravorn, un seul regard de la reine suffit à lever une armée.', null,
   '{"veine": "trone", "nom": "Décret de la Couronne", "effet": "Un ordre de la reine, et le royaume entier s''abat sur la cible.", "puissance": 50}',
   '{"veine": "chaine", "nom": "Loi du Tournoi", "effet": "La loi ancienne de Pravorn lie la cible : nul ne se dérobe au jugement de la Couronne.", "puissance": 60}'),
  ('Elyan, l''ami des Dragons', 'img/Cartes/Elyan-Carte.webp', 'mythique',
   'Sur les falaises au bord de la mer, Elyan guette l''horizon sous sa capuche d''écailles. Les dragons ne l''ont jamais chassé : ils le reconnaissent comme l''un des leurs.', null,
   '{"veine": "bete", "nom": "Morsure d''Écailles", "effet": "La capuche de dragon s''anime et referme ses crocs sur la cible.", "puissance": 50}',
   '{"veine": "maree", "nom": "Appel des Dragons", "effet": "Un cri porté par le vent du large : au loin, quelque chose de gigantesque lui répond.", "puissance": 60}')
),
maj as (
  update public.cards c
  set image = n.image, rarity = n.rarity, description = n.description, rank = n.rank,
      attack_1 = n.attack_1::jsonb, attack_2 = n.attack_2::jsonb, is_available = true
  from nouvelles n
  where c.name = n.name
  returning c.name
)
insert into public.cards (name, image, rarity, description, source, is_available, rank, attack_1, attack_2)
select n.name, n.image, n.rarity, n.description, 'recompense', true, n.rank, n.attack_1::jsonb, n.attack_2::jsonb
from nouvelles n
where not exists (select 1 from public.cards c where c.name = n.name);


-- ---------------------------------------------------------------------
--  2. Les boosters : 1 carte (100 or), 3 cartes (250 or), 5 cartes (375 or), et l'Offrande du Voyageur
--     (gratuite, toutes les 10 minutes, jamais en vente). Mêmes chances par défaut pour tous.
-- ---------------------------------------------------------------------
insert into public.boosters (id, nom, prix, nb_cartes, image, en_vente) values
  ('eclat',   'Éclat des Cendres',         100, 1, 'img/Booster/Booster.webp', true),
  ('cendres', 'Booster des Cendres',       250, 3, 'img/Booster/Booster.webp', true),
  ('grand',   'Grand Booster des Cendres', 375, 5, 'img/Booster/Booster.webp', true),
  ('gratuit', 'Offrande du Voyageur',        0, 3, 'img/Booster/Booster.webp', false)
on conflict (id) do update set nom = excluded.nom, prix = excluded.prix,
  nb_cartes = excluded.nb_cartes, image = excluded.image, en_vente = excluded.en_vente;

-- Toutes les vraies cartes du catalogue (illustrées et disponibles, sauf la carte d'exemple), dans les 4 boosters
insert into public.booster_cartes (booster_id, card_id)
select b.id, c.id from public.cards c cross join (values ('eclat'), ('cendres'), ('grand'), ('gratuit')) as b(id)
where c.is_available and c.image is not null and c.description is distinct from 'Carte d''exemple'
on conflict do nothing;


-- ---------------------------------------------------------------------
--  3. Les plateaux en vente (le plateau par défaut, l'arène de pierre, n'est pas dans la table)
-- ---------------------------------------------------------------------
insert into public.plateaux (id, nom, description, prix, image, miniature, ordre) values
  ('printemps', 'Arène du Printemps',     'L''arène de pierre couverte de lierre et de fleurs de cerisier.',
    500, 'img/Plateaux de carte/plateau-printemps.webp', 'img/Plateaux de carte/plateau-printemps-mini.webp', 1),
  ('ete',       'Arène de l''Été',         'L''arène de pierre envahie de verdure, de mousse et de jeunes sapins.',
    500, 'img/Plateaux de carte/plateau-ete.webp',       'img/Plateaux de carte/plateau-ete-mini.webp',       2),
  ('automne',   'Arène d''Automne',        'L''arène de pierre sous les érables rouges et les feuilles mortes.',
    500, 'img/Plateaux de carte/plateau-automne.webp',   'img/Plateaux de carte/plateau-automne-mini.webp',   3),
  ('hiver',     'Arène de l''Hiver',       'L''arène de pierre prise dans la neige et les cristaux de glace.',
    500, 'img/Plateaux de carte/plateau-hiver.webp',     'img/Plateaux de carte/plateau-hiver-mini.webp',     4),
  ('cristaux',  'Arène des Cristaux d''Or', 'L''arène fissurée, hérissée de cristaux d''or et parcourue de brume dorée.',
    750, 'img/Plateaux de carte/plateau-cristaux.webp',  'img/Plateaux de carte/plateau-cristaux-mini.webp',  5)
on conflict (id) do update set nom = excluded.nom, description = excluded.description, prix = excluded.prix,
  image = excluded.image, miniature = excluded.miniature, ordre = excluded.ordre;


-- ---------------------------------------------------------------------
--  4. Le mode Histoire : les récompenses réellement données (mêmes id et même ordre que le jeu)
-- ---------------------------------------------------------------------
insert into public.histoire_chapitres (id, nom, ordre) values
  ('pravorn', 'Pravorn', 1)
on conflict (id) do update set nom = excluded.nom, ordre = excluded.ordre;

insert into public.histoire_niveaux (id, chapitre_id, ordre, nom, est_boss, or_gagne, xp_gagne, carte_aleatoire) values
  ('pravorn-1',    'pravorn', 1, 'La route du Nord',            false,  15, 200, false),
  ('pravorn-2',    'pravorn', 2, 'Le pont gardé',               false,  18, 200, false),
  ('pravorn-3',    'pravorn', 3, 'Le camp des mercenaires',     false,  20, 200, false),
  ('pravorn-4',    'pravorn', 4, 'Les marais du Sud',           false,  24, 200, false),
  ('pravorn-5',    'pravorn', 5, 'Les remparts de la capitale', false,  27, 200, false),
  ('pravorn-6',    'pravorn', 6, 'Les lices du tournoi',        false,  30, 200, false),
  ('pravorn-boss', 'pravorn', 7, 'Le Grand Tournoi',            true,  100, 500, true)
on conflict (id) do update set
  chapitre_id = excluded.chapitre_id, ordre = excluded.ordre, nom = excluded.nom,
  est_boss = excluded.est_boss, or_gagne = excluded.or_gagne, xp_gagne = excluded.xp_gagne,
  carte_aleatoire = excluded.carte_aleatoire;


-- ---------------------------------------------------------------------
--  5. Le Pass de saison : saison 1 « Les Cendres de Pravorn », 8 semaines à partir du jour où ce
--     fichier est lancé (relancer le fichier ne recrée pas la saison : il remet ses paliers à jour)
-- ---------------------------------------------------------------------
insert into public.saisons (nom, date_debut, date_fin, active, prix_premium)
select 'Les Cendres de Pravorn', date_trunc('day', now()), date_trunc('day', now()) + interval '56 days', true, 1500
where not exists (select 1 from public.saisons where nom = 'Les Cendres de Pravorn');

with s as (select id from public.saisons where nom = 'Les Cendres de Pravorn'),
paliers (numero, piste, type_recompense, valeur) as (values
  ( 1, 'gratuite', 'carte_rarete',   '{"rarete": "mythique", "or_si_deja": 200}'),
  ( 2, 'gratuite', 'or',             '{"montant": 75}'),
  ( 3, 'gratuite', 'or',             '{"montant": 75}'),
  ( 4, 'gratuite', 'or',             '{"montant": 75}'),
  ( 5, 'gratuite', 'booster',        '{"booster": "cendres", "quantite": 1}'),
  ( 6, 'gratuite', 'or',             '{"montant": 75}'),
  ( 7, 'gratuite', 'or',             '{"montant": 75}'),
  ( 8, 'gratuite', 'or',             '{"montant": 75}'),
  ( 9, 'gratuite', 'carte_rarete',   '{"rarete": "eveillee", "or_si_deja": 100}'),
  (10, 'gratuite', 'or',             '{"montant": 100}'),
  (11, 'gratuite', 'or',             '{"montant": 100}'),
  (12, 'gratuite', 'or',             '{"montant": 100}'),
  (13, 'gratuite', 'booster',        '{"booster": "cendres", "quantite": 1}'),
  (14, 'gratuite', 'or',             '{"montant": 100}'),
  (15, 'gratuite', 'or',             '{"montant": 100}'),
  (16, 'gratuite', 'or',             '{"montant": 100}'),
  (17, 'gratuite', 'carte_rarete',   '{"rarete": "mythique", "or_si_deja": 200}'),
  (18, 'gratuite', 'or',             '{"montant": 125}'),
  (19, 'gratuite', 'or',             '{"montant": 125}'),
  (20, 'gratuite', 'or',             '{"montant": 125}'),
  (21, 'gratuite', 'booster',        '{"booster": "cendres", "quantite": 1}'),
  (22, 'gratuite', 'or',             '{"montant": 150}'),
  (23, 'gratuite', 'or',             '{"montant": 150}'),
  (24, 'gratuite', 'or',             '{"montant": 150}'),
  (25, 'gratuite', 'booster',        '{"booster": "grand", "quantite": 1}'),
  (26, 'gratuite', 'or',             '{"montant": 175}'),
  (27, 'gratuite', 'or',             '{"montant": 175}'),
  (28, 'gratuite', 'or',             '{"montant": 175}'),
  (29, 'gratuite', 'carte_rarete',   '{"rarete": "legendaire", "or_si_deja": 400}'),
  (30, 'gratuite', 'or',             '{"montant": 500}'),   -- à la place de l'Arène d'Automne (27/10/2026), qui reste en vente en Boutique
  ( 1, 'premium',  'carte_rarete',   '{"rarete": "transcendante", "or_si_deja": 800}'),
  ( 2, 'premium',  'or',             '{"montant": 75}'),
  ( 3, 'premium',  'or',             '{"montant": 75}'),
  ( 4, 'premium',  'or',             '{"montant": 75}'),
  ( 5, 'premium',  'booster',        '{"booster": "cendres", "quantite": 1}'),
  ( 6, 'premium',  'or',             '{"montant": 75}'),
  ( 7, 'premium',  'or',             '{"montant": 75}'),
  ( 8, 'premium',  'or',             '{"montant": 75}'),
  ( 9, 'premium',  'carte_rarete',   '{"rarete": "mythique", "or_si_deja": 200}'),
  (10, 'premium',  'or',             '{"montant": 100}'),
  (11, 'premium',  'or',             '{"montant": 100}'),
  (12, 'premium',  'or',             '{"montant": 100}'),
  (13, 'premium',  'booster',        '{"booster": "grand", "quantite": 1}'),
  (14, 'premium',  'or',             '{"montant": 100}'),
  (15, 'premium',  'or',             '{"montant": 100}'),
  (16, 'premium',  'or',             '{"montant": 100}'),
  (17, 'premium',  'carte_rarete',   '{"rarete": "legendaire", "or_si_deja": 400}'),
  (18, 'premium',  'or',             '{"montant": 125}'),
  (19, 'premium',  'or',             '{"montant": 125}'),
  (20, 'premium',  'or',             '{"montant": 125}'),
  (21, 'premium',  'booster',        '{"booster": "grand", "quantite": 1}'),
  (22, 'premium',  'or',             '{"montant": 125}'),
  (23, 'premium',  'or',             '{"montant": 125}'),
  (24, 'premium',  'or',             '{"montant": 125}'),
  (25, 'premium',  'carte_rarete',   '{"rarete": "mythique", "or_si_deja": 200}'),
  (26, 'premium',  'or',             '{"montant": 150}'),
  (27, 'premium',  'or',             '{"montant": 150}'),
  (28, 'premium',  'or',             '{"montant": 150}'),
  (29, 'premium',  'carte_rarete',   '{"rarete": "legendaire", "or_si_deja": 400}'),
  (30, 'premium',  'fond_plateau',   '{"plateau": "cristaux", "nom": "Arène des Cristaux d''Or", "or_si_deja": 750}')
)
insert into public.pass_paliers (saison_id, numero, piste, type_recompense, valeur)
select s.id, p.numero, p.piste, p.type_recompense, p.valeur::jsonb from s, paliers p
on conflict (saison_id, numero, piste) do update
  set type_recompense = excluded.type_recompense, valeur = excluded.valeur;


-- ---------------------------------------------------------------------
--  6. Les succès
-- ---------------------------------------------------------------------
insert into public.succes (id, categorie, nom, description, icone, mesure, objectif, recompense, ordre, rarete) values
  -- Duels
  ('premier-sang',      'Duels', 'Premier sang',        'Remporte ton premier duel.',                         '⚔',  'victoires',          1,   50,  10, 'commun'),
  ('guerrier',          'Duels', 'Guerrier aguerri',    'Remporte 10 duels.',                                 '⚔',  'victoires',         10,  150,  11, 'rare'),
  ('champion',          'Duels', 'Champion des arènes', 'Remporte 50 duels.',                                 '⚔',  'victoires',         50,  400,  12, 'epique'),
  ('legende-vivante',   'Duels', 'Légende vivante',     'Remporte 100 duels.',                                '⚔',  'victoires',        100,  800,  13, 'legendaire'),
  ('chasseur-ombre',    'Duels', 'Chasseur d''Ombre',   'Bats l''Ombre 10 fois.',                             '🌑', 'victoires_ia',      10,  150,  14, 'rare'),
  ('premier-rival',     'Duels', 'Premier rival',       'Bats un autre joueur en ligne.',                     '🤝', 'victoires_joueurs',  1,  100,  15, 'commun'),
  ('terreur-salons',    'Duels', 'Terreur des salons',  'Bats 10 joueurs en ligne.',                          '🤝', 'victoires_joueurs', 10,  300,  16, 'epique'),
  -- Classé
  ('classe-1',          'Classé', 'Entrée dans l''arène', 'Remporte une partie classée.',                     '🏆', 'classe_victoires',   1,  100,  20, 'commun'),
  ('classe-10',         'Classé', 'Gladiateur',           'Remporte 10 parties classées.',                    '🏆', 'classe_victoires',  10,  300,  21, 'epique'),
  ('rang-argent',       'Classé', 'Rang d''Argent',       'Atteins le rang d''Argent (1 100 points).',        '🥈', 'cote',            1100,  200,  22, 'rare'),
  ('rang-or',           'Classé', 'Rang d''Or',           'Atteins le rang d''Or (1 250 points).',            '🥇', 'cote',            1250,  400,  23, 'epique'),
  -- Collection
  ('collection-5',      'Collection', 'Apprenti collectionneur', 'Possède 5 cartes différentes.',             '🃏', 'cartes',             5,  100,  30, 'commun'),
  ('collection-10',     'Collection', 'Collectionneur',          'Possède 10 cartes différentes.',            '🃏', 'cartes',            10,  250,  31, 'rare'),
  ('collection-complete','Collection', 'Le grimoire complet',     'Possède toutes les cartes du jeu.',         '📖', 'collection',         0, 1000,  32, 'legendaire'),
  ('legendaire',        'Collection', 'Touché par la légende',   'Possède une carte légendaire.',             '🔴', 'legendaires',        1,  150,  33, 'rare'),
  ('transcendante',     'Collection', 'Au-delà du voile',        'Possède une carte transcendante.',          '🌟', 'transcendantes',     1,  300,  34, 'epique'),
  -- Boosters
  ('booster-1',         'Boosters', 'Première porte',     'Ouvre ton premier booster.',                       '🚪', 'boosters',           1,   50,  40, 'commun'),
  ('booster-10',        'Boosters', 'Briseur de portes',  'Ouvre 10 boosters.',                               '🚪', 'boosters',          10,  200,  41, 'rare'),
  ('booster-50',        'Boosters', 'Mille éclats',       'Ouvre 50 boosters.',                               '🚪', 'boosters',          50,  500,  42, 'epique'),
  -- Histoire
  ('histoire-1',        'Histoire', 'Premiers pas',       'Termine un niveau du mode Histoire.',              '🗺', 'histoire',           1,  100,  50, 'commun'),
  ('histoire-5',        'Histoire', 'Voyageur',           'Termine 5 niveaux du mode Histoire.',              '🗺', 'histoire',           5,  250,  51, 'rare'),
  ('histoire-complete', 'Histoire', 'Le récit achevé',    'Termine tous les niveaux du mode Histoire.',       '👑', 'histoire',           0, 1000,  52, 'legendaire'),
  -- Marché
  ('echange-1',         'Marché', 'Poignée de main',      'Conclus un échange ou un contrat avec un joueur.', '📜', 'echanges',           1,  100,  60, 'commun'),
  ('echange-10',        'Marché', 'Négociant',            'Conclus 10 échanges ou contrats.',                 '📜', 'echanges',          10,  300,  61, 'epique'),
  ('vente-1',           'Marché', 'Première vente',       'Vends une carte sur le tableau de la guilde.',     '💰', 'ventes',             1,  100,  62, 'rare')
on conflict (id) do update set categorie = excluded.categorie, nom = excluded.nom, description = excluded.description,
  icone = excluded.icone, mesure = excluded.mesure, objectif = excluded.objectif,
  recompense = excluded.recompense, ordre = excluded.ordre, rarete = excluded.rarete;


-- ---------------------------------------------------------------------
--  7. Les thèmes de la boutique des apparences (ancien/SQL/themes_couleurs.sql)
--     Les autres objets du site (bannières, titres, objets de pouvoir…) ne sont décrits dans aucun
--     fichier : les copier depuis l'ancien projet (supabase/exporter-depuis-ancien.sql).
-- ---------------------------------------------------------------------
with nouveaux (name, description, price, accent, accent2) as (values
  ('Thème « Bleu des Abysses »', 'Le bleu froid des eaux profondes sous la lune.',  300, '#4f8fe8', '#9cc4ff'),
  ('Thème « Violet Améthyste »', 'L''éclat violet des cristaux de la Veine arcane.', 300, '#9a6cf0', '#c9b2fb'),
  ('Thème « Orange de Braise »', 'La chaleur des braises d''un feu de camp.',        300, '#e8873a', '#f6c27a')
),
maj as (
  update public.items i
  set description = n.description, price = n.price, shop = 'fun',
      payload = jsonb_build_object('accent', n.accent, 'accent2', n.accent2), is_available = true
  from nouveaux n
  where i.name = n.name and i.kind = 'theme'
  returning i.name
)
insert into public.items (name, kind, shop, price, is_available, description, payload)
select n.name, 'theme', 'fun', n.price, true, n.description, jsonb_build_object('accent', n.accent, 'accent2', n.accent2)
from nouveaux n
where not exists (select 1 from public.items i where i.name = n.name and i.kind = 'theme');

notify pgrst, 'reload schema';


-- =====================================================================
--  Pour tester (à lancer À PART, après ta première connexion Discord au jeu en développement) :
--  retire les deux tirets devant les lignes voulues.
-- =====================================================================
-- Ton profil (pour retrouver ton discord_id) :
-- select discord_id, username, is_mj from public.players;

-- Devenir MJ sur le projet de développement :
-- update public.players set is_mj = true where username = 'TON_PSEUDO';

-- Te donner de l'or :
-- update public.wallets set balance = 5000 where discord_id = (select discord_id from public.players where username = 'TON_PSEUDO');

-- Te donner toutes les cartes du catalogue :
-- select c.name, grant_card(p.discord_id, c.id, 'recompense') from public.cards c, public.players p
-- where p.username = 'TON_PSEUDO' and c.description is distinct from 'Carte d''exemple';

-- Te donner les objets de pouvoir (ils servent de cartes dans le duel) : il faut d'abord qu'ils existent
-- dans items (copiés depuis l'ancien projet), par exemple :
-- insert into public.inventory (discord_id, item_id)
-- select p.discord_id, i.id from public.players p, public.items i
-- where p.username = 'TON_PSEUDO' and i.name in ('Potion de soin', 'Talisman du Dé') on conflict do nothing;
