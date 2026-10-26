// =====================================================================
//  Ce qui entoure tous les écrans : les notifications, le joueur connecté et la barre latérale.
//  <Outlet /> est l'endroit où React Router affiche l'écran de l'adresse en cours.
// =====================================================================
import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Notifications from './Notifications.jsx';
import Authentification from './Authentification.jsx';
import BarreLaterale from './BarreLaterale.jsx';
import FiletErreur from './FiletErreur.jsx';
import MiseAJour from './MiseAJour.jsx';
import { useAuth, joueurPret } from '../lib/auth.js';

// La barre latérale : seulement dans le jeu (pas sur l'écran de connexion)
function Barre() {
  const auth = useAuth();
  return joueurPret(auth) ? <BarreLaterale /> : null;
}

export default function Layout() {
  const { pathname } = useLocation();
  return (
    <Notifications>
      <Authentification>
        {/* Si l'écran plante, le filet affiche un message ; la barre reste là pour changer d'écran.
            ecran : en changeant d'écran, le message s'efface. (Pas de « key » ici : elle recréerait le
            <Suspense> à chaque écran, et l'ancien écran disparaîtrait avec ses styles avant que le nouveau
            soit prêt : la barre s'affichait un instant sans style.) */}
        {/* L'écran se charge à la demande : rien ne s'affiche le temps qu'il arrive, pas même la barre.
            Ses styles (barre-laterale.css) arrivent avec ceux de l'écran : affichée avant, elle
            apparaissait un instant sans style au chargement de la page. */}
        <Suspense fallback={null}>
          <FiletErreur ecran={pathname}>
            <Outlet />
          </FiletErreur>
          <Barre />
        </Suspense>
        <MiseAJour />
      </Authentification>
    </Notifications>
  );
}
