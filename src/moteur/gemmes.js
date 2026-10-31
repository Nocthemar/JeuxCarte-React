// =====================================================================
//  Les Gemmes du Codex : les règles (sans affichage), pour le mode « Gemmes » (pages/Gemmes.jsx)
//
//  Deux combattants, mêmes PV au départ, une grille de gemmes partagée au milieu.
//  - À son tour, on échange deux gemmes voisines pour en aligner 3 ou plus de la même sorte
//    (un échange qui n'aligne rien est refusé et ne compte pas). 3 échanges par tour au plus (2 au tout premier
//    tour, pour que celui qui commence n'ait pas trop d'avance) ;
//    on peut finir son tour plus tôt.
//  - Une gemme par rareté, de la couleur de la rareté dans tout le jeu : Commune (gris), Éveillée (vert),
//    Mythique (bleu), Légendaire (rouge), Transcendante (or).
//  - Les gemmes ne frappent pas : chaque combattant a 3 cartes de sa collection, et aligner des gemmes
//    d'une rareté charge la jauge de SA carte de cette rareté (l'Ombre, elle, a pour chaque carte une gemme
//    tirée au hasard ; deux cartes de la même gemme : la première, puis le surplus va à la suivante).
//    Plus on en aligne, plus ça charge : 4 gemmes = 4 parts de jauge, 3 gemmes = 3. Les gemmes d'une rareté qu'on n'a pas
//    ne chargent rien pour soi (mais peut-être pour l'adversaire).
//  - Les gemmes tombent, de nouvelles arrivent du haut : les alignements en chaîne chargent plus
//    (+25 % par maillon), sans coûter d'échange.
//  - Jauge pleine : on appuie sur la carte pour lancer son attaque sur l'adversaire (gratuitement, pendant
//    son tour). C'est la SEULE façon de lui faire perdre des PV. Tout dépend de la rareté (RARETE) :
//    plus la carte est rare, plus sa jauge est longue et plus son pouvoir frappe fort.
//  - La partie s'arrête quand un combattant tombe à 0 PV.
//
//  Le hasard vient d'une graine (moteur/hasard.js) : même graine + mêmes actions = même partie.
//  C'est ce qui permet de jouer en ligne : chacun fait tourner les règles et ne s'envoie que les actions.
// =====================================================================
import { hasard, nouvelleGraine } from './hasard.js';

export const TAILLE = 8;
export const PV_DEPART = 220;
export const ECHANGES_PAR_TOUR = 3;
// Les sortes de gemmes : une par rareté, de la plus commune à la plus rare
export const SORTES = ['commune', 'eveillee', 'mythique', 'legendaire', 'transcendante'];
// Selon la rareté de la carte : jauge (gemmes à aligner pour la remplir), et son pouvoir une fois pleine
// (degats à l'adversaire, soin pour soi, échanges rendus ce tour-ci)
export const RARETE = {
  commune: { nom: 'Commune', jauge: 8, degats: 16, soin: 0, echange: 0 },
  eveillee: { nom: 'Éveillée', jauge: 10, degats: 18, soin: 10, echange: 0 },
  mythique: { nom: 'Mythique', jauge: 12, degats: 25, soin: 0, echange: 1 },
  legendaire: { nom: 'Légendaire', jauge: 15, degats: 36, soin: 0, echange: 0 },
  transcendante: { nom: 'Transcendante', jauge: 18, degats: 42, soin: 8, echange: 1 },
};
const BONUS_CHAINE = 0.25;

const ligneDe = (i) => Math.floor(i / TAILLE);
const colonneDe = (i) => i % TAILLE;
export const voisins = (a, b) => (ligneDe(a) === ligneDe(b) && Math.abs(a - b) === 1) || Math.abs(a - b) === TAILLE;

// ---------------------------------------------------------------------
//  La grille : TAILLE × TAILLE cases { id, s } (id : un numéro unique, pour suivre la gemme à l'écran ;
//  s : sa sorte, indice dans SORTES)
// ---------------------------------------------------------------------
function nouvelleGemme(etat, s = Math.floor(hasard(etat) * SORTES.length)) {
  etat.prochain += 1;
  return { id: etat.prochain, s };
}

