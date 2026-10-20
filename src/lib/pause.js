// Une pause (entre deux coups de l'Ombre, pendant une animation…) : nulle si l'utilisateur
// réduit les animations ou si l'onglet est caché (comme l'ancien jeu)
import { animationsReduites } from './preferences.js';

export const pause = (ms) => new Promise((r) => setTimeout(r, animationsReduites() || document.hidden ? 0 : ms));
