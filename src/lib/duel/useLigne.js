// =====================================================================
//  useLigne : le salon du duel en ligne (ancien JS/jeu-cartes.js, « En ligne : le salon » et
//  « le salon de quatre »). Il vit au niveau de l'écran Duel : le salon reste ouvert du menu au duel,
//  puis à la revanche.
//
//  L'adresse fait foi : #/duel?salon=CODE veut dire « je suis dans le salon CODE » (c'est aussi le lien
//  d'invitation). Entrer = aller à cette adresse ; quitter = en partir. Le canal Supabase Realtime
//  s'ouvre et se ferme avec elle.
//
//  const ligne = useLigne({ joueur, grimoire, notifier });
//    ligne.salon : null, ou pour l'affichage { code, role, cle, format, formatFixe, classe, dedans,
//                  equipe (la mienne en 2 contre 2), pret, enDuel, etat (le texte d'état), erreur }
//    ligne.duel  : null, ou le duel en ligne à lancer :
//                  1 contre 1 : { n, role: 'hote' | 'invite', adversaire, cartes, grimoireAdverse | premier }
//                  2 contre 2 : { n, role: 'equipe', place: { camp, index }, sieges, premier, local }
//    ligne.entrer(code, role, { classe, format, equipe }), ligne.quitter(), ligne.basculerPret(), ligne.revenir()
//    ligne.choisirFormat(format), ligne.changerEquipe()   (salon de quatre)
//    ligne.brancher(pilote) : le duel à l'écran (DuelEnLigne) reçoit les messages et les présences
//    ligne.envoyer(evenement, contenu), ligne.adversaire()
//    ligne.versMaitre(choix), ligne.demanderSuite(depuis, pid), ligne.arbitre() (2 contre 2)
//    ligne.prendreClasse(code) : vrai une fois si ce salon est classé (son résultat est alors à déclarer)
//
//  1 contre 1 : le duel commence quand les deux joueurs sont prêts ; l'hôte le lance (et fait tourner
//  les règles), l'invité le découvre à son premier message.
//  2 contre 2 : quand les quatre sont prêts, deux par équipe, l'hôte lance l'arbitre (lib/duel/arbitre.js) ;
//  les quatre écrans, le sien compris, rejouent ses messages.
// =====================================================================
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ouvrirSalon, codeValide, TAILLE_SALON } from '../salon.js';
import { estHote, retenirHote, grimoireDepuisCles } from '../ligne.js';
import { cleCarte } from '../grimoire.js';
import { creerArbitre } from './arbitre.js';

export const TAILLE_EQUIPES = 4;
const VIDE = { code: null, cle: null, dedans: [], pret: false, format: '1v1', equipe: null, erreur: '' };

// Le texte d'état d'un salon de deux (sous la liste des joueurs)
function texteSalon(role, cle, dedans, pret) {
  const moiDedans = dedans.some((x) => x.cle === cle);
  const adversaire = dedans.find((x) => x.cle !== cle) ?? null;
  if (!moiDedans) return 'Connexion au salon…';
  if (adversaire && adversaire.role === role) return role === 'invite'
    ? 'L\'hôte a quitté ce salon : l\'un de vous doit en créer un nouveau.'
    : 'Ce salon a deux hôtes (onglet dupliqué ?) : créez un nouveau salon.';
  if (!adversaire) return role === 'hote'
    ? 'En attente de ton adversaire… Copie le lien du salon et envoie-le-lui.'
    : 'L\'hôte n\'est pas (ou plus) dans ce salon. Attends-le, ou crée ton propre salon.';
  if (!pret) return 'Vérifie ton deck, puis déclare-toi prêt.';
  if (!adversaire.pret) return `En attente de ${adversaire.nom}…`;
  return 'Le duel commence !';
}

// Le salon de quatre est-il complet et équilibré ?
const parEquipe = (dedans, eq) => dedans.filter((x) => x.equipe === eq).length;
const comptesDifferents = (dedans) => new Set(dedans.map((x) => x.discord_id)).size === dedans.length;

