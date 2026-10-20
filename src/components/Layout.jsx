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

export default function Layout() {
  const { pathname } = useLocation();
  return (
    <Notifications>
      <Authentification>
        {/* Si l'écran plante, le filet affiche un message ; la barre reste là pour changer d'écran.
            key : changer d'écran repart d'un filet neuf. */}
        <FiletErreur key={pathname}>
          {/* (l'écran se charge à la demande : rien ne s'affiche le temps qu'il arrive) */}
          <Suspense fallback={null}><Outlet /></Suspense>
        </FiletErreur>
        <BarreLaterale />
        <MiseAJour />
      </Authentification>
    </Notifications>
  );
}
