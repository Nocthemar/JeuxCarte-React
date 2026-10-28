# Le jeu sur téléphone

Tout ce qui sert à adapter le jeu au téléphone est rangé ici, pour s'y retrouver.

## Organisation

| Fichier | Rôle |
|---|---|
| `styles/commun.css` | Les règles communes à tous les écrans (barre du bas, encoche de l'iPhone, zones à toucher…) |
| `styles/<écran>.css` | Les règles d'un écran : `duel.css`, `collection.css`, `boutique.css`, `pass.css`… (le nom = l'id de l'écran dans `src/styles/feuilles.js`) |
| `useTelephone.js` | Pour un composant qui doit s'afficher autrement sur téléphone (pas seulement son style) |

## Les règles

- **Chargement automatique** : chaque écran charge `commun.css` puis sa propre feuille (si elle existe), **après**
  toutes ses autres feuilles. Rien à déclarer ailleurs : créer `styles/<écran>.css` suffit.
- **Tout fichier de `styles/` est entièrement dans** `@media (max-width: 700px) { … }` : il ne touche jamais l'ordinateur.
- **Le Duel se joue en portrait** (téléphone tenu droit) : choix du 28/10/2026.
- Tailles de référence pour vérifier : 360 × 800 (Android), 375 × 667 (petit iPhone), 390 × 844 (iPhone récent),
  430 × 932 (grand iPhone).
- Une zone à toucher fait au moins 44 px ; le texte au moins 12 px ; jamais de défilement de côté.

Les anciennes règles « téléphone » encore dans `src/styles/` (barre-jeu.css, duel-accueil.css, jeu-cartes.css…)
y restent pour l'instant ; elles seront déplacées ici écran par écran.

## Fait (28/10/2026)

| Écran | Feuille | Ce qui change sur téléphone |
|---|---|---|
| Tous | `commun.css` | Barre du bas au-dessus de la barre de geste de l'iPhone ; boutons 44 px ; cases à cocher, curseurs et champs plus grands (16 px : pas de zoom sur iPhone) ; liens « ← Retour » faciles à toucher |
| Duel | `duel.css` | **Plateau en portrait** : adversaire en haut, centre du plateau zoomé (×1,85), Grimoires et Tombeaux autour du « N », tes boutons sur une ligne, ta main en éventail en bas. Plus d'écran « Tourne ton téléphone » ni de paysage imposé (pages/Duel.jsx) |
| Pass | `pass.css` | Étiquettes lisibles, bouton « Réclamer » plus grand |
| Toutes les cartes | `cartes.css` | Filtres plus hauts |
| Connexion | `connexion.css` | Liens du bas faciles à toucher |
| Paramètres | `parametres.css` | Curseurs de volume à gros bouton |
| Caverne | `caverne.css` | Images du hall dans leur cadre ; butin du Dragon entre la tête et le trésor ; grille des Bourses au-dessus des commandes |
