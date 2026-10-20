// =====================================================================
//  La table du duel : le plateau et tout ce que le joueur y fait (ancien JS/jeu-cartes.js, « Actions du
//  joueur de cet écran »), partagée par le duel contre l'Ombre et le duel en ligne.
//  - la sélection (unité choisie, sort ou capacité qui attend sa cible, défausse) ;
//  - les clics, le glisser-déposer vers le Tombeau, les raccourcis clavier, la loupe ;
//  - les fenêtres : renvoi de main, Méditer, Tombeau, loupe, fin du duel.
//  Elle ne sait pas QUI est l'adversaire : le parent (le « pilote ») lui dit si c'est mon tour
//  (monTour) et reçoit mes actions (surAction), qu'il applique au moteur ou envoie à l'hôte.
//  jeton : change chaque fois que le parent me rend la main (la sélection repart de zéro).
// =====================================================================
import { useEffect, useRef, useState } from 'react';
import Plateau from './Plateau.jsx';
import { Renvoi, Meditation, FenetreTombeau, Loupe, Fin } from './Fenetres.jsx';
import {
  peutJouer, raisonInjouable, ciblesSort, ciblesAttaque, peutAttaquer, peutDefendre, peutActiver, ciblesCapacite,
  peutDestin, peutDefausser, peutMediter, trouver,
} from '../../moteur/index.js';
import { flotter, secouer } from '../../lib/fx.js';
import { jouerSon } from '../../lib/son.js';

const AUCUNE = { attaquant: null, sortIndex: null, capacite: null, cibles: null, defausse: false };
const memeCible = (c, cible) => c.camp === cible.camp && (c.heros ? cible.heros : c.uid === cible.uid);

