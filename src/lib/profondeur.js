// =====================================================================
//  Inclinaison 3D des cartes du duel sous la souris (ancien activerProfondeur de JS/jeu-cartes-arene.js)
//  La carte survolée reçoit la classe « incline » et ses angles (--rx, --ry) ; le reflet suit la
//  souris (--mx, --my). Rien sur un écran tactile, ni avec les animations réduites.
// =====================================================================
import { useEffect } from 'react';
import { animationsReduites, modePerformance } from './preferences.js';

export function useProfondeur() {
  useEffect(() => {
    if (animationsReduites() || modePerformance() || !matchMedia('(hover: hover)').matches) return undefined;
    const bouger = (e) => {
      const carte = e.target.closest?.('.dc-carte');
      document.querySelectorAll('.dc-carte.incline').forEach((c) => {
        if (c !== carte) { c.classList.remove('incline'); c.style.removeProperty('--rx'); c.style.removeProperty('--ry'); }
      });
      if (!carte) return;
      const r = carte.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      carte.classList.add('incline');
      carte.style.setProperty('--rx', `${((0.5 - y) * 16).toFixed(1)}deg`);
      carte.style.setProperty('--ry', `${((x - 0.5) * 18).toFixed(1)}deg`);
      carte.style.setProperty('--mx', `${(x * 100).toFixed(0)}%`);
      carte.style.setProperty('--my', `${(y * 100).toFixed(0)}%`);
    };
    document.addEventListener('pointermove', bouger, { passive: true });
    return () => document.removeEventListener('pointermove', bouger);
  }, []);
}
