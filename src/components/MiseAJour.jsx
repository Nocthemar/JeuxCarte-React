// =====================================================================
//  Le bandeau « Nouvelle version » : une mise à jour du jeu a été publiée et rangée sur l'appareil.
//  Le joueur choisit le moment (jamais de rechargement surprise en plein duel).
// =====================================================================
import { useState } from 'react';
import { mettreAJour, useAppli } from '../lib/appli.js';

// Styles écrits ici : le bandeau s'affiche sur tous les écrans, quelles que soient leurs feuilles
const STYLE_BANDEAU = {
  position: 'fixed', left: '50%', bottom: 16, transform: 'translateX(-50%)', zIndex: 10000,
  width: 'max-content', maxWidth: 'calc(100vw - 32px)', boxSizing: 'border-box',
  display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 10,
  padding: '10px 14px', borderRadius: 12, border: '1px solid #b8893c',
  background: 'rgba(20, 14, 10, 0.95)', color: '#f0e2c4', fontFamily: 'Georgia, serif',
  boxShadow: '0 8px 30px rgba(0, 0, 0, 0.5)',
};
const STYLE_BOUTON = {
  padding: '7px 14px', borderRadius: 8, border: '1px solid #b8893c', font: 'inherit', cursor: 'pointer',
};

export default function MiseAJour() {
  const { majPrete } = useAppli();
  const [plusTard, setPlusTard] = useState(false);
  if (!majPrete || plusTard) return null;
  return (
    <div role="status" style={STYLE_BANDEAU}>
      <span>✦ Une nouvelle version du jeu est prête.</span>
      <button type="button" style={{ ...STYLE_BOUTON, background: '#b8893c', color: '#140c08' }} onClick={mettreAJour}>Mettre à jour</button>
      <button type="button" style={{ ...STYLE_BOUTON, background: 'transparent', color: '#f0e2c4' }} onClick={() => setPlusTard(true)}>Plus tard</button>
    </div>
  );
}
