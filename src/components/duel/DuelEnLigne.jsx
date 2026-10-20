// =====================================================================
//  Un duel en ligne (ancien JS/jeu-cartes.js, « l'hôte fait tourner la partie » et « l'invité rejoue
//  les événements de l'hôte »). C'est un « pilote » de la table (TableDuel), comme DuelSolo.
//
//  - L'HÔTE (celui qui a créé le salon) fait tourner le moteur : ses actions et celles de l'invité
//    (reçues par le salon) passent par appliquerAction ; chaque résultat est animé chez lui et envoyé
//    à l'invité : { pid, n, evs, etat } (n : numéro du message, pour les rejouer dans l'ordre).
//  - L'INVITÉ ne fait que rejouer ces messages, vus de son côté (miroir) ; ses actions partent à l'hôte.
//    Un message manqué ? Il redemande la suite ; trop loin derrière ? L'hôte renvoie l'état complet.
//  - En 2 CONTRE 2, les quatre écrans (celui de l'hôte compris) rejouent comme l'invité les messages de
//    l'arbitre (lib/duel/arbitre.js, chez l'hôte), chacun depuis sa place (vueEquipe : son équipe en bas,
//    sa main, son allié à côté de son héros).
//  - Un adversaire qui disparaît (onglet en arrière-plan, connexion coupée) a 45 s pour revenir.
//  - À la fin : l'XP du Pass (mode « ami »), le résultat du classé, « Revanche » ou « Quitter le salon ».
//
//  duel : 1 contre 1 : { role: 'hote' | 'invite', adversaire, cartes, grimoireAdverse (hôte), premier (invité : son premier message) }
//         2 contre 2 : { role: 'equipe', place: { camp, index }, sieges, premier, local (l'arbitre est chez moi) }
//  ligne : le salon (lib/duel/useLigne.js)
// =====================================================================
import { useEffect, useRef, useState } from 'react';
import TableDuel from './TableDuel.jsx';
import {
  appliquerAction, creerPartie, construireDeck, renvoiFini, miroir, vueEquipe, vueEvEquipe, nouvelleGraine, generateur,
} from '../../moteur/index.js';
import { useAuth } from '../../lib/auth.js';
import { useNotifier } from '../../lib/notification.js';
import { useScene } from '../../lib/duel/useScene.js';
import {
  etatPourInvite, evenementPourInvite, resultatClasse, ACTIONS_INVITE, DELAI_RETOUR, SILENCE_MAX, RENVOI_MAX,
} from '../../lib/ligne.js';
import { demanderTicketPass, finirPartiePass, RAISONS_PASS } from '../../lib/pass.js';
import { pause } from '../../lib/pause.js';
import { jouerSon } from '../../lib/son.js';

const maintenant = () => Date.now();

// La partie de l'hôte : son Grimoire et celui de l'invité, mélangés ; le premier joueur au hasard
function partieHote(duel, joueur) {
  const graine = nouvelleGraine();
  const h = generateur(graine ^ 0x9e3779b9);
  const premier = h() < 0.5 ? 'joueur' : 'adverse';
  return creerPartie(construireDeck(duel.cartes, h), construireDeck(duel.grimoireAdverse, h),
    joueur?.username ?? 'Aventurier', duel.adversaire.nom, premier, { graine });
}

// Pourquoi le duel s'est fini, d'après ses derniers événements (un abandon, un départ…)
function raisonDe(evs, e) {
  const ab = evs.find((x) => x.type === 'abandon');
  if (!ab) return '';
  if (ab.raison) return ab.raison;
  return ab.qui === 'joueur' ? 'Tu as abandonné le duel.' : `${e.camps.adverse.nom} a abandonné le duel.`;
}

// Ce que je vois d'un message de l'arbitre ou de l'hôte : depuis ma place (2 contre 2), ou en miroir (invité)
const lireEtat = (duel, m) => (duel.role === 'equipe' ? vueEquipe(m.etat, duel.place.camp, duel.place.index) : miroir(m.etat));
const lireEvs = (duel, m) => (m.evs ?? []).map((ev) => (duel.role === 'equipe' ? vueEvEquipe(ev, duel.place.camp, duel.place.index) : miroir(ev)));

