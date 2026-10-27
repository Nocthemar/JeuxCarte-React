// =====================================================================
//  Écran « Paramètres » (ancien parametres.html + JS/parametres.js, même HTML)
//  - Son : volume général, musique, effets (lib/son.js), tout couper, écouter ;
//  - Affichage : animations (complètes, réduites, coupées), mode performance, effets réduits,
//    conseils du duel (lib/preferences.js), thème clair ;
//  - Appli : installer le jeu sur l'appareil (lib/appli.js) ;
//  - Compte : déconnexion (cet appareil ou tous), mot de passe (comptes e-mail), double authentification (MJ),
//    suppression du compte (supprimer_mon_compte, seulement juste après s'être reconnecté).
//  Tout est retenu dans le navigateur, sauf ce qui touche au compte.
// =====================================================================
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Page from '../components/Page.jsx';
import { supabase } from '../lib/supabase.js';
import { useAuth, connexionDiscord, connexionEmail, deconnexion } from '../lib/auth.js';
import { useNotifier } from '../lib/notification.js';
import { changerPortrait, retirerPortrait, effacerMesPortraits } from '../lib/portrait.js';
import { CLES, lirePref, ecrirePref, niveauAnimationsChoisi, ecrireNiveauAnimations } from '../lib/preferences.js';
import { estIOS, installer, useAppli } from '../lib/appli.js';
import {
  jouerSon, lireVolumes, reglerVolume, reglerVolumeEffets, reglerVolumeMusique,
  estMuet, basculerMuet, demarrerMusique, arreterMusique,
} from '../lib/son.js';

const ANIMATIONS = [
  ['completes', 'Complètes', 'Toutes les animations du jeu.'],
  ['reduites', 'Réduites', 'Plus courtes, sans secousses ni voiles, moins de particules.'],
  ['coupees', 'Coupées', 'Aucun mouvement : le jeu va plus vite.'],
];
const CASES = [
  ['mode-perf', CLES.modePerformance, 'Mode performance', 'Pour les ordinateurs et téléphones modestes : effets réduits, animations réduites, pas d’inclinaison des cartes ni d’or animé.'],
  ['effets-legers', CLES.effetsLegers, 'Effets visuels réduits', 'Moins de particules, de lueurs et de braises.'],
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

// La double authentification (MJ) : une application d'authentification (codes à 6 chiffres) en plus de
// Discord ou du mot de passe. Supabase la demande ensuite à chaque connexion (pages/Connexion.jsx) ; le serveur
// peut l'exiger pour les actions de MJ (réglage mfa_mj, supabase/securite.sql).
const lireDoubleAuth = () => supabase.auth.mfa.listFactors().then(({ data }) => {
  const facteur = data?.totp?.find((f) => f.status === 'verified');
  return facteur ? { etape: 'active', facteur } : { etape: 'inactive' };
}, () => ({ etape: 'inactive' }));

function DoubleAuth() {
  const notifier = useNotifier();
  const [etat, setEtat] = useState({ etape: 'chargement' });   // chargement | active | inactive | inscription
  const [code, setCode] = useState('');
  const [envoi, setEnvoi] = useState(false);

  const relire = () => lireDoubleAuth().then(setEtat);
  useEffect(() => { lireDoubleAuth().then(setEtat); }, []);

  const commencer = async () => {
    setEnvoi(true);
    // Une inscription commencée puis abandonnée bloquerait la suivante : on l'efface
    const { data: liste } = await supabase.auth.mfa.listFactors();
    for (const f of liste?.all ?? []) if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id });
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Nocthémar' });
    setEnvoi(false);
    if (error) { notifier(error.message, 'erreur'); return; }
    setEtat({ etape: 'inscription', id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  };
  const valider = async (e) => {
    e.preventDefault();
    setEnvoi(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: etat.id, code: code.replace(/\s/g, '') });
    setEnvoi(false);
    if (error) { notifier('Code incorrect ou expiré.', 'erreur'); setCode(''); return; }
    setCode('');
    notifier('Double authentification activée.');
    relire();
  };
  const retirer = async () => {
    if (!confirm('Retirer la double authentification ?')) return;
    const { error } = await supabase.auth.mfa.unenroll({ factorId: etat.facteur.id });
    if (error) { notifier(error.message, 'erreur'); return; }
    notifier('Double authentification retirée.');
    relire();
  };

  if (etat.etape === 'chargement') return null;
  return (
    <div className="reglage reglage--double-auth">
      <span><b>Double authentification</b><small>{etat.etape === 'active'
        ? 'Activée : un code de ton application d’authentification est demandé à chaque connexion.'
        : 'Recommandée pour les MJ : un code de ton application d’authentification (Google Authenticator, Aegis…) en plus de ta connexion.'}</small></span>
      {etat.etape === 'active' && <button type="button" className="btn-sobre" onClick={retirer}>Retirer</button>}
      {etat.etape === 'inactive' && <button type="button" className="btn-sobre" disabled={envoi} onClick={commencer}>Activer</button>}
      {etat.etape === 'inscription' && (
        <form className="double-auth" onSubmit={valider}>
          <img src={etat.qr} alt="QR code à scanner avec ton application d’authentification" width="180" height="180" />
          <small>Ou saisis cette clé : <code>{etat.secret}</code></small>
          <label htmlFor="code-double-auth">Code à 6 chiffres</label>
          <input id="code-double-auth" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} required />
          <button type="submit" className="btn-sobre" disabled={envoi}>Valider</button>
        </form>
      )}
    </div>
  );
}

