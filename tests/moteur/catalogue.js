// Les cartes du catalogue (comme dans la table cards, supabase/donnees.sql), pour les tests du moteur.
// Seuls les champs que le moteur lit sont repris (nom, rareté, rang, attaques).
const a = (veine, nom, puissance) => ({ veine, nom, puissance });

export const CATALOGUE = [
  { id: 1, name: 'Kaéliss', rarity: 'legendaire', rank: 1, attack_1: a('sang', 'Maître du Flot', 80), attack_2: a('sang', 'Cœur Immuable', 120) },
  { id: 2, name: 'Dalek', rarity: 'legendaire', rank: 1, attack_1: a('reve', 'Marcheur d’Esprit', 70), attack_2: a('reve', 'Seigneur des Rêves', 110) },
  { id: 3, name: 'Maître du Jeu', rarity: 'transcendante', rank: null, attack_1: a('destin', 'Coup du Sort', 99), attack_2: a('destin', 'Plume du Codex', '∞') },
  { id: 5, name: 'Mange-cœur', rarity: 'eveillee', rank: null, attack_1: a('bete', 'Éventrement', 50), attack_2: a('tombeau', 'Voix du Défunt', 20) },
  { id: 6, name: 'Slime', rarity: 'commune', rank: null, attack_1: a('racine', 'Masse gélatineuse', 20), attack_2: a('maree', 'Englobement', 30) },
  { id: 7, name: 'Seigneur des Marais', rarity: 'legendaire', rank: null, attack_1: a('racine', 'Étreinte de la Vase', 60), attack_2: a('maree', 'Brume Stagnante', 75) },
  { id: 8, name: 'Elfe des Neiges', rarity: 'mythique', rank: null, attack_1: a('maree', 'Souffle de Givre', 45), attack_2: a('reve', 'Berceuse des Neiges', 55) },
  { id: 9, name: 'Elfe des Neiges dorée', rarity: 'transcendante', rank: null, attack_1: a('reve', 'Larmes de Cristal', 80), attack_2: a('maree', 'Blizzard d’Erynedhal', 120) },
  { id: 10, name: "Garde d'Erynedhal", rarity: 'commune', rank: null, attack_1: a('maree', 'Pique Glacée', 35), attack_2: a('regard', 'Œil des Cimes', 45) },
  { id: 11, name: "Gardes d'Erynedhal", rarity: 'eveillee', rank: null, attack_1: a('maree', 'Lance de Givre', 45), attack_2: a('ombre', 'Embuscade des Neiges', 55) },
  { id: 12, name: 'Garde de Pravorn', rarity: 'commune', rank: null, attack_1: a('forge', 'Écu levé', 35), attack_2: a('trone', 'Estocade du Serment', 45) },
  { id: 13, name: 'Gardes de Pravorn', rarity: 'eveillee', rank: null, attack_1: a('chaine', 'Mur de Boucliers', 40), attack_2: a('trone', 'Charge de la Garde', 60) },
  { id: 14, name: "Garde d'Aelkor", rarity: 'commune', rank: null, attack_1: a('forge', 'Coup de Marteau', 40), attack_2: a('trone', 'Serment des Trois', 50) },
  { id: 15, name: "Gardes d'Aelkor", rarity: 'eveillee', rank: null, attack_1: a('forge', 'Marteaux en Cadence', 45), attack_2: a('chaine', 'Rang d’Acier', 55) },
  { id: 16, name: 'Vultoff', rarity: 'legendaire', rank: null, attack_1: a('tombeau', 'Sentence du Sans-Tête', 70), attack_2: a('sang', 'Moisson Pourpre', 80) },
  { id: 17, name: 'Les Veines', rarity: 'transcendante', rank: null, attack_1: a('esprit', 'Éveil des Entités', 90), attack_2: a('trone', 'Convergence des Douze', 120) },
  { id: 18, name: 'Astris, Reine de Pravorn', rarity: 'mythique', rank: null, attack_1: a('trone', 'Décret de la Couronne', 50), attack_2: a('chaine', 'Loi du Tournoi', 60) },
];
