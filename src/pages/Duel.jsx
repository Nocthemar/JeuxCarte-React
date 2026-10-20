// =====================================================================
//  Écran « Duel des Couronnes » (ancien jeu-cartes.html)
//  Le menu (modes, difficulté, Grimoire, constructeur, règles), puis le plateau d'un duel contre l'Ombre.
//  #/duel?histoire=<niveau> lance directement le duel d'un niveau du mode Histoire (connecté seulement).
//  #/duel?salon=<CODE> : le salon d'un duel en ligne (le lien d'invitation) ; il reste ouvert du menu
//  au duel, puis à la revanche (lib/duel/useLigne.js).
//
//  Le plateau choisi par le joueur (acheté en boutique) devient une classe du <body> : plateau-hiver…
//  Pour en essayer un : #/duel?saison=hiver (printemps, ete, automne, cristaux).
// =====================================================================
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Page from '../components/Page.jsx';
import Menu from '../components/duel/Menu.jsx';
import DuelSolo from '../components/duel/DuelSolo.jsx';
import DuelEnLigne from '../components/duel/DuelEnLigne.jsx';
import Regles from '../components/duel/Regles.jsx';
import Infobulle from '../components/duel/Infobulle.jsx';
import { useAuth } from '../lib/auth.js';
import { useNotifier } from '../lib/notification.js';
import { useDonneesDuel, PLATEAUX } from '../lib/donneesDuel.js';
import { useProfondeur } from '../lib/profondeur.js';
import { useLigne } from '../lib/duel/useLigne.js';
import { grimoireDuJoueur } from '../lib/grimoire.js';
import { trouverNiveau } from '../data/histoire.js';
import { CLES, lirePref, ecrirePref } from '../lib/preferences.js';
import { jouerSon, basculerMuet, estMuet, lireVolume, reglerVolume, musiqueAuPremierGeste } from '../lib/son.js';

