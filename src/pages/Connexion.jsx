// =====================================================================
//  Écran « Connexion » : la porte du jeu. Aucun autre écran ne s'ouvre sans être connecté (RoutePrivee).
//  - Continuer avec Discord (OAuth : le secret de l'application reste chez Supabase) ;
//  - ou une adresse e-mail et un mot de passe (Supabase Auth : mot de passe haché, jamais en clair) ;
//  - créer un compte (lien de confirmation par e-mail), mot de passe oublié (lien de réinitialisation) ;
//  - ensuite, si besoin : le code de double authentification (MJ), le pseudo d'un nouveau compte e-mail.
//  Une fois tout bon : retour à l'écran demandé (?retour=/boutique), sinon le Duel.
//
//  nouveauMotDePasse : l'écran du lien « mot de passe oublié » (#/mot-de-passe)
// =====================================================================
import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import Page from '../components/Page.jsx';
import Captcha from '../components/Captcha.jsx';
import { supabase } from '../lib/supabase.js';
import {
  useAuth, joueurPret, retourSur, connexionDiscord, connexionEmail, inscriptionEmail, motDePasseOublie,
  nouveauMotDePasse as changerMotDePasse, deconnexion, MOT_DE_PASSE_MIN, messageAuth, CLE_CAPTCHA,
} from '../lib/auth.js';

// Un champ de formulaire avec son libellé
function Champ({ id, libelle, aide, ...props }) {
  return (
    <label className="connexion__champ" htmlFor={id}>
      <span>{libelle}</span>
      <input id={id} name={id} required {...props} />
      {aide && <small>{aide}</small>}
    </label>
  );
}

// Le bouton d'envoi (désactivé pendant l'envoi, ou tant que la vérification anti-robot n'est pas faite)
function Envoyer({ envoi, captcha = true, jeton, children }) {
  return (
    <button type="submit" className="connexion__bouton connexion__bouton--principal" disabled={envoi || (captcha && CLE_CAPTCHA && !jeton)}>
      {envoi ? 'Un instant…' : children}
    </button>
  );
}

const Erreur = ({ texte }) => (texte ? <p className="connexion__erreur" role="alert">{texte}</p> : null);
const Info = ({ texte }) => (texte ? <p className="connexion__info" role="status">{texte}</p> : null);

