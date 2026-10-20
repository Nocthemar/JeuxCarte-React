// =====================================================================
//  Des coups qui frappent (styles/duel-spectacle.css)
//   - arretSurImage : tout ce qui bouge à l'écran se fige un instant à l'impact, puis repart
//     (le « hit-stop » des jeux de combat : c'est lui qui donne du poids aux coups) ;
//   - coupDeCamera : le plateau zoome brièvement vers la cible touchée ;
//   - chiffreDegats : un gros chiffre qui jaillit et rebondit, d'autant plus gros que le coup est fort ;
//   - pvTouches : le chiffre des PV d'un héros sursaute en rouge.
//  Rien de tout cela avec « Animations réduites », ni quand l'onglet est caché.
// =====================================================================
import { animationsReduites } from '../preferences.js';
import { pause } from '../pause.js';

const reduit = animationsReduites();
const actif = () => !reduit && !document.hidden;

export async function arretSurImage(ms) {
  if (!actif()) return;
  // (sauf le grand dé, qui finit de rejoindre le petit dé du plateau : figé, il resterait en plein écran)
  const enCours = document.getAnimations().filter((a) => a.playState === 'running' && !a.effect?.target?.closest?.('.gd-scene'));
  enCours.forEach((a) => a.pause());
  await pause(ms);
  enCours.forEach((a) => { if (a.playState === 'paused') a.play(); });
}

export function coupDeCamera(el, force = 0.03) {
  const table = document.getElementById('scene-table');
  if (!el || !table || !actif()) return;
  const t = table.getBoundingClientRect();
  const c = el.getBoundingClientRect();
  // le zoom part de la cible (le reste du plateau s'écarte autour d'elle)
  table.style.transformOrigin = `${c.left + c.width / 2 - t.left}px ${c.top + c.height / 2 - t.top}px`;
  table.animate([{ scale: '1' }, { scale: `${1 + force}`, offset: 0.25 }, { scale: '1' }], { duration: 420, easing: 'cubic-bezier(.2,.8,.3,1)' });
}

export function chiffreDegats(el, valeur, critique = false) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  const n = document.createElement('span');
  n.className = `coup-chiffre${critique ? ' coup-chiffre--critique' : ''}`;
  n.textContent = `-${valeur}`;
  // plus le coup est fort, plus le chiffre est gros
  n.style.setProperty('--taille', `${Math.min(1.8 + valeur * 0.22, 4.2) * (critique ? 1.35 : 1)}rem`);
  n.style.left = `${r.left + r.width / 2}px`;
  n.style.top = `${r.top + r.height * 0.4}px`;
  document.body.appendChild(n);
  if (!actif()) { setTimeout(() => n.remove(), 700); return; }
  const penche = (Math.random() - 0.5) * 16;
  const derive = (Math.random() - 0.5) * 40;
  n.animate([
    { transform: `translate(-50%, -50%) scale(.2) rotate(${penche}deg)`, opacity: 0 },
    { transform: `translate(-50%, -80%) scale(${critique ? 1.7 : 1.45}) rotate(${penche}deg)`, opacity: 1, offset: 0.14 },
    { transform: `translate(-50%, -60%) scale(.92) rotate(${penche / 2}deg)`, opacity: 1, offset: 0.26 },
    { transform: 'translate(-50%, -66%) scale(1.04) rotate(0deg)', opacity: 1, offset: 0.36 },
    { transform: `translate(calc(-50% + ${derive}px), -190%) scale(1) rotate(0deg)`, opacity: 0 },
  ], { duration: critique ? 1500 : 1200, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' }).onfinish = () => n.remove();
}

export function pvTouches(heros) {
  const pv = heros?.querySelector('.dc-heros__pv');
  if (!pv || !actif()) return;
  pv.animate([
    { scale: '1', filter: 'none' },
    { scale: '1.45', filter: 'drop-shadow(0 0 10px #ff4b5c) brightness(1.4)', offset: 0.2 },
    { scale: '.92', offset: 0.45 },
    { scale: '1', filter: 'none' },
  ], { duration: 520, easing: 'ease-out' });
}
