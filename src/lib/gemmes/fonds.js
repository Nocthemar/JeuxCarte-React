// =====================================================================
//  Les fonds des Gemmes : un par plateau de la Boutique (mêmes ids que PLATEAUX, lib/donneesDuel.js).
//  Le plateau équipé (boutique, roue des apparences de la Collection) habille la table des Gemmes.
//  public/img/Fond gemmes/gemmes-<id>.webp (la table, 1670 × 941) et gemmes-<id>-mini.webp (aperçus, 520 px).
// =====================================================================
export const FONDS_GEMMES = ['defaut', 'automne', 'ete', 'hiver', 'printemps', 'cristaux', 'flamme', 'plage'];

// Le chemin du fond d'un plateau (le défaut si ce plateau n'a pas de fond de Gemmes)
export const fondGemmes = (plateau, mini = false) =>
  `img/Fond gemmes/gemmes-${FONDS_GEMMES.includes(plateau) ? plateau : 'defaut'}${mini ? '-mini' : ''}.webp`;
