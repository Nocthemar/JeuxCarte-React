// =====================================================================
//  L'arbitre du 2 contre 2 en ligne (repris de l'ancien JS/jeu-cartes-equipes.js)
//  Un salon de quatre : l'hôte fait tourner la partie (cet arbitre) ; les quatre écrans, le sien compris,
//  ne font que rejouer les messages « jeu » de l'arbitre et lui envoyer leurs actions (« choix »).
//  Chaque écran voit la partie depuis sa place (vueEquipe) : son équipe en bas, sa propre main,
//  et son allié à côté de son héros.
//  Places : l'équipe de l'hôte est « joueur » pour le moteur (l'hôte en est le joueur 0),
//  l'autre équipe est « adverse ». Ordre des tours : A1, B1, A2, B2.
//
//  Chaque écran reçoit sa propre copie des messages, sur son canal privé (lib/salon.js, envoyerPrive) :
//  la partie vue de sa place, où les mains (et cartes piochées, Méditer) des trois autres sont masquées.
//  (L'ancien jeu envoyait les quatre mains à tout le monde ; chaque écran n'affichait que la sienne.)
//
//  creerArbitre({ sieges, decks, envoyerA })
//    sieges   : [{ discord_id, nom, avatar, camp, index }] (les quatre places)
//    decks    : les Grimoires (cartes choisies), dans l'ordre des places
//    envoyerA : (discord_id, message) => void : à l'écran de ce joueur (celui de l'hôte compris)
// =====================================================================
import { appliquerAction, creerPartieEquipes, construireDeck, miroir, alleger, nouvelleGraine, generateur } from '../../moteur/index.js';
import { ACTIONS_INVITE } from '../ligne.js';

// Masque ce qu'un siège ne doit pas voir : les mains et Méditer des trois autres joueurs.
// Dans un camp, les affaires du joueur qui a la main sont dans le camp lui-même, celles de l'autre dans
// camp.membres[i] (camp.membres[membreActif] est une ancienne copie : masquée aussi).
const cacher = (m) => {
  if (!m) return;
  if (Array.isArray(m.main)) m.main = m.main.map(() => ({ cache: true }));
  if (Array.isArray(m.meditation)) m.meditation = m.meditation.map(() => 0);
};
function pourSiege(msg, siege) {
  const m = JSON.parse(JSON.stringify(msg));
  for (const [nom, camp] of Object.entries(m.etat.camps)) {
    const actif = camp.membreActif ?? 0;
    if (!(nom === siege.camp && actif === siege.index)) cacher(camp);
    camp.membres?.forEach((x, i) => { if (!(nom === siege.camp && i === siege.index)) cacher(x); });
  }
  // Les cartes piochées (début de tour, renvoi de main) et celles de Méditer des autres joueurs
  m.evs = m.evs.map((ev) => {
    if (ev.qui === siege.camp && (ev.membre ?? siege.index) === siege.index) return ev;
    const e = { ...ev };
    if (e.pioche) e.pioche = { ...e.pioche, piochees: (e.pioche.piochees ?? []).map(() => ({ cache: true })) };
    if (e.type === 'mediter' && Array.isArray(e.cartes)) e.cartes = e.cartes.map(() => 0);
    return e;
  });
  return m;
}

