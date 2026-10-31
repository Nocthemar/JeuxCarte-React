// =====================================================================
//  Les Gemmes du Codex : les règles (sans affichage), pour le mode « Gemmes » (pages/Gemmes.jsx)
//
//  Deux combattants, mêmes PV au départ, une grille de gemmes partagée au milieu.
//  - À son tour, on échange deux gemmes voisines pour en aligner 3 ou plus de la même sorte
//    (un échange qui n'aligne rien est refusé et ne compte pas). 3 échanges par tour au plus (2 au tout premier
//    tour, pour que celui qui commence n'ait pas trop d'avance) ;
//    on peut finir son tour plus tôt.
//  - Les gemmes ne frappent pas : chaque combattant a 3 cartes, une par couleur (Sang, Ambre, Azur), et
//    aligner une couleur charge la jauge de SA carte de cette couleur. Plus on en aligne, plus ça charge :
//    4 gemmes = 4 parts de jauge, 3 gemmes = 3. L'Os et la Pierre ne chargent rien (ils préparent les chaînes).
//  - Les gemmes tombent, de nouvelles arrivent du haut : les alignements en chaîne chargent plus
//    (+25 % par maillon), sans coûter d'échange.
//  - Jauge pleine : on appuie sur la carte pour lancer son attaque sur l'adversaire (gratuitement, pendant
//    son tour). C'est la SEULE façon de lui faire perdre des PV. Sa force dépend de sa rareté, et chaque
//    couleur attaque à sa façon : Sang frappe fort (jauge longue), Ambre frappe et rend un échange,
//    Azur frappe moins mais soigne (jauge courte).
//  - La partie s'arrête quand un combattant tombe à 0 PV.
//
//  Le hasard vient d'une graine (moteur/hasard.js) : même graine + mêmes actions = même partie.
//  C'est ce qui permet de jouer en ligne : chacun fait tourner les règles et ne s'envoie que les actions.
// =====================================================================
import { hasard, nouvelleGraine } from './hasard.js';

export const TAILLE = 8;
export const PV_DEPART = 220;
export const ECHANGES_PAR_TOUR = 3;
// Les sortes de gemmes : les trois couleurs (dans cet ordre), puis les deux neutres
export const COULEURS = ['sang', 'ambre', 'azur'];
export const SORTES = [...COULEURS, 'os', 'pierre'];
// jauge : les gemmes à aligner pour remplir la jauge de la carte de cette couleur
export const COULEUR = {
  sang: { nom: 'Sang', jauge: 18, effet: 'Attaque lourde : une fois et demie sa force.' },
  ambre: { nom: 'Ambre', jauge: 14, effet: 'Attaque, et rend un échange ce tour-ci.' },
  azur: { nom: 'Azur', jauge: 10, effet: 'Attaque légère (trois quarts de sa force), et soigne la moitié de sa force.' },
};
// La force d'une carte déclenchée, selon sa rareté
export const FORCE = { commune: 24, eveillee: 28, mythique: 32, legendaire: 38, transcendante: 45 };
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
//  combattants : [{ nom, cartes: [{ n, image, rarete } ×3, dans l'ordre des COULEURS] }, …] (0 : celui qui commence)
// ---------------------------------------------------------------------
export function nouvellePartie(combattants, graine = nouvelleGraine()) {
  const etat = {
    graine: graine >>> 0, prochain: 0, tour: 1, actif: 0, echanges: ECHANGES_PAR_TOUR - 1, fin: null, grille: null,
    joueurs: combattants.map(({ nom, cartes }) => ({
      nom, pv: PV_DEPART, pvMax: PV_DEPART,
      cartes: COULEURS.map((couleur, k) => ({
        n: cartes[k]?.n ?? 'Carte', image: cartes[k]?.image ?? null,
        rarete: FORCE[cartes[k]?.rarete] ? cartes[k].rarete : 'commune',
        couleur, jauge: 0, max: COULEUR[couleur].jauge,
      })),
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
// { retirees: [id…], grille, chutes: { id: nombre de cases }, gains: { sorte: gemmes }, charges: { couleur: parts }, chaine }
// Les gemmes ne blessent personne : elles chargent les jauges des cartes du combattant qui joue.
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
    const charges = {};
    for (const couleur of COULEURS) {
      if (!gains[couleur]) continue;
      charges[couleur] = Math.round(gains[couleur] * (1 + BONUS_CHAINE * (chaine - 1)));
      const carte = moi.cartes[COULEURS.indexOf(couleur)];
      carte.jauge = Math.min(carte.max, carte.jauge + charges[couleur]);
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

// Ce que vaut une carte déclenchée : { degats, soin, echange }
export function effetCarte(carte) {
  const f = FORCE[carte.rarete] ?? FORCE.commune;
  if (carte.couleur === 'sang') return { degats: Math.round(f * 1.5), soin: 0, echange: 0 };
  if (carte.couleur === 'ambre') return { degats: f, soin: 0, echange: 1 };
  return { degats: Math.round(f * 0.75), soin: Math.round(f / 2), echange: 0 };
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
      const k = COULEURS.indexOf(sorte);
      if (k < 0) { v += 0.1 * poids; continue; }
      // une gemme vaut la part d'attaque qu'elle charge (rien si la jauge est déjà pleine)
      const c = moi.cartes[k];
      if (c.jauge >= c.max) { v += 0.1 * poids; continue; }
      const e = effetCarte(c);
      v += ((10 * (e.degats + 0.6 * e.soin + 5 * e.echange)) / c.max) * (profond ? 1 + c.jauge / c.max : 1) * poids;
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
