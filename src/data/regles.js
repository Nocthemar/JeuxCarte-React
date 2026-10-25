// =====================================================================
//  Les chiffres et les tables des règles du Duel des Couronnes
//  (repris tels quels de l'ancien JS/jeu-cartes-moteur.js ; les règles elles-mêmes sont dans src/moteur/)
// =====================================================================

export const PV_HEROS = 20;
export const DEFENSE_HEROS = 2;     // seuil pour toucher un héros : 8 + 2 = 10
export const SEUIL_BASE = 8;        // seuil pour toucher : 8 + Défense de la cible
export const ENERGIE_MAX = 10;
export const PLACES = 5;            // emplacements de troupes par camp
export const MAIN_MAX = 7;          // une carte piochée main pleine est brûlée
export const MAIN_DEPART = 3;       // le second joueur pioche une carte de plus
export const COUT_DESTIN = 2;
export const COUT_DEFAUSSE = 1;     // défausser une carte de sa main (une fois par tour)
export const COUT_MEDITER = 1;      // regarder les 3 premières cartes du Grimoire (une fois par tour)
export const TAILLE_DECK = 20;      // le Grimoire
export const COPIES_MAX = 2;        // exemplaires au plus d'une même carte (1 seul d'une Légendaire ou d'une Transcendante)
export const TRANSCENDANTES_MAX = 1;   // une seule Transcendante dans le Grimoire
export const OBJETS_MAX = 4;        // objets de pouvoir au plus dans le Grimoire
export const BONUS_DEFENSE = 2;     // posture défensive
export const MALUS_EXPOSE = 2;      // après un échec critique
export const PV_EQUIPE = 30;        // le héros partagé d'une équipe en 2 contre 2

// Les capacités (mots-clés), affichées sur les cartes et dans la loupe
export const CAPACITES = {
  garde:        { nom: 'Garde',        texte: 'Tant qu’elle est en jeu, ton héros ne peut pas être attaqué.' },
  provocation:  { nom: 'Provocation',  texte: 'Les attaques adverses doivent la viser en premier.' },
  charge:       { nom: 'Charge',       texte: 'Peut attaquer dès le tour où elle est posée.' },
  riposte:      { nom: 'Riposte',      texte: 'Réaction : attaquée et encore debout, elle rend son Attaque à l’attaquant.', reaction: true },
  interception: { nom: 'Interception', texte: 'Réaction : une fois par tour adverse, elle s’interpose quand ton héros est attaqué.', reaction: true },
  esquive:      { nom: 'Esquive',      texte: 'Réaction : la première attaque qui la vise à chaque tour adverse lance deux d20 et garde le plus bas.', reaction: true },
  bouclier:     { nom: 'Bouclier',     texte: 'Réaction : annule entièrement les premiers dégâts qu’elle subit (une seule fois).', reaction: true },
  soin:         { nom: 'Soin',         texte: 'Au début de ton tour, rend 2 PV à ton unité la plus blessée, sinon à ton héros.' },
  inspiration:  { nom: 'Inspiration',  texte: 'Tes autres unités ont +1 Attaque.' },
  percee:       { nom: 'Percée',       texte: 'Ignore Garde et Provocation : peut viser qui elle veut.' },
  drain:        { nom: 'Drain',        texte: 'Les dégâts qu’elle inflige soignent ton héros d’autant.' },
  rapide:       { nom: 'Rapide',       texte: 'Attaquer ne l’empêche pas de se mettre en défense ensuite, dans le même tour.' },
  tenace:       { nom: 'Tenace',       texte: 'La première fois qu’elle devrait tomber, elle reste debout avec 1 PV (une seule fois).' },
};

