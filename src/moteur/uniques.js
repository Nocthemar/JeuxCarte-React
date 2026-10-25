// =====================================================================
//  Capacités uniques des grandes cartes (repris de l'ancien JS/jeu-cartes-moteur.js)
//  Différences voulues : Kaéliss ne se soigne que si elle inflige des dégâts (voir kaeliss) ;
//  octobre 2026, équilibrage d'après des parties simulées : Maître du Flot (Kaéliss) 2 dégâts pour
//  3 énergie, Marcheur d'Esprit (Dalek) endort au lieu de faire piocher, Plume du Codex 2 énergie,
//  et Vultoff gagne Sentence du Sans-Tête.
//
//  arrivee(p, qui, u, ev) : à la pose ;
//  actif : { nom, texte, cout (énergie), cible: 'ennemi'|'allie'|null, effet, utile (l'IA ne s'en
//          sert que si utile() est vrai) }. Une capacité active : de l'énergie, sans action, une fois par tour.
// =====================================================================
import { MILICIEN } from '../data/cartes.js';
import { destinInfo } from './cartes.js';
import { hasard, d20 } from './hasard.js';
import {
  autre, unites, trouver, placeLibre, instancier, blesser, soignerHeros, peutAttaquer,
} from './base.js';
import { appliquerDestin } from './destin.js';

