// =====================================================================
//  Un duel contre l'Ombre, ou un niveau du mode Histoire (ancien déroulé « solo » de JS/jeu-cartes.js)
//  C'est le « pilote » du duel : la table (TableDuel) affiche et reçoit mes actions ; ici, elles sont
//  appliquées au moteur, animées (useScene), puis l'Ombre joue les siennes, une à une.
//
//  Arbitré par le serveur (lib/duelServeur.js) : au début, le serveur tire la graine du hasard et note le
//  Grimoire et l'élan de l'Ombre ; chacune de mes actions est notée dans un journal ; à la fin, l'arbitre
//  rejoue la partie avec ce journal et donne lui-même les récompenses (XP du Pass, or, niveau du mode Histoire).
//  Serveur injoignable au début (hors ligne) : duel d'entraînement, sans récompense.
//
//  config : { cartes (le Grimoire choisi), difficulte, catalogue, histoire? }
//    histoire : { chapitre, niveau } pour un niveau du mode Histoire (adversaire, deck, PV, terrain du niveau)
// =====================================================================
import { useEffect, useRef, useState } from 'react';
import TableDuel from './TableDuel.jsx';
import { appliquerAction, preparerSolo, tourOmbre, actionJournal, nouvelleGraine } from '../../moteur/index.js';
import { useAuth } from '../../lib/auth.js';
import { useScene } from '../../lib/duel/useScene.js';
import { commencerDuel, terminerDuel } from '../../lib/duelServeur.js';
import { RAISONS_PASS } from '../../lib/pass.js';
import { garderResultatHistoire, texteRecompense } from '../../lib/histoire.js';
import { cleCarte } from '../../lib/grimoire.js';
import { pause } from '../../lib/pause.js';
import { jouerSon } from '../../lib/son.js';

// Le duel ne commence qu'une fois la graine du serveur reçue (une seconde au plus, d'habitude)
export default function DuelSolo(props) {
  const { config } = props;
  const [ticket, setTicket] = useState(null);
  // Une seule demande par duel : React (en développement) lance l'effet deux fois, et un second ticket
  // annulerait le premier sur le serveur (l'arbitre refuserait alors le duel : « ticket »)
  const demande = useRef(null);
  useEffect(() => {
    let actif = true;
    const niveau = config.histoire?.niveau ?? null;
    if (demande.current?.config !== config) {
      demande.current = { config, promesse: commencerDuel({
        mode: niveau ? 'histoire' : 'ia', difficulte: niveau ? null : config.difficulte, niveau: niveau?.id ?? null,
        grimoire: config.cartes.map(cleCarte),
      }) };
    }
    demande.current.promesse.then((t) => { if (actif) setTicket(t ?? { id: null, graine: nouvelleGraine(), elan: 0 }); });
    return () => { actif = false; };
  }, [config]);
  if (!ticket) return <p className="duel-preparation" role="status">Préparation du duel…</p>;
  return <Partie {...props} ticket={ticket} />;
}

