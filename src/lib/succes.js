// =====================================================================
//  Succès : raretés, pourcentage, et l'animation « Succès débloqué » (ancien JS/succes-badge.js)
//  Partagé par l'écran Succès et le Profil (vitrine de badges). Styles : styles/succes-badges.css.
//  Rareté (comme sur Steam) : commun, rare, epique, legendaire — chacune a sa couleur et son animation.
//  L'animation fabrique ses propres éléments par-dessus la page (comme celles du duel), hors de React.
// =====================================================================
import { animationsReduites } from './preferences.js';
import { urlPublique } from './chemins.js';

export const RARETES_SUCCES = {
  commun:     { nom: 'Commun',     duree: 2300, etincelles: 0 },
  rare:       { nom: 'Rare',       duree: 2900, etincelles: 10 },
  epique:     { nom: 'Épique',     duree: 3600, etincelles: 18 },
  legendaire: { nom: 'Légendaire', duree: 4800, etincelles: 30 },
};
export const rareteSucces = (s) => (RARETES_SUCCES[s?.rarete] ? s.rarete : 'commun');

export const pourcentageTexte = (p) => {
  const n = Number(p) || 0;
  return `${n < 1 && n > 0 ? n.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) : Math.round(n)} %`;
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Le badge en HTML (le composant Badge, components/Badge.jsx, fait le même pour React)
function htmlBadge(s, taille = '') {
  const r = rareteSucces(s);
  return `<span class="badge-succes badge-succes--${r}${taille ? ` badge-succes--${taille}` : ''}" aria-hidden="true">
    <span class="badge-succes__cadre"></span>
    <span class="badge-succes__icone">${esc(s?.icone ?? '✦')}</span>
  </span>`;
}

// La notification « Succès débloqué » : une plaque courte en haut à droite. Elle ne bloque rien (on continue à
// jouer dessous), prend la couleur de la rareté, et s'efface seule (un peu plus tard pour les plus rares) ou au
// clic. Plusieurs à la suite s'empilent. prete : le succès est atteint mais pas encore réclamé (la plaque mène
// alors à l'écran Succès). Renvoie une promesse résolue tout de suite (rien n'attend la plaque).
export function celebrerSucces(s, { recompense = s?.recompense ?? 0, cristaux = s?.cristaux ?? 0, prete = false } = {}) {
  const r = rareteSucces(s);
  const { nom, duree } = RARETES_SUCCES[r];
  let pile = document.getElementById('succes-notifs');
  if (!pile) {
    pile = document.createElement('div');
    pile.id = 'succes-notifs';
    pile.setAttribute('aria-live', 'polite');
    document.body.append(pile);
  }
  const piece = esc(urlPublique('img/Equipement/Or-icone.webp'));
  const cristal = esc(urlPublique('img/OR/cristal.webp'));
  const gains = (recompense ? `<span><img src="${piece}" alt=""> +${Number(recompense).toLocaleString('fr-FR')}</span>` : '')
    + (cristaux ? `<span><img src="${cristal}" alt=""> +${Number(cristaux).toLocaleString('fr-FR')}</span>` : '');
  const plaque = document.createElement(prete ? 'a' : 'div');
  plaque.className = `succes-notif succes-notif--${r}${animationsReduites() ? ' succes-notif--sobre' : ''}`;
  if (prete) plaque.href = '#/succes';
  plaque.innerHTML = `
    <div class="succes-notif__badge">${htmlBadge(s)}</div>
    <div class="succes-notif__texte">
      <span class="succes-notif__sur">Succès débloqué · ${nom}</span>
      <b class="succes-notif__nom">${esc(s?.nom ?? '')}</b>
      ${gains || prete ? `<span class="succes-notif__gains">${gains}${prete ? '<small>à réclamer</small>' : ''}</span>` : ''}
    </div>`;
  const fermer = () => { plaque.classList.add('est-fermee'); setTimeout(() => plaque.remove(), 300); };
  plaque.addEventListener('click', fermer);
  pile.append(plaque);
  setTimeout(fermer, Math.max(4200, duree + 1400));
  return Promise.resolve();
}
