// =====================================================================
//  Le trésor du duelliste : la bourse du joueur, dans la colonne du héros (styles/profil-heros.css).
//  Visible seulement sur son propre profil.
//  L'image dépend du solde : une pièce couchée en noir et blanc (bourse vide), une pièce qui tourne,
//  puis des tas de plus en plus gros ; plus on est riche, plus l'or scintille (et plus son halo brille, en CSS).
//  À côté de l'or, à égalité, les cristaux (seconde monnaie : affichée, sans usage pour l'instant), qui luisent.
//  « Gagner de l'or » se déplie au besoin, pour que le profil tienne sur un écran.
// =====================================================================
import { Link } from 'react-router-dom';
import OrAnime from '../OrAnime.jsx';
import { PALIERS_OR, palierOr } from '../../lib/or.js';
import { urlPublique } from '../../lib/chemins.js';

const NOMS_TAS = ['Quelques pièces', 'Un petit tas', 'Un tas d’or', 'Un grand trésor', 'Un trésor de seigneur'];

export default function Tresor({ solde, cristaux = 0 }) {
  const vide = solde <= 0;
  const palier = palierOr(solde);
  const iTas = vide ? -1 : PALIERS_OR.indexOf(palier);

  return (
    <div id="bourse" className="tresor" data-richesse={vide ? 0 : iTas + 1}>
      {/* les deux monnaies, à égalité : l'or (qui scintille), puis les cristaux (qui luisent) */}
      <div className="tresor__monnaie">
        <div className="tresor__or"><OrAnime solde={solde} /></div>
        <div>
          <span className="heros-sur" id="tresor-palier">{iTas < 0 ? 'Bourse vide' : NOMS_TAS[iTas]}</span>
          <p className="tresor__solde"><span id="solde">{solde.toLocaleString('fr-FR')}</span> <small>pièces d’or</small></p>
        </div>
      </div>
      <div className="tresor__monnaie tresor__monnaie--cristaux">
        <div className="tresor__cristal"><img src={urlPublique('img/OR/cristal.webp')} alt="" /></div>
        <div>
          <span className="heros-sur">{cristaux > 0 ? 'Cristaux' : 'Aucun cristal'}</span>
          <p className="tresor__solde tresor__solde--cristaux"><span id="cristaux">{cristaux.toLocaleString('fr-FR')}</span> <small>cristaux</small></p>
        </div>
      </div>
      <div className="tresor__liens">
        <Link to="/boutique">Boutique</Link>
        <Link to="/marche">Marché</Link>
        <Link to="/collection?vue=grimoire">Recycler</Link>
      </div>
      <details className="tresor__gains">
        <summary>Gagner de l’or</summary>
        <ul>
          <li>Vaincre l’Ombre : <b>2</b>, <b>5</b> ou <b>10</b> or selon la difficulté</li>
          <li>Recycler tes doublons dans la Collection</li>
          <li>Vendre des cartes au Marché</li>
          <li>Certains paliers du Pass de saison</li>
        </ul>
      </details>
    </div>
  );
}
