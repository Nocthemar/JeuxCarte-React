# Base Supabase du Duel des Couronnes

| Fichier | Où le lancer | Rôle |
|---|---|---|
| `schema.sql` | NOUVEAU projet | Toutes les tables, fonctions, règles RLS, triggers, droits et règles Realtime |
| `donnees.sql` | NOUVEAU projet | Les données de référence telles que décrites dans `ancien/SQL` (cartes, boosters, plateaux, Histoire, Pass, succès, thèmes) |
| `erreurs.sql` | les DEUX projets (dev et vrai jeu) | Le journal des erreurs du jeu (table `erreurs_jeu`, déjà dans `schema.sql`, partie 15) |
| `exporter-depuis-ancien.sql` | ANCIEN projet (lecture seule) | Partie A : comparer les tables du site ; partie B : copier les vraies données de référence |

Les deux premiers scripts ont été testés sur un PostgreSQL vide (installés deux fois de suite, puis le parcours d'un joueur et les droits du navigateur).

## Mise en place du projet de développement

1. **Discord Developer Portal** (https://discord.com/developers/applications). Le mieux est de créer une application à part pour le développement (par exemple « Duel des Couronnes DEV »).
   - OAuth2 > Redirects : ajouter `https://wdzftdqdgcqladvmrweh.supabase.co/auth/v1/callback`
   - Noter le **Client ID** et le **Client Secret** (OAuth2 > Reset Secret).
2. **Supabase (projet de dev) > Authentication > Sign In / Providers > Discord** : activer, coller le Client ID et le Client Secret, puis enregistrer.
3. **Supabase > Authentication > URL Configuration** :
   - Site URL : `http://localhost:5173`
   - Redirect URLs : `http://localhost:5173/**`
4. **Supabase > SQL Editor** : lancer `schema.sql` en entier, puis :
   - soit `donnees.sql` (données des fichiers SQL, suffisantes pour développer),
   - soit le script produit par la partie B de `exporter-depuis-ancien.sql` (copie exacte du vrai jeu).
5. **Supabase > Realtime > Settings** : décocher « Allow public access ». Les salons du duel sont des canaux privés (règles dans `schema.sql`, partie 13). Aucune table n'est à ajouter à la publication Realtime : le jeu n'utilise que Broadcast et Presence.
6. Se connecter une fois au jeu (`npm run dev`), puis lancer dans le SQL Editor les lignes « Pour tester » à la fin de `donnees.sql` : devenir MJ, avoir de l'or, avoir des cartes.

## Ce qui n'était dans aucun fichier SQL (fait par le site, le bot ou à la main)

- **Les tables du site et du bot** : `players`, `wallets`, `transactions`, `items`, `inventory`, `daily_shop`. Elles sont reconstituées dans la partie 1 de `schema.sql`, à partir de ce que le jeu en lit et en écrit.
- **Leurs fonctions** : `current_shop_slot`, `next_shop_refresh`, `buy_daily_item`, `buy_fun_item`, `equip_cosmetic`, `unequip_cosmetic`. Elles sont aussi reconstituées. Le rythme du marchand (un renouvellement par jour, à minuit à Paris) est une supposition.
- **La création du profil `players` à la première connexion Discord** : un trigger sur `auth.users`, reconstitué (`creer_profil_joueur`).
- **La liste des valeurs autorisées de `transactions.source`** : reconstituée.
- **La sélection du marchand du jour** : elle est écrite par le bot Discord. Sans bot sur le projet de dev, le marchand restera vide.
- **Les objets du site** (bannières, titres, objets de pouvoir comme la Potion de soin) et tout ce qui a été modifié à la main dans l'interface (prix, nouvelles cartes…) : seule la partie B de l'export les copie.

La partie A de `exporter-depuis-ancien.sql` sort les vraies définitions de tout ce qui précède, pour rendre `schema.sql` identique au vrai projet.