export default function TableDuel({
  etat, monTour, jeton, avatars, consigneAttente = '', surAction,
  renvoi, surRenvoi, fin, boutonsFin, outils, surAbandon,
}) {
  // La sélection, valable pour le jeton (le tour) où elle a été faite
  const [selBrute, setSelBrute] = useState({ jeton: null, ...AUCUNE });
  const sel = { ...(selBrute.jeton === jeton && monTour ? selBrute : AUCUNE), monTour };
  const setSel = (s) => setSelBrute({ ...AUCUNE, ...s, jeton });
  const [choisies, setChoisies] = useState(new Set());   // renvoi de main : les cartes à renvoyer
  const [tombeau, setTombeau] = useState(null);           // 'joueur' | 'adverse' : le Tombeau ouvert
  const [loupe, setLoupe] = useState(null);
  const [glisse, setGlisse] = useState(false);            // une carte de la main est glissée vers le Tombeau

  const agir = (action) => {
    if (!monTour) return;
    setSel(AUCUNE);
    surAction(action);
  };
  const annuler = () => setSel(AUCUNE);

  // ---- Renvoi de main : touche une carte pour la choisir (ou la reprendre), puis valide
  const basculerRenvoi = (i) => {
    jouerSon('clic');
    setChoisies((c) => { const n = new Set(c); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  };
  const validerRenvoi = () => {
    if (choisies.size) jouerSon('pioche');
    surRenvoi([...choisies]);
  };

  // ---- Clics sur le plateau
  const surCarte = (i, el) => {
    if (!monTour) return;
    if (sel.defausse) return agir({ type: 'defausser', index: i });
    if (!peutJouer(etat, 'joueur', i)) {
      secouer(el);
      jouerSon('clic');
      const raison = raisonInjouable(etat, 'joueur', i);
      if (raison) flotter(el, raison, 'rate');
      return;
    }
    const carte = etat.camps.joueur.main[i];
    const cibles = carte.t === 's' ? ciblesSort(etat, 'joueur', carte) : null;
    if (!cibles) return agir({ type: 'jouer', index: i });
    if (sel.sortIndex === i) return annuler();
    setSel({ sortIndex: i, cibles });
  };

  // Une unité ou un héros : une cible attendue, ou le choix d'une de mes unités
  const surCible = (cible) => {
    if (!monTour) return;
    if (sel.cibles?.some((c) => memeCible(c, cible))) {
      if (sel.sortIndex != null) return agir({ type: 'jouer', index: sel.sortIndex, cible });
      if (sel.capacite) return agir({ type: 'capacite', uid: sel.capacite, cible });
      if (sel.attaquant) return agir({ type: 'attaque', uid: sel.attaquant, cible });
    }
    const el = document.querySelector(cible.heros ? `.dc-heros[data-heros="${cible.camp}"]` : `.dc-unite[data-uid="${cible.uid}"]`);
    if (!cible.heros && cible.camp === 'joueur' && sel.sortIndex == null && !sel.capacite) {
      const u = trouver(etat.camps.joueur, cible.uid);
      if (sel.attaquant === u.uid) return annuler();
      const j = etat.camps.joueur;
      if (!j.actions || !(peutAttaquer(u) || peutDefendre(u) || peutActiver(etat, 'joueur', u.uid))) {
        secouer(el);
        flotter(el, !j.actions ? 'Plus d’action ce tour' : u.bloquee ? 'Gelée ce tour' : 'A déjà agi ce tour', 'rate');
        return;
      }
      jouerSon('clic');
      return setSel({ attaquant: u.uid, cibles: peutAttaquer(u) ? ciblesAttaque(etat, 'joueur', u.uid) : null });
    }
    // Cible impossible (une Garde protège, par exemple)
    if (sel.cibles) { secouer(el); jouerSon('clic'); }
  };

  const finirTour = () => agir({ type: 'fin' });
  const lancerDestin = () => { if (peutDestin(etat, 'joueur')) agir({ type: 'destin' }); };
  const defendre = () => { if (sel.attaquant) agir({ type: 'defendre', uid: sel.attaquant }); };
  const capacite = () => {
    if (!monTour || !sel.attaquant || !peutActiver(etat, 'joueur', sel.attaquant)) return;
    if (sel.capacite) return annuler();
    const cibles = ciblesCapacite(etat, 'joueur', sel.attaquant);
    if (!cibles) return agir({ type: 'capacite', uid: sel.attaquant });
    jouerSon('clic');
    setSel({ attaquant: sel.attaquant, capacite: sel.attaquant, cibles });
  };
  const defausser = () => {
    if (!monTour || !peutDefausser(etat, 'joueur')) return;
    if (sel.defausse) return annuler();
    jouerSon('clic');
    setSel({ defausse: true });
  };
  const mediter = () => { if (monTour && peutMediter(etat, 'joueur')) agir({ type: 'mediter' }); };

  // Glisser une carte de la main sur son Tombeau : la défausser
  const surGlisser = (e, i) => {
    if (!e) return setGlisse(false);
    if (!monTour || !peutDefausser(etat, 'joueur')) { e.preventDefault(); return; }
    e.dataTransfer.setData('text/plain', String(i));
    e.dataTransfer.effectAllowed = 'move';
    setGlisse(true);
  };
  const surDeposer = (i) => { setGlisse(false); if (Number.isInteger(i)) agir({ type: 'defausser', index: i }); };

  // ---- La loupe : clic droit, ou appui long au doigt (le clic qui suit est alors ignoré)
  const appui = useRef(null);
  const ignorerClic = useRef(false);
  useEffect(() => {
    const bloquer = (e) => { if (!ignorerClic.current) return; ignorerClic.current = false; e.stopPropagation(); e.preventDefault(); };
    document.addEventListener('click', bloquer, true);
    return () => document.removeEventListener('click', bloquer, true);
  }, []);
  const arreterAppui = () => { if (appui.current) { clearTimeout(appui.current.minuteur); appui.current = null; } };
  const propsLoupe = (info) => ({
    onContextMenu: (e) => { e.preventDefault(); setLoupe(info); },
    onPointerDown: (e) => {
      if (e.pointerType !== 'touch') return;
      appui.current = { x: e.clientX, y: e.clientY, minuteur: setTimeout(() => { appui.current = null; ignorerClic.current = true; setLoupe(info); }, 450) };
    },
    onPointerMove: (e) => { if (appui.current && Math.hypot(e.clientX - appui.current.x, e.clientY - appui.current.y) > 10) arreterAppui(); },
    onPointerUp: arreterAppui,
    onPointerCancel: arreterAppui,
  });

  // ---- Raccourcis : Espace pour finir le tour, D pour le Destin, G pour défendre, Échap pour annuler
  const raccourcis = useRef(null);
  const surTouche = (e) => {
    if (fin || renvoi.ouvert || loupe || tombeau || document.querySelector('dialog[open]')) return;
    if (e.target.closest?.('input, textarea')) return;
    if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); finirTour(); }
    else if (e.key === 'd' || e.key === 'D') lancerDestin();
    else if ((e.key === 'g' || e.key === 'G') && sel.attaquant) defendre();
    else if (e.key === 'Escape' && (sel.attaquant || sel.capacite || sel.sortIndex != null || sel.defausse)) annuler();
  };
  // (la dernière version du gestionnaire est gardée dans une ref, mise à jour après chaque affichage)
  useEffect(() => { raccourcis.current = surTouche; });
  useEffect(() => {
    const ecoute = (e) => raccourcis.current?.(e);
    document.addEventListener('keydown', ecoute);
    return () => document.removeEventListener('keydown', ecoute);
  }, []);

  // ---- La consigne du tour (affichée avec les « conseils »)
  const j = etat.camps.joueur;
  const consigne = !monTour ? consigneAttente
    : sel.capacite ? 'Choisis la cible de la capacité (Échap pour annuler).'
      : sel.attaquant ? (sel.cibles ? 'Choisis la cible de ton attaque, ou « Défendre » (Échap pour annuler).' : 'Cette unité peut se mettre en garde (« Défendre »).')
        : sel.sortIndex != null ? 'Choisis la cible du sort (Échap pour annuler).'
          : sel.defausse ? 'Choisis la carte à défausser (Échap pour annuler).'
            : j.actions <= 0 ? 'Plus d’action : finis ton tour.'
              : `${j.actions} action${j.actions > 1 ? 's' : ''} : joue une carte, attaque, défends, ou finis ton tour. Clic droit : voir une carte.`;

  return (
    <>
      <Plateau etat={etat} sel={sel} avatars={avatars} consigne={consigne} glisse={glisse}
        surCarte={surCarte} surUnite={surCible} surHeros={surCible} surFin={finirTour} surDestin={lancerDestin}
        surDefendre={defendre} surCapacite={capacite} surDefausser={defausser} surMediter={mediter}
        surTombeau={setTombeau} surGlisser={surGlisser} surDeposer={surDeposer} loupe={propsLoupe}
        outils={outils} surAbandon={surAbandon} />

      <Renvoi ouverte={renvoi.ouvert && !etat.fini && !fin} main={j.main} premier={etat.actif === 'joueur'} choisies={choisies}
        attente={renvoi.attente} surBasculer={basculerRenvoi} surValider={validerRenvoi} loupe={propsLoupe} />
      <Meditation cartes={monTour ? j.meditation : null} surPlacer={(index) => agir({ type: 'placer', index })} loupe={propsLoupe} />
      <FenetreTombeau titre={tombeau === 'joueur' ? 'Ton Tombeau' : `Tombeau de ${etat.camps.adverse.nom}`}
        cartes={tombeau ? etat.camps[tombeau].tombeau : null} surFermeture={() => setTombeau(null)} loupe={propsLoupe} />
      <Loupe etat={etat} info={loupe} nomAdverse={etat.camps.adverse.nom} surFermeture={() => setLoupe(null)} />
      <Fin fin={fin} boutons={boutonsFin} />
    </>
  );
}
