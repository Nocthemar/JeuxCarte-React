// =====================================================================
//  Les badges de la Caverne (supabase/caverne.sql, en fin de fichier) : la Caverne est scellée ; un badge
//  activé l'ouvre pour 24 h, 1 semaine, 1 mois ou 3 mois (le temps s'ajoute au temps restant).
//  Le serveur garde les badges, l'accès et les prix ; ici, on ne fait que demander et afficher.
//  etat : { jusqu_a (date ISO, ou null), mj, badges: [{ id, nom, image, prix, secondes, nombre }] }
// =====================================================================
import { supabase } from '../supabase.js';

async function rpc(nom, args) {
  const { data, error } = await supabase.rpc(nom, args);
  if (error) throw new Error(error.message);
  return data;
}

export const lireBadges = () => rpc('caverne_badges_etat');
export const acheterBadge = (id) => rpc('caverne_badge_acheter', { p_badge: id });
export const activerBadge = (id) => rpc('caverne_badge_activer', { p_badge: id });

// Peut-il entrer ?
export const accesOuvert = (etat) => !!etat && (etat.mj || (!!etat.jusqu_a && new Date(etat.jusqu_a) > new Date()));

// Le temps qui reste, en mots : « 6 j 23 h », « 5 h 12 min », « 3 min »
export function tempsRestant(jusqua, maintenant = Date.now()) {
  const s = Math.max(0, Math.floor((new Date(jusqua) - maintenant) / 1000));
  const j = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (j > 0) return `${j} j${h ? ` ${h} h` : ''}`;
  if (h > 0) return `${h} h${m ? ` ${String(m).padStart(2, '0')} min` : ''}`;
  return `${Math.max(1, m)} min`;
}

// Les badges d'un palier du Pass (valeur.nom : l'id du badge, ou son nom)
export const BADGES_PASS = {
  '24h': { nom: '24 heures', image: 'img/Badge/Badge_24h.webp' },
  '1semaine': { nom: '1 semaine', image: 'img/Badge/Badge_1semaine.webp' },
  '1mois': { nom: '1 mois', image: 'img/Badge/Badge_1mois.webp' },
  '3mois': { nom: '3 mois', image: 'img/Badge/Badge_3mois.webp' },
};
export const badgeDuPass = (nom) => BADGES_PASS[nom] ?? Object.values(BADGES_PASS).find((x) => x.nom === nom) ?? null;