// Connexion, création de compte, mot de passe oublié
function FormulaireEmail({ retour }) {
  const [mode, setMode] = useState('connexion');   // 'connexion' | 'inscription' | 'oubli'
  const [email, setEmail] = useState('');
  const [mdp, setMdp] = useState('');
  const [mdp2, setMdp2] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const [info, setInfo] = useState('');
  const [jeton, setJeton] = useState(null);
  const [nCaptcha, setNCaptcha] = useState(0);   // un jeton anti-robot ne sert qu'une fois : nouveau widget

  const changerMode = (m) => { setMode(m); setErreur(''); setInfo(''); setMdp(''); setMdp2(''); };
  const envoyer = async (e) => {
    e.preventDefault();
    setEnvoi(true); setErreur(''); setInfo('');
    try {
      if (mode === 'connexion') {
        const err = await connexionEmail(email, mdp, jeton);
        if (err) setErreur(err);
      } else if (mode === 'inscription') {
        if (mdp !== mdp2) { setErreur('Les deux mots de passe ne sont pas identiques.'); return; }
        const r = await inscriptionEmail(email, mdp, jeton);
        if (r.erreur) setErreur(r.erreur);
        else if (r.confirmer) { changerMode('connexion'); setInfo(`Un lien de confirmation a été envoyé à ${email.trim()}. Ouvre-le pour activer ton compte.`); }
      } else {
        const err = await motDePasseOublie(email, jeton);
        if (err) setErreur(err);
        else { changerMode('connexion'); setInfo('Si un compte existe avec cette adresse, un lien pour choisir un nouveau mot de passe vient de lui être envoyé.'); }
      }
    } finally {
      setEnvoi(false);
      setJeton(null);
      setNCaptcha((n) => n + 1);
    }
  };

  return (
    <>
      <div className="connexion__discord">
        <button type="button" className="connexion__bouton connexion__bouton--discord"
          onClick={async () => setErreur((await connexionDiscord(`#/connexion?retour=${encodeURIComponent(retour)}`)) ?? '')}>
          <span className="btn-discord__logo" aria-hidden="true" />Continuer avec Discord
        </button>
      </div>
      <p className="connexion__ou" aria-hidden="true"><span>ou</span></p>

      <form className="connexion__formulaire" onSubmit={envoyer}>
        {mode !== 'connexion' && <h2 className="connexion__etape">{mode === 'inscription' ? 'Créer un compte' : 'Mot de passe oublié'}</h2>}
        <Champ id="email" libelle="Adresse e-mail" type="email" autoComplete="email" inputMode="email" maxLength={254}
          value={email} onChange={(e) => setEmail(e.target.value)} />
        {mode !== 'oubli' && (
          <Champ id="mot-de-passe" libelle="Mot de passe" type="password" maxLength={72}
            autoComplete={mode === 'inscription' ? 'new-password' : 'current-password'}
            minLength={mode === 'inscription' ? MOT_DE_PASSE_MIN : undefined}
            aide={mode === 'inscription' ? `${MOT_DE_PASSE_MIN} caractères au moins, avec des lettres et des chiffres.` : null}
            value={mdp} onChange={(e) => setMdp(e.target.value)} />
        )}
        {mode === 'inscription' && (
          <Champ id="mot-de-passe-2" libelle="Confirme le mot de passe" type="password" autoComplete="new-password" maxLength={72}
            value={mdp2} onChange={(e) => setMdp2(e.target.value)} />
        )}
        <Captcha key={nCaptcha} surJeton={setJeton} />
        <Erreur texte={erreur} />
        <Info texte={info} />
        <Envoyer envoi={envoi} jeton={jeton}>
          {mode === 'connexion' ? 'Se connecter' : mode === 'inscription' ? 'Créer mon compte' : 'Recevoir le lien'}
        </Envoyer>
      </form>

      <nav className="connexion__liens" aria-label="Autres options">
        {mode !== 'inscription' && <button type="button" onClick={() => changerMode('inscription')}>Créer un compte</button>}
        {mode !== 'oubli' && <button type="button" onClick={() => changerMode('oubli')}>Mot de passe oublié</button>}
        {mode !== 'connexion' && <button type="button" onClick={() => changerMode('connexion')}>J’ai déjà un compte</button>}
      </nav>
    </>
  );
}

// Le nouveau mot de passe, après le lien reçu par e-mail
function NouveauMotDePasse() {
  const naviguer = useNavigate();
  const [mdp, setMdp] = useState('');
  const [mdp2, setMdp2] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const envoyer = async (e) => {
    e.preventDefault();
    if (mdp !== mdp2) { setErreur('Les deux mots de passe ne sont pas identiques.'); return; }
    setEnvoi(true);
    const err = await changerMotDePasse(mdp);
    setEnvoi(false);
    if (err) setErreur(err);
    else naviguer('/connexion', { replace: true });
  };
  return (
    <form className="connexion__formulaire" onSubmit={envoyer}>
      <h2 className="connexion__etape">Choisis un nouveau mot de passe</h2>
      <Champ id="nouveau-mdp" libelle="Nouveau mot de passe" type="password" autoComplete="new-password" minLength={MOT_DE_PASSE_MIN} maxLength={72}
        aide={`${MOT_DE_PASSE_MIN} caractères au moins, avec des lettres et des chiffres.`} value={mdp} onChange={(e) => setMdp(e.target.value)} />
      <Champ id="nouveau-mdp-2" libelle="Confirme le mot de passe" type="password" autoComplete="new-password" maxLength={72}
        value={mdp2} onChange={(e) => setMdp2(e.target.value)} />
      <Erreur texte={erreur} />
      <Envoyer envoi={envoi} captcha={false}>Enregistrer</Envoyer>
    </form>
  );
}

