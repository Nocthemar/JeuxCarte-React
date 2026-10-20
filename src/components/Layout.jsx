// =====================================================================
//  Ce qui entoure tous les écrans : les notifications, le joueur connecté et la barre latérale.
//  <Outlet /> est l'endroit où React Router affiche l'écran de l'adresse en cours.
// =====================================================================
import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import Notifications from './Notifications.jsx';
import Authentification from './Authentification.jsx';
import BarreLaterale from './BarreLaterale.jsx';

export default function Layout() {
  return (
    <Notifications>
      <Authentification>
        {/* (l'écran se charge à la demande : rien ne s'affiche le temps qu'il arrive) */}
        <Suspense fallback={null}><Outlet /></Suspense>
        <BarreLaterale />
      </Authentification>
    </Notifications>
  );
}
