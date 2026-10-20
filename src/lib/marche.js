// =====================================================================
//  Le Marché : valeurs indicatives et petits outils (ancien JS/marche.js et JS/marche-echanges.js)
// =====================================================================
export const JOURS_VENTE = 14;   // une vente reste 14 jours sur le marché
export const MAX_CARTES = 6;     // cartes de chaque côté d'un contrat
export const MAX_OBJETS = 4;     // objets de chaque côté d'un contrat

// Prix conseillé d'une carte selon sa rareté (repère pour le vendeur), aussi valeur indicative en échange
export const PRIX_CONSEILLE = { commune: 50, eveillee: 100, mythique: 250, legendaire: 600, transcendante: 1500 };
export const valeurCarte = (c) => PRIX_CONSEILLE[c?.rarity] ?? PRIX_CONSEILLE.commune;
export const valeurObjet = (o) => Number(o?.price ?? o?.prix ?? 100) || 100;
// La valeur indicative d'un côté d'un contrat (infos.carte(id), infos.objet(id) : les cartes et objets connus)
export const valeurCote = (infos, cartes, or, objets) => cartes.reduce((s, id) => s + valeurCarte(infos.carte(id)), 0)
  + (Number(or) || 0) + objets.reduce((s, id) => s + valeurObjet(infos.objet(id)), 0);

export const STATUTS = { ratifie: 'Ratifié', rompu: 'Rompu', impossible: 'Impossible' };
export const TYPES_OBJET = { title: 'Titre', banner: 'Bannière', theme: 'Thème' };

export const nombre = (n) => Number(n ?? 0).toLocaleString('fr-FR');
// Une table ou une fonction absente de la base (le commerce pas encore installé)
export const absent = (error) => /schema cache|does not exist|PGRST20[25]|42P01/.test(`${error?.code} ${error?.message}`);
// La Veine sert de « type » de carte
export const veineDe = (c) => [c?.attack_1, c?.attack_2].find((a) => a?.veine)?.veine ?? null;

// L'équilibre estimé d'un contrat
export function texteEquilibre(donne, recoit) {
  if (!donne && !recoit) return '';
  const ecart = recoit - donne;
  const rel = Math.abs(ecart) / Math.max(donne, recoit, 1);
  if (rel < 0.15) return '⚖ Échange équilibré (estimation)';
  return ecart > 0 ? `⚖ Penche en ta faveur d’environ ${nombre(ecart)} or (estimation)` : `⚖ Penche en sa faveur d’environ ${nombre(-ecart)} or (estimation)`;
}
