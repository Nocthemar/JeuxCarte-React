// =====================================================================
//  Le mode Histoire côté duel (ancien JS/jeu-cartes.js)
//  - le Grimoire de l'adversaire d'un niveau (src/data/histoire.js) ;
//  - au début du duel, le serveur note le niveau commencé (histoire_commencer) ;
//  - après une victoire, il la valide et donne les récompenses (valider_niveau_histoire) ;
//  - le résultat est laissé dans le navigateur pour l'écran Histoire (même clé qu'avant).
// =====================================================================
import { supabase } from './supabase.js';
import { TROUPES } from '../data/cartes.js';
import { construireDeck, objetDepuisNom } from '../moteur/index.js';

export const CLE_RESULTAT_HISTOIRE = 'histoire-resultat';

const cleNom = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, "'").trim().toLowerCase();

// Le Grimoire de l'adversaire : chaque carte du niveau en 2 exemplaires (cartes du catalogue, troupes
// du Codex ou objets, par leur nom ; un nom inconnu est ignoré), le reste en cartes de base
export function deckHistoire(noms, catalogue, h) {
  const unites = [];
  const objets = [];
  for (const nom of noms ?? []) {
    const k = cleNom(nom);
    const u = catalogue.find((x) => cleNom(x.n) === k) ?? TROUPES.find((x) => cleNom(x.n) === k);
    if (u) { unites.push(u); continue; }
    const o = objetDepuisNom(nom);
    if (o) objets.push(o);
  }
  return construireDeck([...unites, ...objets].flatMap((c) => [c, c]), h);
}

// Début du duel d'un niveau (une victoire sans partie jouée est refusée par le serveur)
export const commencerNiveau = (idNiveau) => supabase.rpc('histoire_commencer', { p_niveau_id: idNiveau }).then(() => null, () => null);

// Fin d'un niveau : la victoire est validée par le serveur (première victoire = récompenses),
// et le résultat est gardé pour le message affiché sur la carte
export async function finirNiveau(idNiveau, gagne, debut) {
  const resultat = { niveau: idNiveau, gagne, recompenses: null, erreur: null };
  if (gagne) {
    await debut;   // le début du niveau doit être enregistré avant la validation
    const { data, error } = await supabase.rpc('valider_niveau_histoire', { p_niveau_id: idNiveau });
    if (error) resultat.erreur = /schema cache|PGRST20[25]/.test(`${error.code} ${error.message}`)
      ? 'le mode Histoire n’est pas encore installé dans Supabase (SQL/mode_histoire.sql).'
      : error.message;
    else resultat.recompenses = data;
  }
  try { sessionStorage.setItem(CLE_RESULTAT_HISTOIRE, JSON.stringify(resultat)); } catch { /* stockage indisponible */ }
  return resultat;
}

// Le résultat laissé par le dernier duel (l'écran Histoire le lit, puis l'oublie : affiché une seule fois)
export function lireResultatHistoire() {
  try {
    const brut = sessionStorage.getItem(CLE_RESULTAT_HISTOIRE);
    return brut ? JSON.parse(brut) : null;
  } catch { return null; }
}
export function oublierResultatHistoire() {
  try { sessionStorage.removeItem(CLE_RESULTAT_HISTOIRE); } catch { /* stockage indisponible */ }
}

// La phrase des récompenses, sur l'écran de fin du duel
export function texteRecompense({ gagne, recompenses: r, erreur }) {
  if (!gagne) return 'Retourne sur la carte et retente ta chance.';
  if (erreur) return `Victoire non enregistrée : ${erreur}`;
  if (!r || r.deja) return 'Niveau déjà terminé : pas de nouvelle récompense.';
  const gains = [];
  if (r.or) gains.push(`+${r.or} pièces`);
  if (r.carte) gains.push(`la carte « ${r.carte} »`);   // l'XP de pass s'affiche à part
  return gains.length ? `Récompenses : ${gains.join(', ')}.` : '';
}
