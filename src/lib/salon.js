// =====================================================================
//  Duel des Couronnes — salon en ligne (Supabase Realtime) (repris de l'ancien JS/jeu-cartes-ligne.js)
//  Un salon = un canal « duel-CODE ». Rien n'est écrit dans la base :
//    - la présence dit qui est là (pseudo, avatar, rôle, prêt, cartes du deck)
//    - les messages « jeu » portent les événements du duel et l'état de la partie, envoyés par l'hôte
//    - les messages « choix » portent les actions de l'invité (jouer, attaquer, Destin, fin du tour), reçues par l'hôte
//    - les messages « renvoi » redemandent à l'hôte les événements perdus
//      (connexion coupée un instant, onglet en arrière-plan…)
//  En 2 contre 2, chaque joueur a en plus son canal privé « main-CODE-<discord_id> », que lui seul peut écouter
//  (supabase/schema.sql, partie 13) : l'hôte y envoie la partie vue de sa place, avec sa main (envoyerPrive).
//  L'hôte (celui qui crée le salon) fait tourner les règles et lance les dés.
//
//  Sécurité : le canal est PRIVÉ (seuls les membres du salon, inscrits par le serveur avec salon_entrer, y entrent :
//  supabase/securite.sql partie 5), et tout
//  ce qui vient des autres joueurs passe par nettoyer() avant d'être lu : un joueur malveillant ne peut
//  pas glisser de code dans la page de son adversaire (noms, coûts, états de partie…).
// =====================================================================
import { supabase, URL_SUPABASE, CLE_SUPABASE } from './supabase.js';

export const TAILLE_SALON = 2;
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // sans 0/O ni 1/I/L, faciles à confondre

export function nouveauCode() {
  const tirage = crypto.getRandomValues(new Uint32Array(5));
  return Array.from(tirage, (n) => ALPHABET[n % ALPHABET.length]).join('');
}

