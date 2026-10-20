// =====================================================================
//  Le filet de sécurité : si un écran plante, on affiche un message et des boutons
//  au lieu d'une page blanche (et l'erreur part dans le journal, lib/erreurs.js).
//  React n'offre cette protection qu'aux composants écrits en « class » (componentDidCatch).
//
//  pleinePage : le filet qui entoure tout le jeu (dernier recours, sans la barre latérale)
// =====================================================================
import { Component, Suspense } from 'react';
import Page from './Page.jsx';
import { estFichierPerime, rechargerApresMiseAJour, signalerErreur } from '../lib/erreurs.js';

// Styles de la boîte écrits ici : le message ne dépend d'aucune feuille de l'écran qui a planté
const STYLE_BOITE = {
  maxWidth: 420, margin: '18vh auto 0', padding: '28px 24px', textAlign: 'center',
  background: 'rgba(20, 14, 10, 0.92)', color: '#f0e2c4', border: '1px solid #b8893c',
  borderRadius: 14, boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)', fontFamily: 'Georgia, serif',
  position: 'relative', zIndex: 5,
};
const STYLE_BOUTON = {
  margin: '6px', padding: '10px 18px', borderRadius: 8, border: '1px solid #b8893c',
  background: '#3a2814', color: '#f0e2c4', font: 'inherit', cursor: 'pointer',
};

export default class FiletErreur extends Component {
  state = { erreur: null };

  static getDerivedStateFromError(erreur) {
    return { erreur };
  }

  componentDidCatch(erreur) {
    // Un écran publié avant la dernière mise à jour : recharger suffit
    if (estFichierPerime(erreur) && rechargerApresMiseAJour()) return;
    signalerErreur(erreur, this.props.pleinePage ? 'jeu' : 'ecran');
  }

  render() {
    if (!this.state.erreur) return this.props.children;
    const boite = (
      <div role="alert" style={STYLE_BOITE}>
        <h2 style={{ margin: '0 0 10px', color: '#e8c06a' }}>Oups, un problème est survenu</h2>
        <p style={{ margin: '0 0 18px', lineHeight: 1.5 }}>
          {this.props.pleinePage
            ? 'Le jeu a rencontré une erreur. Recharge la page pour reprendre.'
            : 'Cet écran a rencontré une erreur. Réessaie, ou choisis un autre écran dans la barre.'}
        </p>
        {!this.props.pleinePage && (
          <button type="button" style={STYLE_BOUTON} onClick={() => this.setState({ erreur: null })}>Réessayer</button>
        )}
        <button type="button" style={STYLE_BOUTON} onClick={() => location.reload()}>Recharger le jeu</button>
      </div>
    );
    // Tout le jeu a planté : un fond sombre, rien d'autre
    if (this.props.pleinePage) return <div style={{ minHeight: '100vh', background: '#0d0907', padding: '1px 16px' }}>{boite}</div>;
    // Un écran a planté : le message prend l'habit d'une page du jeu (fond, barre latérale stylée),
    // même si l'écran a planté avant d'avoir chargé ses propres feuilles de style
    return (
      <Suspense fallback={null}>
        <Page id="parametres" classes="page-profil page-erreur" titre="Oups">{boite}</Page>
      </Suspense>
    );
  }
}
