// =====================================================================
//  La partie vue depuis une place (mode en ligne)
//  (repris de l'ancien JS/jeu-cartes-equipes.js : la partie « arbitre », qui parle au réseau,
//  viendra avec le mode en ligne)
//  - miroir : le plateau vu de l'autre côté (l'invité d'un 1 contre 1, l'équipe « adverse » du 2 contre 2)
//  - vueEquipe / vueEvEquipe : la partie et ses événements vus depuis une place du 2 contre 2
//  - alleger : une copie à envoyer, sans le superflu des fiches de cartes
// =====================================================================
import { membreDe } from './partie.js';

// Des fiches des cartes, on garde seulement ce que la face affiche
export const alleger = (x) => JSON.parse(JSON.stringify(x, (k, v) => (k === 'carte' && v
  ? { id: v.id, image: v.image, rarity: v.rarity, name: v.name, rank: v.rank, attack_1: v.attack_1, attack_2: v.attack_2 }
  : v)));

// Le plateau vu de l'autre côté : « joueur » et « adverse » échangés partout
const ECHANGE = { joueur: 'adverse', adverse: 'joueur' };
export function miroir(x) {
  if (Array.isArray(x)) return x.map(miroir);
  if (!x || typeof x !== 'object') return x;
  const o = {};
  for (const [k, v] of Object.entries(x)) {
    if (k === 'camps' && v) o.camps = { joueur: miroir(v.adverse), adverse: miroir(v.joueur) };
    else if ((k === 'renvoi' || k === 'renvoiSieges') && v && typeof v === 'object' && !Array.isArray(v)) {
      o[k] = { joueur: miroir(v.adverse), adverse: miroir(v.joueur) };
    }
    else if (['qui', 'camp', 'actif', 'fini'].includes(k) && ECHANGE[v]) o[k] = ECHANGE[v];
    else o[k] = miroir(v);
  }
  return o;
}

// La partie vue depuis une place (camp du moteur, joueur 0 ou 1 de l'équipe)
//  - camps.joueur : mon équipe, avec MES affaires (main, énergie, actions…) même quand mon allié joue
//  - moiActif     : c'est à moi de jouer (pas seulement à mon équipe)
//  - nomActif     : le joueur qui a la main
//  - allie        : { nom, cartes, actif } ; ennemis : [{ nom, cartes, actif }, …]
//  - renvoi       : { joueur: mon renvoi est fait, adverse: celui des trois autres aussi }
export function vueEquipe(etat, monCamp, monIndex) {
  const e = monCamp === 'adverse' ? miroir(etat) : JSON.parse(JSON.stringify(etat));
  const nous = e.camps.joueur;
  const eux = e.camps.adverse;
  const actifNous = nous.membreActif;
  const resume = (camp, i) => {
    const m = membreDe(camp, i);
    return { nom: m.nom, cartes: m.main?.length ?? 0, actif: e.actif === (camp === nous ? 'joueur' : 'adverse') && camp.membreActif === i };
  };
  const autreIndex = 1 - monIndex;
  e.allie = resume(nous, autreIndex);
  e.ennemis = [0, 1].map((i) => resume(eux, i));
  e.nomActif = e.actif === 'joueur' ? membreDe(nous, actifNous).nom : eux.nom;
  e.moiActif = e.actif === 'joueur' && actifNous === monIndex;
  Object.assign(nous, membreDe(nous, monIndex));
  nous.nom = nous.nomEquipe ?? nous.nom;
  eux.nom = eux.nomEquipe ?? eux.nom;
  nous.membres = nous.membres?.map(() => null);
  eux.main = eux.main.map(() => ({ cache: true }));
  eux.membres = eux.membres?.map(() => null);
  const sieges = e.renvoiSieges;
  if (sieges) {
    e.renvoi = {
      joueur: !!sieges.joueur[monIndex],
      adverse: !!sieges.joueur[autreIndex] && sieges.adverse.every(Boolean),
    };
  }
  return e;
}

// Un événement vu depuis une place ; coequipier : c'est mon allié qui a agi
export function vueEvEquipe(ev, monCamp, monIndex) {
  const e = monCamp === 'adverse' ? miroir(ev) : { ...ev };
  if (e.qui === 'joueur' && e.membre != null && e.membre !== monIndex) e.coequipier = true;
  return e;
}
