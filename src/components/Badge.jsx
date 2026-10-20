// Le badge d'un succès : un médaillon hexagonal à la couleur de la rareté, l'icône au centre
// (ancien htmlBadge de JS/succes-badge.js, même HTML ; styles/succes-badges.css)
// taille : '' (normal), 'grand' (vitrine, profil) ou 'geant' (animation « Succès débloqué »)
import { rareteSucces } from '../lib/succes.js';

export default function Badge({ s, taille = '' }) {
  return (
    <span className={`badge-succes badge-succes--${rareteSucces(s)}${taille ? ` badge-succes--${taille}` : ''}`} aria-hidden="true">
      <span className="badge-succes__cadre" />
      <span className="badge-succes__icone">{s?.icone ?? '✦'}</span>
    </span>
  );
}
