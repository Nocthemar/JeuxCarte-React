// =====================================================================
//  Le mode Histoire côté duel (ancien JS/jeu-cartes.js)
//  - le Grimoire de l'adversaire d'un niveau (src/data/histoire.js ; moteur/solo.js) ;
//  - la victoire est validée par l'arbitre du serveur, qui rejoue la partie et donne les récompenses
//    (lib/duelServeur.js) ;
//  - le résultat est laissé dans le navigateur pour l'écran Histoire (même clé qu'avant).
// =====================================================================
export { deckHistoire } from '../moteur/index.js';

export const CLE_RESULTAT_HISTOIRE = 'histoire-resultat';

// Fin d'un niveau : la réponse de l'arbitre (lib/duelServeur.js, terminerDuel) devient le résultat affiché
// sur l'écran de fin et sur la carte. reponse : null pour un duel d'entraînement (serveur injoignable au début)
export function garderResultatHistoire(idNiveau, gagne, reponse) {
  const resultat = { niveau: idNiveau, gagne, recompenses: null, erreur: null };
  if (gagne) {
    if (!reponse) resultat.erreur = 'le serveur était injoignable au début du duel (duel d’entraînement).';
    else if (reponse.erreur) resultat.erreur = reponse.erreur;
    else if (!reponse.victoire) resultat.erreur = reponse.raison === 'court' ? 'duel trop court.'
      : reponse.raison === 'ticket' ? 'duel déjà clos ou remplacé par un autre.' :'l’arbitre n’a pas reconnu cette victoire.';
    else resultat.recompenses = reponse.recompenses;
  }
  try { sessionStorage.setItem(CLE_RESULTAT_HISTOIRE, JSON.stringify(resultat)); } catch { /* stockage indisponible */ }
  return resultat;
}

// Le résultat laissé par le dernier duel (l'écran Histoire le lit, puis l'oublie : affiché une seule fois)
export function lireResultatHistoire() {
  try {
    const brut = sessionStorage.getItem(CLE_RESULTAT_HISTOIRE);
    return brut ? JSON.parse(brut) : null;
  } catch { return null; }
}
export function oublierResultatHistoire() {
  try { sessionStorage.removeItem(CLE_RESULTAT_HISTOIRE); } catch { /* stockage indisponible */ }
}

// La phrase des récompenses, sur l'écran de fin du duel
export function texteRecompense({ gagne, recompenses: r, erreur }) {
  if (!gagne) return 'Retourne sur la carte et retente ta chance.';
  if (erreur) return `Victoire non enregistrée : ${erreur}`;
  if (!r || r.deja) return 'Niveau déjà terminé : pas de nouvelle récompense.';
  const gains = [];
  if (r.or) gains.push(`+${r.or} pièces`);
  if (r.carte) gains.push(`la carte « ${r.carte} »`);   // l'XP de pass s'affiche à part
  return gains.length ? `Récompenses : ${gains.join(', ')}.` : '';
}
