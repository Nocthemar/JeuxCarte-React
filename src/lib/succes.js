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

// L'animation « Succès débloqué » : plein écran, différente selon la rareté.
// Se ferme seule (plus longue pour les plus rares) ou au clic / Échap. Renvoie une promesse.
export function celebrerSucces(s, { recompense = s?.recompense ?? 0 } = {}) {
  const r = rareteSucces(s);
  const { nom, duree, etincelles } = RARETES_SUCCES[r];
  const reduit = animationsReduites();

  const fond = document.createElement('div');
  fond.className = `succes-obtenu succes-obtenu--${r}${reduit ? ' succes-obtenu--sobre' : ''}`;
  fond.setAttribute('role', 'dialog');
  fond.setAttribute('aria-modal', 'true');
  fond.setAttribute('aria-label', `Succès débloqué : ${s?.nom ?? ''}`);
  const eclats = reduit ? '' : Array.from({ length: etincelles }, (_, i) => {
    const a = (360 / etincelles) * i + Math.random() * 14;
    const d = 140 + Math.random() * 160;
    return `<i style="--a:${a.toFixed(0)}deg;--d:${d.toFixed(0)}px;--t:${(Math.random() * .35).toFixed(2)}s"></i>`;
  }).join('');
  fond.innerHTML = `
    <div class="succes-obtenu__rayons" aria-hidden="true"></div>
    <div class="succes-obtenu__onde" aria-hidden="true"></div>
    <div class="succes-obtenu__onde succes-obtenu__onde--2" aria-hidden="true"></div>
    <div class="succes-obtenu__eclats" aria-hidden="true">${eclats}</div>
    <div class="succes-obtenu__contenu">
      <span class="succes-obtenu__sur">Succès débloqué · ${nom}</span>
      <div class="succes-obtenu__badge">${htmlBadge(s, 'geant')}</div>
      <h2 class="succes-obtenu__nom">${esc(s?.nom ?? '')}</h2>
      <p class="succes-obtenu__desc">${esc(s?.description ?? '')}</p>
      ${recompense ? `<p class="succes-obtenu__or"><img src="${esc(urlPublique('img/Equipement/Or-icone.webp'))}" alt=""> +${Number(recompense).toLocaleString('fr-FR')} or</p>` : ''}
      ${s?.pourcentage != null ? `<p class="succes-obtenu__pct">Obtenu par ${pourcentageTexte(s.pourcentage)} des joueurs</p>` : ''}
    </div>`;

  return new Promise((fini) => {
    let minuterie;
    const fermer = () => {
      clearTimeout(minuterie);
      document.removeEventListener('keydown', clavier);
      fond.classList.add('est-fermee');
      setTimeout(() => { fond.remove(); fini(); }, reduit ? 0 : 320);
    };
    const clavier = (e) => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fermer(); } };
    fond.addEventListener('click', fermer, { once: true });
    document.addEventListener('keydown', clavier);
    document.body.append(fond);
    minuterie = setTimeout(fermer, reduit ? 1800 : duree);
  });
}
