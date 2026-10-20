// =====================================================================
//  Rendre le jeu solide face aux plantages
//  - signalerErreur() : envoie l'erreur au journal Supabase (table erreurs_jeu, supabase/erreurs.sql) ;
//  - rechargerApresMiseAJour() : quand une nouvelle version du jeu a été publiée pendant qu'on jouait,
//    les anciens fichiers des écrans n'existent plus sur GitHub Pages : on recharge la page une fois ;
//  - installerFilets() : attrape aussi les erreurs qui arrivent hors d'un écran (minuteurs, promesses).
// =====================================================================
import { supabase } from './supabase.js';

// Le commit publié (donné par GitHub Actions), « local » pendant le développement
const VERSION = (import.meta.env.VITE_VERSION || 'local').slice(0, 7);
// Au plus 5 erreurs envoyées par visite, et jamais deux fois la même
const MAX_PAR_VISITE = 5;
let envoyees = 0;
const dejaVues = new Set();
// La page se recharge : les erreurs qui suivent viennent de la version périmée, on ne les signale pas
let enRechargement = false;

// Bruit qu'on ne peut pas corriger : réseau coupé, extensions du navigateur…
const BRUIT = /^Script error\.?$|Failed to fetch|NetworkError|Load failed|ResizeObserver loop|chrome-extension:|moz-extension:/;

// Un fichier d'écran introuvable (le jeu a été mis à jour depuis l'ouverture de la page)
const FICHIER_PERIME = /dynamically imported module|Importing a module script failed|Unable to preload CSS|error loading dynamically/i;

export function estFichierPerime(erreur) {
  return FICHIER_PERIME.test(String(erreur?.message ?? erreur));
}

export function signalerErreur(erreur, origine) {
  if (enRechargement) return;
  const message = String(erreur?.message ?? erreur ?? 'Erreur inconnue');
  const pile = String(erreur?.stack ?? '');
  // (« Failed to fetch dynamically imported module » n'est pas du bruit : le fichier d'écran manque encore après rechargement)
  if (!estFichierPerime(message) && (BRUIT.test(message) || BRUIT.test(pile))) return;
  const cle = `${origine}|${message}`;
  if (dejaVues.has(cle) || envoyees >= MAX_PAR_VISITE) return;
  dejaVues.add(cle);
  envoyees += 1;
  supabase.rpc('signaler_erreur', {
    p_message: message.slice(0, 500),
    p_pile: pile.slice(0, 4000),
    p_origine: origine,
    p_page: location.hash.slice(0, 200) || '#/',
    p_navigateur: navigator.userAgent.slice(0, 300),
    p_version: VERSION,
  }).then(() => {}, () => {}); // le journal ne doit jamais faire planter le jeu lui-même
}

// Recharge la page, mais pas deux fois en 30 secondes (sinon : boucle de rechargements)
export function rechargerApresMiseAJour() {
  try {
    const derniere = Number(sessionStorage.getItem('jeu-recharge')) || 0;
    if (Date.now() - derniere < 30000) return false;
    sessionStorage.setItem('jeu-recharge', String(Date.now()));
  } catch {
    return false;
  }
  enRechargement = true;
  location.reload();
  return true;
}

export function installerFilets() {
  // Vite prévient quand un fichier d'écran ne se charge pas
  window.addEventListener('vite:preloadError', (e) => {
    if (rechargerApresMiseAJour()) e.preventDefault();
  });
  window.addEventListener('error', (e) => signalerErreur(e.error ?? e.message, 'global'));
  window.addEventListener('unhandledrejection', (e) => signalerErreur(e.reason, 'promesse'));
}
