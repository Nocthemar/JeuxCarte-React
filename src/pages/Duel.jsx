// =====================================================================
//  Écran « Duel des Couronnes » (ancien jeu-cartes.html)
//  Le menu (modes, difficulté, Grimoire, constructeur, règles), puis le plateau d'un duel contre l'Ombre.
//  (#/duel?histoire=<niveau>, l'ancienne adresse d'un niveau du mode Histoire : les niveaux se jouent maintenant aux
//  Gemmes, #/gemmes?histoire=<niveau>)
//  #/duel?salon=<CODE> : le salon d'un duel en ligne (le lien d'invitation) ; il reste ouvert du menu
//  au duel, puis à la revanche (lib/duel/useLigne.js).
//
//  Le plateau choisi par le joueur (acheté en boutique) devient une classe du <body> : plateau-hiver…
//  Pour en essayer un : #/duel?saison=hiver (printemps, ete, automne, cristaux, flamme, plage).
// =====================================================================
import { useEffect, useState } from 'react';
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
import { CLES, lirePref, ecrirePref } from '../lib/preferences.js';
import { jouerSon, basculerMuet, estMuet, lireVolume, reglerVolume, musiqueAuPremierGeste } from '../lib/son.js';

// ---------------------------------------------------------------------
//  Téléphone : le duel passe en plein écran, comme un jeu (plus de barres du navigateur). Il se joue tenu
//  droit (portrait : src/telephone/styles/duel.css) ou couché, au choix du joueur : l'orientation n'est plus
//  verrouillée. Le navigateur n'accepte le plein écran qu'après un geste du joueur (« Engager le duel »)
//  et pas partout (iPhone : non).
// ---------------------------------------------------------------------
const estTelephone = () => matchMedia('(pointer: coarse) and (max-width: 940px), (pointer: coarse) and (max-height: 520px)').matches;
let pleinEcranAuto = false;
async function passerEnPleinEcran() {
  if (!estTelephone()) return;
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      pleinEcranAuto = true;
    }
  } catch { /* refusé ou pas disponible : le duel reste dans la page */ }
}
function quitterPleinEcran() {
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
  // L'ancienne adresse d'un niveau du mode Histoire : vers les Gemmes
  const idHistoire = params.get('histoire');
  useEffect(() => {
    if (idHistoire) naviguer(`/gemmes?histoire=${encodeURIComponent(idHistoire)}`, { replace: true });
  }, [idHistoire, naviguer]);
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


  useEffect(() => {
    const surChangement = () => setPleinEcran(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', surChangement);
    return () => document.removeEventListener('fullscreenchange', surChangement);
  }, []);

  const saisonForcee = params.get('saison');
  const plateau = PLATEAUX.includes(saisonForcee) ? saisonForcee : (donnees.plateau ?? 'defaut');
  const classes = `page-profil page-jeu plateau-${plateau}${duel || duelLigne ? ' en-duel' : ''}${conseils ? ' avec-conseils' : ''}`;

  const lancer = (cartes, difficulte) => {
    setDuel((d) => ({ cartes, difficulte, catalogue: donnees.catalogue ?? [], n: (d?.n ?? 0) + 1 }));
    passerEnPleinEcran();
    scrollTo(0, 0);
  };
  const retourMenu = () => { setDuel(null); quitterPleinEcran(); scrollTo(0, 0); };
  // Un duel en ligne commence (lancé par l'hôte quand les deux sont prêts)
  const nDuelLigne = duelLigne?.n;
  useEffect(() => { if (nDuelLigne) { passerEnPleinEcran(); scrollTo(0, 0); } }, [nDuelLigne]);

  const basculerPleinEcran = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
        if (estTelephone()) await screen.orientation?.lock?.('landscape').catch(() => {});
      }
    } catch { notifier("Le plein écran n'est pas disponible sur ce navigateur.", 'erreur'); }
  };

  // Les outils sous l'historique des jets : une rangée de boutons (règles, conseils, plein écran,
  // abandon), puis le son (couper, volume)
  const outils = (abandonner) => (
    <div className="historique__outils">
      <div className="historique__boutons">
        <button type="button" className="btn-outil" title="Règles du duel" aria-label="Règles du duel" onClick={() => setRegles(true)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5h5.5a2 2 0 0 1 1.5.7 2 2 0 0 1 1.5-.7H19v14h-5.5a1.5 1.5 0 0 0-1.5 1.5 1.5 1.5 0 0 0-1.5-1.5H5z" /><path d="M12 5.2V20" /></svg>
        </button>
        <button type="button" className={`btn-outil${conseils ? ' est-actif' : ''}`} id="btn-conseils" aria-pressed={conseils}
          title="Afficher les conseils (que faire maintenant ?)" aria-label="Conseils"
          onClick={() => { ecrirePref(CLES.conseils, !conseils); setConseils(!conseils); jouerSon('clic'); }}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" /></svg>
        </button>
        <button type="button" className={`btn-outil${pleinEcran ? ' est-actif' : ''}`} title={pleinEcran ? 'Quitter le plein écran' : 'Plein écran'} aria-label="Plein écran" onClick={basculerPleinEcran}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" /></svg>
        </button>
        <button type="button" className="btn-outil btn-outil--danger" title="Abandonner" aria-label="Abandonner le duel" onClick={abandonner}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 21V4" /><path d="M6 4h11l-2.5 4L17 12H6" /></svg>
        </button>
      </div>
      <div className="volume">
        <button type="button" className={`btn-outil${muet ? ' est-muet' : ''}`} id="btn-son" aria-label="Couper le son" aria-pressed={muet}
          title={muet ? 'Activer le son' : 'Couper le son'} onClick={() => { basculerMuet(); setMuet(estMuet()); jouerSon('clic'); }}>
          <svg className="ico-son" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" /><path className="ico-son__ondes" d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" /><path className="ico-son__barre" d="M16 9l6 6M22 9l-6 6" /></svg>
        </button>
        <input type="range" id="volume" min="0" max="100" step="5" value={volume} aria-label="Volume du son" title="Volume du son" style={{ '--pct': `${volume}%` }}
          onChange={(e) => { reglerVolume(e.target.value / 100); setVolume(Number(e.target.value)); setMuet(estMuet()); }}
          onPointerUp={() => jouerSon('clic')} onKeyUp={() => jouerSon('clic')} />
        <span className="volume__valeur" id="volume-valeur">{volume} %</span>
      </div>
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
        {idHistoire ? null : duelLigne ? (
          <DuelEnLigne key={`l${duelLigne.n}`} duel={duelLigne} ligne={ligne} salon={ligne.salon} outils={outils}
            surRevanche={() => { ligne.revenir(); quitterPleinEcran(); scrollTo(0, 0); }}
            surQuitter={() => { ligne.quitter(); quitterPleinEcran(); scrollTo(0, 0); }} />
        ) : duel
          ? <DuelSolo key={duel.n} config={duel} outils={outils}
              surRejouer={() => lancer(duel.cartes, duel.difficulte)} surMenu={retourMenu} />
          : <Menu joueur={joueur} donnees={donnees} ligne={ligne} surRegles={() => setRegles(true)} surJouer={lancer} />}
      </main>

      <Regles ouverte={regles} surFermeture={() => setRegles(false)} />
      <Infobulle />

    </Page>
  );
}
