// =====================================================================
//  Un duel contre l'Ombre, ou un niveau du mode Histoire (ancien déroulé « solo » de JS/jeu-cartes.js)
//  C'est le « pilote » du duel : la table (TableDuel) affiche et reçoit mes actions ; ici, elles sont
//  appliquées au moteur, animées (useScene), puis l'Ombre joue les siennes, une à une.
//  À la fin : l'écran de victoire / défaite, l'élan de l'Ombre (ou les récompenses du niveau) et l'XP du Pass.
//
//  config : { cartes (le Grimoire choisi), difficulte, catalogue, histoire? }
//    histoire : { chapitre, niveau } pour un niveau du mode Histoire (adversaire, deck, PV, terrain du niveau ;
//    la victoire est validée par le serveur, qui donne les récompenses)
// =====================================================================
import { useEffect, useRef, useState } from 'react';
import TableDuel from './TableDuel.jsx';
import { DIFFICULTES } from '../../data/regles.js';
import {
  appliquerAction, creerPartie, grimoire, grimoireOmbre, pvElan, choixRenvoiIA, nouvelleGraine, generateur, melanger,
} from '../../moteur/index.js';
import { useAuth } from '../../lib/auth.js';
import { useScene } from '../../lib/duel/useScene.js';
import { lireElan, noterResultat } from '../../lib/elan.js';
import { demanderTicketPass, finirPartiePass, RAISONS_PASS } from '../../lib/pass.js';
import { deckHistoire, commencerNiveau, finirNiveau, texteRecompense } from '../../lib/histoire.js';
import { pause } from '../../lib/pause.js';
import { jouerSon } from '../../lib/son.js';

const NOM_ADVERSAIRE = "L'Ombre du Codex";

// La partie de départ : Grimoires, terrain, premier joueur, et le renvoi de main de l'Ombre
function nouvellePartie({ cartes, difficulte, catalogue, histoire }, joueur) {
  const graine = nouvelleGraine();
  const h = generateur(graine ^ 0x9e3779b9);   // le hasard de la préparation (Grimoire de l'Ombre, premier joueur)
  const monGrimoire = grimoire(cartes);
  const niv = histoire?.niveau;
  // Contre l'Ombre : un Grimoire en miroir du tien, ajusté par ton élan (niveau caché) ; en Histoire : celui du niveau
  const elan = lireElan(joueur?.discord_id);
  const deckAdverse = niv ? deckHistoire(niv.deck, catalogue, h) : grimoireOmbre(monGrimoire, catalogue, elan, h);
  const premier = h() < 0.5 ? 'joueur' : 'adverse';
  const options = niv ? { pvAdverse: niv.pv, energieBonusAdverse: niv.energieBonus, terrain: niv.terrain, graine }
    : { pvAdverse: DIFFICULTES[difficulte].pv + pvElan(elan), graine };
  const e = creerPartie(melanger(monGrimoire, h), deckAdverse, joueur?.username ?? 'Toi', niv ? niv.adversaire : NOM_ADVERSAIRE, premier, options);
  return appliquerAction(e, { type: 'renvoi', qui: 'adverse', indices: choixRenvoiIA(e.camps.adverse) });
}