export const UNIQUES = {
  kaeliss: {
    nom: 'Cœur Immuable',
    texte: 'À son arrivée, ton héros récupère 4 PV.',
    arrivee(p, qui, u, ev) { soignerHeros(p.camps[qui], 4, qui, ev); },
    actif: {
      nom: 'Maître du Flot', cout: 3, cible: 'ennemi',
      texte: '3 énergie : inflige 2 dégâts à une unité adverse ; Kaéliss récupère autant de PV.',
      effet(p, qui, u, cible, ev) {
        const t = trouver(p.camps[autre(qui)], cible.uid);
        // CORRIGÉ : Kaéliss récupère les PV des dégâts réellement infligés (rien si un Bouclier les absorbe)
        const inflige = blesser(p, autre(qui), t, 2, ev, qui);
        if (inflige <= 0) return;
        const avant = u.h;
        u.h = Math.min(u.hMax, u.h + inflige);
        if (u.h > avant) ev.touches.push({ camp: qui, uid: u.uid, valeur: u.h - avant, soin: true });
      },
    },
  },
  dalek: {
    nom: 'Seigneur des Rêves',
    texte: 'À son arrivée, endort l’unité adverse la plus forte : elle ne pourra ni attaquer ni défendre à son prochain tour.',
    arrivee(p, qui, u, ev) {
      const t = [...unites(p.camps[autre(qui)])].sort((x, y) => y.a - x.a)[0];
      if (t) { t.gele = 1; ev.touches.push({ camp: autre(qui), uid: t.uid, texte: 'Endormie', etat: true }); }
    },
    actif: {
      nom: 'Marcheur d’Esprit', cout: 2, cible: 'ennemi',
      // (avant : piocher 2 cartes ; l'Ombre s'en servait jusqu'à vider son Grimoire, et perdait)
      utile: (p, qui) => unites(p.camps[autre(qui)]).some((t) => !t.gele && t.a >= 3),
      texte: '2 énergie : endort une unité adverse : elle ne pourra ni attaquer ni défendre à son prochain tour.',
      effet(p, qui, u, cible, ev) {
        const t = trouver(p.camps[autre(qui)], cible.uid);
        if (t) { t.gele = 1; ev.touches.push({ camp: autre(qui), uid: t.uid, texte: 'Endormie', etat: true }); }
      },
    },
  },
  maitre: {
    nom: 'Coup du Sort',
    texte: 'À son arrivée, lance un Jet du Destin gratuit : deux d20, le meilleur est gardé.',
    arrivee(p, qui, u, ev) {
      const h = () => hasard(p);
      const de = Math.max(d20(h), d20(h));
      ev.destin = { de, info: destinInfo(de) };
      appliquerDestin(p, qui, de, ev);
    },
    actif: {
      nom: 'Plume du Codex', cout: 2, cible: null,
      utile: (p, qui) => !p.camps[qui].prochainCritique && unites(p.camps[qui]).some((x) => peutAttaquer(x) && x.a >= 3),
      texte: '2 énergie : ton prochain jet d’attaque est un 20 naturel.',
      effet(p, qui, u, cible, ev) {
        p.camps[qui].prochainCritique = true;
        ev.touches.push({ camp: qui, heros: true, texte: 'Prochain jet : 20 !', buff: true });
      },
    },
  },
  blizzard: {
    nom: 'Blizzard d’Erynedhal',
    texte: 'À son arrivée, gèle toutes les unités adverses : elles ne pourront ni attaquer ni défendre à leur prochain tour.',
    arrivee(p, qui, u, ev) {
      unites(p.camps[autre(qui)]).forEach((t) => { t.gele = 1; ev.touches.push({ camp: autre(qui), uid: t.uid, texte: 'Gelée', etat: true }); });
    },
  },
  // Garde de Pravorn : il ne recule jamais
  sentinelle: {
    nom: 'Sentinelle de Pravorn',
    texte: 'À son arrivée, prend la Garde : tant qu’il est en jeu, ton héros ne peut pas être attaqué.',
    arrivee(p, qui, u, ev) {
      if (!u.caps.includes('garde')) u.caps.push('garde');
      ev.touches.push({ camp: qui, uid: u.uid, texte: 'Garde', buff: true });
    },
  },
  // Gardes de Pravorn : l'escouade fait mur
  rangs: {
    nom: 'Rangs serrés',
    texte: 'À son arrivée, tes autres unités gagnent +1 Défense pour de bon.',
    arrivee(p, qui, u, ev) {
      unites(p.camps[qui]).filter((x) => x !== u).forEach((x) => { x.d += 1; ev.touches.push({ camp: qui, uid: x.uid, texte: '+1 Défense', buff: true }); });
    },
  },
  // Garde d'Erynedhal : la gardienne ne laisse aucune trace dans la neige
  neige: {
    nom: 'Pas dans la neige',
    texte: 'À son arrivée, gagne Esquive : la première attaque qui la vise à chaque tour adverse lance deux d20 et garde le plus bas.',
    arrivee(p, qui, u, ev) {
      if (!u.caps.includes('esquive')) u.caps.push('esquive');
      ev.touches.push({ camp: qui, uid: u.uid, texte: 'Esquive', buff: true });
    },
  },
  // Gardes d'Erynedhal : les gardiennes des cols repèrent la plus grande menace et la figent
  vigie: {
    nom: 'Vigie d’Erynedhal',
    texte: 'À son arrivée, gèle l’unité adverse la plus forte : elle ne pourra ni attaquer ni défendre à son prochain tour.',
    arrivee(p, qui, u, ev) {
      const t = [...unites(p.camps[autre(qui)])].sort((x, y) => y.a - x.a)[0];
      if (t) { t.gele = 1; ev.touches.push({ camp: autre(qui), uid: t.uid, texte: 'Gelée', etat: true }); }
    },
  },
  // Garde d'Aelkor : une armure forgée par les nains
  armure: {
    nom: 'Armure naine',
    texte: 'À son arrivée, gagne Bouclier : les premiers dégâts qu’il subit sont annulés.',
    arrivee(p, qui, u, ev) {
      u.bouclier = true;
      if (!u.caps.includes('bouclier')) u.caps.push('bouclier');
      ev.touches.push({ camp: qui, uid: u.uid, texte: 'Bouclier', buff: true });
    },
  },
  // Gardes d'Aelkor : les marteaux de la garde naine
  marteaux: {
    nom: 'Marteaux d’Aelkor',
    texte: 'À son arrivée, tes autres unités gagnent +1 Attaque pour de bon.',
    arrivee(p, qui, u, ev) {
      unites(p.camps[qui]).filter((x) => x !== u).forEach((x) => { x.a += 1; ev.touches.push({ camp: qui, uid: x.uid, texte: '+1 Attaque', buff: true }); });
    },
  },
  // Vultoff : la mort qu'il a refusée, il la rend
  sanstete: {
    nom: 'Le Sans-Tête',
    texte: 'À son arrivée, inflige 3 dégâts au héros adverse ; ton héros récupère autant de PV.',
    arrivee(p, qui, u, ev) {
      p.camps[autre(qui)].pv -= 3;
      p.camps[qui].stats.degats += 3;
      ev.touches.push({ camp: autre(qui), heros: true, valeur: 3 });
      soignerHeros(p.camps[qui], 3, qui, ev);
    },
    actif: {
      nom: 'Sentence du Sans-Tête', cout: 2, cible: 'ennemi',
      texte: '2 énergie : inflige 2 dégâts à une unité adverse ; si elle tombe, ton héros récupère 2 PV.',
      effet(p, qui, u, cible, ev) {
        const t = trouver(p.camps[autre(qui)], cible.uid);
        if (blesser(p, autre(qui), t, 2, ev, qui) > 0 && t.h <= 0) soignerHeros(p.camps[qui], 2, qui, ev);
      },
    },
  },
  // Les Veines : les Entités prennent forme et renforcent les tiens
  entites: {
    nom: 'Éveil des Entités',
    texte: 'À son arrivée, tes autres unités gagnent +1 Attaque et +1 Défense pour de bon, et ton héros récupère 4 PV.',
    arrivee(p, qui, u, ev) {
      unites(p.camps[qui]).filter((x) => x !== u).forEach((x) => {
        x.a += 1; x.d += 1;
        ev.touches.push({ camp: qui, uid: x.uid, texte: '+1 / +1', buff: true });
      });
      soignerHeros(p.camps[qui], 4, qui, ev);
    },
  },
  // Astris, Reine de Pravorn : un mot de la reine, et la milice accourt
  reine: {
    nom: 'Appel de la Couronne',
    texte: 'À son arrivée, un Milicien de la Couronne (2 / 1 / 2) rejoint ta rangée s’il reste une place.',
    arrivee(p, qui, u, ev) {
      const camp = p.camps[qui];
      const place = placeLibre(camp);
      if (place < 0) return;
      const m = instancier(p, MILICIEN);
      camp.terrain[place] = m;
      ev.renfort = m.uid;
    },
  },
  // Légendaires sans capacité propre
  presence: {
    nom: 'Présence',
    texte: 'À son arrivée, tes autres unités gagnent +1 Attaque pour de bon.',
    arrivee(p, qui, u, ev) {
      unites(p.camps[qui]).filter((x) => x !== u).forEach((x) => { x.a += 1; ev.touches.push({ camp: qui, uid: x.uid, texte: '+1 Attaque', buff: true }); });
    },
  },
  // Transcendantes sans capacité propre
  fracas: {
    nom: 'Entrée fracassante',
    texte: 'À son arrivée, inflige 2 dégâts à toutes les unités adverses.',
    arrivee(p, qui, u, ev) { unites(p.camps[autre(qui)]).forEach((t) => blesser(p, autre(qui), t, 2, ev, qui)); },
  },
};
