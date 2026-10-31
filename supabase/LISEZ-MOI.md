# Base Supabase du Duel des Couronnes

| Fichier | Où le lancer | Rôle |
|---|---|---|
| `schema.sql` | NOUVEAU projet | Toutes les tables, fonctions, règles RLS, triggers, droits et règles Realtime |
| `donnees.sql` | NOUVEAU projet | Les données de référence telles que décrites dans `ancien/SQL` (cartes, boosters, plateaux, Histoire, Pass, succès, thèmes) |
| `erreurs.sql` | les DEUX projets (dev et vrai jeu) | Le journal des erreurs du jeu (table `erreurs_jeu`, déjà dans `schema.sql`, partie 15) |
| `exporter-depuis-ancien.sql` | ANCIEN projet (lecture seule) | Partie A : comparer les tables du site ; partie B : copier les vraies données de référence |
| `securite.sql` | les DEUX projets, après `schema.sql` | La sécurité (audit d'octobre 2026) : profils, duels arbitrés, salons, limites de débit, journal… |
| `avatars.sql` | les DEUX projets, après `securite.sql` | Le portrait choisi par le joueur (comptes e-mail ET Discord) : le stockage « avatars », changer_avatar ; un portrait choisi n’est plus remplacé par celui de Discord (à relancer depuis le 31/10/2026) |
| `succes.sql` | les DEUX projets, après `caverne.sql` et `amis.sql` | Les succès façon jeu vidéo : secrets masqués par le serveur, récompenses en cristaux, catégories Caverne / Multijoueur / Secrets |
| `caverne.sql` | les DEUX projets, après `securite.sql` | La Caverne aux Trésors (#/caverne) : les mises en or ou en cristaux, le hasard et les gains, tenus par le serveur |
| `verifier-securite.sql` | les DEUX projets (lecture seule) | Vérifie les droits, les triggers, et si la faille de prise de contrôle a déjà servi |
| `functions/arbitre/index.js` | Edge Function des DEUX projets | L'arbitre des duels contre l'Ombre et du mode Histoire (construit par `npm run arbitre`) |

Les deux premiers scripts ont été testés sur un PostgreSQL vide (installés deux fois de suite, puis le parcours d'un joueur et les droits du navigateur).

## Mise en place du projet de développement

1. **Discord Developer Portal** (https://discord.com/developers/applications). Le mieux est de créer une application à part pour le développement (par exemple « Duel des Couronnes DEV »).
   - OAuth2 > Redirects : ajouter `https://wdzftdqdgcqladvmrweh.supabase.co/auth/v1/callback`
   - Noter le **Client ID** et le **Client Secret** (OAuth2 > Reset Secret).
2. **Supabase (projet de dev) > Authentication > Sign In / Providers > Discord** : activer, coller le Client ID et le Client Secret, puis enregistrer.
3. **Supabase > Authentication > URL Configuration** :
   - Site URL : `http://localhost:5173`
   - Redirect URLs : `http://localhost:5173/**`
4. **Supabase > SQL Editor** : lancer `schema.sql` en entier, puis `securite.sql`, puis :
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

## Sécurité (à faire dans CET ORDRE, d'abord sur le projet de développement, puis sur le vrai)

Le jeu publié ne marche qu'avec ces trois éléments en place : on installe la base et l'arbitre AVANT de publier le jeu.

1. **SQL Editor** : lancer `verifier-securite.sql` (lecture seule), et garder le résultat de la requête 1
   (des lignes = la faille de prise de contrôle a déjà servi : prévenir le joueur concerné, remettre son `user_id`).
2. **SQL Editor** : lancer `securite.sql` en entier. Lire les éventuels avertissements (« Autre trigger sur auth.users »,
   « Limites de débit non branchées ») : ils disent quoi faire.
3. **Edge Function « arbitre »** (au choix) :
   - Tableau de bord : Edge Functions > Deploy a new function > Via Editor, nom `arbitre`, coller TOUT
     `supabase/functions/arbitre/index.js`, déployer ; puis dans ses réglages, **décocher « Enforce JWT verification »**
     (l'arbitre vérifie lui-même la session ; sinon le navigateur ne peut pas l'appeler).
   - Ou en ligne de commande : `npx supabase login`, puis `npx supabase functions deploy arbitre --project-ref <id du projet>`
     (`config.toml` donne déjà le bon fichier et coupe la vérification automatique).
   - Facultatif : un secret `ORIGINES` (Edge Functions > Secrets) si le jeu est publié à une autre adresse que
     https://nocthemar.github.io (séparer les adresses par des virgules).
4. **Relancer `verifier-securite.sql`** : les repères « ATTENDU » doivent tous être bons.
5. Seulement maintenant : publier le jeu.

Après chaque modification du moteur du duel (`src/moteur`, `src/data`) : `npm run arbitre`, puis redéployer l'arbitre.
Sinon le serveur rejoue les parties avec les anciennes règles et refuse les victoires.

### Réglages du tableau de bord (Authentication)

- **Sign In / Providers > Email** : activé, **Confirm email** activé, mot de passe de 10 caractères au moins avec
  lettres et chiffres (Password requirements). *Leaked password protection* si l'offre le permet.
- **Sign In / Providers > Anonymous** et **Phone** : désactivés.
- **Sign In / Providers > Discord** : déjà configuré ; le secret Discord reste ici, jamais dans le code du jeu.
- **URL Configuration** : Site URL = l'adresse publiée du jeu ; Redirect URLs = cette adresse exacte (et
  `http://localhost:5173/**` seulement sur le projet de développement).
- **Emails > Templates** (recommandé : les liens marchent aussi ouverts sur un autre appareil) : dans « Confirm signup »
  et « Reset password », remplacer le lien par
  `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email` (confirmation) et
  `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery` (mot de passe).
- **Attack Protection** : CAPTCHA (Cloudflare Turnstile) si possible — clé SECRÈTE ici, clé publique dans la Variable
  `VITE_TURNSTILE_SITE_KEY` du dépôt et dans `.env.local`. Les limites de connexion par adresse IP sont réglées ici aussi.
- **Multi-Factor** : TOTP activé. Chaque MJ l'active dans Paramètres > Compte. Ensuite seulement :
  `update securite.reglages set valeur = 'true' where cle = 'mfa_mj';` (le panneau MJ du site devra alors demander le code).
- **Sessions** : durée du jeton d'accès (JWT expiry) 1800 secondes ; rotation des jetons de rafraîchissement activée (par défaut).
- **Realtime > Settings** : « Allow public access » décoché.

### Surveillance (SQL Editor)

`select * from admin.journal_recent;` (actions de MJ, suppressions de compte, duels refusés, profils refusés),
`admin.gains_suspects` (beaucoup d'or en 24 h), `admin.duels_refuses` (rejeux qui ne correspondent pas : triche ou bug),
`admin.inscriptions_par_ip` (fabriques de comptes). Les requêtes refusées par les limites de débit (HTTP 429) sont dans
Logs > API. Les réglages (`securite.reglages`) se changent sans republier le jeu.

### Bon à savoir

- Toute NOUVELLE fonction SQL (du jeu, du site ou du bot) n'est plus exécutable par défaut par le navigateur :
  ajouter `grant execute on function … to authenticated;` (et vérifier qu'elle contrôle `my_discord_id()`).
- Le bot Discord (clé service_role) n'est pas concerné par les limites de débit ni par les droits du navigateur.
- Comptes e-mail : leur clé de joueur est `e_` suivie de l'identifiant du compte (jamais un identifiant Discord) ;
  le bot ne les connaît pas.