// Chaque carte a UNE capacité : son Trait, ou, pour les rares cartes qui détiennent une Veine,
// la capacité de cette Veine (CAP_VEINE). Par le nom de la carte (sans accents, en minuscules).
// Une carte absente des deux listes n'a pas de capacité.
export const TRAIT_PAR_NOM = {
  'vultoff': 'tenace',
  'elfe des neiges doree': 'esquive',
  'elfe des neiges': 'esquive',
  'astris, reine de pravorn': 'inspiration',
  'gardes de pravorn': 'garde',
  "gardes d'aelkor": 'provocation',
  "gardes d'erynedhal": 'rapide',
  'garde des elfes': 'rapide',   // ancien nom des Gardes d'Erynedhal
  'mange-cœur': 'drain',   // le « œ » reste tel quel une fois les accents enlevés
  'garde de pravorn': 'interception',
  "garde d'aelkor": 'riposte',
  "garde d'erynedhal": 'percee',
  'slime': 'tenace',
  'veilleuse ecarlate': 'drain',
};
// Les détenteurs d'une Veine : [la Veine (qui donne la capacité), le nom affiché sur la carte]
export const VEINE_PAR_NOM = {
  'kaeliss': ['sang', 'Veine du Sang'],
  'dalek': ['reve', 'Veine du Rêve'],
  'seigneur des marais': ['racine', 'Veine inconnue'],
  'maitre du jeu': ['destin', 'Pouvoir du Destin'],
  'les veines': ['trone', 'Les Douze Veines'],
};

// La capacité donnée par chaque Veine
export const CAP_VEINE = {
  trone: 'inspiration', chaine: 'provocation', forge: 'bouclier', racine: 'soin', esprit: 'soin',
  bete: 'charge', sang: 'drain', maree: 'riposte', tombeau: 'riposte', ombre: 'esquive',
  regard: 'percee', reve: 'interception', destin: 'bouclier',
};

// Coût / Attaque / Défense / PV de base d'une carte du catalogue selon sa rareté
//   act : actions pour la jouer ; condition 'allie' : il faut déjà une de tes unités en jeu
// (octobre 2026 : grandes cartes renforcées après des milliers de parties simulées ;
//  avant : mythique 5 PV, légendaire 4/4/7, transcendante coût 7 et 5/4/8)
export const BASE = {
  commune:       { c: 2, a: 2, d: 1, h: 3 },
  eveillee:      { c: 3, a: 3, d: 2, h: 4 },
  mythique:      { c: 4, a: 3, d: 3, h: 6 },
  legendaire:    { c: 5, a: 5, d: 4, h: 9 },
  transcendante: { c: 6, a: 6, d: 5, h: 12, act: 2, condition: 'allie' },
};

// Capacité unique des grandes cartes, par le nom de la carte (sans accents, en minuscules)
export const UNIQUE_PAR_NOM = {
  'kaeliss': 'kaeliss',
  'dalek': 'dalek',
  'maitre du jeu': 'maitre',
  'elfe des neiges doree': 'blizzard',
  'garde de pravorn': 'sentinelle',
  'gardes de pravorn': 'rangs',
  "gardes d'erynedhal": 'vigie',
  'garde des elfes': 'vigie',   // ancien nom des Gardes d'Erynedhal
  "garde d'erynedhal": 'neige',
  "garde d'aelkor": 'armure',
  "gardes d'aelkor": 'marteaux',
  'vultoff': 'sanstete',
  'les veines': 'entites',
  'astris, reine de pravorn': 'reine',
};

// Les terrains : chaque duel se joue sur l'un d'eux, qui change une petite règle
export const TERRAINS = {
  pravorn:   { nom: 'Lices de Pravorn',        texte: 'Terre de tournois : les unités avec Charge ont +1 Attaque.' },
  erynedhal: { nom: 'Neiges d’Erynedhal',      texte: 'Le froid engourdit les bras : un jet de 1 ou 2 est un échec critique.' },
  aelkor:    { nom: 'Bibliothèques d’Aelkor',  texte: 'La magie y coule à flots : les sorts et les objets coûtent 1 énergie de moins.' },
  vharos:    { nom: 'Remparts de Vharos',      texte: 'Une forteresse : toutes les unités ont +1 Défense.' },
  marais:    { nom: 'Marais de Brume',         texte: 'La vase ralentit tout : Charge ne fait plus effet, chaque unité attend son tour.' },
  ruines:    { nom: 'Ruines hantées',          texte: 'Les morts murmurent : quand une unité meurt, son camp pioche une carte.' },
};
export const TERRAINS_IDS = Object.keys(TERRAINS);

