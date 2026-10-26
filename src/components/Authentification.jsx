// =====================================================================
//  Fournit le joueur connecté à toute l'application (lib/auth.js : useAuth)
//  - au démarrage : la session enregistrée par Supabase dans le navigateur, puis la ligne « players » ;
//  - au retour de Discord, ou d'un lien reçu par e-mail (confirmation, mot de passe oublié) :
//      « ?code=… »       Supabase l'échange tout seul contre une session (même navigateur) ;
//      « ?token_hash=… » on le fait vérifier par Supabase (marche aussi depuis un autre appareil) ;
//    puis on nettoie l'adresse et on revient sur l'écran d'où l'on était parti ;
//  - lien « mot de passe oublié » : direction l'écran du nouveau mot de passe ;
//  - double authentification activée (MJ) : mfaRequis tant que le code n'est pas validé ;
//  - à chaque connexion / déconnexion / fin de session (même dans un autre onglet) : mise à jour.
// =====================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { AuthContext, CLE_RETOUR, chargerJoueur, messageAuth } from '../lib/auth.js';
import { useNotifier } from '../lib/notification.js';

const TYPES_LIEN = new Set(['signup', 'email', 'recovery', 'invite', 'magiclink', 'email_change']);

// Après un retour (Discord, lien d'e-mail) : retire les paramètres de connexion de l'adresse.
// Renvoie { ecran, erreur, tokenHash, type }, ou null si on ne revient de nulle part.
function nettoyerAdresse() {
  const params = new URLSearchParams(location.search);
  if (!params.has('code') && !params.has('error') && !params.has('token_hash')) return null;
  let retour = '';
  try { retour = sessionStorage.getItem(CLE_RETOUR) ?? ''; sessionStorage.removeItem(CLE_RETOUR); } catch { /* stockage indisponible */ }
  history.replaceState(null, '', location.pathname + location.hash);
  const type = params.get('type');
  return {
    ecran: retour.replace(/^#/, ''),
    erreur: params.get('error_description'),
    tokenHash: params.get('token_hash'),
    type: TYPES_LIEN.has(type) ? type : null,
  };
}

// La double authentification reste-t-elle à valider pour cette session ?
async function doubleAuthAValider(session) {
  if (!session) return false;
  try {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    return data?.nextLevel === 'aal2' && data?.currentLevel !== 'aal2';
  } catch { return false; }
}

export default function Authentification({ children }) {
  const [etat, setEtat] = useState({ session: null, joueur: null, chargement: true, mfaRequis: false });
  const notifier = useNotifier();
  const naviguer = useNavigate();
  const compteActuel = useRef(undefined);   // le compte (user.id) déjà chargé ; undefined : pas encore
  const actif = useRef(true);

  const mettreAJour = useCallback(async (session) => {
    compteActuel.current = session?.user.id ?? null;
    const [joueur, mfaRequis] = await Promise.all([chargerJoueur(session).catch(() => null), doubleAuthAValider(session)]);
    if (actif.current) setEtat({ session, joueur, chargement: false, mfaRequis });
  }, []);
  // Relire le joueur (pseudo choisi, double authentification validée…)
  const recharger = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    await mettreAJour(session);
  }, [mettreAJour]);

  useEffect(() => {
    actif.current = true;
    // getSession attend la fin de l'échange du « ?code=… » quand on revient de Discord (ou d'un e-mail)
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const retour = nettoyerAdresse();
      let s = session;
      if (retour?.tokenHash && retour.type) {
        const { data, error } = await supabase.auth.verifyOtp({ token_hash: retour.tokenHash, type: retour.type });
        if (error) notifier(`Lien invalide ou expiré : ${messageAuth(error)}`, 'erreur');
        else s = data.session;
      }
      if (retour?.erreur) notifier(`Connexion impossible : ${retour.erreur}`, 'erreur');
      if (retour?.type === 'recovery' && s) naviguer('/mot-de-passe', { replace: true });
      else if (retour?.ecran) naviguer(retour.ecran, { replace: true });
      mettreAJour(s);
    });

    // setTimeout : Supabase déconseille d'appeler la base directement dans ce callback.
    // Supabase annonce aussi « SIGNED_IN » chaque fois qu'on revient sur l'onglet : on ne recharge
    // le joueur que si le compte a vraiment changé (sinon tout l'écran se rechargerait pour rien).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((evenement, session) => {
      if (evenement === 'PASSWORD_RECOVERY') {
        setTimeout(() => { naviguer('/mot-de-passe', { replace: true }); mettreAJour(session); }, 0);
        return;
      }
      if (evenement === 'MFA_CHALLENGE_VERIFIED') { setTimeout(() => mettreAJour(session), 0); return; }
      if (evenement !== 'SIGNED_IN' && evenement !== 'SIGNED_OUT') return;
      if ((session?.user.id ?? null) === compteActuel.current) return;
      setTimeout(() => mettreAJour(session), 0);
    });

    return () => { actif.current = false; subscription.unsubscribe(); };
  }, [notifier, naviguer, mettreAJour]);

  const valeur = useMemo(() => ({ ...etat, recharger }), [etat, recharger]);
  return <AuthContext.Provider value={valeur}>{children}</AuthContext.Provider>;
}
