// =====================================================================
//  Les règles de la Caverne aux Trésors : les mêmes nombres que le serveur (supabase/caverne.sql),
//  qui seul décide. Ici, seulement pour afficher les multiplicateurs et les risques à l'avance.
// =====================================================================

// Les deux monnaies du jeu : mise minimale et maximale, mises rapides, image
export const MONNAIES = {
  or: { min: 10, max: 1000, rapides: [10, 25, 50, 100, 250], nom: 'pièces', image: 'img/Caverne/piece.png', mise: 25 },
  cristaux: { min: 5, max: 250, rapides: [5, 10, 25, 50, 100], nom: 'cristaux', image: 'img/OR/cristal.webp', mise: 10 },
};

export const PLAFOND = 100;                        // le gain d'une partie : au plus 100 fois la mise
const auCentieme = (m) => Math.min(PLAFOND, Math.floor(m * 100 + 1e-9) / 100);

// I. Le Dragon : le butin grossit de ×e^(0,12 t)
export const CROISSANCE = 0.12;
export const multDragon = (secondes) => Math.min(PLAFOND, Math.exp(CROISSANCE * Math.max(0, secondes)));

// II. Les Bourses : 25 bourses, le nombre de cristaux maudits au choix
export const NB_BOURSES = 25;
export const MAUDITES = [1, 3, 5, 8, 12];
export function multBourses(ouvertes, maudites) {
  if (ouvertes === 0) return 1;
  let f = 1;
  for (let i = 0; i < ouvertes; i++) f *= (NB_BOURSES - i) / (NB_BOURSES - maudites - i);
  return auCentieme(f * 0.97);
}

// III. Le Pont : 12 planches, la chance de casser de chacune
export const NB_PLANCHES = 12;
export const RISQUES = [0.08, 0.10, 0.12, 0.14, 0.17, 0.20, 0.24, 0.29, 0.35, 0.42, 0.48, 0.55];
export const MULT_PONT = [1];
{ let s = 1; for (const r of RISQUES) { s *= 1 - r; MULT_PONT.push(auCentieme(0.97 / s)); } }
