// =====================================================================
//  Connexion à Supabase (comptes Discord, cartes, pièces, progression)
//
//  L'adresse et la clé viennent du fichier .env.local (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) :
//  Vite les remplace au démarrage par leur valeur (import.meta.env). Ainsi le code ne contient
//  aucune adresse en dur, et on peut changer de projet (développement / vrai jeu) sans le toucher.
//  La clé « publishable » (sb_publishable_…) peut être publique. JAMAIS la clé secrète ici.
// =====================================================================
import { createClient } from '@supabase/supabase-js';

export const URL_SUPABASE = import.meta.env.VITE_SUPABASE_URL;
export const CLE_SUPABASE = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!URL_SUPABASE || !CLE_SUPABASE) {
  throw new Error('Supabase n’est pas configuré : copie .env.example en .env.local et remplis-le, puis relance « npm run dev ».');
}

export const supabase = createClient(URL_SUPABASE, CLE_SUPABASE, {
  auth: {
    // PKCE : au retour de Discord, la connexion arrive dans « ?code=… » et non dans le « # » de l'adresse,
    // que le routeur (HashRouter) utilise déjà pour savoir quel écran afficher
    flowType: 'pkce',
  },
});
