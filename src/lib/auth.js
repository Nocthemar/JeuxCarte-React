// =====================================================================
//  Le joueur connecté, partagé par tous les écrans (un « contexte » React)
//  Dans un composant : const { joueur, session, chargement, mfaRequis, recharger } = useAuth();
//    joueur     : la ligne « players » du joueur connecté (discord_id, username, avatar_url, is_mj…), ou null
//    session    : la session Supabase (null : pas connecté)
//    chargement : true tant qu'on ne sait pas encore s'il est connecté
//    mfaRequis  : connecté, mais la double authentification reste à valider (comptes MJ qui l'ont activée)
//
//  L'identité vient TOUJOURS de la session vérifiée par Supabase : le serveur retrouve le joueur avec
//  auth.uid(), jamais avec un identifiant envoyé par le navigateur.
// =====================================================================
import { createContext, useContext } from 'react';
import { supabase } from './supabase.js';

export const AuthContext = createContext({ joueur: null, session: null, chargement: true, mfaRequis: false, recharger: () => {} });
export const useAuth = () => useContext(AuthContext);
// Le joueur peut-il entrer dans le jeu ? (session, double authentification validée, profil, pseudo choisi)
export const joueurPret = ({ session, joueur, mfaRequis }) => !!session && !!joueur && !mfaRequis && !joueur.pseudo_a_choisir;

// L'écran où revenir après Discord (ex. « #/connexion?retour=/boutique ») : gardé le temps de l'aller-retour
export const CLE_RETOUR = 'connexion-retour';
// L'adresse du jeu, sans « # » : Supabase y ajoute « ?code=… » (ou « ?token_hash=… ») au retour
const adresseRetour = () => location.origin + location.pathname;

// La clé publique de la vérification anti-robot (facultative : components/Captcha.jsx)
export const CLE_CAPTCHA = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '';

// Les règles du mot de passe (aussi réglées dans Supabase > Authentication > Policies, côté serveur)
export const MOT_DE_PASSE_MIN = 10;
export function problemeMotDePasse(mdp) {
  if (mdp.length < MOT_DE_PASSE_MIN) return `Au moins ${MOT_DE_PASSE_MIN} caractères.`;
  if (!/[a-zA-ZÀ-ÿ]/.test(mdp) || !/[0-9]/.test(mdp)) return 'Au moins une lettre et un chiffre.';
  return null;
}

// Les messages de Supabase Auth, en français (les autres restent tels quels)
export function messageAuth(error) {
  const m = `${error?.code ?? ''} ${error?.message ?? ''}`;
  if (/invalid_credentials|Invalid login credentials/i.test(m)) return 'Adresse e-mail ou mot de passe incorrect.';
  if (/email_not_confirmed|Email not confirmed/i.test(m)) return 'Confirme d’abord ton adresse : ouvre le lien reçu par e-mail.';
  if (/user_already_exists|already registered/i.test(m)) return 'Un compte existe déjà avec cette adresse.';
  if (/over_.*rate_limit|rate limit|too many/i.test(m)) return 'Trop de tentatives : patiente quelques minutes avant de réessayer.';
  if (/weak_password|Password should/i.test(m)) return 'Mot de passe trop faible : choisis-en un plus long, avec lettres et chiffres.';
  if (/captcha/i.test(m)) return 'La vérification anti-robot a échoué : réessaie.';
  if (/same_password|should be different/i.test(m)) return 'Choisis un mot de passe différent de l’ancien.';
  if (/signup_disabled|Signups not allowed/i.test(m)) return 'Les inscriptions sont fermées pour le moment.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Connexion au serveur impossible : vérifie ta connexion internet.';
  return error?.message || 'Une erreur est survenue.';
}

// « Continuer avec Discord » : on part chez Discord, puis on revient sur l'écran d'où l'on vient
export async function connexionDiscord(retour = location.hash) {
  try { sessionStorage.setItem(CLE_RETOUR, retour); } catch { /* stockage indisponible */ }
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'discord',
    // identify : identifiant, pseudo, avatar ; email : l'adresse du compte Discord (rien d'autre)
    options: { redirectTo: adresseRetour(), scopes: 'identify email' },
  });
  return error ? messageAuth(error) : null;
}

// Connexion par e-mail ; renvoie null, ou le message d'erreur
export async function connexionEmail(email, motDePasse, captchaToken) {
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(), password: motDePasse, options: captchaToken ? { captchaToken } : undefined,
  });
  return error ? messageAuth(error) : null;
}

// Création d'un compte par e-mail : Supabase envoie un lien de confirmation. Renvoie { erreur } ou { confirmer }
export async function inscriptionEmail(email, motDePasse, captchaToken) {
  const probleme = problemeMotDePasse(motDePasse);
  if (probleme) return { erreur: probleme };
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(), password: motDePasse,
    options: { emailRedirectTo: adresseRetour(), ...(captchaToken ? { captchaToken } : {}) },
  });
  if (error) return { erreur: messageAuth(error) };
  // Sans session : l'adresse doit d'abord être confirmée (réglage recommandé)
  return { confirmer: !data.session };
}

// Mot de passe oublié : un lien de réinitialisation par e-mail (même réponse que l'adresse existe ou non)
export async function motDePasseOublie(email, captchaToken) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: adresseRetour(), ...(captchaToken ? { captchaToken } : {}),
  });
  return error ? messageAuth(error) : null;
}

// Le nouveau mot de passe (après le lien de réinitialisation, ou depuis les Paramètres)
export async function nouveauMotDePasse(motDePasse) {
  const probleme = problemeMotDePasse(motDePasse);
  if (probleme) return probleme;
  const { error } = await supabase.auth.updateUser({ password: motDePasse });
  return error ? messageAuth(error) : null;
}

// Déconnexion : la session est révoquée côté serveur (portee 'local' : cet appareil ; 'global' : tous)
export async function deconnexion(portee = 'local') {
  await supabase.auth.signOut({ scope: portee }).catch(() => {});
  try { sessionStorage.removeItem(CLE_RETOUR); } catch { /* stockage indisponible */ }
  location.hash = '#/connexion';
  location.reload();   // comme l'ancien jeu : la page repart de zéro, sans aucune donnée du joueur
}

// La ligne « players » d'un compte, ou null
export async function chargerJoueur(session) {
  if (!session) return null;
  const { data } = await supabase.from('players').select('*').eq('user_id', session.user.id).maybeSingle();
  return data;
}

// Une adresse de retour sûre (un écran du jeu, jamais un autre site)
export const retourSur = (r) => (typeof r === 'string' && /^\/[a-z-]*(\?[\w=&%.-]*)?$/i.test(r) && !r.startsWith('/connexion') ? r : '/duel');
