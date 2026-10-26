// =====================================================================
//  Les écrans du jeu ne s'ouvrent qu'à un joueur connecté (session valable, double authentification validée
//  si elle est activée, profil créé, pseudo choisi). Sinon : l'écran de connexion, qui ramène ensuite ici.
//  (C'est le confort d'affichage : la vraie barrière est côté serveur, où chaque donnée et chaque action
//  vérifient la session, supabase/securite.sql.)
// =====================================================================
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth, joueurPret } from '../lib/auth.js';

export default function RoutePrivee() {
  const auth = useAuth();
  const { pathname, search } = useLocation();
  if (auth.chargement) return null;
  if (!joueurPret(auth)) return <Navigate to={`/connexion?retour=${encodeURIComponent(pathname + search)}`} replace />;
  return <Outlet />;
}
