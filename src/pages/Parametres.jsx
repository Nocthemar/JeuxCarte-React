// =====================================================================
//  Écran « Paramètres » (ancien parametres.html + JS/parametres.js, même HTML)
//  - Son : volume général, musique, effets (lib/son.js), tout couper, écouter ;
//  - Affichage : animations réduites, effets légers, conseils du duel (lib/preferences.js), thème clair ;
//  - Appli : installer le jeu sur l'appareil (lib/appli.js) ;
//  - Compte : déconnexion, suppression du compte (supprimer_mon_compte).
//  Tout est retenu dans le navigateur, sauf la suppression du compte.
// =====================================================================
import { useEffect, useRef, useState } from 'react';
import Page from '../components/Page.jsx';
import { supabase } from '../lib/supabase.js';
import { useAuth, connexionDiscord, deconnexion } from '../lib/auth.js';
import { useNotifier } from '../lib/notification.js';
import { CLES, lirePref, ecrirePref } from '../lib/preferences.js';
import { estIOS, installer, useAppli } from '../lib/appli.js';
import {
  jouerSon, lireVolumes, reglerVolume, reglerVolumeEffets, reglerVolumeMusique,
  estMuet, basculerMuet, demarrerMusique, arreterMusique,
} from '../lib/son.js';

const CASES = [
  ['anim-reduites', CLES.animationsReduites, 'Animations réduites', 'Coupe les mouvements, envols de cartes et secousses (le jeu va plus vite).'],
  ['effets-legers', CLES.effetsLegers, 'Effets légers (performances)', 'Moins de particules et de braises : pour les ordinateurs et téléphones modestes.'],
  ['conseils', CLES.conseils, 'Conseils pendant le duel', 'Une ligne discrète indique quoi faire (aussi avec le bouton 💡 du duel).'],
];
const themeClair = () => { try { return localStorage.getItem('nocthemar-theme') === 'jour'; } catch { return false; } };

// Un curseur de volume (0 à 100 %)
function Curseur({ id, libelle, aide, valeur, surChangement, surFin }) {
  const pct = Math.round(valeur * 100);
  return (
    <div className="reglage reglage--curseur">
      <label htmlFor={`vol-${id}`}>{libelle}{aide && <> <small>{aide}</small></>}</label>
      <input type="range" id={`vol-${id}`} min="0" max="100" step="5" value={pct} style={{ '--pct': `${pct}%` }}
        onChange={(e) => surChangement(e.target.value / 100)} onPointerUp={surFin} onKeyUp={surFin} />
      <output id={`val-${id}`}>{pct} %</output>
    </div>
  );
}

// Installer le jeu comme une appli : le bouton du navigateur s'il en propose un, sinon la marche à suivre
function Appli() {
  const { installable, installee } = useAppli();
  let contenu;
  if (installee) contenu = <span>Le jeu est installé sur cet appareil.</span>;
  else if (installable) {
    contenu = (
      <>
        <span><b>Installer le jeu</b><small>Une icône Nocthémar sur ton écran d’accueil, en plein écran ; le duel contre l’Ombre marche même sans internet.</small></span>
        <button type="button" className="btn-or" id="btn-installer" onClick={installer}>Installer l’appli</button>
      </>
    );
  } else if (estIOS()) {
    contenu = <span><b>Installer le jeu</b><small>Dans Safari, touche le bouton Partager, puis « Sur l’écran d’accueil ».</small></span>;
  } else {
    contenu = <span><b>Installer le jeu</b><small>Ouvre le jeu dans Chrome ou Edge (ordinateur, Android), puis utilise « Installer » du menu du navigateur. Sur iPhone : Safari, Partager, « Sur l’écran d’accueil ».</small></span>;
  }
  return (
    <section className="reglages-bloc" aria-labelledby="titre-appli">
      <h2 id="titre-appli">Appli</h2>
      <div className="reglage" id="appli">{contenu}</div>
    </section>
  );
}

// La confirmation de la suppression du compte : il faut taper SUPPRIMER
function Suppression({ surFermeture }) {
  const notifier = useNotifier();
  const fenetre = useRef(null);
  const [texte, setTexte] = useState('');
  const [envoi, setEnvoi] = useState(false);
  useEffect(() => {
    const d = fenetre.current;
    d.showModal();
    return () => { if (d.open) d.close(); };
  }, []);
  const supprimer = async () => {
    setEnvoi(true);
    const { error } = await supabase.rpc('supprimer_mon_compte', { p_confirmation: texte.trim() });
    if (error) {
      notifier(/PGRST202|schema cache/.test(`${error.code} ${error.message}`)
        ? 'La suppression de compte n’est pas encore installée (SQL/compte.sql).' : (error.message || 'Suppression impossible.'), 'erreur');
      setEnvoi(false);
      return;
    }
    await supabase.auth.signOut().catch(() => {});
    alert('Ton compte a été supprimé. Adieu, aventurier.');
    location.hash = '#/duel';
    location.reload();
  };
  return (
    <dialog className="reglages-dialogue" id="dialogue-suppression" aria-labelledby="suppression-titre" ref={fenetre}
      onCancel={(e) => { e.preventDefault(); surFermeture(); }}>
      <h2 id="suppression-titre">Supprimer ton compte ?</h2>
      <p>C’est <b>définitif</b> : tes cartes, ton grimoire, ton or, tes objets, ta progression (Pass, Histoire, rang) et ton profil seront effacés. Personne ne pourra les récupérer.</p>
      <label htmlFor="confirmation">Pour confirmer, tape <b>SUPPRIMER</b> :</label>
      <input type="text" id="confirmation" autoComplete="off" spellCheck="false" autoFocus value={texte} onChange={(e) => setTexte(e.target.value)} />
      <div className="reglages-dialogue__boutons">
        <button type="button" className="btn-sobre" id="suppression-annuler" onClick={surFermeture}>Annuler</button>
        <button type="button" className="btn-danger" id="suppression-ok" disabled={texte.trim() !== 'SUPPRIMER' || envoi} onClick={supprimer}>Supprimer définitivement</button>
      </div>
    </dialog>
  );
}