export default function DuelEnLigne({ duel, ligne, salon, outils, surRevanche, surQuitter }) {
  const { joueur } = useAuth();
  const notifier = useNotifier();
  const hote = duel.role === 'hote';
  const { etat, partie, actif, afficher, animerEvenements } = useScene(() => (hote ? partieHote(duel, joueur) : lireEtat(duel, duel.premier)));
  // occupe : une action ou une animation est en cours ; jeton : change quand la main me revient
  const [verrou, setVerrou] = useState({ occupe: false, jeton: 0 });
  const [renvoiEnvoye, setRenvoiEnvoye] = useState(false);
  const [fin, setFin] = useState(null);

  // Chez l'hôte : le numéro du duel (pid), des messages (n), leur historique, les choix déjà traités
  const [idDuel] = useState(() => (hote ? crypto.randomUUID() : duel.premier.pid));
  const maitre = useRef({ n: 0, historique: [], choixVus: new Set() });
  // Chez l'invité : le dernier message joué, la dernière activité, l'action envoyée (renvoyée si elle se perd)
  const invite = useRef({ dernier: hote ? 0 : duel.premier.n, activite: maintenant(), choixEnvoye: null, renvoi: null, abandon: null });
  const cleDuel = useRef(duel.adversaire?.cle ?? null);   // la connexion de l'adversaire au début du duel
  const absence = useRef(null);
  const absences = useRef(new Map());   // 2 contre 2 : discord_id -> minuteur d'un joueur parti
  const clesSieges = useRef({});        // 2 contre 2 : discord_id -> sa connexion pendant le duel
  const ticket = useRef(null);
  const abandon = useRef(false);
  const finie = useRef(false);
  const occupe = useRef(false);
  useEffect(() => { occupe.current = verrou.occupe; }, [verrou.occupe]);

  // Les actions et l'animation passent une à la fois, dans l'ordre d'arrivée
  const file = useRef(Promise.resolve());
  const enFile = (fn) => { file.current = file.current.then(fn).catch(console.error); };

  const verrouiller = () => setVerrou((v) => ({ ...v, occupe: true }));
  const deverrouiller = () => setVerrou((v) => ({ occupe: false, jeton: v.jeton + 1 }));

  // ---- Fin du duel : écran de fin, XP du Pass, résultat du classé
  const terminer = async (raison = '', finiForce = null) => {
    if (finie.current) return;
    finie.current = true;
    verrouiller();
    oublierAbsence();
    await pause(600);
    if (!actif.current) return;
    const e = partie.current;
    const fini = finiForce ?? e.fini;
    const gagne = fini === 'joueur';
    jouerSon(gagne ? 'fanfare' : 'tonnerre');
    setFin({
      gagne, egalite: fini === 'egalite', raison, stats: e.camps.joueur.stats, tour: e.tour, nomAdverse: e.camps.adverse.nom,
      supplement: '', pass: null, classe: null,
    });
    // Partie classée : le résultat est déclaré au serveur (une revanche dans ce salon n'est plus classée)
    if (ligne.prendreClasse(salon.code)) {
      setFin((f) => ({ ...f, classe: { morceaux: [duel.role === 'equipe' ? 'Partie classée : en attente du résultat de l’équipe adverse…' : 'Partie classée : en attente du résultat de ton adversaire…'] } }));
      resultatClasse(salon.code, gagne).then((classe) => { if (actif.current) setFin((f) => ({ ...f, classe })); });
    }
    // L'XP du Pass (un abandon ne rapporte rien)
    if (!ticket.current || abandon.current) return;
    const t = ticket.current;
    ticket.current = null;
    const r = await finirPartiePass(t, gagne);
    if (!r || !actif.current) return;
    let pass = null;
    if (r.xp > 0) pass = { texte: `+${r.xp} XP de pass${r.or > 0 ? ` · +${r.or} or` : ''}${r.raison === 'plafond' ? ' (plafond du jour atteint)' : ''}` };
    else if (RAISONS_PASS[r.raison]) pass = { texte: RAISONS_PASS[r.raison], vide: true };
    if (pass) setFin((f) => ({ ...f, pass }));
  };

  // Après un message ou une action : la fin, ou la main de nouveau à quelqu'un
  const apres = (e, evs) => {
    if (!actif.current) return;
    if (e.fini) return terminer(raisonDe(evs, e));
    deverrouiller();
  };

  // =====================================================================
  //  L'hôte
  // =====================================================================
  // Envoie le résultat d'une action à l'invité
  const diffuser = (evs, e) => {
    const msg = { pid: idDuel, n: ++maitre.current.n, evs: evs.map(evenementPourInvite), etat: etatPourInvite(e) };
    maitre.current.historique.push(msg);
    ligne.envoyer('jeu', msg);
  };
  // L'état complet, sans animation : pour l'invité qui a manqué trop de messages ou rechargé la page
  const envoyerEtat = () => {
    if (partie.current.fini) return;
    ligne.envoyer('jeu', { pid: idDuel, n: maitre.current.n, etatComplet: true, evs: [{ type: 'etat' }], etat: etatPourInvite(partie.current) });
  };
  // Applique une action (de l'hôte ou de l'invité) au moteur, l'envoie à l'invité, puis l'anime
  const appliquer = async (action) => {
    if (!actif.current || finie.current) return;
    const e = appliquerAction(partie.current, action);
    diffuser(e.evenements, e);   // une action refusée est envoyée aussi : elle débloque l'invité
    await animerEvenements(e.evenements, e);
    apres(e, e.evenements);
  };
  // Action reçue de l'invité (dans son sens à lui : retournée en miroir)
  const traiterChoix = (c) => {
    const p = partie.current;
    if (c?.pid !== idDuel || !c.id || maitre.current.choixVus.has(c.id) || p.fini || finie.current) return;
    const type = c.a?.type;
    if (!ACTIONS_INVITE.has(type)) return;
    // Action périmée ou hors de son tour (l'abandon et le renvoi de main, eux, se font hors tour)
    const horsTour = type === 'abandon' || (type === 'renvoi' && !p.renvoi?.adverse);
    if (!horsTour && (c.n !== maitre.current.n || p.actif !== 'adverse')) return;
    maitre.current.choixVus.add(c.id);
    const a = { ...miroir(c.a), qui: 'adverse' };
    delete a.membre;
    delete a.raison;
    enFile(() => appliquer(a));
  };
  // L'invité a manqué des messages : on les renvoie dans l'ordre, ou (s'il en manque beaucoup) l'état d'un coup
  const renvoyerManquants = (c) => {
    const manquants = c?.pid === idDuel ? maitre.current.historique.filter((m) => m.n >= c.depuis) : null;
    if (manquants && manquants.length <= RENVOI_MAX) manquants.forEach((m) => ligne.envoyer('jeu', m));
    else envoyerEtat();
  };

  // =====================================================================
  //  L'invité
  // =====================================================================
  const envoyerAuMaitre = (c) => ligne.versMaitre({ ...c, de: joueur?.discord_id ?? null });
  const demanderSuite = () => ligne.demanderSuite(invite.current.dernier + 1, idDuel);
  const envoyerChoix = (a) => {
    const c = { pid: idDuel, id: crypto.randomUUID(), n: invite.current.dernier, a };
    invite.current.choixEnvoye = c;
    invite.current.activite = maintenant();
    envoyerAuMaitre(c);
  };
  // Un message de l'hôte, rejoué dans l'ordre (sans trou ni doublon)
  const recevoirJeu = (c) => {
    const inv = invite.current;
    if (c?.pid !== idDuel || !!c.equipes !== (duel.role === 'equipe')) return;   // un autre duel
    if (c.etatComplet) {
      if (c.n < inv.dernier) return;   // plus ancien que ce qu'on a déjà
      Object.assign(inv, { dernier: c.n, activite: maintenant(), choixEnvoye: null });
      enFile(async () => {
        if (!actif.current || finie.current) return;
        const e = lireEtat(duel, c);
        afficher(e);
        apres(e, []);
      });
      return;
    }
    if (c.n <= inv.dernier) return;
    if (c.n > inv.dernier + 1) { demanderSuite(); return; }
    Object.assign(inv, { dernier: c.n, activite: maintenant(), choixEnvoye: null });   // l'hôte a avancé : l'action envoyée a été traitée
    enFile(async () => {
      if (!actif.current || finie.current) return;
      const evs = lireEvs(duel, c);
      const e = lireEtat(duel, c);
      await animerEvenements(evs, e);
      invite.current.activite = maintenant();
      apres(e, evs);
    });
  };

  // =====================================================================
  //  Commun : l'adversaire part, revient, ou recharge sa page
  // =====================================================================
  const oublierAbsence = () => {
    clearTimeout(absence.current);
    absence.current = null;
    for (const t of absences.current.values()) clearTimeout(t);
    absences.current.clear();
  };
  const attendreRetour = (nom) => {
    notifier(`${nom} s'est déconnecté : on l'attend encore ${DELAI_RETOUR / 1000} secondes…`, 'erreur');
    absence.current = setTimeout(() => {
      absence.current = null;
      if (ligne.adversaire() || partie.current.fini || finie.current) return;
      if (hote) enFile(() => appliquer({ type: 'abandon', qui: 'adverse', raison: `${nom} a quitté le duel.` }));
      else terminer(`${nom} a quitté le duel.`, 'joueur');
    }, DELAI_RETOUR);
  };
  // 2 contre 2 : sans l'hôte, la partie s'arrête ; son équipe perd
  const finSansHote = (raison) => terminer(raison, duel.place.camp === 'joueur' ? 'adverse' : 'joueur');
  const joueurParti = (x) => {
    absences.current.delete(x.discord_id);
    if (partie.current.fini || finie.current) return;
    const arbitre = ligne.arbitre();
    if (arbitre) arbitre.forfait(x.camp, `${x.nom} a quitté le duel : son équipe perd.`);
    else finSansHote(`${x.nom} (l'hôte) a quitté le duel : son équipe perd.`);
  };
  // Un joueur a quitté le salon en plein 2 contre 2 : on l'attend un peu. L'hôte surveille les trois
  // autres (un départ fait perdre son équipe) ; les autres surveillent l'hôte (sans lui, plus de partie)
  const suivreAbsences = (dedans) => {
    const ici = new Map(dedans.map((x) => [x.discord_id, x]));
    const arbitre = ligne.arbitre();
    for (const x of duel.sieges) {
      if (x.discord_id === joueur?.discord_id) continue;
      const estHoteSiege = x.camp === 'joueur' && x.index === 0;
      if (!arbitre && !estHoteSiege) continue;
      const present = ici.get(x.discord_id);
      if (!present) {
        if (!absences.current.has(x.discord_id)) {
          notifier(`${x.nom} s'est déconnecté : on l'attend encore ${DELAI_RETOUR / 1000} secondes…`, 'erreur');
          absences.current.set(x.discord_id, setTimeout(() => joueurParti(x), DELAI_RETOUR));
        }
        continue;
      }
      const revenu = absences.current.has(x.discord_id);
      if (revenu) {
        clearTimeout(absences.current.get(x.discord_id));
        absences.current.delete(x.discord_id);
        notifier(`${x.nom} est de retour.`);
      }
      const cleAvant = clesSieges.current[x.discord_id];
      clesSieges.current[x.discord_id] = present.cle;
      const recharge = !!cleAvant && cleAvant !== present.cle;
      // L'hôte a rechargé sa page : la partie (qu'il faisait tourner) est perdue
      if (recharge && estHoteSiege && !arbitre) return finSansHote(`${x.nom} (l'hôte) a rechargé la page : le duel est interrompu.`);
      if ((revenu || recharge) && arbitre) arbitre.envoyerEtat(x.discord_id);
    }
  };

  const surPresence = ({ adversaire, avant, dedans }) => {
    if (partie.current.fini || finie.current) return;
    if (duel.role === 'equipe') { suivreAbsences(dedans ?? []); return; }
    if (!adversaire) {
      if (!absence.current && avant) attendreRetour(avant.nom);
      return;
    }
    const revenu = !!absence.current;
    oublierAbsence();
    if (!cleDuel.current) cleDuel.current = adversaire.cle;
    const autreOnglet = adversaire.cle !== cleDuel.current;   // il a rechargé sa page
    if (autreOnglet && !hote) {
      // L'hôte a rechargé sa page : la partie (qu'il faisait tourner) est perdue
      terminer(`${adversaire.nom} a rechargé la page : le duel est interrompu.`, 'joueur');
      return;
    }
    if (revenu) notifier(`${adversaire.nom} est de retour.`);
    if ((revenu || autreOnglet) && hote) {
      cleDuel.current = adversaire.cle;
      envoyerEtat();   // messages perdus pendant l'absence, ou page rechargée : il retrouve la partie
    }
  };

  // Le salon parle au duel par ces deux fonctions (gardées à jour dans une ref)
  const recepteur = useRef(null);
  useEffect(() => {
    recepteur.current = {
      surMessage: (evenement, contenu) => {
        if (!hote) { if (evenement === 'jeu') recevoirJeu(contenu); return; }
        if (evenement === 'choix') traiterChoix(contenu);
        else if (evenement === 'renvoi') renvoyerManquants(contenu);
      },
      surPresence,
    };
  });

  // Au début du duel : le ticket du Pass, l'annonce à l'invité, le branchement au salon, la veille de l'invité
  const demarre = useRef(false);
  useEffect(() => {
    if (!demarre.current) {
      demarre.current = true;
      ticket.current = demanderTicketPass({ mode: 'ami', salon: salon.code });
      if (hote) diffuser([{ type: 'debut' }], partie.current);
      else enFile(async () => apres(partie.current, []));   // l'état reçu (un duel déjà fini ?)
    }
    const debrancher = ligne.brancher({
      surMessage: (evenement, contenu) => recepteur.current?.surMessage(evenement, contenu),
      surPresence: (x) => recepteur.current?.surPresence(x),
    });
    // Veille de l'invité : si rien ne bouge depuis un moment alors qu'il attend l'hôte
    // (connexion coupée un instant, message perdu…), il renvoie son action et redemande la suite
    const veille = hote || duel.local ? null : setInterval(() => {
      const e = partie.current;
      const inv = invite.current;
      if (!e || e.fini || finie.current) return;
      // Mon abandon n'a pas encore été pris en compte : on le renvoie (même si d'autres messages arrivent)
      if (inv.abandon && maintenant() - inv.abandon.envoye > SILENCE_MAX) {
        inv.abandon.envoye = maintenant();
        envoyerAuMaitre(inv.abandon.c);
      }
      if (e.actif === 'joueur' && renvoiFini(e) && !occupe.current) return;   // c'est à lui de jouer
      if (maintenant() - inv.activite < SILENCE_MAX) return;
      inv.activite = maintenant();
      if (inv.renvoi && !e.renvoi?.joueur) envoyerAuMaitre(inv.renvoi);   // renvoi de main perdu
      if (inv.choixEnvoye) envoyerAuMaitre(inv.choixEnvoye);
      demanderSuite();
    }, 1000);
    return () => { debrancher(); clearInterval(veille); };
    // (une seule fois par duel : un nouveau duel est un nouveau composant)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => clearTimeout(absence.current), []);

  // ---- Mes gestes
  const surAction = (action) => {
    verrouiller();
    if (hote) enFile(() => appliquer({ ...action, qui: 'joueur' }));
    else envoyerChoix(action);
  };
  const surRenvoi = (indices) => {
    setRenvoiEnvoye(true);
    if (hote) { enFile(() => appliquer({ type: 'renvoi', qui: 'joueur', indices })); return; }
    // L'hôte applique le renvoi ; on attend la suite
    invite.current.renvoi = { pid: idDuel, id: crypto.randomUUID(), n: invite.current.dernier, a: { type: 'renvoi', indices } };
    envoyerAuMaitre(invite.current.renvoi);
  };
  const abandonner = () => {
    if (etat.fini || fin || !confirm('Abandonner le duel ?')) return;
    abandon.current = true;
    if (hote) enFile(() => appliquer({ type: 'abandon', qui: 'joueur' }));
    else {
      // (renvoyé par la veille tant que le duel n'est pas fini : le message a pu se perdre)
      const c = { pid: idDuel, id: crypto.randomUUID(), n: invite.current.dernier, a: { type: 'abandon' } };
      invite.current.abandon = { c, envoye: maintenant() };
      envoyerAuMaitre(c);
    }
  };

  // En face : l'adversaire (1 contre 1), ou le joueur adverse qui a la main (2 contre 2 ; sinon le premier)
  const avatarAdverse = duel.role === 'equipe'
    ? duel.sieges.find((x) => x.camp !== duel.place.camp && x.index === (etat.camps.adverse.membreActif ?? 0))?.avatar ?? null
    : duel.adversaire?.avatar ?? null;
  const enCours = renvoiFini(etat) && !etat.fini && !fin;
  const monTour = !verrou.occupe && enCours && etat.actif === 'joueur' && etat.moiActif !== false;
  const consigneAttente = enCours && etat.actif !== 'joueur' ? `${etat.nomActif ?? etat.camps.adverse.nom} joue…` : '';

  return (
    <TableDuel etat={etat} jeton={verrou.jeton} monTour={monTour} consigneAttente={consigneAttente}
      avatars={{ joueur: joueur?.avatar_url ?? null, adverse: avatarAdverse }} surAction={surAction}
      renvoi={{ ouvert: !renvoiFini(etat) && !etat.fini && !fin, attente: renvoiEnvoye || !!etat.renvoi?.joueur }} surRenvoi={surRenvoi}
      fin={fin} boutonsFin={[{ texte: 'Revanche', surClic: surRevanche }, { texte: 'Quitter le salon', surClic: surQuitter }]}
      outils={outils} surAbandon={abandonner} />
  );
}
