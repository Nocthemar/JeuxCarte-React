// =====================================================================
//  Les paliers de la bourse (components/OrAnime.jsx, components/profil/Tresor.jsx)
// =====================================================================
// Paliers : [solde minimum, image, nombre d'étincelles] ; le dernier palier atteint l'emporte
export const PALIERS_OR = [
  [0, null, 1],              // pièce qui tourne (animation)
  [50, 'tas-1-petit', 2],
  [200, 'tas-2-moyen', 4],
  [500, 'tas-3-grand', 7],
  [1500, 'tas-4-enorme', 12],
];
export const palierOr = (solde) => PALIERS_OR.findLast(([min]) => solde >= min) ?? PALIERS_OR[0];
