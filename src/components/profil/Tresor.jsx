// =====================================================================
//  Le trésor du duelliste : la bourse du joueur (ancien afficherSolde, afficherOrBourse et afficherTresor
//  de JS/profil.js, même HTML). Visible seulement sur son propre profil.
//  L'image dépend du solde : une pièce couchée en noir et blanc (bourse vide), une pièce qui tourne,
//  puis des tas de plus en plus gros ; plus on est riche, plus l'or scintille (et plus son halo brille, en CSS).
// =====================================================================
import { Link } from 'react-router-dom';
import OrAnime from '../OrAnime.jsx';
import { PALIERS_OR, palierOr } from '../../lib/or.js';

const NOMS_TAS = ['Quelques pièces', 'Un petit tas', 'Un tas d’or', 'Un grand trésor', 'Un trésor de seigneur'];

export default function Tresor({ solde }) {
  const vide = solde <= 0;
  const palier = palierOr(solde);
  const iTas = vide ? -1 : PALIERS_OR.indexOf(palier);

  return (
    <section id="duelliste" className="carte duelliste tresor-carte">
      <span className="vitrine__sur">Le duelliste</span>
      <h2>Le trésor</h2>
      <div id="bourse" className="tresor" data-richesse={vide ? 0 : PALIERS_OR.indexOf(palier) + 1}>
        <div className="tresor__or">
          <OrAnime solde={solde} />
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