// La confirmation de la suppression du compte : il faut taper SUPPRIMER, et s'être connecté il y a moins de
// 10 minutes (vérifié par le serveur) : compte e-mail, le mot de passe ; compte Discord, un passage par Discord
// Le portrait d'un compte e-mail : une image choisie sur l'appareil (lib/portrait.js) ; les comptes Discord gardent celui de Discord
function Portrait({ joueur }) {
  const { recharger } = useAuth();
  const notifier = useNotifier();
  const champ = useRef(null);
  const [envoi, setEnvoi] = useState(false);
  const agir = async (travail, message) => {
    setEnvoi(true);
    try { await travail(); await recharger(); notifier(message); }
    catch (e) { notifier(e.message, 'erreur'); }
    setEnvoi(false);
  };
  const choisi = (e) => {
    const fichier = e.target.files?.[0];
    e.target.value = '';   // pour pouvoir rechoisir le même fichier
    if (fichier) agir(() => changerPortrait(joueur.discord_id, fichier), 'Ton nouveau portrait est en place.');
  };
  return (
    <div className="reglage reglage--portrait">
      <span className="reglage__compte">
        {joueur.avatar_url ? <img src={joueur.avatar_url} alt="" /> : <span className="reglage__portrait-vide" aria-hidden="true">{(joueur.username ?? '?').slice(0, 1)}</span>}
        <span><b>Portrait</b><small>Choisis une image sur ton appareil : elle est recadrée en carré.</small></span>
      </span>
      <span className="reglage__boutons">
        <input ref={champ} type="file" accept="image/*" hidden onChange={choisi} />
        <button type="button" className="btn-or" disabled={envoi} onClick={() => champ.current.click()}>{envoi ? 'Envoi…' : 'Choisir une image'}</button>
        {joueur.avatar_url && <button type="button" className="btn-sobre" disabled={envoi}
          onClick={() => agir(() => retirerPortrait(joueur.discord_id), 'Portrait retiré.')}>Retirer</button>}
      </span>
    </div>
  );
}

