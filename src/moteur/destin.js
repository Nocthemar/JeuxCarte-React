// =====================================================================
//  L'effet d'un Jet du Destin (aussi lancé par le Maître du Jeu à son arrivée)
//  (repris de l'ancien JS/jeu-cartes-moteur.js, sans changement)
// =====================================================================
import { ENERGIE_MAX } from '../data/regles.js';
import { MILICIEN } from '../data/cartes.js';
import { destinInfo } from './cartes.js';
import { hasard, auHasard } from './hasard.js';
import { autre, unites, placeLibre, instancier, piocher, blesser, soignerHeros } from './base.js';

export function appliquerDestin(p, qui, de, ev) {
  const camp = p.camps[qui];
  const adv = autre(qui);
  const info = destinInfo(de);
  const h = () => hasard(p);
  switch (info.q) {
    case 'malediction':
      camp.pv -= 3;
      ev.touches.push({ camp: qui, heros: true, valeur: 3 });
      break;
    case 'trahison': {
      const u = auHasard(unites(camp), h);
      if (u) blesser(p, qui, u, 2, ev, null);
      break;
    }
    case 'brouillard': {
      if (camp.main.length) {
        const [carte] = camp.main.splice(Math.floor(h() * camp.main.length), 1);
        camp.tombeau.push(carte);
        ev.touches.push({ camp: qui, heros: true, texte: `${carte.n} part au Tombeau`, etat: true });
      }
      break;
    }
    case 'presage':
      camp.bonusDe = (camp.bonusDe ?? 0) - 3;
      ev.touches.push({ camp: qui, heros: true, texte: '-3 au prochain jet', etat: true });
      break;
    case 'eclair': {
      const u = auHasard(unites(p.camps[adv]), h);
      if (u) blesser(p, adv, u, 3, ev, qui);
      break;
    }
    case 'fortune':
      camp.energie = Math.min(ENERGIE_MAX + 2, camp.energie + 2);
      ev.touches.push({ camp: qui, heros: true, texte: '+2 énergie', buff: true });
      break;
    case 'souffle':
      camp.actions += 1;
      ev.touches.push({ camp: qui, heros: true, texte: '+1 action', buff: true });
      break;
    case 'armure':
      unites(camp).forEach((u) => { u.d += 1; ev.touches.push({ camp: qui, uid: u.uid, texte: '+1 Défense', buff: true }); });
      break;
    case 'tempete':
      unites(p.camps[adv]).forEach((u) => blesser(p, adv, u, 1, ev, qui));
      break;
    case 'prophetie':
      camp.bonusDe = (camp.bonusDe ?? 0) + 5;
      ev.touches.push({ camp: qui, heros: true, texte: '+5 au prochain jet', buff: true });
      break;
    case 'chatiment':
      p.camps[adv].pv -= 3;
      camp.stats.degats += 3;
      ev.touches.push({ camp: adv, heros: true, valeur: 3 });
      break;
    case 'elan':
      unites(camp).filter((u) => u.aAttaque && !u.bloquee).forEach((u) => {
        u.aAttaque = false; u.defend = false; u.prete = true;
        ev.touches.push({ camp: qui, uid: u.uid, texte: 'De nouveau prête !', buff: true });
      });
      break;
    case 'soin':
      soignerHeros(camp, 4, qui, ev);
      break;
    case 'pioche':
      ev.pioche = piocher(camp, 2);
      break;
    case 'renfort': {
      const place = placeLibre(camp);
      if (place >= 0) {
        const u = instancier(p, MILICIEN);
        camp.terrain[place] = u;
        ev.renfort = u.uid;
      } else ev.complet = true;
      break;
    }
    case 'benediction':
    case 'grace': {
      const bonus = info.q === 'grace' ? 2 : 1;
      unites(camp).forEach((u) => {
        u.a += bonus; u.h += bonus; u.hMax += bonus;
        ev.touches.push({ camp: qui, uid: u.uid, valeur: bonus, buff: true });
      });
      if (info.q === 'grace') soignerHeros(camp, 3, qui, ev);
      break;
    }
    default: break;
  }
  return info;
}
