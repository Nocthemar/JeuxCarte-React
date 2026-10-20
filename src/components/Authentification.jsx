// =====================================================================
//  Fournit le joueur connecté à toute l'application (lib/auth.js : useAuth)
//  - au démarrage : la session enregistrée par Supabase dans le navigateur, puis la ligne « players » ;
//  - au retour de Discord : Supabase échange tout seul le « ?code=… » de l'adresse contre une session,
//    puis on nettoie l'adresse et on revient sur l'écran d'où l'on était parti ;
//  - à chaque connexion / déconnexion (même dans un autre onglet) : mise à jour.
// =====================================================================
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { AuthContext, CLE_RETOUR, chargerJoueur } from '../lib/auth.js';
import { useNotifier } from '../lib/notification.js';

// Après le retour de Discord : retire « ?code=… » (ou « ?error=… ») de l'adresse.
// Renvoie l'écran de départ (ex. « /boutique ») et l'éventuelle erreur, ou null si on ne revient pas de Discord.
function nettoyerAdresse() {
  const params = new URLSearchParams(location.search);
  if (!params.has('code') && !params.has('error')) return null;
  let retour = '';
  try { retour = sessionStorage.getItem(CLE_RETOUR) ?? ''; sessionStorage.removeItem(CLE_RETOUR); } catch { /* stockage indisponible */ }
  history.replaceState(null, '', location.pathname + location.hash);
  return { ecran: retour.replace(/^#/, ''), erreur: params.get('error_description') };
}

export default function Authentification({ children }) {
  const [etat, setEtat] = useState({ session: null, joueur: null, chargement: true });
  const notifier = useNotifier();
  const naviguer = useNavigate();
  const compteActuel = useRef(undefined);   // le compte (user.id) déjà chargé ; undefined : pas encore

  useEffect(() => {
    let actif = true;
    const mettreAJour = async (session) => {
      compteActuel.current = session?.user.id ?? null;
      const joueur = await chargerJoueur(session).catch(() => null);
      if (actif) setEtat({ session, joueur, chargement: false });
    };

    // getSession attend la fin de l'échange du « ?code=… » quand on revient de Discord
    supabase.auth.getSession().then(({ data: { session } }) => {
      const retour = nettoyerAdresse();
      if (retour?.ecran) naviguer(retour.ecran, { replace: true });
      if (retour?.erreur) notifier(`Connexion impossible : ${retour.erreur}`, 'erreur');
      mettreAJour(session);
    });

    // setTimeout : Supabase déconseille d'appeler la base directement dans ce callback.
    // Supabase annonce aussi « SIGNED_IN » chaque fois qu'on revient sur l'onglet : on ne recharge
    // le joueur que si le compte a vraiment changé (sinon tout l'écran se rechargerait pour rien).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((evenement, session) => {
      if (evenement !== 'SIGNED_IN' && evenement !== 'SIGNED_OUT') return;
      if ((session?.user.id ?? null) === compteActuel.current) return;
      setTimeout(() => mettreAJour(session), 0);
    });

    return () => { actif = false; subscription.unsubscribe(); };
  }, [notifier, naviguer]);

  return <AuthContext.Provider value={etat}>{children}</AuthContext.Provider>;
}
