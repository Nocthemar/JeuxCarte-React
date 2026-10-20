// =====================================================================
//  L'adresse complète d'un fichier du dossier public/ (images…).
//  Les cartes de la base donnent des chemins comme « img/Cartes/Dalek-Carte.webp » ; une fois le jeu
//  publié sur GitHub Pages, il vit dans un sous-dossier (…github.io/CarteJeuxNocthemar/). BASE_URL (réglé
//  par Vite, « ./ » : relatif) part de l'adresse de la page (location.href, sans tenir compte du « # »).
// =====================================================================
export const urlPublique = (chemin) => new URL(chemin, new URL(import.meta.env.BASE_URL, location.href)).href;
