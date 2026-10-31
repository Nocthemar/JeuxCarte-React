// =====================================================================
//  Mode Histoire — les chapitres et leurs niveaux (à modifier à la main)
//
//  Un chapitre = un pays de Nocthémar, avec sa carte vue de haut.
//  Un niveau = un cercle sur la carte, placé en POURCENTAGE de l'image
//  (x : de gauche à droite, y : de haut en bas), donc au même endroit
//  quelle que soit la taille de l'écran. Les niveaux se jouent dans l'ordre
//  de la liste ; le dernier est le boss du chapitre.
//
//  Chaque niveau se joue aux Gemmes du Codex (moteur/histoireGemmes.js) : le joueur prend ses trois cartes,
//  l'adversaire a les siennes.
//  ombre : les raretés des trois cartes de l'adversaire ('commune', 'eveillee', 'mythique', 'legendaire',
//    'transcendante') ; ses cartes sont prises au hasard dans le catalogue, une par rareté.
//    Plus elles sont rares, plus leurs attaques frappent fort (mais plus leurs jauges sont longues).
//  difficulte : 'facile' | 'normal' | 'difficile' (comment l'adversaire choisit ses coups)
//  pv : les PV de l'adversaire (le joueur en a 220).
//  IMPORTANT : l'arbitre du serveur rejoue les parties avec ces données : après un changement,
//  « npm run arbitre » puis redéployer l'arbitre (supabase/LISEZ-MOI.md).
//
//  IMPORTANT : les récompenses affichées ici ne sont qu'un aperçu. Celles qui
//  sont réellement données sont dans la table histoire_niveaux (supabase/donnees.sql) :
//  si tu changes un montant, une id ou l'ordre des niveaux, change-le aussi là-bas.
// =====================================================================

export const CHAPITRES = [
  {
    id: 'pravorn',
    nom: 'Pravorn',
    sousTitre: 'Le royaume du Grand Tournoi',
    description: "Le plus vaste royaume du continent. De la route du Nord jusqu'aux lices de la capitale, prouve ta valeur pour défier le Champion du Grand Tournoi.",
    image: 'img/Histoire/pravorn.svg',
    ratio: '16 / 9',   // proportions de l'image (largeur / hauteur)
    niveaux: [
      {
        id: 'pravorn-1', nom: 'La route du Nord', x: 9, y: 80,
        adversaire: 'Un écuyer égaré',
        ombre: ['commune', 'eveillee', 'mythique'], difficulte: 'facile', pv: 150, est_boss: false,
        recompenses: { or: 15, xp: 200 },
      },
      {
        id: 'pravorn-2', nom: 'Le pont gardé', x: 23, y: 60,
        adversaire: 'La garde du pont',
        ombre: ['commune', 'eveillee', 'mythique'], difficulte: 'facile', pv: 190, est_boss: false,
        recompenses: { or: 18, xp: 200 },
      },
      {
        id: 'pravorn-3', nom: 'Le camp des mercenaires', x: 37, y: 76,
        adversaire: 'Une bande de mercenaires',
        ombre: ['commune', 'mythique', 'legendaire'], difficulte: 'normal', pv: 200, est_boss: false,
        recompenses: { or: 20, xp: 200 },
      },
      {
        id: 'pravorn-4', nom: 'Les marais du Sud', x: 50, y: 54,
        adversaire: 'Les bêtes des marais',
        ombre: ['eveillee', 'mythique', 'legendaire'], difficulte: 'normal', pv: 220, est_boss: false,
        recompenses: { or: 24, xp: 200 },
      },
      {
        id: 'pravorn-5', nom: 'Les remparts de la capitale', x: 63, y: 70,
        adversaire: 'Le capitaine des remparts',
        ombre: ['commune', 'legendaire', 'transcendante'], difficulte: 'normal', pv: 240, est_boss: false,
        recompenses: { or: 27, xp: 200 },
      },
      {
        id: 'pravorn-6', nom: 'Les lices du tournoi', x: 74, y: 44,
        adversaire: 'Un chevalier de tournoi',
        ombre: ['eveillee', 'legendaire', 'transcendante'], difficulte: 'normal', pv: 250, est_boss: false,
        recompenses: { or: 30, xp: 200 },
      },
      {
        id: 'pravorn-boss', nom: 'Le Grand Tournoi', x: 88, y: 22,
        adversaire: 'Le Champion du Grand Tournoi',
        ombre: ['mythique', 'legendaire', 'transcendante'], difficulte: 'difficile', pv: 300, est_boss: true,
        recompenses: { or: 100, xp: 500, carte: true },
      },
    ],
  },
  {
    // Chapitre suivant : visible mais pas encore écrit (aucun niveau)
    id: 'vharos',
    nom: 'Vharos',
    sousTitre: 'Les terres du Pacte de l’Ombre',
    description: 'Bientôt : vampires, loups-garous et factions rivales.',
    image: '',
    ratio: '16 / 9',
    niveaux: [],
  },
];

export const DIFFICULTES_HISTOIRE = { facile: 'Facile', normal: 'Normal', difficile: 'Redoutable' };

// Retrouve un niveau par son id : { chapitre, niveau, index } ou null
export function trouverNiveau(id) {
  for (const chapitre of CHAPITRES) {
    const index = chapitre.niveaux.findIndex((n) => n.id === id);
    if (index >= 0) return { chapitre, niveau: chapitre.niveaux[index], index };
  }
  return null;
}

// Un chapitre est ouvert si c'est le premier, ou si le boss du chapitre précédent est battu
// (même règle que valider_niveau_histoire côté serveur). faits : Set des id de niveaux terminés.
export function chapitreOuvert(chapitre, faits) {
  const i = CHAPITRES.indexOf(chapitre);
  if (!chapitre.niveaux.length) return false;
  if (i <= 0) return true;
  const boss = CHAPITRES[i - 1].niveaux.find((n) => n.est_boss);
  return !!boss && faits.has(boss.id);
}

// État d'un niveau : 'termine' | 'disponible' | 'verrouille'
export function etatNiveau(chapitre, index, faits) {
  const niveau = chapitre.niveaux[index];
  if (faits.has(niveau.id)) return 'termine';
  if (!chapitreOuvert(chapitre, faits)) return 'verrouille';
  return index === 0 || faits.has(chapitre.niveaux[index - 1].id) ? 'disponible' : 'verrouille';
}
