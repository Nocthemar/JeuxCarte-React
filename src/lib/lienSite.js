// =====================================================================
//  L'adresse du site Nocthémar (le Codex, le profil du site, le panneau MJ…), avec le « / » final.
//  Tous les liens vers le site passent par ici.
// =====================================================================
export const NOCTHEMAR_SITE = 'https://nocthemar.github.io/CodexNockt-mar/';

// Une page du site : lienSite('mj.html') -> https://nocthemar.github.io/CodexNockt-mar/mj.html
export const lienSite = (chemin = '') => new URL(chemin, NOCTHEMAR_SITE).href;
