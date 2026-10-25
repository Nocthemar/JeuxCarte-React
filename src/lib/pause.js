// Une pause (entre deux coups de l'Ombre, pendant une animation…) : plus courte si les animations
// sont réduites, nulle si elles sont coupées ou si l'onglet est caché (comme l'ancien jeu).
// Si le joueur presse les animations (un clic), la pause en cours s'arrête aussitôt.
import { duree, quandPresse } from './preferences.js';

export const pause = (ms) => new Promise((r) => {
  const fin = () => { clearTimeout(minuteur); oublier(); r(); };
  const minuteur = setTimeout(fin, duree(ms));
  const oublier = quandPresse(fin);
});