// Les cases alignées (3 ou plus, en ligne ou en colonne)
export function alignements(grille) {
  const touchees = new Set();
  const suivre = (cases) => {
    let debut = 0;
    for (let k = 1; k <= cases.length; k += 1) {
      if (k < cases.length && grille[cases[k]].s === grille[cases[debut]].s) continue;
      if (k - debut >= 3) for (let m = debut; m < k; m += 1) touchees.add(cases[m]);
      debut = k;
    }
  };
  for (let r = 0; r < TAILLE; r += 1) suivre(Array.from({ length: TAILLE }, (_, c) => r * TAILLE + c));
  for (let c = 0; c < TAILLE; c += 1) suivre(Array.from({ length: TAILLE }, (_, r) => r * TAILLE + c));
  return touchees;
}

const echangees = (grille, a, b) => {
  const g = grille.slice();
  [g[a], g[b]] = [g[b], g[a]];
  return g;
};

// Tous les échanges qui alignent quelque chose : [[a, b], …]
export function coupsPossibles(grille) {
  const coups = [];
  for (let i = 0; i < grille.length; i += 1) {
    for (const j of [i + 1, i + TAILLE]) {
      if (j >= grille.length || !voisins(i, j) || grille[i].s === grille[j].s) continue;
      if (alignements(echangees(grille, i, j)).size) coups.push([i, j]);
    }
  }
  return coups;
}

// Une grille sans alignement, où au moins un échange est possible
function remplir(etat) {
  for (;;) {
    const g = [];
    for (let i = 0; i < TAILLE * TAILLE; i += 1) {
      let gemme;
      do gemme = nouvelleGemme(etat);
      while ((colonneDe(i) >= 2 && g[i - 1].s === gemme.s && g[i - 2].s === gemme.s)
        || (ligneDe(i) >= 2 && g[i - TAILLE].s === gemme.s && g[i - 2 * TAILLE].s === gemme.s));
      g.push(gemme);
    }
    if (coupsPossibles(g).length) return g;
  }
}

// ---------------------------------------------------------------------
//  La partie
//  combattants : [{ nom, cartes: [{ n, image, rarete, gemme? } ×3] }, …] (0 : celui qui commence)
//  Une carte de la partie : { n, image, rarete, gemme, jauge, max } : sa gemme (celle qui la charge) est celle de
//  sa rareté, sauf si on en donne une autre (les cartes de l'Ombre : tirées au hasard, choix.js cartesOmbre)
// ---------------------------------------------------------------------
export function nouvellePartie(combattants, graine = nouvelleGraine()) {
  const etat = {
    graine: graine >>> 0, prochain: 0, tour: 1, actif: 0, echanges: ECHANGES_PAR_TOUR - 1, fin: null, grille: null,
    joueurs: combattants.map(({ nom, cartes }) => ({
      nom, pv: PV_DEPART, pvMax: PV_DEPART,
      cartes: [0, 1, 2].map((k) => {
        const rarete = RARETE[cartes[k]?.rarete] ? cartes[k].rarete : 'commune';
        const gemme = SORTES.includes(cartes[k]?.gemme) ? cartes[k].gemme : rarete;
        return { n: cartes[k]?.n ?? 'Carte', image: cartes[k]?.image ?? null, rarete, gemme, jauge: 0, max: RARETE[rarete].jauge };
      }),
    })),
  };
  etat.grille = remplir(etat);
  return etat;
}

const copie = (etat) => ({
  ...etat, grille: etat.grille.slice(),
  joueurs: etat.joueurs.map((j) => ({ ...j, cartes: j.cartes.map((c) => ({ ...c })) })),
});

const blesser = (etat, cible, n) => {
  const j = etat.joueurs[cible];
  j.pv = Math.max(0, j.pv - n);
  if (j.pv === 0 && !etat.fin) etat.fin = { gagnant: 1 - cible };
};