export default function Parametres() {
  const { joueur, chargement } = useAuth();
  const notifier = useNotifier();
  const [volumes, setVolumes] = useState(lireVolumes);
  const [muet, setMuet] = useState(estMuet);
  const [cases, setCases] = useState(() => Object.fromEntries(CASES.map(([id, cle]) => [id, lirePref(cle)])));
  const [clair, setClair] = useState(themeClair);
  const [ecoute, setEcoute] = useState(false);
  const [suppression, setSuppression] = useState(false);

  const majSon = () => { setVolumes(lireVolumes()); setMuet(estMuet()); };
  // La musique d'essai s'arrête en quittant l'écran
  useEffect(() => () => arreterMusique(), []);

  const basculerCase = (id, cle, actif) => {
    ecrirePref(cle, actif);
    setCases((c) => ({ ...c, [id]: actif }));
    notifier('Réglage enregistré.');
  };
  const basculerTheme = (actif) => {
    try { localStorage.setItem('nocthemar-theme', actif ? 'jour' : 'nuit'); } catch { /* stockage indisponible */ }
    if (actif) document.documentElement.dataset.theme = 'jour';
    else delete document.documentElement.dataset.theme;
    setClair(actif);
  };

  return (
    <Page id="parametres" classes="page-profil page-parametres" titre="Paramètres">
      <main className="profil-wrap reglages">
        <header className="reglages-entete">
          <h1>Paramètres</h1>
          <p>Réglés pour ce navigateur : ils s’appliquent à toutes les pages du jeu.</p>
        </header>

        {/* Son */}
        <section className="reglages-bloc" aria-labelledby="titre-son">
          <h2 id="titre-son">Son</h2>
          <Curseur id="general" libelle="Volume général" valeur={volumes.general} surChangement={(v) => { reglerVolume(v); majSon(); }} />
          <Curseur id="musique" libelle="Musique" aide="ambiance générée pendant le jeu" valeur={volumes.musique} surChangement={(v) => { reglerVolumeMusique(v); majSon(); }} />
          <Curseur id="effets" libelle="Effets sonores" aide="coups, dés, cartes, sceaux" valeur={volumes.effets}
            surChangement={(v) => { reglerVolumeEffets(v); majSon(); }} surFin={() => jouerSon('cloche')} />
          <div className="reglage">
            <label className="reglage__case">
              <input type="checkbox" id="muet" checked={muet} onChange={(e) => { if (e.target.checked !== estMuet()) basculerMuet(); majSon(); }} /> Tout couper
            </label>
            <span className="reglage__boutons">
              <button type="button" className="btn-sobre" id="essai-effet" onClick={() => { jouerSon('cire'); jouerSon('cloche', 0.35); }}>Écouter un effet</button>
              <button type="button" className="btn-sobre" id="essai-musique"
                onClick={() => { if (ecoute) arreterMusique(); else demarrerMusique(); setEcoute(!ecoute); }}>
                {ecoute ? 'Arrêter la musique' : 'Écouter la musique'}
              </button>
            </span>
          </div>
        </section>

        {/* Affichage */}
        <section className="reglages-bloc" aria-labelledby="titre-affichage">
          <h2 id="titre-affichage">Affichage et animations</h2>
          {CASES.map(([id, cle, titre, aide]) => (
            <label key={id} className="reglage reglage--case">
              <input type="checkbox" id={id} checked={cases[id]} onChange={(e) => basculerCase(id, cle, e.target.checked)} />
              <span><b>{titre}</b><small>{aide}</small></span>
            </label>
          ))}
          <label className="reglage reglage--case">
            <input type="checkbox" id="theme-clair" checked={clair} onChange={(e) => basculerTheme(e.target.checked)} />
            <span><b>Thème clair</b><small>Pages claires, comme le jour sur Nocthémar.</small></span>
          </label>
        </section>

        <Appli />

        {/* Compte */}
        <section className="reglages-bloc" aria-labelledby="titre-compte">
          <h2 id="titre-compte">Compte</h2>
          {!chargement && !joueur && (
            <div className="reglage" id="compte-deconnecte">
              <span>Tu n’es pas connecté.</span>
              <button type="button" className="btn-or" id="btn-connecter" onClick={connexionDiscord}>Connecter Discord</button>
            </div>
          )}
          {joueur && (
            <div id="compte-connecte">
              <div className="reglage">
                <span className="reglage__compte">
                  <img id="compte-avatar" alt="" src={joueur.avatar_url ?? undefined} hidden={!joueur.avatar_url} /><b id="compte-nom">{joueur.username ?? 'Aventurier'}</b>
                </span>
                <button type="button" className="btn-sobre" id="btn-deconnexion" onClick={deconnexion}>Se déconnecter</button>
              </div>
              <div className="reglage reglage--danger">
                <span><b>Supprimer mon compte</b><small>Efface définitivement tes cartes, ton or, ta progression et ton profil.</small></span>
                <button type="button" className="btn-danger" id="btn-supprimer" onClick={() => setSuppression(true)}>Supprimer…</button>
              </div>
            </div>
          )}
        </section>
      </main>

      {suppression && <Suppression surFermeture={() => setSuppression(false)} />}
    </Page>
  );
}
