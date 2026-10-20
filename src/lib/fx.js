// =====================================================================
//  Petits retours visuels du duel (ancien JS/jeu-cartes-arene.js) : un texte qui flotte au-dessus
//  d'un élément, et une secousse. Ils agissent directement sur la page (comme avant) : ce sont des
//  effets passagers, qui ne changent rien à l'état du jeu.
//  Styles : .flotte, .fx-secousse (styles/jeu-cartes.css)
// =====================================================================
import { animationsReduites } from './preferences.js';

// Texte flottant (dégâts en rouge, soin en vert, bonus en ambre, « rate » en gris)
export function flotter(el, texte, type = 'degats') {
  if (!el) return;
  const r = el.getBoundingClientRect();
  const f = document.createElement('span');
  f.className = `flotte flotte--${type}`;
  f.textContent = texte;
  f.style.left = `${r.left + r.width / 2}px`;
  f.style.top = `${r.top + r.height * 0.35}px`;
  document.body.appendChild(f);
  setTimeout(() => f.remove(), animationsReduites() ? 600 : 1300);
}

export function classeTemporaire(el, classe, ms) {
  if (!el) return;
  el.classList.remove(classe);
  void el.offsetWidth;   // relance l'animation CSS même si la classe était déjà là
  el.classList.add(classe);
  setTimeout(() => el.classList.remove(classe), ms);
}
export const secouer = (el) => classeTemporaire(el, 'fx-secousse', 450);
