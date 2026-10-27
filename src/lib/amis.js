// =====================================================================
//  Les amis (supabase/amis.sql) : les demandes au serveur, et useAmis, branché dans la barre latérale :
//  il dit au serveur « je suis là » toutes les minutes (et si je suis en duel), et compte ce qui m'attend
//  (demandes reçues + défis) pour la pastille de l'entrée « Amis ».
// =====================================================================
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from './supabase.js';

async function rpc(nom, args) {
  const { data, error } = await supabase.rpc(nom, args);
  if (error) throw new Error(error.message);
  return data;
}
export const amis = {
  etat: () => rpc('amis_etat'),
  chercher: (texte) => rpc('amis_chercher', { p_texte: texte }),
  demander: (id) => rpc('amis_demander', { p_discord_id: id }),
  repondre: (id, accepter) => rpc('amis_repondre', { p_de: id, p_accepter: accepter }),
  retirer: (id) => rpc('amis_retirer', { p_discord_id: id }),
  defier: (id, salon) => rpc('amis_defier', { p_ami: id, p_salon: salon }),
  repondreDefi: (id, accepter) => rpc('amis_defi_repondre', { p_id: id, p_accepter: accepter }),
};

// « vu il y a 5 min », « vu hier »… (pour un ami hors ligne)
export function vuIlYa(date) {
  if (!date) return 'jamais vu';
  const s = Math.max(0, (Date.now() - new Date(date)) / 1000);
  if (s < 3600) return `vu il y a ${Math.max(1, Math.round(s / 60))} min`;
  if (s < 86400) return `vu il y a ${Math.round(s / 3600)} h`;
  if (s < 172800) return 'vu hier';
  return `vu il y a ${Math.round(s / 86400)} jours`;
}

const SIGNAL = 60000;   // ms entre deux « je suis là » (le serveur compte « en ligne » sur 2 minutes)

// Ce qui m'attend (pour la pastille), relu en changeant d'écran, au retour sur l'onglet et à chaque signal
export function useAmis(discordId) {
  const { pathname } = useLocation();
  const [enAttente, setEnAttente] = useState(0);
  const [tic, setTic] = useState(0);
  useEffect(() => {
    if (!discordId) return undefined;
    const t = setInterval(() => setTic((n) => n + 1), SIGNAL);
    const vu = () => { if (document.visibilityState === 'visible') setTic((n) => n + 1); };
    document.addEventListener('visibilitychange', vu);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vu); };
  }, [discordId]);
  useEffect(() => {
    if (!discordId || document.visibilityState !== 'visible') return undefined;
    let actif = true;
    // (sans amis.sql en base, tout ceci échoue sans bruit : la pastille reste vide)
    supabase.rpc('amis_signal', { p_en_duel: document.body.classList.contains('en-duel') }).then(() => {});
    supabase.rpc('amis_en_attente').then(({ data }) => { if (actif) setEnAttente(data ?? 0); });
    return () => { actif = false; };
  }, [discordId, pathname, tic]);
  return enAttente;
}
