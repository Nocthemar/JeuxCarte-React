// =====================================================================
//  L'élan de l'Ombre (le niveau caché du duel contre l'IA), retenu dans le navigateur, par joueur.
//  +1 par victoire, -1 par défaite, entre -3 et +3 (règles : src/moteur/ombre.js).
//  Même clé qu'avant : l'élan déjà gagné est gardé.
// =====================================================================
import { ELAN_MAX, elanApres } from '../moteur/index.js';

const cle = (idJoueur) => `duel-ombre-elan:${idJoueur ?? 'invite'}`;

export function lireElan(idJoueur) {
  try {
    const n = Number(localStorage.getItem(cle(idJoueur)));
    return Number.isFinite(n) ? Math.max(-ELAN_MAX, Math.min(ELAN_MAX, Math.round(n))) : 0;
  } catch { return 0; }
}

// Après un duel contre l'Ombre (pas en mode Histoire)
export function noterResultat(idJoueur, gagne) {
  const elan = elanApres(lireElan(idJoueur), gagne);
  try { localStorage.setItem(cle(idJoueur), String(elan)); } catch { /* stockage indisponible */ }
  return elan;
}
