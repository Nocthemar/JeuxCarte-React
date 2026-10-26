// =====================================================================
//  L'XP du Pass de saison gagnée en duel EN LIGNE (ancien JS/jeu-cartes.js ; serveur : supabase/schema.sql, partie 9)
//  Au début du duel, un ticket est demandé au serveur ; à la fin, il est échangé contre l'XP
//  (le serveur vérifie la durée, le plafond du jour, l'adversaire).
//  Contre l'Ombre et en mode Histoire, c'est l'arbitre du serveur qui donne l'XP (lib/duelServeur.js).
// =====================================================================
import { supabase } from './supabase.js';

// Le ticket d'un duel en ligne : une promesse d'uuid (ou null : pas de saison, pas connecté…)
export function demanderTicketPass({ salon }) {
  return supabase.rpc('pass_commencer_partie', { p_mode: 'ami', p_salon: salon })
    .then(({ data, error }) => (error ? null : data))
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
  invalide: 'Victoire non reconnue par l’arbitre : pas de récompense',
  abandon: 'Un abandon ne rapporte rien',
  ticket: 'Duel déjà clos ou remplacé par un autre : pas de récompense',
};
