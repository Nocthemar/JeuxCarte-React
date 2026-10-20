// =====================================================================
//  Collection : la valeur des doublons recyclés (ancien JS/collection.js ; recycler_carte, recycler_doublons)
// =====================================================================
const VALEUR = { commune: 20, eveillee: 40, mythique: 80, legendaire: 150, transcendante: 300 };
export const valeurCarte = (carte) => VALEUR[carte.rarity] ?? 20;
export const texteGains = (or, ex) => `+${or.toLocaleString('fr-FR')} or · +${10 * ex} XP de pass`;
