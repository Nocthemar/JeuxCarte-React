// =====================================================================
//  Pass de saison : les noms des types de récompenses, et l'affichage des nombres (ancien JS/pass.js)
// =====================================================================
export const TYPES = {
  or: 'Or',
  carte: 'Carte',
  carte_rarete: 'Carte au hasard',
  booster: 'Booster',
  dos_carte: 'Dos de cartes',
  cadre_portrait: 'Cadre de portrait',
  titre: 'Titre',
  fond_plateau: 'Plateau',
};
export const nombre = (n) => Number(n ?? 0).toLocaleString('fr-FR');
export const PIECE = 'img/Equipement/Or-icone.webp';