// Résultats d'un jet d'attaque (d20 + Attaque contre le seuil : 8 + Défense de la cible)
export const JETS = [
  { q: 'echec',    jet: '1 naturel',        label: 'Échec critique', texte: 'Raté, et l’attaquant est exposé : -2 Défense jusqu’à son prochain tour.' },
  { q: 'faible',   jet: '2 à 4, sous le seuil', label: 'Raté',        texte: 'Aucun dégât.' },
  { q: 'eraflure', jet: '5 ou plus, sous le seuil', label: 'Éraflure', texte: 'Le coup passe de justesse : 1 dégât.' },
  { q: 'normal',   jet: 'seuil atteint',    label: 'Touché',         texte: 'Dégâts = Attaque.' },
  { q: 'solide',   jet: 'seuil + 5',        label: 'Coup solide',    texte: '+1 dégât.' },
  { q: 'critique', jet: '20 naturel',       label: 'Critique !',     texte: 'Touche toujours, dégâts doublés.' },
];

// Jet du Destin : 20 résultats, des plus funestes aux plus glorieux
export const DESTIN = [
  { min: 1,  max: 1,  q: 'malediction', label: 'Malédiction',     texte: 'Ton héros subit 3 dégâts.' },
  { min: 2,  max: 2,  q: 'trahison',    label: 'Trahison',        texte: 'Une de tes unités, au hasard, subit 2 dégâts.' },
  { min: 3,  max: 3,  q: 'brouillard',  label: 'Brouillard',      texte: 'Une carte de ta main, au hasard, part au Tombeau.' },
  { min: 4,  max: 4,  q: 'presage',     label: 'Mauvais présage', texte: 'Ton prochain jet d’attaque a -3.' },
  { min: 5,  max: 6,  q: 'soin',        label: 'Soin',            texte: 'Ton héros récupère 4 PV.' },
  { min: 7,  max: 7,  q: 'eclair',      label: 'Éclair',          texte: 'Une unité adverse, au hasard, subit 3 dégâts.' },
  { min: 8,  max: 9,  q: 'pioche',      label: 'Pioche',          texte: 'Tu pioches 2 cartes.' },
  { min: 10, max: 10, q: 'fortune',     label: 'Fortune',         texte: 'Tu gagnes 2 énergie ce tour.' },
  { min: 11, max: 11, q: 'souffle',     label: 'Second souffle',  texte: 'Tu gagnes 1 action ce tour.' },
  { min: 12, max: 13, q: 'renfort',     label: 'Renfort',         texte: 'Un Milicien de la Couronne (2/1/2) rejoint tes rangs.' },
  { min: 14, max: 14, q: 'armure',      label: 'Armure bénie',    texte: 'Tes unités gagnent +1 Défense pour de bon.' },
  { min: 15, max: 15, q: 'tempete',     label: 'Tempête',         texte: 'Toutes les unités adverses subissent 1 dégât.' },
  { min: 16, max: 16, q: 'prophetie',   label: 'Prophétie',       texte: 'Ton prochain jet d’attaque a +5.' },
  { min: 17, max: 17, q: 'benediction', label: 'Bénédiction',     texte: 'Tes unités gagnent +1/+1.' },
  { min: 18, max: 18, q: 'chatiment',   label: 'Châtiment',       texte: 'Le héros adverse subit 3 dégâts.' },
  { min: 19, max: 19, q: 'elan',        label: 'Élan héroïque',   texte: 'Tes unités qui ont déjà agi peuvent agir à nouveau ce tour.' },
  { min: 20, max: 20, q: 'grace',       label: 'Grâce divine',    texte: 'Tes unités gagnent +2/+2 et ton héros récupère 3 PV.' },
];

// Les trois niveaux de l'Ombre (duel contre l'IA, hors mode Histoire) : ses PV et la description du menu
export const DIFFICULTES = {
  facile:    { pv: 16, texte: 'L’Ombre oublie parfois ses cartes, frappe au hasard et a moins de vie.' },
  normal:    { pv: 20, texte: 'L’Ombre joue ses meilleures cartes et choisit ses cibles.' },
  difficile: { pv: 24, texte: 'L’Ombre tente plus souvent le Destin et a plus de vie.' },
};
