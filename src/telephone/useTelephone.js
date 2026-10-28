// =====================================================================
//  Sommes-nous sur un téléphone ? (la même limite que les feuilles de src/telephone/styles : 700 px de large)
//  const telephone = useTelephone();   -> true / false, mis à jour si la fenêtre change de taille
//  Pour un composant qui doit s'afficher autrement sur téléphone ; pour le style seul, une feuille suffit.
// =====================================================================
import { useSyncExternalStore } from 'react';

const REQUETE = '(max-width: 700px)';
const abonner = (prevenir) => {
  const m = matchMedia(REQUETE);
  m.addEventListener('change', prevenir);
  return () => m.removeEventListener('change', prevenir);
};
const lire = () => matchMedia(REQUETE).matches;

export function useTelephone() {
  return useSyncExternalStore(abonner, lire, () => false);
}
