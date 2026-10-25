// =====================================================================
//  Préférences du joueur (page Paramètres), retenues dans le navigateur.
//  Lues par les pages du jeu : niveau d'animations, effets réduits, mode performance, conseils du duel.
//  (Les volumes sont dans le module des sons.)
//  Mêmes clés que l'ancienne version : les réglages déjà faits sont gardés.
// =====================================================================
export const CLES = {
  animations: 'duel-animations',                    // 'completes' | 'reduites' | 'coupees'
  animationsReduites: 'duel-animations-reduites',   // ancienne case « Animations réduites » ('1' = coupées)
  effetsLegers: 'duel-effets-legers',               // '1' : moins de particules et de lueurs
  modePerformance: 'duel-mode-performance',         // '1' : tout ce qui coûte est coupé ou allégé
  conseils: 'duel-conseils',                        // '1' : la consigne du tour s'affiche en duel
};

export function lirePref(cle) {
  try { return localStorage.getItem(cle) === '1'; } catch { return false; }
}
export function ecrirePref(cle, actif) {
  try { localStorage.setItem(cle, actif ? '1' : '0'); } catch { /* stockage indisponible */ }
  appliquerClasses();
}

export const modePerformance = () => lirePref(CLES.modePerformance);

// Niveau d'animations : complètes, réduites (plus courtes, sans secousses ni voiles), coupées.
// Le réglage du système (moins de mouvement) les coupe ; le mode performance les réduit au moins.
export const NIVEAUX_ANIMATIONS = ['completes', 'reduites', 'coupees'];
export function niveauAnimations() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return 'coupees';
  const niveau = niveauAnimationsChoisi();
  return niveau === 'completes' && modePerformance() ? 'reduites' : niveau;
}
export function ecrireNiveauAnimations(niveau) {
  try { localStorage.setItem(CLES.animations, niveau); } catch { /* stockage indisponible */ }
  appliquerClasses();
}
// Le niveau choisi dans les Paramètres (sans le mode performance ni le réglage du système) ;
// l'ancienne case « Animations réduites » cochée vaut « coupées »
export function niveauAnimationsChoisi() {
  try {
    const niveau = localStorage.getItem(CLES.animations);
    if (NIVEAUX_ANIMATIONS.includes(niveau)) return niveau;
    return localStorage.getItem(CLES.animationsReduites) === '1' ? 'coupees' : 'completes';
  } catch { return 'completes'; }
}

// Animations coupées (le nom est resté celui de l'ancienne case)
export const animationsReduites = () => niveauAnimations() === 'coupees';
// Animations réduites ou coupées : plus courtes, sans secousse de l'écran ni voile
export const animationsDouces = () => niveauAnimations() !== 'completes';
// Le joueur presse les animations du duel (un clic pendant qu'elles jouent, lib/duel/useScene.js) :
// jusqu'à la fin de l'action en cours, plus de pauses, et les animations attendues se terminent d'un coup
let presse = false;
const quandPresses = new Set();
export function presser(oui = true) {
  presse = oui;
  if (oui) quandPresses.forEach((f) => f());
}
// f() est appelée si le joueur presse ; renvoie la fonction qui l'oublie
export function quandPresse(f) {
  quandPresses.add(f);
  return () => quandPresses.delete(f);
}

// Durée d'une pause ou d'une animation selon le niveau (0 si coupées, si le joueur presse les
// animations, ou si l'onglet est caché)
export function duree(ms) {
  if (document.hidden || presse) return 0;
  const niveau = niveauAnimations();
  return niveau === 'coupees' ? 0 : niveau === 'reduites' ? Math.round(ms * 0.6) : ms;
}
export const effetsLegers = () => lirePref(CLES.effetsLegers) || modePerformance();

// Classes sur <html> pour le CSS (styles/compte.css) :
//   anim-reduites (coupées), anim-douces (réduites ou coupées), effets-legers, mode-perf
export function appliquerClasses() {
  const html = document.documentElement.classList;
  html.toggle('anim-reduites', animationsReduites());
  html.toggle('anim-douces', animationsDouces());
  html.toggle('effets-legers', effetsLegers());
  html.toggle('mode-perf', modePerformance());
}

// Thème de jour du site (choisi sur le site Nocthémar, retenu dans le navigateur)
export function appliquerTheme() {
  try {
    if (localStorage.getItem('nocthemar-theme') === 'jour') document.documentElement.dataset.theme = 'jour';
  } catch { /* stockage indisponible */ }
}