// Les alignements, les chutes et les chaînes après un échange. Renvoie les étapes, pour l'affichage :
// { retirees: [id…], grille, chutes: { id: nombre de cases }, gains: { sorte: gemmes }, charges: { k: parts }, chaine }
// Les gemmes ne blessent personne : elles chargent les jauges des cartes (de leur rareté) du combattant qui joue.
function resoudre(etat) {
  const etapes = [];
  const moi = etat.joueurs[etat.actif];
  for (let chaine = 1; ; chaine += 1) {
    const touchees = alignements(etat.grille);
    if (!touchees.size) break;
    const gains = {};
    for (const i of touchees) {
      const sorte = SORTES[etat.grille[i].s];
      gains[sorte] = (gains[sorte] ?? 0) + 1;
    }
    // Plusieurs cartes de la même rareté : la charge remplit la première, le surplus passe à la suivante
    const charges = {};
    for (const sorte of SORTES) {
      if (!gains[sorte]) continue;
      let reste = Math.round(gains[sorte] * (1 + BONUS_CHAINE * (chaine - 1)));
      moi.cartes.forEach((carte, k) => {
        if (carte.gemme !== sorte || !reste || carte.jauge >= carte.max) return;
        const part = Math.min(reste, carte.max - carte.jauge);
        carte.jauge += part;
        charges[k] = part;
        reste -= part;
      });
    }
    const retirees = [...touchees].map((i) => etat.grille[i].id);

    // Les gemmes tombent dans chaque colonne ; les nouvelles arrivent d'au-dessus de la grille
    const chutes = {};
    for (let c = 0; c < TAILLE; c += 1) {
      const restent = [];
      for (let r = TAILLE - 1; r >= 0; r -= 1) {
        const i = r * TAILLE + c;
        if (!touchees.has(i)) restent.push([etat.grille[i], r]);
      }
      const manque = TAILLE - restent.length;
      for (let r = TAILLE - 1, k = 0; r >= 0; r -= 1, k += 1) {
        if (k < restent.length) {
          const [gemme, avant] = restent[k];
          etat.grille[r * TAILLE + c] = gemme;
          if (r !== avant) chutes[gemme.id] = r - avant;
        } else {
          const gemme = nouvelleGemme(etat);
          etat.grille[r * TAILLE + c] = gemme;
          chutes[gemme.id] = manque;   // part d'au-dessus de la grille
          gemme.neuve = true;
        }
      }
    }
    etapes.push({ retirees, grille: etat.grille.map(({ id, s, neuve }) => ({ id, s, neuve })), chutes, gains, charges, chaine });
    etat.grille.forEach((g) => { delete g.neuve; });
  }
  // Plus aucun échange possible : la grille est rebattue
  if (!etat.fin && !coupsPossibles(etat.grille).length) {
    etat.grille = remplir(etat);
    etapes.push({ rebattue: true, grille: etat.grille.slice(), chutes: {}, retirees: [], gains: {}, charges: {}, chaine: 0 });
  }
  return etapes;
}

const jaugePleine = (j) => j.cartes.some((c) => c.jauge >= c.max);

// Le tour passe à l'autre
function passer(etat) {
  etat.actif = 1 - etat.actif;
  etat.echanges = ECHANGES_PAR_TOUR;
  if (etat.actif === 0) etat.tour += 1;
}

// Ce que vaut une carte déclenchée (selon sa rareté) : { degats, soin, echange }
export function effetCarte(carte) {
  const { degats, soin, echange } = RARETE[carte.rarete] ?? RARETE.commune;
  return { degats, soin, echange };
}
// Le pouvoir en une phrase (l'écran du choix, les infobulles)
export function textePouvoir(rarete) {
  const { degats, soin, echange } = RARETE[rarete] ?? RARETE.commune;
  return [`${degats} dégâts`, soin && `+${soin} PV`, echange && '+1 échange'].filter(Boolean).join(' · ');
}

