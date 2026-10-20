// =====================================================================
//  Les cartes de base du Codex (troupes, sorts), le Milicien du Destin et les objets de pouvoir
//  (repris tels quels de l'ancien JS/jeu-cartes-moteur.js). Les cartes du catalogue, elles,
//  viennent de la base (table cards) et sont transformées en unités par src/moteur/cartes.js.
// =====================================================================

// Sorts du Codex
//   fx : unit (dégâts à une unité adverse), face (dégâts au héros adverse), heal (soin du héros),
//        buff (+v/+v à une de tes unités), draw (pioche v cartes), aoe (v dégâts à toutes les unités adverses)
export const SORTS = [
  { id: 's-forge',  n: 'Étincelle de la Forge', c: 1, t: 's', fx: 'unit', v: 2, veine: 'forge',  d: 'Inflige 2 dégâts à une unité adverse.' },
  { id: 's-ombre',  n: "Morsure de l'Ombre",    c: 2, t: 's', fx: 'face', v: 3, veine: 'ombre',  d: 'Inflige 3 dégâts au héros adverse.' },
  { id: 's-racine', n: 'Sève de la Racine',     c: 2, t: 's', fx: 'heal', v: 5, veine: 'racine', d: 'Rend 5 PV à ton héros.' },
  { id: 's-trone',  n: 'Serment du Trône',      c: 2, t: 's', fx: 'buff', v: 2, veine: 'trone',  d: 'Donne +2/+2 à une de tes unités.' },
  { id: 's-regard', n: 'Vision du Regard',      c: 3, t: 's', fx: 'draw', v: 2, veine: 'regard', d: 'Pioche 2 cartes.' },
  { id: 's-sang',   n: 'Saignée',               c: 4, t: 's', fx: 'unit', v: 5, veine: 'sang',   d: 'Inflige 5 dégâts à une unité adverse.' },
  { id: 's-maree',  n: 'Raz-de-Marée',          c: 5, t: 's', fx: 'aoe',  v: 2, veine: 'maree',  d: 'Inflige 2 dégâts à toutes les unités adverses.' },
];

// Troupes du Codex : soldats, gardes, bêtes… (illustration low poly). Elles complètent le Grimoire
export const TROUPES = [
  { id: 't-ecuyer',     n: 'Écuyer de la Couronne', c: 1, t: 'u', a: 1, d: 1, h: 2, caps: [],               veine: 'trone',  icone: 'epee' },
  { id: 't-garde',      n: 'Garde du Pont',         c: 2, t: 'u', a: 1, d: 3, h: 3, caps: ['garde'],        veine: 'forge',  icone: 'bouclier' },
  { id: 't-archer',     n: 'Archer des Remparts',   c: 2, t: 'u', a: 2, d: 1, h: 2, caps: ['percee'],       veine: 'regard', icone: 'arc' },
  { id: 't-loup',       n: 'Loup des Cendres',      c: 2, t: 'u', a: 3, d: 1, h: 1, caps: ['charge'],       veine: 'ombre',  icone: 'croc' },
  { id: 't-chevalier',  n: 'Chevalier errant',      c: 3, t: 'u', a: 3, d: 2, h: 3, caps: [],               veine: 'trone',  icone: 'epee' },
  { id: 't-cavalier',   n: 'Cavalier de la Marche', c: 3, t: 'u', a: 3, d: 1, h: 2, caps: ['charge'],       veine: 'maree',  icone: 'lance' },
  { id: 't-sentinelle', n: 'Sentinelle de pierre',  c: 4, t: 'u', a: 2, d: 4, h: 5, caps: ['provocation'],  veine: 'racine', icone: 'bouclier' },
  { id: 't-lancier',    n: 'Lancier des Ruines',    c: 4, t: 'u', a: 4, d: 2, h: 4, caps: ['riposte'],      veine: 'sang',   icone: 'lance' },
];

// Renfort du Jet du Destin (et de la capacité d'Astris) : ce n'est pas une carte, il ne va pas au Tombeau
export const MILICIEN = { id: 'milicien', n: 'Milicien de la Couronne', c: 1, t: 'u', a: 2, d: 1, h: 2, caps: [], veine: null, icone: 'epee' };

// Cartes de base : elles complètent un Grimoire trop petit (troupes puis sorts du Codex,
// des moins chères aux plus chères)
export const CARTES_BASE = [...TROUPES, ...SORTS].sort((a, b) => a.c - b.c);

// Cartes de pouvoir : les objets de l'Équipement. Un joueur a ceux qu'il possède (table inventory).
//   heal : soin du héros (v)        ready : une unité alliée peut attaquer à nouveau
//   rage : +v attaque / -1 vie       talisman : +v au prochain jet de d20
//   coffre : pioche 1 et +1 énergie  jeton : la prochaine carte coûte v de moins
export const OBJETS = [
  { id: 'o-potion',   n: 'Potion de soin',          c: 1, t: 's', fx: 'heal',     v: 4, image: 'img/Equipement/Potion de soin.webp',          d: 'Rend 4 PV à ton héros.' },
  { id: 'o-trousse',  n: 'Trousse de soins',        c: 3, t: 's', fx: 'heal',     v: 8, image: 'img/Equipement/Trousse de soins.webp',        d: 'Rend 8 PV à ton héros.' },
  { id: 'o-endu',     n: "Tonique d'endurance",     c: 2, t: 's', fx: 'ready',    v: 1, image: 'img/Equipement/Tonique d’endurance.webp',     d: 'Une de tes unités peut attaquer une fois de plus ce tour.' },
  { id: 'o-rage',     n: 'Tonique de rage',         c: 2, t: 's', fx: 'rage',     v: 3, image: 'img/Equipement/Tonique de rage.webp',         d: 'Une de tes unités gagne +3 attaque mais perd 1 vie.' },
  { id: 'o-talisman', n: 'Talisman du Dé',          c: 1, t: 's', fx: 'talisman', v: 5, image: 'img/Equipement/Talisman du Dé.webp',          d: '+5 à ton prochain jet de d20.' },
  { id: 'o-coffre',   n: "Nécessaire d'aventurier", c: 1, t: 's', fx: 'coffre',   v: 1, image: 'img/Equipement/Nécessaire d’aventurier.webp', d: 'Ouvre un coffre : pioche 1 carte et regagne 1 énergie.' },
  { id: 'o-jeton',    n: 'Jeton du marchand',       c: 0, t: 's', fx: 'jeton',    v: 2, image: 'img/Equipement/Jeton du marchand.webp',       d: 'Ta prochaine carte coûte 2 de moins.' },
];
