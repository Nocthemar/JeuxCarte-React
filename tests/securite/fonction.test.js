// =====================================================================
//  L'Edge Function « arbitre » TELLE QU'ELLE EST DÉPLOYÉE (supabase/functions/arbitre/index.js, construit par
//  « npm run arbitre »), avec un faux Deno et un faux Supabase : session, propriétaire du duel, CORS,
//  et le résultat transmis à duel_terminer.
// =====================================================================
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync } from 'node:fs';

const FICHIER = new URL('../../supabase/functions/arbitre/index.js', import.meta.url);
const DUEL = '0b6a1a4e-6c1d-4f7e-9a51-2a0f8f5d1c11';
const appels = [];
let gerer;
const fetchReel = globalThis.fetch;

beforeAll(async () => {
  globalThis.Deno = {
    env: { get: (k) => ({ SUPABASE_URL: 'https://projet.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'eyJ.serveur' })[k] },
    serve: (f) => { gerer = f; },
  };
  // Le faux Supabase : la session « bon-jeton » est le compte U1 (joueur 111) ; le duel est à 111
  globalThis.fetch = async (url, options = {}) => {
    const u = String(url);
    appels.push({ u, options });
    const json = (x, status = 200) => new Response(JSON.stringify(x), { status });
    if (u.endsWith('/auth/v1/user')) {
      return options.headers.Authorization === 'Bearer bon-jeton' ? json({ id: 'U1' }) : json({ msg: 'jeton invalide' }, 401);
    }
    if (u.includes('/rest/v1/players?user_id=eq.U1')) return json([{ discord_id: '111', username: 'Alice' }]);
    if (u.includes('/rest/v1/duels?id=eq.')) {
      return json([{ id: DUEL, discord_id: '111', mode: 'ia', difficulte: 'normal', graine: 42, elan: 0, grimoire: [], cartes: [], objets: [], termine_le: null }]);
    }
    if (u.includes('/rest/v1/cards?is_available')) return json([]);
    if (u.endsWith('/rest/v1/rpc/duel_terminer')) return json({ xp: 0, raison: 'invalide' });
    return json({ message: 'inconnu' }, 404);
  };
  if (!existsSync(FICHIER)) throw new Error('Lance d’abord « npm run arbitre »');
  await import(FICHIER.href);
});
afterAll(() => { globalThis.fetch = fetchReel; delete globalThis.Deno; });

const demande = (corps, { jeton = 'bon-jeton', origine = 'https://nocthemar.github.io', methode = 'POST' } = {}) => gerer(new Request('https://projet.supabase.co/functions/v1/arbitre', {
  method: methode,
  headers: { Authorization: `Bearer ${jeton}`, Origin: origine, 'Content-Type': 'application/json' },
  body: methode === 'POST' ? JSON.stringify(corps) : undefined,
}));

describe('Edge Function arbitre (fichier déployé)', () => {
  it('CORS : seulement les adresses du jeu', async () => {
    const r = await demande(null, { methode: 'OPTIONS' });
    expect(r.status).toBe(204);
    expect(r.headers.get('access-control-allow-origin')).toBe('https://nocthemar.github.io');
    expect((await demande({ duel: DUEL, journal: [] }, { origine: 'https://pirate.example' })).status).toBe(403);
  });

  it('sans session valable : refusé', async () => {
    expect((await demande({ duel: DUEL, journal: [] }, { jeton: 'faux' })).status).toBe(401);
  });

  it('le résultat rejoué (ici un abandon) est transmis à duel_terminer, avec la clé du serveur', async () => {
    appels.length = 0;
    const r = await demande({ duel: DUEL, journal: [{ type: 'abandon' }, { type: 'fin' }] });
    expect(r.status).toBe(200);
    const fin = appels.find((a) => a.u.endsWith('/rpc/duel_terminer'));
    const corps = JSON.parse(fin.options.body);
    expect(corps.p_duel).toBe(DUEL);
    expect(corps.p_resultat).toBe('adverse');   // l'abandon : une défaite, rejouée par l'arbitre
    expect(corps.p_details.abandon).toBe(true);
    expect(fin.options.headers.apikey).toBe('eyJ.serveur');
  });

  it('un identifiant de duel mal formé est refusé avant toute lecture', async () => {
    appels.length = 0;
    expect((await demande({ duel: "1' or '1'='1", journal: [] })).status).toBe(400);
    expect(appels.some((a) => a.u.includes('/rest/v1/duels'))).toBe(false);
  });
});
