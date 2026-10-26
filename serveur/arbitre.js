// =====================================================================
//  Edge Function Supabase « arbitre » : la fin d'un duel contre l'Ombre ou d'un niveau du mode Histoire
//
//  Le navigateur envoie POST { duel: <id donné par duel_commencer>, journal: [ses actions] } avec sa session.
//  L'arbitre vérifie qui il est (auprès de Supabase Auth, pas d'après ce qu'il dit), relit le duel noté au
//  début, rejoue la partie (serveur/arbitrage.js) et appelle duel_terminer avec le VRAI résultat.
//
//  Ce fichier est la source : « npm run arbitre » en fait supabase/functions/arbitre/index.js (un seul
//  fichier, moteur du jeu compris), à déployer (voir supabase/LISEZ-MOI.md).
//  Variables fournies par Supabase : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
//  Variable facultative : ORIGINES (les adresses du jeu autorisées, séparées par des virgules).
// =====================================================================
/* global Deno */
import { arbitrer, TAILLE_MAX } from './arbitrage.js';

const URL_SB = Deno.env.get('SUPABASE_URL');
const CLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const ORIGINES = (Deno.env.get('ORIGINES') ?? 'https://nocthemar.github.io,http://localhost:5173,http://localhost:4173')
  .split(',').map((o) => o.trim()).filter(Boolean);

// CORS strict : seules les adresses du jeu peuvent appeler l'arbitre depuis un navigateur
function entetes(origine) {
  return {
    'Access-Control-Allow-Origin': ORIGINES.includes(origine) ? origine : ORIGINES[0],
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  };
}
const reponse = (corps, statut, origine) => new Response(JSON.stringify(corps), { status: statut, headers: entetes(origine) });

// La base, avec la clé du serveur (jamais envoyée au navigateur)
const cleServeur = () => ({ apikey: CLE, ...(CLE?.startsWith('eyJ') ? { Authorization: `Bearer ${CLE}` } : {}) });
async function base(chemin, options = {}) {
  const r = await fetch(`${URL_SB}/rest/v1/${chemin}`, {
    ...options, headers: { ...cleServeur(), 'Content-Type': 'application/json', ...(options.headers ?? {}) },
  });
  const texte = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${texte.slice(0, 200)}`);
  return texte ? JSON.parse(texte) : null;
}

// Le compte de la session (Supabase Auth vérifie le jeton) ; null si la session n'est pas valable
async function compte(jeton) {
  if (!jeton) return null;
  const r = await fetch(`${URL_SB}/auth/v1/user`, { headers: { apikey: CLE, Authorization: `Bearer ${jeton}` } });
  if (!r.ok) return null;
  const u = await r.json();
  return u?.id ?? null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

Deno.serve(async (req) => {
  const origine = req.headers.get('origin') ?? '';
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: entetes(origine) });
  if (req.method !== 'POST') return reponse({ erreur: 'Méthode non autorisée.' }, 405, origine);
  if (origine && !ORIGINES.includes(origine)) return reponse({ erreur: 'Origine non autorisée.' }, 403, origine);

  try {
    const uid = await compte((req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, ''));
    if (!uid) return reponse({ erreur: 'Connecte-toi d’abord.' }, 401, origine);

    const texte = await req.text();
    if (texte.length > TAILLE_MAX) return reponse({ erreur: 'Partie trop longue.' }, 413, origine);
    let corps;
    try { corps = JSON.parse(texte); } catch { return reponse({ erreur: 'Requête illisible.' }, 400, origine); }
    if (!UUID.test(String(corps?.duel ?? ''))) return reponse({ erreur: 'Duel inconnu.' }, 400, origine);

    const [joueur] = await base(`players?user_id=eq.${uid}&select=discord_id,username`);
    if (!joueur) return reponse({ erreur: 'Profil introuvable.' }, 403, origine);
    const [duel] = await base(`duels?id=eq.${corps.duel}&select=*`);
    if (!duel || duel.discord_id !== joueur.discord_id) return reponse({ erreur: 'Duel inconnu.' }, 404, origine);
    if (duel.termine_le) return reponse({ xp: 0, raison: 'ticket' }, 200, origine);

    const catalogueBrut = await base('cards?is_available=eq.true&order=id.asc&select=*');
    const ids = (duel.cartes ?? []).filter((x) => Number.isInteger(Number(x))).join(',');
    const possedeesBrutes = ids ? await base(`cards?id=in.(${ids})&select=*`) : [];

    const { resultat, details } = arbitrer({ duel, catalogueBrut, possedeesBrutes, journal: corps.journal, nom: joueur.username ?? 'Toi' });
    let fin;
    try {
      fin = await base('rpc/duel_terminer', {
        method: 'POST', body: JSON.stringify({ p_duel: duel.id, p_resultat: resultat, p_details: details }),
      });
    } catch (e) {
      // Une règle du jeu refusée par la base (niveau pas encore débloqué…) : son message, tel quel
      const message = /"message":"([^"]{1,200})"/.exec(String(e.message))?.[1];
      if (message) return reponse({ resultat, erreur: message }, 409, origine);
      throw e;
    }
    return reponse({ resultat, ...fin }, 200, origine);
  } catch (e) {
    console.error('arbitre', e);
    return reponse({ erreur: 'L’arbitre n’a pas pu valider ce duel.' }, 500, origine);
  }
});