export default function DuelSolo({ config, surMenu, surRejouer, outils }) {
  const { joueur } = useAuth();
  const { etat, partie, actif, animerEvenements } = useScene(() => nouvellePartie(config, joueur));
  // occupe : une action ou le tour de l'Ombre est en cours ; jeton : change quand la main me revient
  const [verrou, setVerrou] = useState({ occupe: false, jeton: 0 });
  const [renvoiOuvert, setRenvoiOuvert] = useState(true);
  const [fin, setFin] = useState(null);
  const ticket = useRef(null);
  const abandon = useRef(false);
  const niveau = config.histoire?.niveau ?? null;

  // Au début du duel (une seule fois : un nouveau duel est un nouveau composant)
  const depart = useRef({ connecte: !!joueur, difficulte: config.difficulte, niveau: niveau?.id ?? null });
  useEffect(() => {
    // Pass de saison : le ticket du duel (connecté seulement) ; mode Histoire : le serveur note le début du niveau
    if (depart.current.niveau) ticket.current = commencerNiveau(depart.current.niveau);
    else if (depart.current.connecte) ticket.current = demanderTicketPass({ mode: 'ia', difficulte: depart.current.difficulte });
  }, []);

  const verrouiller = () => setVerrou((v) => ({ ...v, occupe: true }));
  const deverrouiller = () => setVerrou((v) => ({ occupe: false, jeton: v.jeton + 1 }));

  // Applique une action au moteur et anime ses événements ; renvoie le nouvel état
  const jouer = async (action) => {
    const e = appliquerAction(partie.current, action);
    await animerEvenements(e.evenements, e);
    return e;
  };

  // Fin du duel : écran de fin, élan de l'Ombre ou récompenses du niveau, XP du Pass
  const terminer = async (raison = '') => {
    verrouiller();
    await pause(600);
    if (!actif.current) return;
    const e = partie.current;
    const egalite = e.fini === 'egalite';
    const gagne = e.fini === 'joueur';
    // Mode Histoire : la victoire est validée par le serveur (récompenses) ; sinon, l'élan de l'Ombre
    const resultat = niveau ? await finirNiveau(niveau.id, gagne, ticket.current) : null;
    if (!actif.current) return;
    if (!niveau && !egalite) noterResultat(joueur?.discord_id, gagne);
    jouerSon(gagne ? 'fanfare' : 'tonnerre');
    const base = {
      gagne, egalite, raison, stats: e.camps.joueur.stats, tour: e.tour, nomAdverse: e.camps.adverse.nom,
      supplement: resultat ? texteRecompense(resultat) : '',
      // En Histoire, l'XP de pass vient des récompenses du niveau
      pass: resultat?.recompenses?.xp ? { texte: `+${resultat.recompenses.xp} XP de pass` } : null,
    };
    setFin(base);
    // L'XP du Pass (un abandon ne rapporte rien)
    if (niveau || !ticket.current || abandon.current) return;
    const r = await finirPartiePass(ticket.current, gagne);
    ticket.current = null;
    if (!r || !actif.current) return;
    let pass = null;
    if (r.xp > 0) pass = { texte: `+${r.xp} XP de pass${r.or > 0 ? ` · +${r.or} or` : ''}${r.raison === 'plafond' ? ' (plafond du jour atteint)' : ''}` };
    else if (RAISONS_PASS[r.raison]) pass = { texte: RAISONS_PASS[r.raison], vide: true };
    if (pass) setFin({ ...base, pass });
  };

  // Le tour de l'Ombre : une action à la fois, jusqu'à ce qu'elle passe la main
  const tourOmbre = async () => {
    for (let i = 0; i < 30; i++) {
      await pause(650);
      if (!actif.current) return;
      const e = await jouer({ type: 'ia', qui: 'adverse', difficulte: config.difficulte });
      if (!actif.current) return;
      if (e.fini) return terminer();
      if (e.evenements[0]?.ia?.type === 'fin' || e.evenements[0]?.type === 'refus') return deverrouiller();
    }
    // 30 actions : elle finit son tour
    await pause(400);
    if (!actif.current) return;
    const e = await jouer({ type: 'fin', qui: 'adverse' });
    if (e.fini) return terminer();
    deverrouiller();
  };

  // Après une de mes actions (ou le renvoi de main) : fin, tour de l'Ombre, ou de nouveau à moi
  const suite = (e) => {
    if (!actif.current) return;
    if (e.fini) return terminer();
    if (e.actif === 'adverse') return tourOmbre();
    return deverrouiller();
  };

  const surAction = (action) => {
    verrouiller();
    jouer({ ...action, qui: 'joueur' }).then(suite);
  };
  const surRenvoi = (indices) => {
    setRenvoiOuvert(false);
    verrouiller();
    jouer({ type: 'renvoi', qui: 'joueur', indices }).then(suite);
  };
  const abandonner = () => {
    if (etat.fini || fin || !confirm('Abandonner le duel ?')) return;
    abandon.current = true;
    setRenvoiOuvert(false);
    jouer({ type: 'abandon', qui: 'joueur' });
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
