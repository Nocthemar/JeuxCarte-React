// =====================================================================
//  Le duel en ligne : ce qui ne dépend pas de l'écran (ancien JS/jeu-cartes.js, parties « En ligne »)
//  - les réglages du réseau (attente d'un joueur parti, veille de l'invité, messages renvoyés) ;
//  - le salon de l'hôte (retenu dans l'onglet), le lien d'invitation ;
//  - ce que l'hôte envoie à l'invité (sa main et les Grimoires cachés, pas le hasard) ;
//  - le Grimoire de l'adversaire, relu dans SA collection ;
//  - le classé : paliers, résultat déclaré au serveur.
// =====================================================================
import { supabase } from './supabase.js';
import { objetsPossedes } from './donneesDuel.js';
import { TAILLE_DECK } from '../data/regles.js';
import { TROUPES, SORTS, OBJETS } from '../data/cartes.js';
import { uniteDepuisCarte, alleger } from '../moteur/index.js';

// Délai laissé à un adversaire déconnecté pour revenir (ex. : il est passé sur Discord depuis son téléphone)
export const DELAI_RETOUR = 45000;
// L'invité qui n'a rien reçu depuis ce temps alors qu'il attend l'hôte renvoie son action et redemande la suite
export const SILENCE_MAX = 5000;
// Au-delà de ce nombre de messages manqués, l'hôte renvoie l'état de la partie d'un coup
export const RENVOI_MAX = 6;

// Les actions qu'un invité peut demander à l'hôte (jamais « ia », par exemple)
export const ACTIONS_INVITE = new Set(['renvoi', 'jouer', 'attaque', 'defendre', 'capacite', 'destin', 'defausser', 'mediter', 'placer', 'fin', 'abandon']);

// Celui qui crée un salon en est l'hôte (retenu dans l'onglet : une page rechargée le reste)
const cleHote = (code) => `duel-hote-${code}`;
export function estHote(code) {
  try { return !!sessionStorage.getItem(cleHote(code)); } catch { return false; }
}
export function retenirHote(code, oui) {
  try { if (oui) sessionStorage.setItem(cleHote(code), '1'); else sessionStorage.removeItem(cleHote(code)); } catch { /* stockage indisponible */ }
}

export const lienInvitation = (code) => `${location.origin}${location.pathname}#/duel?salon=${code}`;

// ---------------------------------------------------------------------
//  Ce que l'invité reçoit : la main et la pioche de l'hôte sont masquées, les deux Grimoires aussi,
//  et la graine du hasard n'est pas envoyée (l'invité ne doit pas pouvoir prévoir les dés)
// ---------------------------------------------------------------------
export function etatPourInvite(p) {
  const e = alleger(p);
  delete e.evenements;
  delete e.graine;
  delete e.tirages;
  e.camps.joueur.main = e.camps.joueur.main.map(() => ({ cache: true }));
  e.camps.joueur.meditation = e.camps.joueur.meditation ? e.camps.joueur.meditation.map(() => 0) : null;
  e.camps.joueur.deck = e.camps.joueur.deck.map(() => 0);
  e.camps.adverse.deck = e.camps.adverse.deck.map(() => 0);
  return e;
}
export function evenementPourInvite(ev) {
  const e = alleger(ev);
  if (e.qui === 'joueur' && e.pioche) e.pioche.piochees = e.pioche.piochees.map(() => ({ cache: true }));
  if (e.qui === 'joueur' && e.cartes) e.cartes = e.cartes.map(() => 0);   // Méditer : cartes cachées
  return e;
}

// ---------------------------------------------------------------------
//  Le Grimoire d'un joueur à partir de clés (ce que sa présence dans le salon annonce) : cartes et objets
//  relus par l'hôte dans la collection et l'inventaire de CE joueur (cartes_du_joueur, objets_du_joueur :
//  impossible de jouer une carte qu'on n'a pas), plus les troupes et sorts du Codex, ouverts à tous.
//  Les limites (copies, objets, transcendantes) sont refaites par le moteur.
// ---------------------------------------------------------------------
const jouable = (c) => c?.image && c.description !== "Carte d'exemple";
export async function grimoireDepuisCles(cles, discordId) {
  const liste = (Array.isArray(cles) ? cles : []).slice(0, TAILLE_DECK).map(String);
  const [{ data: cartes }, { data: items }] = discordId
    ? await Promise.all([
      supabase.rpc('cartes_du_joueur', { p_discord_id: discordId }),
      supabase.rpc('objets_du_joueur', { p_discord_id: discordId }),
    ])
    : [{ data: [] }, { data: [] }];
  const unites = new Map((cartes ?? []).filter(jouable).map((c) => [`u${c.id}`, uniteDepuisCarte(c)]));
  const objets = new Set(objetsPossedes((items ?? []).map((item) => ({ item }))).map((o) => o.id));
  return liste.map((k) => unites.get(k) ?? TROUPES.find((t) => t.id === k) ?? SORTS.find((s) => s.id === k)
    ?? (objets.has(k) ? OBJETS.find((o) => o.id === k) : null)).filter(Boolean);
}

// ---------------------------------------------------------------------
//  Le classé (supabase/schema.sql, partie « classé »)
// ---------------------------------------------------------------------
export const PALIERS = [[1700, 'Couronne'], [1550, 'Diamant'], [1400, 'Platine'], [1250, 'Or'], [1100, 'Argent'], [0, 'Bronze']];
export const palierDe = (cote) => PALIERS.find(([min]) => cote >= min)[1];
export const classeAbsent = (error) => /PGRST202|schema cache/.test(`${error?.code} ${error?.message}`);

// Fin d'une partie classée : chacun déclare son résultat ; la cote bouge quand les deux concordent.
// Renvoie { morceaux, gain } : morceaux alterne texte normal et texte en gras (indices impairs).
export async function resultatClasse(code, gagne) {
  for (let essai = 0; essai < 8; essai++) {
    const { data, error } = await supabase.rpc('resultat_classe', { p_salon: code, p_victoire: gagne });
    if (error) return { morceaux: [`Partie classée : ${error.message}`] };
    if (data?.ok && data.litige) {
      return { morceaux: ['Partie classée : résultats contradictoires, la partie compte comme une défaite pour les deux camps (', String(data.ecart), ' points · ta cote : ', String(data.cote), ').'] };
    }
    if (data?.ok) {
      if (data.deja) return { morceaux: ['Partie classée : ta cote est de ', String(data.cote), ` points (${palierDe(data.cote)}).`] };
      return {
        morceaux: ['Partie classée : ', `${data.ecart > 0 ? '+' : ''}${data.ecart}`, ' points · ta cote : ', String(data.cote), ` (${palierDe(data.cote)})`],
        gain: (data.ecart ?? 0) > 0,
      };
    }
    if (data && data.ok === false) return { morceaux: [`Partie classée : ${data.raison}`] };
    await new Promise((r) => setTimeout(r, 2500));
  }
  return { morceaux: ['Partie classée : ton adversaire n’a pas déclaré son résultat ; sans réponse de sa part d’ici 10 minutes, ton résultat sera compté.'] };
}