// ---------------------------------------------------------------------
//  Téléphone : le duel se joue couché (paysage), en plein écran, comme un jeu.
//  Le navigateur n'accepte le plein écran et le verrouillage de l'orientation qu'après un geste du
//  joueur (le clic sur « Engager le duel ») et pas partout (iPhone : non) : sinon l'écran
//  « Tourne ton téléphone » invite à le faire soi-même.
// ---------------------------------------------------------------------
const estTelephone = () => matchMedia('(pointer: coarse) and (max-width: 940px), (pointer: coarse) and (max-height: 520px)').matches;
let pleinEcranAuto = false;
async function passerEnPaysage() {
  if (!estTelephone()) return;
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      pleinEcranAuto = true;
    }
    await screen.orientation?.lock?.('landscape');
  } catch { /* refusé ou pas disponible : l'écran « Tourne ton téléphone » prend le relais */ }
}
function quitterPaysage() {
  try { screen.orientation?.unlock?.(); } catch { /* rien à déverrouiller */ }
  if (pleinEcranAuto && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  pleinEcranAuto = false;
}

export default function Duel() {
  const { joueur, chargement } = useAuth();
  const donnees = useDonneesDuel(joueur, chargement);
  const notifier = useNotifier();
  const [params] = useSearchParams();
  const naviguer = useNavigate();
  const [regles, setRegles] = useState(false);
  // Le duel en ligne : le salon, et le duel qu'il lance
  const ligne = useLigne({ joueur, grimoire: () => (donnees.pret ? grimoireDuJoueur(donnees) : []), notifier });
  const duelLigne = ligne.duel;
  // Mode Histoire : le niveau demandé dans l'adresse ; nHistoire change à chaque « Réessayer »
  const idHistoire = params.get('histoire');
  const histoire = useMemo(() => (idHistoire ? trouverNiveau(idHistoire) : null), [idHistoire]);
  const [nHistoire, setNHistoire] = useState(1);
  // Le duel en cours : { cartes, difficulte, catalogue, n } (n change à chaque nouvelle partie), ou null au menu
  const [duel, setDuel] = useState(null);
  // Conseils facultatifs : la consigne du tour s'affiche (coupés par défaut, retenus dans le navigateur)
  const [conseils, setConseils] = useState(() => lirePref(CLES.conseils));
  const [pleinEcran, setPleinEcran] = useState(!!document.fullscreenElement);
  const [muet, setMuet] = useState(estMuet);
  const [volume, setVolume] = useState(() => Math.round(lireVolume() * 100));
  useProfondeur();
  // L'ambiance musicale démarre au premier geste du joueur (les navigateurs l'exigent)
  useEffect(() => { musiqueAuPremierGeste(); }, []);

  // Niveau inconnu, ou joueur non connecté (la progression est liée au compte) : retour à la carte
  useEffect(() => {
    if (idHistoire && !chargement && (!histoire || !joueur)) naviguer('/histoire', { replace: true });
  }, [idHistoire, histoire, joueur, chargement, naviguer]);
  // Le duel du niveau : ton Grimoire (celui du menu), le deck et la difficulté du niveau
  const duelHistoire = useMemo(() => (histoire && joueur && donnees.pret
    ? { cartes: grimoireDuJoueur(donnees), difficulte: histoire.niveau.difficulte, catalogue: donnees.catalogue ?? [], histoire }
    : null), [histoire, joueur, donnees]);

  useEffect(() => {
    const surChangement = () => setPleinEcran(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', surChangement);
    return () => document.removeEventListener('fullscreenchange', surChangement);
  }, []);

  const saisonForcee = params.get('saison');
  const plateau = PLATEAUX.includes(saisonForcee) ? saisonForcee : (donnees.plateau ?? 'defaut');
  const classes = `page-profil page-jeu plateau-${plateau}${duel || duelHistoire || duelLigne ? ' en-duel' : ''}${conseils ? ' avec-conseils' : ''}`;

  const lancer = (cartes, difficulte) => {
    setDuel((d) => ({ cartes, difficulte, catalogue: donnees.catalogue ?? [], n: (d?.n ?? 0) + 1 }));
    passerEnPaysage();
    scrollTo(0, 0);
  };
  const retourMenu = () => { setDuel(null); quitterPaysage(); scrollTo(0, 0); };
  // Un duel en ligne commence (lancé par l'hôte quand les deux sont prêts)
  const nDuelLigne = duelLigne?.n;
  useEffect(() => { if (nDuelLigne) { passerEnPaysage(); scrollTo(0, 0); } }, [nDuelLigne]);

  const basculerPleinEcran = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
        if (estTelephone()) await screen.orientation?.lock?.('landscape').catch(() => {});
      }
    } catch { notifier("Le plein écran n'est pas disponible sur ce navigateur.", 'erreur'); }
  };

  // Les outils sous l'historique des jets (règles, conseils, son, plein écran, abandon, volume)
  const outils = (abandonner) => (
    <div className="historique__outils">
      <button type="button" className="btn-outil" title="Règles du duel" aria-label="Règles du duel" onClick={() => setRegles(true)}>?</button>
      <button type="button" className={`btn-outil${conseils ? ' est-actif' : ''}`} id="btn-conseils" aria-pressed={conseils}
        title="Afficher les conseils (que faire maintenant ?)" aria-label="Conseils"
        onClick={() => { ecrirePref(CLES.conseils, !conseils); setConseils(!conseils); jouerSon('clic'); }}>💡</button>
      <button type="button" className={`btn-outil${muet ? ' est-muet' : ''}`} id="btn-son" aria-label="Couper le son" aria-pressed={muet}
        title={muet ? 'Activer le son' : 'Couper le son'} onClick={() => { basculerMuet(); setMuet(estMuet()); jouerSon('clic'); }}>
        <svg className="ico-son" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" /><path className="ico-son__ondes" d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" /><path className="ico-son__barre" d="M16 9l6 6M22 9l-6 6" /></svg>
      </button>
      <button type="button" className={`btn-outil${pleinEcran ? ' est-actif' : ''}`} title={pleinEcran ? 'Quitter le plein écran' : 'Plein écran'} aria-label="Plein écran" onClick={basculerPleinEcran}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" /></svg>
      </button>
      <button type="button" className="btn-outil" title="Abandonner" aria-label="Abandonner le duel" onClick={abandonner}>⚑</button>
      <label className="volume" title="Volume du son">
        <span className="volume__titre">Volume</span>
        <input type="range" id="volume" min="0" max="100" step="5" value={volume} aria-label="Volume du son" style={{ '--pct': `${volume}%` }}
          onChange={(e) => { reglerVolume(e.target.value / 100); setVolume(Number(e.target.value)); setMuet(estMuet()); }}
          onPointerUp={() => jouerSon('clic')} onKeyUp={() => jouerSon('clic')} />
        <span className="volume__valeur" id="volume-valeur">{volume} %</span>
      </label>
    </div>
  );

  return (
    <Page id="duel" classes={classes} titre="Duel des Couronnes">
      {/* Décor fixe : forteresse low poly, brume */}
      <div className="scene" id="scene" aria-hidden="true">
        <div className="scene__fond" />
        <div className="scene__brume" />
        <div className="scene__brume scene__brume--2" />
      </div>

      <main className="jeu-wrap">
        {idHistoire ? (duelHistoire && (
          <DuelSolo key={`h${nHistoire}`} config={duelHistoire} outils={outils}
            surRejouer={() => setNHistoire((n) => n + 1)}
            surMenu={() => { quitterPaysage(); naviguer(`/histoire?chapitre=${encodeURIComponent(histoire.chapitre.id)}`, { viewTransition: true }); }} />
        )) : duelLigne ? (
          <DuelEnLigne key={`l${duelLigne.n}`} duel={duelLigne} ligne={ligne} salon={ligne.salon} outils={outils}
            surRevanche={() => { ligne.revenir(); quitterPaysage(); scrollTo(0, 0); }}
            surQuitter={() => { ligne.quitter(); quitterPaysage(); scrollTo(0, 0); }} />
        ) : duel
          ? <DuelSolo key={duel.n} config={duel} outils={outils}
              surRejouer={() => lancer(duel.cartes, duel.difficulte)} surMenu={retourMenu} />
          : <Menu joueur={joueur} donnees={donnees} ligne={ligne} surRegles={() => setRegles(true)} surJouer={lancer} />}
      </main>

      <Regles ouverte={regles} surFermeture={() => setRegles(false)} />
      <Infobulle />

      {/* Téléphone en portrait pendant un duel : invitation à le tourner (styles/jeu-cartes.css) */}
      <div className="tourne-telephone" aria-hidden="true">
        <span className="tourne-telephone__icone" />
        <strong>Tourne ton téléphone</strong>
        <span>Le Duel des Couronnes se joue à l’horizontale.</span>
      </div>
    </Page>
  );
}
