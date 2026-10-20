// =====================================================================
//  Le joueur connecté, partagé par tous les écrans (un « contexte » React)
//  Dans un composant : const { joueur, chargement, connexion, deconnexion } = useAuth();
//    joueur     : la ligne « players » du joueur connecté (discord_id, username, avatar_url, is_mj…), ou null
//    chargement : true tant qu'on ne sait pas encore s'il est connecté
// =====================================================================
import { createContext, useContext } from 'react';
import { supabase } from './supabase.js';

export const AuthContext = createContext({ joueur: null, session: null, chargement: true });
export const useAuth = () => useContext(AuthContext);

// L'écran où revenir après Discord (ex. « #/boutique ») : gardé le temps de l'aller-retour
export const CLE_RETOUR = 'connexion-retour';

// Bouton « Connecter Discord » : on part chez Discord, puis on revient sur l'écran d'où l'on vient
export async function connexionDiscord() {
  try { sessionStorage.setItem(CLE_RETOUR, location.hash); } catch { /* stockage indisponible */ }
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'discord',
    // Sans le « # » : Supabase ajoute « ?code=… » à cette adresse au retour
    options: { redirectTo: location.origin + location.pathname },
  });
  if (error) alert('Connexion impossible : ' + error.message);
}

export async function deconnexion() {
  await supabase.auth.signOut();
  location.reload();   // comme l'ancien jeu : la page repart de zéro, sans aucune donnée du joueur
}

// La ligne « players » d'un compte, ou null
export async function chargerJoueur(session) {
  if (!session) return null;
  const { data } = await supabase.from('players').select('*').eq('user_id', session.user.id).maybeSingle();
  return data;
}
