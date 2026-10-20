// =====================================================================
//  appliquerAction(etat, action) -> nouvel état
//
//  LA porte d'entrée du moteur : le duel contre l'IA, le mode Histoire, le mode en ligne et le
//  2 contre 2 font tous avancer la partie par cette seule fonction.
//  - L'état reçu n'est JAMAIS modifié : on travaille sur une copie (structuredClone), qu'on renvoie.
//    (React compare les objets : un nouvel état = l'écran se redessine.)
//  - nouvelEtat.evenements : ce qui vient de se passer, dans l'ordre (dé lancé, dégâts, morts…),
//    pour que l'écran puisse l'animer. Une action impossible donne [{ type: 'refus', qui }]
//    et l'état ne change pas.
//
//  Les actions (qui : 'joueur' ou 'adverse', le camp qui agit) :
//    { type: 'renvoi', qui, indices, membre? }  renvoi de main (membre : 0 ou 1 en 2 contre 2) ;
//                                               le 1er tour commence quand tous ont choisi
//    { type: 'jouer', qui, index, cible? }      jouer la carte n° index de la main
//    { type: 'attaque', qui, uid, cible }       cible : { camp, uid } ou { camp, heros: true }
//    { type: 'defendre', qui, uid }
//    { type: 'capacite', qui, uid, cible? }     capacité active d'une grande carte
//    { type: 'destin', qui }                    Jet du Destin
//    { type: 'defausser', qui, index }
//    { type: 'mediter', qui }  puis  { type: 'placer', qui, index }   (index null : ne rien changer)
//    { type: 'fin', qui }                       fin du tour ; le tour suivant commence aussitôt
//    { type: 'abandon', qui, raison? }
//    { type: 'ia', qui, difficulte }            l'Ombre choisit et joue UNE action ;
//                                               si elle n'a plus rien à faire, elle finit son tour
// =====================================================================
import {
  renvoiFini, renvoyerMain, renvoyerMainMembre, debutTour, finTour,
  jouer, attaquer, defendre, activer, destin, defausser, mediter, placerSous,
} from './partie.js';
import { autre } from './base.js';
import { ai } from './ia.js';

// Le début de tour, et son événement (en 2 contre 2 : le joueur de l'équipe qui prend la main)
function commencerTour(p) {
  const ev = debutTour(p);
  if (p.equipes) ev.membre = p.camps[ev.qui].membreActif;
  return ev;
}

// Exécute l'action sur p (la copie) ; renvoie la liste des événements, ou null si l'action est impossible
function executer(p, a) {
  const qui = a?.qui;
  if (qui !== 'joueur' && qui !== 'adverse') return null;

  switch (a.type) {
    case 'renvoi': {
      if (renvoiFini(p)) return null;
      const indices = Array.isArray(a.indices) ? a.indices : [];
      const ev = a.membre != null ? renvoyerMainMembre(p, qui, a.membre, indices) : renvoyerMain(p, qui, indices);
      if (!ev) return null;
      // Tout le monde a choisi : le premier tour commence
      return renvoiFini(p) ? [ev, commencerTour(p)] : [ev];
    }
    case 'fin':
      if (p.fini || !renvoiFini(p) || p.actif !== qui || p.camps[qui].meditation) return null;
      finTour(p);
      return [commencerTour(p)];
    case 'abandon':
      if (p.fini) return null;
      p.fini = autre(qui);
      return [{ type: 'abandon', qui, ...(a.raison ? { raison: a.raison } : {}) }];
    case 'ia': {
      if (p.fini || !renvoiFini(p) || p.actif !== qui) return null;
      const choix = ai(p, qui, a.difficulte ?? 'normal');
      if (!choix) {
        finTour(p);
        return [{ ...commencerTour(p), ia: { type: 'fin' } }];
      }
      const evs = executer(p, { ...choix, qui });
      return evs && evs.map((ev) => ({ ...ev, ia: choix }));
    }
    default: {
      if (!renvoiFini(p)) return null;
      let ev = null;
      if (a.type === 'jouer') ev = jouer(p, qui, a.index, a.cible ?? null);
      else if (a.type === 'attaque') ev = attaquer(p, qui, a.uid, a.cible);
      else if (a.type === 'destin') ev = destin(p, qui);
      else if (a.type === 'defendre') ev = defendre(p, qui, a.uid);
      else if (a.type === 'capacite') ev = activer(p, qui, a.uid, a.cible ?? null);
      else if (a.type === 'defausser') ev = defausser(p, qui, a.index);
      else if (a.type === 'mediter') ev = mediter(p, qui);
      else if (a.type === 'placer') ev = placerSous(p, qui, a.index ?? null);
      return ev ? [ev] : null;
    }
  }
}

export function appliquerAction(etat, action) {
  const p = structuredClone(etat);
  delete p.evenements;
  const evenements = executer(p, action);
  if (!evenements) return { ...etat, evenements: [{ type: 'refus', qui: action?.qui ?? null }] };
  p.evenements = evenements;
  return p;
}