export function creerArbitre({ sieges, decks, envoyerA }) {
  const a = { pid: crypto.randomUUID(), n: 0, historique: [], choixVus: new Set(), p: null };
  const siegesPublics = sieges.map(({ discord_id, nom, avatar, camp, index }) => ({ discord_id, nom, avatar, camp, index }));

  // L'état envoyé : les Grimoires masqués (seulement leur nombre de cartes), pas de graine du hasard
  function etat() {
    const e = alleger(a.p);
    delete e.evenements;
    delete e.graine;
    delete e.tirages;
    for (const camp of Object.values(e.camps)) {
      camp.deck = camp.deck.map(() => 0);
      camp.membres?.forEach((m) => { if (m) m.deck = m.deck.map(() => 0); });
    }
    return e;
  }
  // Un message à un siège (sa vue), ou aux quatre
  const envoyerAuSiege = (msg, s) => envoyerA(s.discord_id, pourSiege(msg, s));
  const envoyer = (msg) => sieges.forEach((s) => envoyerAuSiege(msg, s));
  function diffuser(evs) {
    const msg = { pid: a.pid, n: ++a.n, equipes: true, evs: evs.map(alleger), etat: etat() };
    a.historique.push(msg);
    if (a.historique.length > 60) a.historique.shift();
    envoyer(msg);
  }
  // Applique une action au moteur et diffuse ses événements ; membre : le joueur de l'équipe qui a agi
  function appliquer(action, membre = null) {
    const e = appliquerAction(a.p, action);
    a.p = e;
    diffuser(membre == null ? e.evenements : e.evenements.map((ev) => (ev.type === 'tour' || ev.membre != null ? ev : { ...ev, membre })));
  }

  a.demarrer = () => {
    const graine = nouvelleGraine();
    const h = generateur(graine ^ 0x9e3779b9);
    const premier = h() < 0.5 ? 'joueur' : 'adverse';
    const equipes = { joueur: [], adverse: [] };
    sieges.forEach((s, i) => { equipes[s.camp][s.index] = { nom: s.nom, deck: construireDeck(decks[i], h) }; });
    a.p = creerPartieEquipes(equipes, premier, { graine });
    diffuser([{ type: 'debut', sieges: siegesPublics }]);
  };

  // L'état complet (écran rechargé, messages perdus) : à un joueur (discord_id), ou aux quatre
  a.envoyerEtat = (discordId = null) => {
    if (!a.p) return;
    const msg = { pid: a.pid, n: a.n, equipes: true, etatComplet: true, sieges: siegesPublics, evs: [{ type: 'etat' }], etat: etat() };
    const s = sieges.find((x) => x.discord_id === discordId);
    if (s) envoyerAuSiege(msg, s); else envoyer(msg);
  };
  // Un joueur a manqué des messages (demande : { depuis, pid, de: son discord_id })
  a.renvoyer = (demande) => {
    const s = sieges.find((x) => x.discord_id === demande?.de);
    if (!a.p || !s) return;
    // Rien de manqué : rien à renvoyer ; quelques messages : on les renvoie dans l'ordre ;
    // beaucoup (ou un écran rechargé, sur un autre duel) : l'état de la partie d'un coup
    const manquants = demande?.pid === a.pid ? a.historique.filter((m) => m.n >= demande.depuis) : null;
    if (manquants && !manquants.length && demande.depuis > a.n) return;
    if (manquants?.length && manquants[0].n === demande.depuis && manquants.length <= 6) manquants.forEach((m) => envoyerAuSiege(m, s));
    else a.envoyerEtat(s.discord_id);
  };

  // Une équipe perd sur tapis vert (abandon, joueur parti)
  a.forfait = (camp, raison) => {
    if (!a.p || a.p.fini) return;
    appliquer({ type: 'abandon', qui: camp, raison });
  };

  // Une action reçue d'un écran : { pid, id, n, de: discord_id, a: { type, … } }
  a.recevoir = (c) => {
    const p = a.p;
    if (!p || p.fini || c?.pid !== a.pid || !c.id || a.choixVus.has(c.id)) return;
    const s = sieges.find((x) => x.discord_id === c.de);
    if (!s || !ACTIONS_INVITE.has(c.a?.type)) return;
    // L'équipe « adverse » voit la partie en miroir : ses cibles sont retournées dans le sens du moteur
    const act = s.camp === 'adverse' ? miroir(c.a) : { ...c.a };
    delete act.membre;
    delete act.raison;
    if (act.type === 'abandon') {
      a.choixVus.add(c.id);
      a.forfait(s.camp, `${s.nom} a abandonné : son équipe perd le duel.`);
      return;
    }
    if (act.type === 'renvoi') {
      a.choixVus.add(c.id);
      appliquer({ type: 'renvoi', qui: s.camp, membre: s.index, indices: Array.isArray(act.indices) ? act.indices : [] });
      return;
    }
    // Les autres actions : seulement le joueur qui a la main, sur le dernier état
    if (c.n !== a.n || p.actif !== s.camp || p.camps[s.camp].membreActif !== s.index) return;
    a.choixVus.add(c.id);
    appliquer({ ...act, qui: s.camp }, s.index);
  };

  a.fini = () => !!a.p?.fini;
  return a;
}
