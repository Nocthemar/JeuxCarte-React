// =====================================================================
//  Infobulles du duel (ancien JS/jeu-cartes-arene.js) : au survol d'un élément [data-infobulle]
//  (les icônes des capacités), une bulle au-dessus de la page. Elle disparaît au défilement.
//  Style : .infobulle (styles/jeu-cartes.css)
// =====================================================================
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export default function Infobulle() {
  const bulle = useRef(null);

  useEffect(() => {
    const el = bulle.current;
    // On place la bulle directement (sans état React) : elle suit la souris sans redessiner la page
    const survol = (e) => {
      const cible = e.target.closest?.('[data-infobulle]');
      if (!cible) { el.hidden = true; return; }
      el.textContent = cible.dataset.infobulle;
      el.hidden = false;
      const r = cible.getBoundingClientRect();
      const b = el.getBoundingClientRect();
      el.style.left = `${Math.max(8, Math.min(innerWidth - b.width - 8, r.left + r.width / 2 - b.width / 2))}px`;
      el.style.top = `${r.top - b.height - 8 < 8 ? r.bottom + 8 : r.top - b.height - 8}px`;
    };
    const defilement = () => { el.hidden = true; };
    document.addEventListener('pointerover', survol, { passive: true });
    document.addEventListener('scroll', defilement, { passive: true, capture: true });
    return () => {
      document.removeEventListener('pointerover', survol);
      document.removeEventListener('scroll', defilement, { capture: true });
    };
  }, []);

  return createPortal(<div className="infobulle" role="tooltip" hidden ref={bulle} />, document.body);
}
