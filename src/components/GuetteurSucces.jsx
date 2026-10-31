// =====================================================================
//  Le guetteur de succès : quand le joueur atteint un objectif en jouant (fin de duel, booster ouvert,
//  échange…), la notification « Succès débloqué » s'affiche, sans attendre qu'il ouvre l'écran Succès.
//  Il demande la liste au serveur (mes_succes) à chaque changement d'écran, au plus une fois toutes les
//  40 secondes, et retient dans le navigateur les succès déjà annoncés (rien n'est annoncé deux fois).
//  La toute première fois, il note ce qui est déjà atteint sans rien annoncer (pas d'avalanche).
// =====================================================================
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { celebrerSucces } from '../lib/succes.js';

const INTERVALLE = 40000;

export default function GuetteurSucces({ discordId }) {
  const { pathname } = useLocation();
  const dernier = useRef(0);
  useEffect(() => {
    if (!discordId || pathname === '/succes' || Date.now() - dernier.current < INTERVALLE) return;
    dernier.current = Date.now();
    const cle = `succes-annonces-${discordId}`;
    supabase.rpc('mes_succes').then(({ data, error }) => {
      if (error || !Array.isArray(data)) return;
      let vus = null;
      try { vus = JSON.parse(localStorage.getItem(cle) ?? 'null'); } catch { /* stockage indisponible */ }
      const atteints = data.filter((s) => s.atteint && !s.reclame);
      const nouveaux = vus ? atteints.filter((s) => !vus.includes(s.id)) : [];
      nouveaux.slice(0, 3).forEach((s, i) => setTimeout(() => celebrerSucces(s, { prete: true }), i * 700));
      try { localStorage.setItem(cle, JSON.stringify([...new Set([...(vus ?? []), ...atteints.map((s) => s.id)])])); } catch { /* idem */ }
    });
  }, [discordId, pathname]);
  return null;
}
