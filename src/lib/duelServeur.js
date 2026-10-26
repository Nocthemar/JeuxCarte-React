// =====================================================================
//  Les duels contre l'Ombre et du mode Histoire, côté serveur (supabase/securite.sql, partie 3)
//  - au début : le serveur tire la graine du hasard et note le Grimoire (duel_commencer) ;
//  - à la fin : l'arbitre (Edge Function « arbitre ») rejoue la partie à partir des actions du joueur
//    et donne lui-même les récompenses. Le navigateur ne déclare plus sa victoire.
// =====================================================================
import { supabase, URL_SUPABASE, CLE_SUPABASE } from './supabase.js';

// Le début d'un duel : { id, graine, elan }, ou null (hors ligne, serveur indisponible : duel d'entraînement)
//   mode : 'ia' | 'histoire' ; grimoire : les clés des cartes choisies (lib/grimoire.js, cleCarte)
export async function commencerDuel({ mode, difficulte = null, niveau = null, grimoire = [] }) {
  try {
    const { data, error } = await supabase.rpc('duel_commencer', {
      p_mode: mode, p_difficulte: difficulte, p_niveau: niveau, p_grimoire: grimoire,
    });
    if (error || !data?.id) return null;
    return { id: data.id, graine: Number(data.graine) >>> 0, elan: Number(data.elan) || 0 };
  } catch { return null; }
}

// La fin d'un duel : la réponse de l'arbitre
//   contre l'Ombre : { resultat, xp, or, raison, victoire, elan } ; en Histoire : { resultat, victoire, recompenses }
//   en cas de problème : { erreur }
export async function terminerDuel(id, journal) {
  try {
    const { data } = await supabase.auth.getSession();
    const r = await fetch(`${URL_SUPABASE}/functions/v1/arbitre`, {
      method: 'POST',
      headers: { apikey: CLE_SUPABASE, Authorization: `Bearer ${data.session?.access_token ?? ''}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ duel: id, journal }),
    });
    const corps = await r.json().catch(() => ({}));
    if (!r.ok) return { erreur: corps.erreur ?? 'l’arbitre est injoignable.' };
    return corps;
  } catch {
    return { erreur: 'l’arbitre est injoignable (connexion ?).' };
  }
}