// Le code de double authentification (application d'authentification), pour les comptes qui l'ont activée
function CodeDoubleAuth() {
  const { recharger } = useAuth();
  const [code, setCode] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const envoyer = async (e) => {
    e.preventDefault();
    setEnvoi(true); setErreur('');
    const { data } = await supabase.auth.mfa.listFactors();
    const facteur = data?.totp?.find((f) => f.status === 'verified');
    const { error } = facteur
      ? await supabase.auth.mfa.challengeAndVerify({ factorId: facteur.id, code: code.replace(/\s/g, '') })
      : { error: { message: 'Aucune application d’authentification n’est liée à ce compte.' } };
    setEnvoi(false);
    if (error) { setErreur(/invalid|expired/i.test(error.message) ? 'Code incorrect ou expiré.' : messageAuth(error)); setCode(''); return; }
    await recharger();
  };
  return (
    <form className="connexion__formulaire" onSubmit={envoyer}>
      <h2 className="connexion__etape">Double authentification</h2>
      <p className="connexion__texte">Saisis le code à 6 chiffres affiché par ton application d’authentification.</p>
      <Champ id="code-mfa" libelle="Code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7}
        value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
      <Erreur texte={erreur} />
      <Envoyer envoi={envoi} captcha={false}>Valider</Envoyer>
      <button type="button" className="connexion__lien" onClick={() => deconnexion()}>Se déconnecter</button>
    </form>
  );
}

// Le pseudo d'un nouveau compte e-mail (vérifié par le serveur : longueur, caractères, unicité, noms réservés)
function ChoixPseudo() {
  const { recharger } = useAuth();
  const [nom, setNom] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const envoyer = async (e) => {
    e.preventDefault();
    setEnvoi(true); setErreur('');
    const { error } = await supabase.rpc('choisir_pseudo', { p_nom: nom });
    setEnvoi(false);
    if (error) { setErreur(error.message); return; }
    await recharger();
  };
  return (
    <form className="connexion__formulaire" onSubmit={envoyer}>
      <h2 className="connexion__etape">Ton nom d’aventurier</h2>
      <p className="connexion__texte">C’est le nom que verront les autres joueurs. Il ne pourra plus être changé.</p>
      <Champ id="pseudo" libelle="Pseudo" autoComplete="nickname" minLength={3} maxLength={20}
        aide="3 à 20 caractères : lettres, chiffres, espaces, - _ ' ." value={nom} onChange={(e) => setNom(e.target.value)} autoFocus />
      <Erreur texte={erreur} />
      <Envoyer envoi={envoi} captcha={false}>Entrer dans Nocthémar</Envoyer>
    </form>
  );
}

export default function Connexion({ nouveauMotDePasse = false }) {
  const auth = useAuth();
  const [params] = useSearchParams();
  const retour = retourSur(params.get('retour'));

  let contenu;
  if (auth.chargement) contenu = <p className="connexion__texte" role="status">Un instant…</p>;
  else if (nouveauMotDePasse) contenu = auth.session ? <NouveauMotDePasse /> : <Navigate to="/connexion" replace />;
  else if (joueurPret(auth)) return <Navigate to={retour} replace />;
  else if (auth.session && auth.mfaRequis) contenu = <CodeDoubleAuth />;
  else if (auth.session && !auth.joueur) {
    contenu = (
      <div className="connexion__formulaire">
        <h2 className="connexion__etape">Profil introuvable</h2>
        <p className="connexion__texte">Ce compte n’a pas de profil de joueur. Si tu viens de t’inscrire, recharge la page ; sinon, contacte un MJ sur le Discord de Nocthémar.</p>
        <button type="button" className="connexion__bouton" onClick={() => deconnexion()}>Se déconnecter</button>
      </div>
    );
  } else if (auth.session && auth.joueur?.pseudo_a_choisir) contenu = <ChoixPseudo />;
  else contenu = <FormulaireEmail retour={retour} />;

  return (
    <Page id="connexion" classes="page-connexion" titre="Connexion" rail={false}>
      <div className="connexion__decor" aria-hidden="true" />
      <main className="connexion">
        <section className="connexion__carte" aria-labelledby="connexion-titre">
          <p className="connexion__marque">Nocthémar</p>
          <h1 id="connexion-titre">Bienvenue dans Nocthémar</h1>
          <p className="connexion__sous-titre">Duel des Couronnes</p>
          {contenu}
        </section>
      </main>
    </Page>
  );
}
