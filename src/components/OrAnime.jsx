// =====================================================================
//  L'or animé de la bourse (le Trésor du profil et la bourse de la barre de navigation) :
//  l'image dépend du solde — une pièce couchée en noir et blanc (bourse vide), une pièce qui tourne,
//  puis des tas de plus en plus gros ; plus on est riche, plus l'or scintille.
//  Styles : .piece-icone, .bourse-etincelles, .etincelle (styles/compte.css).
// =====================================================================
import { useEffect, useRef } from 'react';
import { urlPublique } from '../lib/chemins.js';
import { animationsReduites, modePerformance } from '../lib/preferences.js';
import { palierOr } from '../lib/or.js';

const SANS_ETINCELLES_JUSQUA = 10;   // de 0 à 10 pièces : pas d'étincelles
const imageOr = (nom) => urlPublique(`img/OR/pieces/${nom}.webp`);

// Un tour complet : face -> profil, puis les mêmes images en miroir (le revers de la pièce)
const TOUR_PIECE = [
  ['piece-face', false], ['piece-rotation-1', false], ['piece-rotation-2', false], ['piece-rotation-3', false],
  ['piece-rotation-3', true], ['piece-rotation-2', true], ['piece-rotation-1', true], ['piece-face', true],
  ['piece-rotation-1', false], ['piece-rotation-2', false], ['piece-rotation-3', false],
  ['piece-rotation-3', true], ['piece-rotation-2', true], ['piece-rotation-1', true],
];
const DUREE_IMAGE_PIECE = 280;   // ms par image


export default function OrAnime({ solde }) {
  const image = useRef(null);
  const etincelles = useRef(null);
  const vide = solde <= 0;
  const [, tas, nbEtincelles] = palierOr(solde);

  // La pièce qui tourne (et les étincelles posées au hasard, chacune à son rythme)
  useEffect(() => {
    const img = image.current;
    img.style.transform = '';
    const n = solde <= SANS_ETINCELLES_JUSQUA ? 0 : nbEtincelles;
    etincelles.current.innerHTML = Array.from({ length: n }, () => {
      const x = 20 + Math.random() * 60;         // % de la largeur de l'or
      const y = 10 + Math.random() * 75;         // % de la hauteur
      const taille = 8 + Math.random() * 8;      // px
      const duree = 1.4 + Math.random() * 1.6;   // s
      const delai = -Math.random() * duree;      // déjà en cours au chargement
      return `<span class="etincelle" style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%;--taille:${taille.toFixed(1)}px;animation-duration:${duree.toFixed(2)}s;animation-delay:${delai.toFixed(2)}s"></span>`;
    }).join('');
    if (vide || tas || animationsReduites() || modePerformance()) return undefined;
    // Précharge les images du tour pour que l'animation ne clignote pas
    for (const nom of new Set(TOUR_PIECE.map(([x]) => x))) new Image().src = imageOr(nom);
    let i = 0;
    const t = setInterval(() => {
      i = (i + 1) % TOUR_PIECE.length;
      const [nom, miroir] = TOUR_PIECE[i];
      img.src = imageOr(nom);
      img.style.transform = miroir ? 'scaleX(-1)' : '';
    }, DUREE_IMAGE_PIECE);
    return () => clearInterval(t);
  }, [solde, vide, tas, nbEtincelles]);

  return (
    <>
      <img className={`piece-icone${vide ? ' piece-icone--vide' : ''}`} ref={image} alt=""
        src={imageOr(vide ? 'piece-couchee-1' : tas ?? 'piece-face')} />
      <span className="bourse-etincelles" aria-hidden="true" ref={etincelles} />
    </>
  );
}
