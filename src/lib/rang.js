// =====================================================================
//  Le rang classé et les statistiques d'un joueur, pour son profil (components/profil/Rang.jsx)
//  - rangs : la cote du classé (1 000 points au départ, Elo K = 32), victoires et défaites classées ;
//  - stats_joueur : des totaux calculés à partir des duels enregistrés et des cartes possédées.
// =====================================================================
import { useEffect, useState } from 'react';
import { supabase } from './supabase.js';

// null pendant le chargement, puis { rang, stats } (les réponses de Supabase, avec leur éventuelle erreur)
export function useRang(discordId) {
  const [d, setD] = useState(null);
  useEffect(() => {
    if (!discordId) return undefined;
    let actif = true;
    Promise.all([
      supabase.from('rangs').select('cote, victoires, defaites').eq('discord_id', discordId).maybeSingle(),
      supabase.rpc('stats_joueur', { p_discord_id: discordId }),
    ]).then(([rang, stats]) => { if (actif) setD({ pour: discordId, rang, stats }); });
    return () => { actif = false; };
  }, [discordId]);
  return d?.pour === discordId ? d : null;
}