// Le texte d'état d'un salon de quatre
function texteSalonEquipes(cle, dedans, pret, formatFixe) {
  const hotes = dedans.filter((x) => x.role === 'hote');
  const attendus = dedans.filter((x) => !x.pret).map((x) => x.nom);
  if (!dedans.some((x) => x.cle === cle)) return 'Connexion au salon…';
  if (hotes.length > 1) return 'Ce salon a deux hôtes (onglet dupliqué ?) : créez un nouveau salon.';
  if (!hotes.length) return 'L’hôte n’est pas (ou plus) dans ce salon. Attends-le, ou crée ton propre salon.';
  if (dedans.length < TAILLE_EQUIPES) return formatFixe
    ? `En attente des autres joueurs (${dedans.length}/4)…`
    : `En attente de joueurs (${dedans.length}/4)… Copie le lien du salon et envoie-le à tes amis.`;
  if (parEquipe(dedans, 'A') !== 2 || parEquipe(dedans, 'B') !== 2) return 'Il faut deux joueurs par équipe : utilisez « Changer d’équipe ».';
  if (!comptesDifferents(dedans)) return 'Un même compte est entré deux fois : il faut quatre joueurs différents.';
  if (!pret) return 'Vérifie ton deck, puis déclare-toi prêt.';
  if (attendus.length) return `En attente de ${attendus.join(', ')}…`;
  return 'Le duel commence !';
}

