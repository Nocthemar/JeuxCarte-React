// =====================================================================
//  Le trésor du duelliste : la bourse du joueur (ancien afficherSolde, afficherOrBourse et afficherTresor
//  de JS/profil.js, même HTML). Visible seulement sur son propre profil.
//  L'image dépend du solde : une pièce couchée en noir et blanc (bourse vide), une pièce qui tourne,
//  puis des tas de plus en plus gros ; plus on est riche, plus l'or scintille (et plus son halo brille, en CSS).
// =====================================================================
import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { urlPublique } from '../../lib/chemins.js';
import { animationsReduites } from '../../lib/preferences.js';

// Paliers : [solde minimum, image, nombre d'étincelles] ; le dernier palier atteint l'emporte
const PALIERS_OR = [
  [0, null, 1],              // pièce qui tourne (animation)
  [50, 'tas-1-petit', 2],
  [200, 'tas-2-moyen', 4],
  [500, 'tas-3-grand', 7],
  [1500, 'tas-4-enorme', 12],
];
const SANS_ETINCELLES_JUSQUA = 10;   // de 0 à 10 pièces : pas d'étincelles
const NOMS_TAS = ['Quelques pièces', 'Un petit tas', 'Un tas d’or', 'Un grand trésor', 'Un trésor de seigneur'];
const imageOr = (nom) => urlPublique(`img/OR/pieces/${nom}.webp`);

// Un tour complet : face -> profil, puis les mêmes images en miroir (le revers de la pièce)
const TOUR_PIECE = [
  ['piece-face', false], ['piece-rotation-1', false], ['piece-rotation-2', false], ['piece-rotation-3', false],
  ['piece-rotation-3', true], ['piece-rotation-2', true], ['piece-rotation-1', true], ['piece-face', true],
  ['piece-rotation-1', false], ['piece-rotation-2', false], ['piece-rotation-3', false],
  ['piece-rotation-3', true], ['piece-rotation-2', true], ['piece-rotation-1', true],
];
const DUREE_IMAGE_PIECE = 280;   // ms par image

export default function Tresor({ solde }) {
  const image = useRef(null);
  const etincelles = useRef(null);
  const vide = solde <= 0;
  const palier = PALIERS_OR.findLast(([min]) => solde >= min) ?? PALIERS_OR[0];
  const [, tas, nbEtincelles] = palier;
  const iTas = vide ? -1 : PALIERS_OR.findLastIndex(([min]) => solde >= min);

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
    if (vide || tas || animationsReduites()) return undefined;
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
    <section id="duelliste" className="carte duelliste tresor-carte">
      <span className="vitrine__sur">Le duelliste</span>
      <h2>Le trésor</h2>
      <div id="bourse" className="tresor" data-richesse={vide ? 0 : PALIERS_OR.indexOf(palier) + 1}>
        <div className="tresor__or">
          <img className={`piece-icone${vide ? ' piece-icone--vide' : ''}`} ref={image} alt=""
            src={imageOr(vide ? 'piece-couchee-1' : tas ?? 'piece-face')} />
          <span className="bourse-etincelles" aria-hidden="true" ref={etincelles} />
        </div>
        <div className="tresor__infos">
          <span className="tresor__palier" id="tresor-palier">{iTas < 0 ? 'Bourse vide' : NOMS_TAS[iTas]}</span>
          <p className="tresor__solde"><span id="solde">{solde.toLocaleString('fr-FR')}</span><small>pièces d’or</small></p>
          <div className="tresor__gains">
            <span className="tresor__gains-titre">Gagner de l’or</span>
            <ul>
              <li>Vaincre l’Ombre : <b>2</b>, <b>5</b> ou <b>10</b> or selon la difficulté</li>
              <li>Recycler tes doublons dans la Collection</li>
              <li>Vendre des cartes au Marché</li>
              <li>Certains paliers du Pass de saison</li>
            </ul>
          </div>
          <div className="tresor__liens">
            <Link className="tresor__lien" to="/boutique">Boutique</Link>
            <Link className="tresor__lien" to="/marche">Marché</Link>
            <Link className="tresor__lien" to="/collection?vue=grimoire">Recycler</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