function Partie({ config, surMenu, surRejouer, outils, ticket }) {
  const { joueur } = useAuth();
  const niveau = config.histoire?.niveau ?? null;
  const difficulte = niveau ? niveau.difficulte : config.difficulte;
  const { etat, partie, actif, animerEvenements } = useScene(() => preparerSolo({
    cartes: config.cartes, catalogue: config.catalogue, difficulte, niveau,
    elan: ticket.elan, graine: ticket.graine, nom: joueur?.username ?? 'Toi',
  }));
  // occupe : une action ou le tour de l'Ombre est en cours ; jeton : change quand la main me revient
  const [verrou, setVerrou] = useState({ occupe: false, jeton: 0 });
  const [renvoiOuvert, setRenvoiOuvert] = useState(true);
  const [fin, setFin] = useState(null);
  const journal = useRef([]);   // mes actions, dans l'ordre : l'arbitre rejoue la partie avec

  const verrouiller = () => setVerrou((v) => ({ ...v, occupe: true }));
  const deverrouiller = () => setVerrou((v) => ({ occupe: false, jeton: v.jeton + 1 }));

  // Applique une action au moteur et anime ses événements ; renvoie le nouvel état
  const jouer = async (action) => {
    const e = appliquerAction(partie.current, action);
    await animerEvenements(e.evenements, e);
    return e;
  };
  // Une de mes actions : notée dans le journal, puis jouée
  const jouerMoi = (action) => {
    journal.current.push(actionJournal(action));
    return jouer({ ...action, qui: 'joueur' });
  };

  // Fin du duel : écran de fin, puis le verdict de l'arbitre (récompenses)
  const terminer = async (raison = '') => {
    verrouiller();
    await pause(600);
    if (!actif.current) return;
    const e = partie.current;
    const egalite = e.fini === 'egalite';
    const gagne = e.fini === 'joueur';
    jouerSon(gagne ? 'fanfare' : 'tonnerre');
    const base = { gagne, egalite, raison, stats: e.camps.joueur.stats, tour: e.tour, nomAdverse: e.camps.adverse.nom };
    setFin({ ...base, supplement: niveau ? 'L’arbitre vérifie le duel…' : '' });

    const verdict = ticket.id ? await terminerDuel(ticket.id, journal.current) : null;
    if (!actif.current) return;
    if (niveau) {
      const resultat = garderResultatHistoire(niveau.id, gagne, verdict);
      // En Histoire, l'XP de pass vient des récompenses du niveau
      const xp = resultat.recompenses?.xp;
      setFin({ ...base, supplement: texteRecompense(resultat), pass: xp ? { texte: `+${xp} XP de pass` } : null });
      return;
    }
    let pass = null;
    if (!ticket.id) pass = { texte: 'Duel d’entraînement (hors ligne) : pas de récompense', vide: true };
    else if (verdict?.erreur) pass = { texte: `Récompense non enregistrée : ${verdict.erreur}`, vide: true };
    else if (verdict?.xp > 0) pass = { texte: `+${verdict.xp} XP de pass${verdict.or > 0 ? ` · +${verdict.or} or` : ''}${verdict.raison === 'plafond' ? ' (plafond du jour atteint)' : ''}` };
    else if (RAISONS_PASS[verdict?.raison]) pass = { texte: RAISONS_PASS[verdict.raison], vide: true };
    else if (verdict?.resultat === 'adverse' && raison) pass = { texte: RAISONS_PASS.abandon, vide: true };
    setFin({ ...base, pass });
  };

  // Le tour de l'Ombre : une action à la fois (moteur/solo.js), avec un court temps entre deux
  const jouerTourOmbre = async () => {
    for (const e of tourOmbre(partie.current, difficulte)) {
      await pause(e.evenements?.[0]?.ia ? 380 : 400);
      if (!actif.current) return;
      await animerEvenements(e.evenements, e);
      if (!actif.current) return;
      if (e.fini) return terminer();
    }
    deverrouiller();
  };

  // Après une de mes actions (ou le renvoi de main) : fin, tour de l'Ombre, ou de nouveau à moi
  const suite = (e) => {
    if (!actif.current) return;
    if (e.fini) return terminer();
    if (e.actif === 'adverse') return jouerTourOmbre();
    return deverrouiller();
  };

  const surAction = (action) => {
    verrouiller();
    jouerMoi(action).then(suite);
  };
  const surRenvoi = (indices) => {
    setRenvoiOuvert(false);
    verrouiller();
    jouerMoi({ type: 'renvoi', indices }).then(suite);
  };
  const abandonner = () => {
    if (etat.fini || fin || !confirm('Abandonner le duel ?')) return;
    setRenvoiOuvert(false);
    jouerMoi({ type: 'abandon' });
    terminer('Tu as abandonné le duel.');
  };

  const gagne = fin?.gagne;
  const boutonsFin = niveau
    ? [{ texte: gagne ? 'Rejouer le niveau' : 'Réessayer', surClic: surRejouer }, { texte: 'Retour à la carte', surClic: surMenu }]
    : [{ texte: 'Rejouer', surClic: surRejouer }, { texte: 'Retour au menu', surClic: surMenu }];

  return (
    <TableDuel etat={etat} jeton={verrou.jeton} monTour={!verrou.occupe && !renvoiOuvert && etat.actif === 'joueur' && !etat.fini && !fin}
      avatars={{ joueur: joueur?.avatar_url ?? null, adverse: null }} surAction={surAction}
      renvoi={{ ouvert: renvoiOuvert, attente: false }} surRenvoi={surRenvoi}
      fin={fin} boutonsFin={boutonsFin} outils={outils} surAbandon={abandonner} />
  );
}
