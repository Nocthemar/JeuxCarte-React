// =====================================================================
//  Ce qu'il faut pour AFFICHER une carte du catalogue (repris de l'ancien JS/cartes.js)
//  noms des raretés, Veines et leurs icônes, rangs, dos de cartes, pages du Codex
// =====================================================================

export const RARETES = {
  commune: 'Commune', eveillee: 'Éveillée', mythique: 'Mythique', legendaire: 'Légendaire', transcendante: 'Transcendante',
};
// Une rareté connue, sinon « commune »
export const rareteDe = (carte) => (RARETES[carte?.rarity] ? carte.rarity : 'commune');

// Les 12 Veines (mêmes icônes que la page Les Veines du Codex)
export const VEINES = {
  sang:    ['Veine du Sang', '🩸'],       trone:  ['Veine du Trône', '👑'],
  regard:  ['Veine du Regard', '👁️'],     reve:   ['Veine du Rêve', '🌙'],
  tombeau: ['Veine du Tombeau', '⚰️'],    bete:   ['Veine de la Bête', '🐺'],
  forge:   ['Veine de la Forge', '⚒️'],   maree:  ['Veine de la Marée', '🌊'],
  racine:  ['Veine de la Racine', '🌿'],  esprit: ['Veine de l’Esprit', '🕯️'],
  ombre:   ['Veine de l’Ombre', '🌑'],    chaine: ['Veine de la Chaîne', '⛓️'],
  // Hors Veines : pouvoirs du Maître du Jeu
  destin:  ['Pouvoir du Destin', '🎲'],
};

export const RANGS = ['', 'I', 'II', 'III', 'IV', 'V'];   // Rang I = le plus puissant

// Dos d'une carte selon sa rareté (collection, ouverture des boosters)
const VERSO_DEFAUT = 'img/Cartes/Verso-Carte.webp';
const VERSOS = {
  commune: 'img/Cartes/Verso-gris.webp',
  eveillee: 'img/Cartes/Verso-Eveillee.webp',
  mythique: 'img/Cartes/Verso-Bleue.webp',
  transcendante: 'img/Cartes/Verso-Or-Carte.webp',
};
export const versoDe = (rarete) => VERSOS[rarete] ?? VERSO_DEFAUT;

// La page du Codex du site Nocthémar de certaines cartes (nom sans accents, en minuscules)
export const PAGES_CODEX = {
  'kaeliss': 'Personnages/Kaeliss.html',
  'dalek': 'Personnages/Dalek.html',
  'maitre du jeu': 'Personnages/Maitre_du_jeu.html',
  'seigneur des marais': 'Personnages/Seigneur_des_Marais.html',
};
export const PROVENANCES = { boutique: 'Boosters et boutique', recompense: 'Récompense', evenement: 'Événement', discord: 'Serveur Discord' };

export const sansAccents = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
export const attaquesDe = (carte) => [carte.attack_1, carte.attack_2].filter((a) => a?.nom);