// grimoire() : les cartes choisies par le joueur (sans le complément de base) au moment où on la demande
export function useLigne({ joueur, grimoire, notifier }) {
  const [params] = useSearchParams();
  const naviguer = useNavigate();
  const brut = (params.get('salon') ?? '').toUpperCase();
  const discordId = joueur?.discord_id ?? null;
  const code = discordId && codeValide(brut) ? brut : null;

  const salon = useRef(null);         // l'objet de lib/salon.js (+ role, format, adversaire, rafraichir…)
  const enDuel = useRef(null);        // le duel lancé (ou en train de l'être) : '1v1' | '2v2' | null
  const pilote = useRef(null);        // le duel à l'écran : { surMessage, surPresence }
  const arbitre = useRef(null);       // 2 contre 2, chez l'hôte : l'arbitre de la partie
  const tampon = useRef([]);          // messages arrivés avant que le duel soit à l'écran
  const attenteEcran = useRef(false); // le duel est lancé, pas encore à l'écran (ses messages vont au tampon)
  const pidsJoues = useRef(new Set());   // duels déjà joués ici (leurs vieux messages sont ignorés)
  const demandes = useRef(new Set());    // duels dont on a déjà redemandé le début
  const classe = useRef(null);        // salon classé en cours : { salon, format, equipe }
  const compteur = useRef(0);
  const [vue, setVue] = useState(VIDE);
  const [duel, setDuel] = useState(null);
  const [salonClasse, setSalonClasse] = useState(null);   // (le même, pour l'affichage)

  // Les dernières valeurs, pour les fonctions appelées par le réseau
  const courant = useRef(null);
  useEffect(() => { courant.current = { joueur, grimoire, notifier, naviguer }; });

  const cles = () => (courant.current.grimoire() ?? []).map(cleCarte);
  const allerA = (adresse) => courant.current.naviguer(adresse, { replace: true });

  // Le canal du salon : ouvert à l'arrivée sur #/duel?salon=CODE (connecté), fermé en partant
  useEffect(() => {
    if (!code || !discordId) return undefined;
    const { joueur: moi, notifier: notif } = courant.current;
    const role = estHote(code) ? 'hote' : 'invite';
    const enClasse = classe.current?.salon === code ? classe.current : null;
    enDuel.current = null;
    tampon.current = [];
    attenteEcran.current = false;
    arbitre.current = null;

    const complet = () => {
      courant.current.notifier('Ce salon est complet.', 'erreur');
      retenirHote(code, false);
      allerA('/duel?mode=duel');
    };

    // Présences : qui est là, prêt ou non, dans quelle équipe ; l'hôte lance le duel quand tous sont prêts
    const surPresence = (tous) => {
      if (salon.current !== s) return;
      // Page rechargée : l'ancienne connexion reste visible quelques secondes ; on ne garde que la plus récente
      // d'un même compte dans un même rôle
      const liste = tous.filter((x) => !tous.some((y) => y !== x && y.discord_id === x.discord_id && y.role === x.role && y.rejoint > x.rejoint));
      // Le format du salon : fixé par le classé, sinon choisi par l'hôte (sa présence le dit à tous)
      const format = enClasse?.format
        ?? (s.role === 'hote' ? s.presence.format : liste.find((x) => x.role === 'hote')?.format) ?? '1v1';
      if (!enDuel.current) s.format = format;
      // (en plein duel, le format est celui du duel : son état a pu arriver avant les présences)
      if (enDuel.current ? enDuel.current === '2v2' : s.format === '2v2') return presenceEquipes(liste);

      // Salon de deux : les deux premiers arrivés jouent, les suivants repartent
      // (seulement quand l'hôte est là : avant, on ne connaît pas encore le format du salon, peut-être un 2 contre 2)
      const dedans = liste.slice(0, TAILLE_SALON);
      if (liste.length > TAILLE_SALON && liste.some((x) => x.role === 'hote') && !dedans.some((x) => x.cle === s.cle)) return complet();
      const adversaire = dedans.find((x) => x.cle !== s.cle) ?? null;
      const avant = s.adversaire;
      s.adversaire = adversaire;
      setVue({ ...VIDE, code, cle: s.cle, dedans, pret: !!s.presence.pret, format: s.format });
      // En plein duel : le pilote surveille les départs et retours de l'adversaire
      pilote.current?.surPresence({ adversaire, avant, dedans });
      if (s.role === 'hote' && !enDuel.current && s.presence.pret && adversaire?.pret && adversaire.role === 'invite') commencer(adversaire);
    };

    // Le salon de quatre : deux équipes de deux
    const presenceEquipes = (liste) => {
      const dedans = liste.slice(0, TAILLE_EQUIPES);
      if (liste.length > TAILLE_EQUIPES && !dedans.some((x) => x.cle === s.cle)) return complet();
      const moiDedans = dedans.find((x) => x.cle === s.cle);
      // Pas encore d'équipe : celle qui a le moins de joueurs (l'hôte prend la A)
      if (moiDedans && !s.presence.equipe && !enDuel.current) {
        const n = (eq) => parEquipe(dedans, eq) - (moiDedans.equipe === eq ? 1 : 0);
        s.annoncer({ equipe: s.role === 'hote' ? 'A' : n('A') <= n('B') ? 'A' : 'B' }).then(() => s.rafraichir());
        return;
      }
      // Arrivées presque en même temps : une équipe à trois ; le dernier arrivé passe dans l'autre
      const monEq = s.presence.equipe;
      if (moiDedans && monEq && !enDuel.current && !enClasse && !s.presence.pret) {
        const miens = dedans.filter((x) => x.equipe === monEq).sort((x, y) => x.rejoint - y.rejoint);
        const autreEq = monEq === 'A' ? 'B' : 'A';
        if (miens.length > 2 && miens.slice(2).some((x) => x.cle === s.cle) && parEquipe(dedans, autreEq) < 2) {
          s.annoncer({ equipe: autreEq }).then(() => s.rafraichir());
          return;
        }
      }
      setVue({ ...VIDE, code, cle: s.cle, dedans, pret: !!s.presence.pret, format: '2v2', equipe: monEq ?? null });
      // En plein duel : le pilote surveille les départs
      if (enDuel.current) { pilote.current?.surPresence({ dedans }); return; }

      // L'hôte lance le duel quand les quatre joueurs sont prêts, deux par équipe
      if (s.role === 'hote' && dedans.filter((x) => x.role === 'hote').length === 1 && dedans.length === TAILLE_EQUIPES
        && dedans.every((x) => x.pret) && parEquipe(dedans, 'A') === 2 && parEquipe(dedans, 'B') === 2 && comptesDifferents(dedans)) {
        commencerEquipes(dedans);
      }
    };

    // 1 contre 1 : l'hôte lance le duel ; le Grimoire de l'invité est relu dans sa collection
    const commencer = async (adversaire) => {
      enDuel.current = '1v1';   // réserve la place tout de suite (pas de double lancement)
      await s.annoncer({ pret: false });
      const grimoireAdverse = await grimoireDepuisCles(adversaire.grimoire, adversaire.discord_id);
      if (salon.current !== s) return;
      setVue((v) => ({ ...v, pret: false }));
      setDuel({ code, n: ++compteur.current, role: 'hote', adversaire, cartes: courant.current.grimoire() ?? [], grimoireAdverse });
    };

    // 2 contre 2 : l'hôte lance l'arbitre ; son équipe est « joueur » pour le moteur (lui en premier)
    const commencerEquipes = async (dedans) => {
      enDuel.current = '2v2';
      const monEq = s.presence.equipe;
      const ordre = (eq) => dedans.filter((x) => x.equipe === eq)
        .sort((x, y) => (x.cle === s.cle ? -1 : y.cle === s.cle ? 1 : x.rejoint - y.rejoint));
      const sieges = [
        ...ordre(monEq).map((x, i) => ({ ...x, camp: 'joueur', index: i })),
        ...ordre(monEq === 'A' ? 'B' : 'A').map((x, i) => ({ ...x, camp: 'adverse', index: i })),
      ];
      const mesCartes = courant.current.grimoire() ?? [];
      const decks = await Promise.all(sieges.map((x) => (x.cle === s.cle ? mesCartes : grimoireDepuisCles(x.grimoire, x.discord_id))));
      await s.annoncer({ pret: false });
      if (salon.current !== s) return;
      setVue((v) => ({ ...v, pret: false }));
      const a = creerArbitre({
        sieges, decks,
        // à chaque écran sa vue : les trois autres sur leur canal privé, le mien directement
        envoyerA: (id, msg) => (id === discordId ? recevoirJeu(msg) : s.envoyerPrive(id, 'jeu', msg)),
      });
      arbitre.current = a;
      a.demarrer();
    };

    // Un message « jeu » (de l'hôte, ou chez l'hôte d'un 2 contre 2, de son propre arbitre)
    const recevoirJeu = (contenu) => {
      if (!contenu?.pid) return;
      if (pilote.current) {
        pidsJoues.current.add(contenu.pid);
        pilote.current.surMessage('jeu', contenu);
        return;
      }
      // Pas de duel à l'écran : seul un écran qui rejoue les messages attend le début d'un duel
      const equipes = !!contenu.equipes;
      if ((!equipes && s.role !== 'invite') || pidsJoues.current.has(contenu.pid)) return;
      if (attenteEcran.current) { tampon.current.push(contenu); return; }   // le duel s'affiche : il lira ces messages
      const sieges = contenu.sieges ?? contenu.evs?.[0]?.sieges;
      const place = equipes ? sieges?.find((x) => x.discord_id === discordId) : null;
      if (equipes && !place) return;   // pas une de mes parties
      if (contenu.etatComplet || contenu.evs?.[0]?.type === 'debut') {
        enDuel.current = equipes ? '2v2' : '1v1';
        attenteEcran.current = true;
        pidsJoues.current.add(contenu.pid);
        if (s.presence.pret) s.annoncer({ pret: false });
        setVue((v) => ({ ...v, pret: false }));
        setDuel(equipes
          ? { code, n: ++compteur.current, role: 'equipe', place: { camp: place.camp, index: place.index }, sieges, premier: contenu, local: !!arbitre.current }
          : { code, n: ++compteur.current, role: 'invite', adversaire: s.adversaire, premier: contenu });
        return;
      }
      // Duel commencé sans nous (son premier message s'est perdu) : on redemande depuis le début
      if (!demandes.current.has(contenu.pid)) {
        demandes.current.add(contenu.pid);
        s.envoyer('renvoi', { depuis: 1, pid: contenu.pid, de: discordId });
      }
    };

    const surMessage = (evenement, contenu) => {
      if (salon.current !== s) return;
      // 2 contre 2, chez l'hôte : les actions et demandes des trois autres vont à l'arbitre
      if (arbitre.current) {
        if (evenement === 'choix') arbitre.current.recevoir(contenu);
        else if (evenement === 'renvoi') arbitre.current.renvoyer(contenu);
        return;
      }
      if (evenement === 'jeu') return recevoirJeu(contenu);
      // 1 contre 1, chez l'hôte : les actions de l'invité et ses demandes de messages
      if (pilote.current && !contenu?.equipes) pilote.current.surMessage(evenement, contenu);
    };

    const s = ouvrirSalon(code, {
      discord_id: moi.discord_id,
      nom: moi.username ?? 'Aventurier',
      avatar: moi.avatar_url ?? null,
      role,
      ...(role === 'hote' ? { format: enClasse?.format ?? '1v1' } : {}),
      ...(enClasse?.equipe ? { equipe: enClasse.equipe } : {}),
    }, {
      surPresence,
      surMessage,
      surErreur: (texte) => { if (salon.current === s) setVue((v) => ({ ...v, erreur: texte })); },
    });
    s.role = role;
    s.format = enClasse?.format ?? '1v1';
    s.adversaire = null;
    s.rafraichir = () => surPresence(s.liste());
    s.vers = (c) => (arbitre.current ? arbitre.current.recevoir(c) : s.envoyer('choix', c));
    salon.current = s;
    // Classé : on se déclare prêt tout de suite ; sinon on annonce seulement son Grimoire
    s.annoncer({ grimoire: cles(), ...(enClasse ? { pret: true } : {}) });

    // Classé : un joueur ne vient pas (onglet fermé entre-temps) : la partie est annulée
    const minuteur = enClasse ? setTimeout(() => {
      if (salon.current !== s || enDuel.current) return;
      const incomplet = enClasse.format === '2v2' ? s.liste().length < TAILLE_EQUIPES : !s.adversaire;
      if (!incomplet) return;
      notif(enClasse.format === '2v2' ? 'Un joueur n’est pas venu : la partie est annulée.' : 'Ton adversaire n’est pas venu : la partie est annulée.', 'erreur');
      classe.current = null;
      allerA('/duel?mode=duel');
    }, 30000) : null;

    return () => {
      clearTimeout(minuteur);
      if (salon.current === s) salon.current = null;
      enDuel.current = null;
      arbitre.current = null;
      s.fermer();
    };
    // (courant : les dernières valeurs, lues sans rouvrir le salon)
  }, [code, discordId]);

  // ---- Les gestes du joueur
  // opts (classé) : { classe: true, format, equipe } donnés par le serveur
  const entrer = (nouveau, role, opts = {}) => {
    if (role === 'hote') retenirHote(nouveau, true);
    classe.current = opts.classe ? { salon: nouveau, format: opts.format ?? '1v1', equipe: opts.equipe ?? null } : null;
    setSalonClasse(opts.classe ? nouveau : null);
    setDuel(null);
    allerA(`/duel?salon=${nouveau}`);
  };
  const quitter = () => {
    if (code) retenirHote(code, false);
    classe.current = null;
    setSalonClasse(null);
    pilote.current = null;
    arbitre.current = null;
    setDuel(null);
    allerA('/duel?mode=duel');
  };
  const basculerPret = async () => {
    const s = salon.current;
    if (!s || enDuel.current) return;
    await s.annoncer({ pret: !s.presence.pret, grimoire: cles() });
    s.rafraichir();
  };
  // L'hôte choisit le format du salon (1 contre 1, ou 2 contre 2 à quatre)
  const choisirFormat = async (format) => {
    const s = salon.current;
    if (!s || s.role !== 'hote' || enDuel.current || s.presence.pret || s.format === format) return;
    s.format = format;
    await s.annoncer({ format, ...(format === '2v2' ? {} : { equipe: null }) });
    s.rafraichir();
  };
  // Salon de quatre : passer dans l'autre équipe (s'il y reste une place)
  const changerEquipe = async () => {
    const s = salon.current;
    if (!s || enDuel.current || s.presence.pret) return false;
    const autreEquipe = s.presence.equipe === 'A' ? 'B' : 'A';
    const dedans = s.liste().slice(0, TAILLE_EQUIPES);
    if (dedans.filter((x) => x.equipe === autreEquipe && x.cle !== s.cle).length >= 2) {
      courant.current.notifier(`L’équipe ${autreEquipe} est déjà complète.`, 'erreur');
      return false;
    }
    await s.annoncer({ equipe: autreEquipe });
    s.rafraichir();
    return true;
  };
  // Fin du duel, « Revanche » : retour au salon, on se redéclare prêt
  const revenir = () => {
    enDuel.current = null;
    tampon.current = [];
    attenteEcran.current = false;
    pilote.current = null;
    arbitre.current = null;
    setDuel(null);
    salon.current?.rafraichir();
  };

  // Le duel à l'écran se branche : il reçoit d'abord les messages arrivés avant lui
  const brancher = (p) => {
    pilote.current = p;
    attenteEcran.current = false;
    const enAttente = tampon.current;
    tampon.current = [];
    enAttente.forEach((m) => { pidsJoues.current.add(m.pid); p.surMessage('jeu', m); });
    return () => { if (pilote.current === p) pilote.current = null; };
  };

  const v = vue.code === code ? vue : { ...VIDE, code };
  const role = code ? (estHote(code) ? 'hote' : 'invite') : null;
  const formatFixe = salonClasse === code;
  const enCours = !!(duel?.code === code);
  return {
    salon: code ? {
      code, role, classe: formatFixe, formatFixe, cle: v.cle, dedans: v.dedans, pret: v.pret, format: v.format, equipe: v.equipe,
      enDuel: enCours, erreur: v.erreur,
      etat: v.erreur || (v.format === '2v2' ? texteSalonEquipes(v.cle, v.dedans, v.pret, formatFixe) : texteSalon(role, v.cle, v.dedans, v.pret)),
    } : null,
    duel: enCours ? duel : null,
    entrer, quitter, basculerPret, revenir, brancher, choisirFormat, changerEquipe,
    envoyer: (evenement, contenu) => salon.current?.envoyer(evenement, contenu),
    versMaitre: (c) => salon.current?.vers(c),
    demanderSuite: (depuis, pid) => { if (!arbitre.current) salon.current?.envoyer('renvoi', { depuis, pid, de: discordId }); },
    arbitre: () => arbitre.current,
    adversaire: () => salon.current?.adversaire ?? null,
    prendreClasse: (c) => {
      if (classe.current?.salon !== c) return false;
      classe.current = null;   // une revanche dans ce salon n'est plus classée
      return true;
    },
  };
}