// ---------------------------------------------------------------------
//  Une action du combattant dont c'est le tour (qui : 0 ou 1) :
//    { t: 'echange', a, b }   { t: 'carte', k }   { t: 'fin' }
//  -> { etat (nouveau), etapes, carte?, tourFini } ; null si l'action n'est pas permise
// ---------------------------------------------------------------------
export function appliquer(etat, qui, action) {
  if (etat.fin || qui !== etat.actif || !action) return null;
  const e = copie(etat);
  const moi = e.joueurs[qui];
  if (action.t === 'echange') {
    const { a, b } = action;
    if (e.echanges <= 0 || !Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0
      || a >= e.grille.length || b >= e.grille.length || !voisins(a, b)) return null;
    const g = echangees(e.grille, a, b);
    if (!alignements(g).size) return null;
    e.grille = g;
    e.echanges -= 1;
    const etapes = resoudre(e);
    // Plus d'échange : le tour passe, sauf si une carte attend d'être déclenchée
    const tourFini = !e.fin && e.echanges === 0 && !jaugePleine(moi);
    if (tourFini) passer(e);
    return { etat: e, etapes, tourFini };
  }
  if (action.t === 'carte') {
    const carte = moi.cartes[action.k];
    if (!carte || carte.jauge < carte.max) return null;
    carte.jauge = 0;
    const effet = effetCarte(carte);
    moi.pv = Math.min(moi.pvMax, moi.pv + effet.soin);
    e.echanges += effet.echange;
    blesser(e, 1 - qui, effet.degats);
    const tourFini = !e.fin && e.echanges === 0 && !jaugePleine(moi);
    if (tourFini) passer(e);
    return { etat: e, etapes: [], carte: { k: action.k, ...effet }, tourFini };
  }
  if (action.t === 'fin') {
    passer(e);
    return { etat: e, etapes: [], tourFini: true };
  }
  return null;
}

// ---------------------------------------------------------------------
//  L'Ombre (l'IA) : déclenche ses cartes pleines, puis choisit son échange.
//  facile : souvent au hasard ; normal : le meilleur coup immédiat ; difficile : regarde aussi les
//  chaînes que provoquent les chutes et charge en priorité les jauges presque pleines.
// ---------------------------------------------------------------------
function valeurCoup(etat, qui, [a, b], profond) {
  const g = echangees(etat.grille, a, b);
  const touchees = alignements(g);
  const moi = etat.joueurs[qui];
  let v = 0;
  const compter = (cases, poids) => {
    for (const i of cases) {
      const sorte = SORTES[g[i].s];
      v += 0.1 * poids;
      // une gemme vaut la part d'attaque qu'elle charge à chacune de ses cartes de cette rareté
      // (rien pour une jauge déjà pleine)
      for (const c of moi.cartes) {
        if (c.gemme !== sorte || c.jauge >= c.max) continue;
        const e = effetCarte(c);
        v += ((10 * (e.degats + 0.6 * e.soin + 5 * e.echange)) / c.max) * (profond ? 1 + c.jauge / c.max : 1) * poids;
      }
    }
  };
  compter(touchees, 1);
  if (profond) {
    // les chutes, sans les gemmes à venir (inconnues) : les chaînes qu'on voit déjà
    const h = g.map((x, i) => (touchees.has(i) ? null : x));
    for (let c = 0; c < TAILLE; c += 1) {
      const col = [];
      for (let r = TAILLE - 1; r >= 0; r -= 1) if (h[r * TAILLE + c]) col.push(h[r * TAILLE + c]);
      for (let r = TAILLE - 1, k = 0; r >= 0; r -= 1, k += 1) h[r * TAILLE + c] = col[k] ?? { id: -1 - r * TAILLE - c, s: -1 - r * TAILLE - c };
    }
    compter(alignements(h), 1.25);
  }
  return v;
}

// Le prochain choix de l'Ombre (qui : sa place) ; h : une fonction de hasard (Math.random)
export function choixOmbre(etat, qui, difficulte = 'normal', h = Math.random) {
  const moi = etat.joueurs[qui];
  const pleine = moi.cartes.findIndex((c) => c.jauge >= c.max);
  if (pleine >= 0) return { t: 'carte', k: pleine };
  if (etat.echanges <= 0) return { t: 'fin' };
  const coups = coupsPossibles(etat.grille);
  if (!coups.length) return { t: 'fin' };
  if (difficulte === 'facile' && h() < 0.55) {
    const [a, b] = coups[Math.floor(h() * coups.length)];
    return { t: 'echange', a, b };
  }
  const profond = difficulte === 'difficile';
  let meilleur = coups[0], score = -Infinity;
  for (const coup of coups) {
    const v = valeurCoup(etat, qui, coup, profond) + h() * 0.3;   // un rien de hasard entre deux coups égaux
    if (v > score) { score = v; meilleur = coup; }
  }
  return { t: 'echange', a: meilleur[0], b: meilleur[1] };
}