function Suppression({ joueur, surFermeture }) {
  const notifier = useNotifier();
  const fenetre = useRef(null);
  const [texte, setTexte] = useState('');
  const [mdp, setMdp] = useState('');
  const [reconnexion, setReconnexion] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const parEmail = joueur.fournisseur === 'email';
  useEffect(() => {
    const d = fenetre.current;
    d.showModal();
    return () => { if (d.open) d.close(); };
  }, []);
  const supprimer = async () => {
    setEnvoi(true);
    if (parEmail) {
      const { data: { user } } = await supabase.auth.getUser();
      const erreur = await connexionEmail(user?.email ?? '', mdp);
      if (erreur) { notifier(erreur, 'erreur'); setEnvoi(false); return; }
    }
    if (parEmail) await effacerMesPortraits(joueur.discord_id);   // ses images ne restent pas en ligne
    const { error } = await supabase.rpc('supprimer_mon_compte', { p_confirmation: texte.trim() });
    if (error && /^REAUTH/.test(error.message)) { setReconnexion(true); setEnvoi(false); return; }
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
      {parEmail && (
        <>
          <label htmlFor="confirmation-mdp">Par sécurité, ton mot de passe :</label>
          <input type="password" id="confirmation-mdp" autoComplete="current-password" value={mdp} onChange={(e) => setMdp(e.target.value)} />
        </>
      )}
      {reconnexion && (
        <p className="reglages-dialogue__reconnexion" role="alert">Par sécurité, reconnecte-toi avec Discord juste avant de supprimer ton compte.
          {' '}<button type="button" className="btn-sobre" onClick={() => connexionDiscord('#/parametres?supprimer=1')}>Me reconnecter</button>
        </p>
      )}
      <div className="reglages-dialogue__boutons">
        <button type="button" className="btn-sobre" id="suppression-annuler" onClick={surFermeture}>Annuler</button>
        <button type="button" className="btn-danger" id="suppression-ok" disabled={texte.trim() !== 'SUPPRIMER' || (parEmail && !mdp) || envoi} onClick={supprimer}>Supprimer définitivement</button>
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
  const [animations, setAnimations] = useState(niveauAnimationsChoisi);
  const [clair, setClair] = useState(themeClair);
  const [ecoute, setEcoute] = useState(false);
  const [params, setParams] = useSearchParams();
  // ?supprimer=1 : retour de la reconnexion Discord demandée par la suppression du compte
  const [suppression, setSuppression] = useState(() => params.get('supprimer') === '1');
  useEffect(() => { if (params.has('supprimer')) setParams({}, { replace: true }); }, [params, setParams]);

  const majSon = () => { setVolumes(lireVolumes()); setMuet(estMuet()); };
  // La musique d'essai s'arrête en quittant l'écran
  useEffect(() => () => arreterMusique(), []);

  const basculerCase = (id, cle, actif) => {
    ecrirePref(cle, actif);
    setCases((c) => ({ ...c, [id]: actif }));
    notifier('Réglage enregistré.');
  };
  const choisirAnimations = (niveau) => {
    ecrireNiveauAnimations(niveau);
    setAnimations(niveau);
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
          <div className="reglage reglage--choix" role="radiogroup" aria-labelledby="titre-animations">
            <span>
              <b id="titre-animations">Animations</b>
              <small>{cases['mode-perf'] && animations === 'completes'
                ? 'Réduites par le mode performance.'
                : ANIMATIONS.find(([niveau]) => niveau === animations)[2]}</small>
            </span>
            <span className="reglage__options">
              {ANIMATIONS.map(([niveau, titre]) => (
                <label key={niveau}>
                  <input type="radio" name="animations" value={niveau} checked={animations === niveau} onChange={() => choisirAnimations(niveau)} />
                  <span>{titre}</span>
                </label>
              ))}
            </span>
          </div>
          {CASES.map(([id, cle, titre, aide]) => {
            // le mode performance réduit déjà les effets : la case reste cochée et grisée
            const compris = id === 'effets-legers' && cases['mode-perf'];
            return (
              <label key={id} className="reglage reglage--case">
                <input type="checkbox" id={id} checked={cases[id] || compris} disabled={compris} onChange={(e) => basculerCase(id, cle, e.target.checked)} />
                <span><b>{titre}</b><small>{compris ? 'Compris dans le mode performance.' : aide}</small></span>
              </label>
            );
          })}
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
              <button type="button" className="btn-or" id="btn-connecter" onClick={() => connexionDiscord()}>Connecter Discord</button>
            </div>
          )}
          {joueur && (
            <div id="compte-connecte">
              <div className="reglage">
                <span className="reglage__compte">
                  <img id="compte-avatar" alt="" src={joueur.avatar_url ?? undefined} hidden={!joueur.avatar_url} /><b id="compte-nom">{joueur.username ?? 'Aventurier'}</b>
                  <small>{joueur.fournisseur === 'email' ? 'Compte e-mail' : 'Compte Discord'}</small>
                </span>
                <span className="reglage__boutons">
                  <button type="button" className="btn-sobre" id="btn-deconnexion" onClick={() => deconnexion('local')}>Se déconnecter</button>
                  <button type="button" className="btn-sobre" id="btn-deconnexion-partout" title="Ferme aussi la session sur tes autres appareils"
                    onClick={() => deconnexion('global')}>Partout</button>
                </span>
              </div>
              {joueur.fournisseur === 'email' && <Portrait joueur={joueur} />}
              {joueur.fournisseur === 'email' && (
                <div className="reglage">
                  <span><b>Mot de passe</b><small>Choisis un nouveau mot de passe pour ton compte.</small></span>
                  <Link className="btn-sobre" to="/mot-de-passe">Changer</Link>
                </div>
              )}
              {joueur.is_mj && <DoubleAuth />}
              <div className="reglage reglage--danger">
                <span><b>Supprimer mon compte</b><small>Efface définitivement tes cartes, ton or, ta progression et ton profil.</small></span>
                <button type="button" className="btn-danger" id="btn-supprimer" onClick={() => setSuppression(true)}>Supprimer…</button>
              </div>
            </div>
          )}
        </section>
      </main>

      {suppression && joueur && <Suppression joueur={joueur} surFermeture={() => setSuppression(false)} />}
    </Page>
  );
}
