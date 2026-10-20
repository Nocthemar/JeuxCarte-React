# Duel des Couronnes — version React

Le jeu de cartes de l'univers de Nocthémar : duels contre l'Ombre (3 difficultés), mode Histoire,
duels en ligne (1 contre 1 et 2 contre 2, parties privées et classées), collection, boutique et boosters,
Pass de saison, Marché (ventes et échanges scellés), profil et succès.

C'est la migration vers **Vite + React** de l'ancien jeu en HTML/CSS/JavaScript, avec les mêmes règles,
le même design et les mêmes données Supabase. L'ancien code reste dans `Ancient/` comme référence
(il n'est jamais modifié).

## Commandes

| Commande | Ce qu'elle fait |
| --- | --- |
| `npm install` | installe les dépendances (une fois) |
| `npm run dev` | lance le jeu en développement sur http://localhost:5173 |
| `npm test` | lance les tests du moteur (règles, et comparaison avec l'ancien moteur) |
| `npm run lint` | vérifie le code |
| `npm run build` | fabrique la version finale dans `dist/` |
| `npm run preview` | sert la version finale, pour la vérifier |

Avant le premier lancement : copier `.env.example` en `.env.local` et y mettre l'adresse et la clé
**publique** du projet Supabase (voir `supabase/LISEZ-MOI.md`). Jamais la clé secrète.

## Organisation

| Dossier | Contenu |
| --- | --- |
| `src/moteur/` | le moteur du jeu, en JavaScript pur : un état de partie, et `appliquerAction(etat, action)` qui renvoie le nouvel état. Utilisé par l'Ombre, l'Histoire, le duel en ligne et le 2 contre 2 |
| `src/data/` | les données fixes : règles, cartes de base, objets, chapitres de l'Histoire… |
| `src/pages/` | un écran par ancienne page HTML (Duel, Histoire, Collection, Boutique, Marché, Pass, Profil, Succès, Paramètres, Toutes les cartes) |
| `src/components/` | les morceaux d'écran (cartes, plateau, deck, fenêtres…) |
| `src/lib/` | Supabase, connexion Discord, sons, animations du duel, salon en ligne, ouverture des boosters… |
| `src/styles/` | les feuilles CSS de l'ancien jeu ; chaque écran charge la même liste que son ancienne page (`feuilles.js`) |
| `public/` | les images, et de petites pages qui redirigent les anciennes adresses (`jeu-cartes.html`, `profil.html?id=…`…) vers le bon écran |
| `supabase/` | le schéma complet de la base (`schema.sql`), les données de départ (`donnees.sql`) et leur mode d'emploi |
| `tests/` | les tests du moteur |

Les écrans sont à des adresses avec `#` (`…/#/boutique`, `…/#/profil?id=…`, `…/#/duel?salon=CODE`) :
GitHub Pages sert ainsi toujours le même `index.html`.
