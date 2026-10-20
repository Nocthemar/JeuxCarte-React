// =====================================================================
//  L'XP du Pass de saison gagnée en duel (ancien JS/jeu-cartes.js ; serveur : supabase/schema.sql, partie 9)
//  Au début du duel, un ticket est demandé au serveur ; à la fin, il est échangé contre l'XP
//  (le serveur vérifie la durée, le plafond du jour, l'adversaire).
// =====================================================================
import { supabase } from './supabase.js';

// Le ticket d'un duel : une promesse d'uuid (ou null : pas de saison, pas connecté…)
//   { mode: 'ia', difficulte } contre l'Ombre ; { mode: 'ami', salon } en ligne
export function demanderTicketPass({ mode, difficulte = null, salon = null }) {
  const params = mode === 'ami' ? { p_mode: 'ami', p_salon: salon } : { p_mode: 'ia', p_difficulte: difficulte };
  return supabase.rpc('pass_commencer_partie', params)
    .then(({ data, error }) => {
      if (!error) return data;
      // Base pas encore à jour : la fonction ne connaît pas la difficulté, on la redemande sans (comme l'ancien jeu)
      if (error.code === 'PGRST202' && params.p_difficulte) {
        return supabase.rpc('pass_commencer_partie', { p_mode: 'ia' }).then((r) => (r.error ? null : r.data));
      }
      return null;
    })
    .catch(() => null);
}

// Fin du duel : { xp, or, raison, … } ou null
export async function finirPartiePass(ticket, victoire) {
  const id = await ticket;
  if (!id) return null;
  const { data, error } = await supabase.rpc('pass_fin_partie', { p_ticket: id, p_victoire: victoire });
  return error ? null : data;
}

export const RAISONS_PASS = {
  plafond: 'Plafond d\'XP de pass du jour atteint',
  court: 'Duel trop court pour rapporter de l’XP de pass',
};
