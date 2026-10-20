// =====================================================================
//  Le hasard du moteur : un générateur « à graine » (mulberry32)
//
//  L'ancien moteur tirait ses dés avec Math.random(), impossible à rejouer. Ici, le hasard vient de
//  la graine rangée dans l'état de la partie (etat.graine) : chaque tirage la fait avancer.
//  Même graine + mêmes actions = même partie, au dé près. C'est ce qui permet de tester les règles,
//  et à l'hôte d'une partie en ligne d'être le seul à lancer les dés.
//
//  etat.tirages (facultatif, pour les tests) : une liste de nombres entre 0 et 1, utilisés AVANT la
//  graine. Exemple : etat.tirages = [faceD20(20)] -> le prochain d20 fera 20.
// =====================================================================

// Une graine au hasard (au début d'une partie, si on n'en donne pas)
export const nouvelleGraine = () => Math.floor(Math.random() * 2 ** 32) >>> 0;

// Un pas du générateur mulberry32 : la graine suivante et un nombre entre 0 (compris) et 1 (exclu)
export function pas(graine) {
  const suivante = (graine + 0x6d2b79f5) | 0;
  let t = Math.imul(suivante ^ (suivante >>> 15), 1 | suivante);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return { graine: suivante >>> 0, valeur: ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
}

// Un nombre entre 0 et 1, tiré dans l'état de la partie (qui avance sa graine)
export function hasard(etat) {
  if (etat.tirages?.length) return etat.tirages.shift();
  const { graine, valeur } = pas(etat.graine >>> 0);
  etat.graine = graine;
  return valeur;
}

// Une fonction « () => nombre entre 0 et 1 » à partir d'une graine (hors partie : préparer un Grimoire…)
export function generateur(graine) {
  const etat = { graine: graine >>> 0 };
  return () => hasard(etat);
}

// Les tirages, à partir d'une fonction de hasard h (comme Math.random)
export const d20 = (h) => 1 + Math.floor(h() * 20);
export const auHasard = (liste, h) => liste[Math.floor(h() * liste.length)];

// Mélange de Fisher-Yates (le même que l'ancien moteur, tirage pour tirage)
export function melanger(liste, h) {
  const l = [...liste];
  for (let i = l.length - 1; i > 0; i--) {
    const j = Math.floor(h() * (i + 1));
    [l[i], l[j]] = [l[j], l[i]];
  }
  return l;
}

// Pour les tests : le nombre qui donne cette face au d20
export const faceD20 = (face) => (face - 1) / 20 + 0.01;