// ---------------------------------------------------------------------
//  Nettoyage des messages reçus : ni balise ni guillemet droit dans les textes (ils s'affichent sans
//  danger, même insérés dans du HTML), images limitées aux fichiers du jeu, avatars à Discord (ou au
//  stockage « avatars » du jeu, pour les comptes e-mail : supabase/avatars.sql),
//  nombres finis, taille et profondeur bornées
// ---------------------------------------------------------------------
const CLES_INTERDITES = new Set(['__proto__', 'constructor', 'prototype']);
const IMAGE_DU_JEU = /^img\/[^:?#\\<>"'`]+$/;
const AVATAR_DISCORD = /^https:\/\/(cdn\.discordapp\.com|media\.discordapp\.net)\/[^\s"'<>`\\]+$/;
const AVATAR_DU_JEU = /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/avatars\/[a-z0-9_]+\/[a-z0-9-]+\.(webp|png)$/;
const texteSur = (s) => s.slice(0, 2000).replace(/[<>`]/g, '').replace(/"/g, '”').replace(/'/g, '’');

export function nettoyer(x, cle = '', profondeur = 0) {
  if (profondeur > 40) return null;
  if (typeof x === 'string') {
    if (cle === 'image') return IMAGE_DU_JEU.test(x) && !x.includes('..') ? x : null;
    if (cle === 'avatar' || cle === 'avatar_url') return AVATAR_DISCORD.test(x) || AVATAR_DU_JEU.test(x) ? x : null;
    return texteSur(x);
  }
  if (typeof x === 'number') return Number.isFinite(x) ? x : 0;
  if (typeof x === 'boolean' || x == null) return x ?? null;
  if (Array.isArray(x)) return x.slice(0, 500).map((v) => nettoyer(v, cle, profondeur + 1));
  if (typeof x === 'object') {
    const o = {};
    for (const [k, v] of Object.entries(x)) {
      if (CLES_INTERDITES.has(k) || !/^[\w-]{1,40}$/.test(k)) continue;
      o[k] = nettoyer(v, k, profondeur + 1);
    }
    return o;
  }
  return null;
}

export const codeValide = (code) => new RegExp(`^[${ALPHABET}]{5}$`).test(code);

// Les salons en train de se fermer : Supabase garde un canal du même nom tant qu'il n'est pas tout à fait
// fermé (et le rendrait tel quel) ; on rouvre donc un salon seulement une fois l'ancien parti
const fermetures = new Map();   // code -> promesse de fin de fermeture

// Ouvre le salon. surPresence(liste) à chaque arrivée / départ / changement,
// surMessage(evenement, contenu) pour les messages des autres, surErreur(texte).
export function ouvrirSalon(code, profil, { surPresence, surMessage, surErreur }) {
  const cle = crypto.randomUUID();   // une clé par onglet
  let presence = { ...profil, cle, rejoint: Date.now(), pret: false, cartes: [] };
  let canal = null;
  let prive = null;   // mon canal privé (2 contre 2)
  let ferme = false;

  // Ma propre présence reste telle quelle (comparaisons de clé) ; celle des autres est nettoyée
  const liste = () => (canal ? Object.values(canal.presenceState()).flat() : [])
    .map((brut) => { const p = { ...brut }; delete p.presence_ref; return p.cle === cle ? p : nettoyer(p); })   // presence_ref : interne à Supabase
    .sort((a, b) => a.rejoint - b.rejoint);

  const ouvert = (fermetures.get(code) ?? Promise.resolve()).then(async () => {
    if (ferme) return;
    // D'abord, le serveur m'inscrit dans le salon (supabase/securite.sql, partie 5) : seuls ses membres
    // l'écoutent, et seul son hôte écrit dans les canaux privés
    const { error } = await supabase.rpc('salon_entrer', { p_code: code, p_hote: profil.role === 'hote' });
    if (ferme) return;
    if (error) { surErreur(error.message || 'Impossible d’entrer dans ce salon.'); return; }
    canal = supabase.channel(`duel-${code}`, {
      config: { private: true, broadcast: { self: false }, presence: { key: cle } },
    });
    canal
      .on('presence', { event: 'sync' }, () => surPresence(liste()))
      .on('broadcast', { event: 'jeu' }, ({ payload }) => surMessage('jeu', nettoyer(payload)))
      .on('broadcast', { event: 'choix' }, ({ payload }) => surMessage('choix', nettoyer(payload)))
      .on('broadcast', { event: 'renvoi' }, ({ payload }) => surMessage('renvoi', nettoyer(payload)))
      .subscribe(async (statut) => {
        if (statut === 'SUBSCRIBED') await canal.track(presence);
        else if (statut === 'CHANNEL_ERROR' || statut === 'TIMED_OUT') surErreur('La connexion au salon a échoué. Réessaie dans un instant.');
      });
    // Mon canal privé : seul moi peux l'écouter ; l'hôte d'un 2 contre 2 m'y envoie la partie vue de ma place
    prive = supabase.channel(`main-${code}-${profil.discord_id}`, { config: { private: true } });
    prive.on('broadcast', { event: 'jeu' }, ({ payload }) => surMessage('jeu', nettoyer(payload))).subscribe();
  });

  return {
    code,
    cle,
    get presence() { return presence; },
    liste,
    // Met à jour ce que les autres voient de moi (prêt, cartes…)
    async annoncer(changements) {
      presence = { ...presence, ...changements };
      await ouvert;
      if (canal && !ferme) await canal.track(presence);
    },
    envoyer(evenement, contenu) {
      return canal?.send({ type: 'broadcast', event: evenement, payload: contenu });
    },
    // Un message sur le canal privé d'un autre joueur, sans l'écouter (on n'en a pas le droit) :
    // par l'API REST de Realtime, avec ma session (la règle SQL vérifie que je suis connecté)
    async envoyerPrive(discordId, evenement, contenu) {
      if (ferme) return;
      const { data } = await supabase.auth.getSession();
      await fetch(`${URL_SUPABASE}/realtime/v1/api/broadcast`, {
        method: 'POST',
        headers: { apikey: CLE_SUPABASE, Authorization: `Bearer ${data.session?.access_token ?? CLE_SUPABASE}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ topic: `main-${code}-${discordId}`, event: evenement, payload: contenu, private: true }] }),
      }).catch(() => {});
    },
    fermer() {
      ferme = true;
      const fin = ouvert.then(async () => {
        if (!canal) return;
        await canal.untrack().catch(() => {});
        await supabase.removeChannel(canal);
        if (prive) await supabase.removeChannel(prive);
      }).catch(() => {}).finally(() => { if (fermetures.get(code) === fin) fermetures.delete(code); });
      fermetures.set(code, fin);
      return fin;
    },
  };
}
