// =====================================================================
//  Glisser-déposer à la souris et au doigt (Pointer Events) (ancien activerGlisser de JS/cartes.js)
//  Au doigt : appui long pour saisir la carte, sinon la page défile normalement.
//  Pendant le glisser, une copie de la carte (le « fantôme ») suit le pointeur, et <body> porte la
//  classe glisser-actif ; la cible survolée porte cible-survol.
//
//  const arreter = activerGlisser(zone, { poignee, cible, deposer });
//    poignee : sélecteur CSS de ce qu'on peut saisir ; cible : où on peut le déposer
//    deposer(element, cible) : appelé quand on lâche la carte sur une cible
//    arreter() : retire les écouteurs (à appeler en quittant l'écran)
// =====================================================================
const SEUIL = 6;          // px avant de considérer que la souris « glisse »
const APPUI_LONG = 280;   // ms au doigt avant de saisir la carte

export function activerGlisser(zone, { poignee, cible, deposer }) {
  let enCours = null;

  // Tant qu'une carte est saisie au doigt, on empêche la page de défiler
  const bloquerDefilement = (e) => { if (enCours?.retenir) e.preventDefault(); };
  document.addEventListener('touchmove', bloquerDefilement, { passive: false });

  const surAppui = (e) => {
    const el = e.target.closest(poignee);
    if (!el || !zone.contains(el) || e.button !== 0 || e.target.closest('button, a')) return;

    const tactile = e.pointerType !== 'mouse';
    const depart = { x: e.clientX, y: e.clientY };
    const etat = { el, fantome: null, survol: null, retenir: false, minuteur: null };
    enCours = etat;

    const suivre = (x, y) => {
      etat.fantome.style.transform = `translate(${x - etat.decalage.x}px, ${y - etat.decalage.y}px) rotate(4deg) scale(1.05)`;
      const dessous = document.elementFromPoint(x, y)?.closest(cible) ?? null;
      if (dessous !== etat.survol) {
        etat.survol?.classList.remove('cible-survol');
        etat.survol = dessous;
        etat.survol?.classList.add('cible-survol');
      }
    };
    const saisir = (x, y) => {
      const r = el.getBoundingClientRect();
      etat.decalage = { x: depart.x - r.left, y: depart.y - r.top };
      etat.fantome = el.cloneNode(true);
      etat.fantome.classList.add('carte-fantome');
      etat.fantome.style.width = `${r.width}px`;
      etat.fantome.style.height = `${r.height}px`;
      document.body.append(etat.fantome);
      el.classList.add('carte-jeu--saisie');
      etat.retenir = true;
      document.body.classList.add('glisser-actif');
      navigator.vibrate?.(15);
      suivre(x, y);
    };

    if (tactile) etat.minuteur = setTimeout(() => saisir(depart.x, depart.y), APPUI_LONG);

    const bouger = (ev) => {
      if (etat.fantome) return suivre(ev.clientX, ev.clientY);
      const distance = Math.hypot(ev.clientX - depart.x, ev.clientY - depart.y);
      if (distance < SEUIL) return;
      if (tactile) return terminer();   // le doigt bouge avant l'appui long : c'est un défilement
      saisir(ev.clientX, ev.clientY);
    };

    const terminer = (ev) => {
      clearTimeout(etat.minuteur);
      window.removeEventListener('pointermove', bouger);
      window.removeEventListener('pointerup', terminer);
      window.removeEventListener('pointercancel', terminer);
      enCours = null;
      if (!etat.fantome) return;

      etat.fantome.remove();
      el.classList.remove('carte-jeu--saisie');
      document.body.classList.remove('glisser-actif');
      etat.survol?.classList.remove('cible-survol');

      // Le « click » qui suit un glisser ne doit pas sélectionner la carte
      const bloquerClic = (c) => { c.stopPropagation(); c.preventDefault(); };
      window.addEventListener('click', bloquerClic, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', bloquerClic, { capture: true }), 0);

      if (ev?.type === 'pointerup' && etat.survol) deposer(el, etat.survol);
    };

    window.addEventListener('pointermove', bouger);
    window.addEventListener('pointerup', terminer);
    window.addEventListener('pointercancel', terminer);
  };

  // Empêche le menu contextuel de l'appui long sur mobile
  const surMenu = (e) => { if (e.target.closest(poignee)) e.preventDefault(); };

  zone.addEventListener('pointerdown', surAppui);
  zone.addEventListener('contextmenu', surMenu);
  return () => {
    document.removeEventListener('touchmove', bloquerDefilement);
    zone.removeEventListener('pointerdown', surAppui);
    zone.removeEventListener('contextmenu', surMenu);
  };
}
