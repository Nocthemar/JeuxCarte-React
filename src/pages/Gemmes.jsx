// =====================================================================
//  Écran « Gemmes du Codex » (#/gemmes), un mode de « Jouer » (le menu du Duel y mène)
//  Trois pages : contre l'Ombre (#/gemmes, depuis « Modes de jeu ») ; contre un ami (#/gemmes?mode=ami, depuis « En ligne » ;
//  le salon : #/gemmes?salon=CODE) ; un niveau du mode Histoire (#/gemmes?histoire=<niveau>, depuis la carte de
//  l'Histoire : arbitré par le serveur, moteur/histoireGemmes.js) ; les trois cartes du joueur
//  (une par couleur, choisies dans sa collection), la difficulté ; puis la table (components/gemmes/Table.jsx).
//  Les règles : moteur/gemmes.js.
// =====================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Page from '../components/Page.jsx';
import Chargement from '../components/Chargement.jsx';
import Table from '../components/gemmes/Table.jsx';
import Gemme, { DefsGemmes } from '../components/gemmes/Gemme.jsx';
import { useAuth } from '../lib/auth.js';
import { useDonneesDuel } from '../lib/donneesDuel.js';
import { useNotifier } from '../lib/notification.js';
import { nouveauCode, codeValide } from '../lib/salon.js';
import { estHote } from '../lib/ligne.js';
import { useSalonGemmes, lienGemmes } from '../lib/gemmes/useSalonGemmes.js';
import { reserveGemmes, cartesDuChoix, lireChoix, garderChoix, cartesOmbre, carteGemmes } from '../lib/gemmes/choix.js';
import { preparerNiveau, actionGemmes } from '../moteur/histoireGemmes.js';
import { commencerDuel, terminerDuel } from '../lib/duelServeur.js';
import { garderResultatHistoire, texteRecompense } from '../lib/histoire.js';
import { trouverNiveau, DIFFICULTES_HISTOIRE } from '../data/histoire.js';
import { SORTES, RARETE, PV_DEPART, ECHANGES_PAR_TOUR, textePouvoir } from '../moteur/gemmes.js';
import { nouvelleGraine } from '../moteur/hasard.js';
import { DIFFICULTES } from '../data/regles.js';
import { urlPublique } from '../lib/chemins.js';
import { jouerSon, musiqueAuPremierGeste } from '../lib/son.js';

const CLE_DIFFICULTE = 'gemmes-difficulte';
const lireDifficulte = () => { try { const d = localStorage.getItem(CLE_DIFFICULTE); return DIFFICULTES[d] ? d : 'normal'; } catch { return 'normal'; } };
const NOM_DIFFICULTE = { facile: 'Facile', normal: 'Normale', difficile: 'Difficile' };

// Les trois emplacements (une carte par rareté : sa gemme est celle de sa rareté) et la réserve où l'on choisit.
// Une carte de la réserve remplace la carte choisie de même rareté, sinon celle de l'emplacement sélectionné.
function ChoixCartes({ reserve, choisies, surChoisir, bloque }) {
  const [place, setPlace] = useState(0);
  const prendre = (carte) => {
    if (bloque || choisies.some((c) => c.cle === carte.cle)) return;
    const cles = choisies.map((c) => c.cle);
    const meme = choisies.findIndex((c) => c.rarete === carte.rarete);
    const ici = meme >= 0 ? meme : place;
    cles[ici] = carte.cle;
    surChoisir(cles);
    jouerSon('pose');
    setPlace((ici + 1) % 3);
  };
  return (
    <div className="gm-choix">
      <div className="gm-places" role="radiogroup" aria-label="Emplacement à remplacer">
        {[0, 1, 2].map((k) => {
          const c = choisies[k];
          return (
            <button key={k} type="button" role="radio" aria-checked={place === k} disabled={bloque || !c}
              className={`gm-place gm-place--${c?.rarete ?? 'commune'}${place === k ? ' est-choisie' : ''}`} onClick={() => setPlace(k)}>
              {c && <span className="gm-place__gemme"><Gemme sorte={c.rarete} /></span>}
              <span className="gm-place__couleur">{c ? RARETE[c.rarete].nom : '—'}</span>
              <span className="gm-place__image" style={c?.image ? { backgroundImage: `url("${urlPublique(c.image)}")` } : undefined} />
              <span className="gm-place__nom">{c?.n ?? 'Aucune carte'}</span>
              {c && <span className="gm-place__force">Jauge de {RARETE[c.rarete].jauge} · {textePouvoir(c.rarete)}</span>}
            </button>
          );
        })}
      </div>
      <p className="gm-choix__aide">
        Trois cartes de trois raretés différentes : chacune se charge avec les gemmes de sa rareté. Plus elle est rare,
        plus sa jauge est longue et plus son pouvoir frappe fort.
      </p>
      <ul className="gm-reserve" aria-label="Ta collection">
        {reserve.map((c) => {
          const prise = choisies.some((x) => x.cle === c.cle);
          return (
            <li key={c.cle}>
              <button type="button" disabled={bloque} onClick={() => prendre(c)}
                className={`gm-mini gm-mini--${c.rarete}${prise ? ' est-prise' : ''}`}
                title={`${c.n} — ${RARETE[c.rarete].nom} (${textePouvoir(c.rarete)})${c.pretee ? ', prêtée par le Codex' : ''}`}>
                <span className="gm-mini__image" style={c.image ? { backgroundImage: `url("${urlPublique(c.image)}")` } : undefined} />
                <span className="gm-mini__nom">{c.n}</span>
                {c.pretee && <span className="gm-mini__pretee">prêtée</span>}
                <span className="gm-mini__gemme"><Gemme sorte={c.rarete} /></span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Le salon contre un ami : les trois étapes (cartes, salon, prêts), puis créer ou rejoindre ; dans le salon,
// son code en grand, les deux joueurs face à face, « Je suis prêt »
function PanneauAmi({ salon, cartesPretes }) {
  const notifier = useNotifier();
  const [code, setCode] = useState('');
  const { vue } = salon;
  const copier = async () => {
    const lien = lienGemmes(vue.code);
    try { await navigator.clipboard.writeText(lien); notifier('Lien du salon copié : envoie-le à ton ami.'); } catch { prompt('Copie ce lien et envoie-le à ton ami :', lien); }
  };
  const rejoindre = (e) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (!codeValide(c)) return notifier('Ce code n’est pas valide : cinq lettres ou chiffres.', 'erreur');
    salon.entrer(c, estHote(c) ? 'hote' : 'invite');
  };
  const moi = vue.dedans.find((x) => x.role === vue.role);
  const autre = vue.dedans.find((x) => x.role !== vue.role);
  const etapes = [
    ['Choisis tes trois cartes', cartesPretes],
    ['Crée un salon ou rejoins celui de ton ami', !!vue.code && !!autre],
    ['Déclarez-vous prêts tous les deux', !!moi?.pret && !!autre?.pret],
  ];
  const actuelle = etapes.findIndex(([, fait]) => !fait);

  const joueur = (x, vide) => (
    <div className={`gm-salon__joueur${x?.pret ? ' est-pret' : ''}${x ? '' : ' est-vide'}`}>
      {x?.avatar ? <img src={x.avatar} alt="" /> : <span className="gm-salon__avatar" aria-hidden="true">{x ? x.nom.slice(0, 1) : '?'}</span>}
      <b>{x ? x.nom : vide}</b>
      <small>{x ? (x.pret ? 'Prêt' : 'Choisit ses cartes…') : 'En attente…'}</small>
    </div>
  );

  return (
    <div className="gm-salon">
      <ol className="gm-etapes">
        {etapes.map(([texte, fait], k) => (
          <li key={texte} className={fait ? 'est-fait' : k === actuelle ? 'est-actuelle' : undefined}>
            <span className="gm-etapes__num" aria-hidden="true">{fait ? '✓' : k + 1}</span>{texte}
          </li>
        ))}
      </ol>

      {!vue.code ? (
        <>
          <div className="gm-salon__choix">
            <p>Un salon privé : un code à envoyer à ton ami. Mêmes règles, chacun ses trois cartes.</p>
            <button type="button" className="gm-bouton gm-bouton--or gm-salon__large" onClick={() => salon.entrer(nouveauCode(), 'hote')}>Créer un salon</button>
          </div>
          <div className="gm-salon__ou" aria-hidden="true"><span>ou</span></div>
          <form className="gm-salon__choix" onSubmit={rejoindre}>
            <label htmlFor="gm-code">Ton ami t’a envoyé un code ?</label>
            <input id="gm-code" className="gm-salon__saisie" maxLength={5} autoComplete="off" spellCheck="false" placeholder="•••••"
              value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
            <button type="submit" className="gm-bouton gm-salon__large">Rejoindre le salon</button>
          </form>
        </>
      ) : (
        <>
          <div className="gm-salon__code">
            <span>Salon</span>
            <strong>{vue.code}</strong>
            <button type="button" className="gm-bouton gm-salon__large" onClick={copier}>Copier le lien d’invitation</button>
          </div>
          <div className="gm-salon__face">
            {joueur(moi, 'Toi')}
            <span className="gm-salon__contre" aria-hidden="true">contre</span>
            {joueur(autre, 'Place libre')}
          </div>
          <p className="gm-salon__etat" aria-live="polite">{vue.erreur || vue.texte}</p>
          <button type="button" className={`gm-bouton gm-salon__large gm-salon__pret${vue.pret ? '' : ' gm-bouton--or'}`} disabled={!cartesPretes} onClick={salon.basculerPret}>
            {vue.pret ? 'Je ne suis plus prêt' : 'Je suis prêt'}
          </button>
          <button type="button" className="gm-salon__quitter" onClick={salon.quitterSalon}>Quitter le salon</button>
        </>
      )}
    </div>
  );
}

// Un niveau du mode Histoire, avant la partie : l'adversaire (ses PV, sa difficulté, les raretés de ses cartes),
// les récompenses de la première victoire, « Combattre »
function PanneauNiveau({ trouve, pret, lancement, surLancer }) {
  const { niveau } = trouve;
  const r = niveau.recompenses ?? {};
  return (
    <div className="gm-niveau">
      <h2>L’adversaire</h2>
      <p className="gm-niveau__nom">{niveau.adversaire}</p>
      <dl className="gm-niveau__infos">
        <div><dt>Difficulté</dt><dd>{DIFFICULTES_HISTOIRE[niveau.difficulte] ?? niveau.difficulte}</dd></div>
        <div><dt>Points de vie</dt><dd>{niveau.pv ?? PV_DEPART}</dd></div>
      </dl>
      <p className="gm-niveau__label">Ses trois cartes</p>
      <ul className="gm-niveau__raretes">
        {(niveau.ombre ?? []).map((rarete, k) => (
          <li key={k} className={`gm-txt--${rarete}`}><Gemme sorte={rarete} />{RARETE[rarete]?.nom ?? rarete}</li>
        ))}
      </ul>
      <p className="gm-niveau__label">Première victoire</p>
      <ul className="gm-niveau__gains">
        {r.or > 0 && <li><img src={urlPublique('img/Equipement/Or-icone.webp')} alt="" /> {r.or} pièces</li>}
        {r.xp > 0 && <li><span className="gm-niveau__xp">XP</span> {r.xp} XP de pass</li>}
        {r.carte && <li><span className="gm-niveau__carte" aria-hidden="true" /> Une carte pour ta collection</li>}
      </ul>
      <button type="button" className="gm-engager" disabled={!pret || lancement} onClick={surLancer}>
        {lancement ? 'Préparation…' : niveau.est_boss ? 'Affronter le boss' : 'Combattre'}
      </button>
    </div>
  );
}

export default function Gemmes() {
  const { joueur, chargement } = useAuth();
  const donnees = useDonneesDuel(joueur, chargement);
  const [params, setParams] = useSearchParams();
  const naviguer = useNavigate();
  // Trois pages : contre l'Ombre (#/gemmes, depuis « Modes de jeu ») ; contre un ami (#/gemmes?mode=ami, depuis « En ligne »,
  // ou le lien d'un salon #/gemmes?salon=CODE) ; un niveau du mode Histoire (#/gemmes?histoire=<niveau>)
  const idHistoire = params.get('histoire');
  const histoire = useMemo(() => (idHistoire ? trouverNiveau(idHistoire) : null), [idHistoire]);
  const mode = histoire ? 'histoire' : params.has('salon') || params.get('mode') === 'ami' ? 'ami' : 'ombre';
  const [difficulte, setDifficulte] = useState(lireDifficulte);
  const [cles, setCles] = useState(lireChoix);
  const [partie, setPartie] = useState(null);   // contre l'Ombre : { combattants, graine, n }
  // (useDonneesDuel rend un nouvel objet à chaque affichage : on dépend de ses données, pas de l'objet)
  const reserve = useMemo(() => (donnees.pret ? reserveGemmes(donnees.collection, donnees.catalogue) : []), [donnees.pret, donnees.collection, donnees.catalogue]);
  const choisies = useMemo(() => cartesDuChoix(cles, reserve), [cles, reserve]);
  const mesCartes = useMemo(() => choisies.map(({ cle, n, image, rarete }) => ({ cle, n, image, rarete })), [choisies]);
  const salon = useSalonGemmes({ joueur, cartes: mesCartes });
  // L'ambiance musicale démarre au premier geste du joueur (les navigateurs l'exigent)
  useEffect(() => { musiqueAuPremierGeste(); }, []);
  // Un niveau inconnu, ou pas connecté (la progression est liée au compte) : retour à la carte de l'Histoire
  useEffect(() => {
    if (idHistoire && !chargement && (!histoire || !joueur)) naviguer('/histoire', { replace: true });
  }, [idHistoire, histoire, joueur, chargement, naviguer]);


  // Le lien d'invitation : on entre dans le salon dès que le joueur est là
  const codeLien = params.get('salon');
  useEffect(() => {
    if (!joueur || !codeLien || !codeValide(codeLien) || salon.vue.code === codeLien) return;
    salon.entrer(codeLien, estHote(codeLien) ? 'hote' : 'invite');
  }, [joueur, codeLien]);   // eslint-disable-line react-hooks/exhaustive-deps
  // L'adresse suit le salon (le lien reste partageable, une page rechargée y revient)
  useEffect(() => {
    const code = salon.vue.code;
    if (code && params.get('salon') !== code) setParams({ salon: code }, { replace: true });
  }, [salon.vue.code]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Quitter le salon : l'adresse ne garde plus son code (une page rechargée n'y retourne pas), on reste contre un ami
  const quitterSalon = () => { salon.quitter(); setParams({ mode: 'ami' }, { replace: true }); };
  const choisir = (nouvelles) => { setCles(nouvelles); garderChoix(nouvelles); };
  const choisirDifficulte = (d) => { setDifficulte(d); jouerSon('clic'); try { localStorage.setItem(CLE_DIFFICULTE, d); } catch { /* stockage indisponible */ } };

  const nom = joueur?.username ?? 'Toi';
  const lancerOmbre = () => {
    if (mesCartes.length < 3) return;

    const moi = { nom, avatar: joueur?.avatar_url ?? null, cartes: mesCartes };
    const ombre = { nom: 'L’Ombre', avatar: null, cartes: cartesOmbre(donnees.catalogue, difficulte) };
    const jeCommence = Math.random() < 0.5;   // le joueur commence une fois sur deux
    setPartie((p) => ({
      n: (p?.n ?? 0) + 1, graine: nouvelleGraine(), difficulte,
      combattants: jeCommence ? [moi, ombre] : [ombre, moi], moi: jeCommence ? 0 : 1,
    }));
  };

  // ---------- Un niveau du mode Histoire ----------
  // Le serveur tire la graine et note les trois cartes (duel_commencer) ; chacune de mes actions part dans le
  // journal ; à la fin, l'arbitre rejoue la partie et donne les récompenses du niveau. Serveur injoignable au
  // début : partie d'entraînement, sans récompense.
  const [niveauJeu, setNiveauJeu] = useState(null);   // { n, combattants, graine, moi, h }
  const [messageFin, setMessageFin] = useState('');
  const [lancement, setLancement] = useState(false);
  const journal = useRef([]);
  const enCours = useRef(null);   // { ticket, fini }
  const lancerNiveau = async () => {
    if (!histoire || mesCartes.length < 3 || lancement) return;
    setLancement(true);
    const ticket = await commencerDuel({ mode: 'histoire', niveau: histoire.niveau.id, grimoire: mesCartes.map((c) => String(c.cle)) });
    setLancement(false);
    const graine = ticket?.graine ?? nouvelleGraine();
    const depart = preparerNiveau({
      niveau: histoire.niveau, mesCartes, catalogue: (donnees.catalogue ?? []).map(carteGemmes), graine, nom, avatar: joueur?.avatar_url ?? null,
    });
    journal.current = [];
    enCours.current = { ticket: ticket?.id ?? null, fini: false };
    setMessageFin('');
    setNiveauJeu((p) => ({ n: (p?.n ?? 0) + 1, combattants: depart.combattants, graine, moi: depart.moi, h: depart.h }));
    scrollTo(0, 0);
  };
  const noterAction = useCallback((action) => { journal.current.push(actionGemmes(action)); }, []);
  const finNiveau = useCallback(async ({ gagne }) => {
    const partieEnCours = enCours.current;
    if (!histoire || !partieEnCours || partieEnCours.fini) return;
    partieEnCours.fini = true;
    if (!partieEnCours.ticket) {
      garderResultatHistoire(histoire.niveau.id, gagne, null);
      setMessageFin(gagne ? 'Partie d’entraînement (serveur injoignable au début) : pas de récompense.' : '');
      return;
    }
    setMessageFin('L’arbitre vérifie la partie…');
    const verdict = await terminerDuel(partieEnCours.ticket, journal.current);
    if (enCours.current !== partieEnCours) return;
    const resultat = garderResultatHistoire(histoire.niveau.id, gagne, verdict);
    const xp = resultat.recompenses?.xp;
    setMessageFin([texteRecompense(resultat), xp ? `+${xp} XP de pass.` : ''].filter(Boolean).join(' '));
  }, [histoire]);
  const versLaCarte = histoire ? `/histoire?chapitre=${encodeURIComponent(histoire.chapitre.id)}` : '/histoire';

  const retour = mode === 'histoire' ? versLaCarte : mode === 'ami' ? '/duel?mode=ligne' : '/duel?mode=jeux';
  const partieAmi = mode === 'ami' ? salon.partie : null;
  const classes = `page-gemmes${partie || partieAmi || (niveauJeu && mode === 'histoire') ? ' en-partie' : ''}`;

  let contenu;
  if (niveauJeu && mode === 'histoire') {
    contenu = (
      <Table key={niveauJeu.n} combattants={niveauJeu.combattants} graine={niveauJeu.graine} moi={niveauJeu.moi}
        difficulte={histoire.niveau.difficulte} hasardOmbre={niveauJeu.h} surJournal={noterAction} surFin={finNiveau} messageFin={messageFin}
        surRejouer={lancerNiveau} surQuitter={() => naviguer(versLaCarte, { viewTransition: true })} />
    );
  } else if (partie && mode === 'ombre') {
    contenu = (
      <Table key={partie.n} combattants={partie.combattants} graine={partie.graine} moi={partie.moi} difficulte={partie.difficulte}
        surRejouer={lancerOmbre} surQuitter={() => setPartie(null)} />
    );
  } else if (partieAmi) {
    const enAttente = partieAmi.fini && salon.vue.dedans.some((x) => x.revanche === partieAmi.p);
    contenu = (
      <>
        <Table key={partieAmi.p} combattants={partieAmi.combattants} graine={partieAmi.graine} moi={partieAmi.moi} ligne={salon}
          surRejouer={salon.vue.absent ? null : salon.revanche} surQuitter={quitterSalon} />
        {(salon.vue.absent && !partieAmi.fini) && <p className="gm-alerte" role="status">Ton adversaire s’est déconnecté… La victoire t’est donnée s’il ne revient pas.</p>}
        {enAttente && <p className="gm-alerte" role="status">Revanche demandée : la partie reprend quand vous l’avez demandée tous les deux.</p>}
      </>
    );
  } else {
    contenu = (
      <main className={`gm-accueil gm-accueil--${mode}`}>
        <header className="gm-entete">
          {/* le retour, en haut à gauche : vers Modes de jeu (contre l'Ombre) ou En ligne (contre un ami) */}
          <Link className="gm-retour-haut" to={retour} viewTransition>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg><span>{mode === 'histoire' ? 'La carte' : mode === 'ami' ? 'En ligne' : 'Modes de jeu'}</span>
          </Link>
          {mode === 'histoire' ? <>
            <span className="gm-entete__sur">Histoire · {histoire.chapitre.nom} · {histoire.niveau.est_boss ? 'Boss' : `Niveau ${histoire.index + 1}`}</span>
            <h1>{histoire.niveau.nom}</h1>
            <p>{histoire.niveau.adversaire} te barre la route. Aligne les gemmes pour charger tes cartes, et fais tomber ses PV avant qu’il ne fasse tomber les tiens.</p>
          </> : <>
            <span className="gm-entete__sur">{mode === 'ami' ? 'En ligne · Contre un ami' : 'Modes de jeu · Contre l’Ombre'}</span>
            <h1>Les Gemmes du Codex</h1>
            <p>Échange deux gemmes voisines pour en aligner trois ou plus. Chaque gemme charge ta carte de sa rareté ; jauge pleine, la carte lance son pouvoir {mode === 'ami' ? 'sur ton ami' : 'sur l’Ombre'}.</p>
          </>}
        </header>

        <div className="gm-accueil__corps">
          <section className="gm-bloc gm-bloc--cartes" aria-labelledby="gm-titre-cartes">
            <h2 id="gm-titre-cartes">Tes trois cartes</h2>
            {donnees.pret
              ? <ChoixCartes reserve={reserve} choisies={choisies} surChoisir={choisir} bloque={mode === 'ami' && salon.vue.pret} />
              : <Chargement texte="Ta collection…" />}
          </section>

          <aside className="gm-bloc gm-bloc--lancer">
            {mode === 'histoire' ? (
              <PanneauNiveau trouve={histoire} pret={mesCartes.length === 3 && donnees.pret} lancement={lancement} surLancer={lancerNiveau} />
            ) : mode === 'ombre' ? (
              <>
                <h2>Difficulté</h2>
                <div className="gm-difficultes" role="radiogroup" aria-label="Difficulté de l’Ombre">
                  {Object.keys(DIFFICULTES).map((d) => (
                    <button key={d} type="button" role="radio" aria-checked={difficulte === d} className={`gm-difficulte${difficulte === d ? ' est-choisie' : ''}`}
                      onClick={() => choisirDifficulte(d)}>{NOM_DIFFICULTE[d]}</button>
                  ))}
                </div>
                <p className="gm-bloc__note">
                  {difficulte === 'facile' ? 'L’Ombre joue souvent au hasard, avec des cartes communes.'
                    : difficulte === 'normal' ? 'L’Ombre cherche le meilleur coup, avec des cartes éveillées ou mythiques.'
                      : 'L’Ombre prépare ses chaînes et charge ses jauges, avec ses cartes les plus rares.'}
                </p>
                <button type="button" className="gm-engager" disabled={mesCartes.length < 3} onClick={lancerOmbre}>Engager la partie</button>
              </>
            ) : (
              <>
                <h2>Le salon</h2>
                <PanneauAmi salon={{ ...salon, quitterSalon }} cartesPretes={mesCartes.length === 3} />
              </>
            )}
            <details className="gm-regles">
              <summary>Les règles</summary>
              <ul>
                <li>{mode === 'histoire' ? `Tu commences avec ${PV_DEPART} PV, ton adversaire avec ${histoire.niveau.pv ?? PV_DEPART}.` : `Chacun commence avec ${PV_DEPART} PV.`} À ton tour : jusqu’à {ECHANGES_PAR_TOUR} échanges (2 pour celui qui commence la partie), ou « Fin du tour » plus tôt.</li>
                <li>Un échange doit aligner 3 gemmes ou plus. Il y a une gemme par rareté, de sa couleur : {SORTES.map((r, k) => <span key={r}>{k ? (k === SORTES.length - 1 ? ' et ' : ', ') : ''}<b className={`gm-txt--${r}`}>{RARETE[r].nom}</b></span>)}.</li>
                <li>Les gemmes ne blessent pas : chaque gemme alignée charge d’une part la jauge de ta carte de cette rareté (aligner 4, c’est 4 parts). Les gemmes d’une rareté que tu n’as pas ne chargent rien pour toi.</li>
                <li>Les chutes provoquent des chaînes : +25 % de charge par maillon, sans coûter d’échange.</li>
                <li>Jauge pleine : appuie sur la carte pour lancer son pouvoir sur l’adversaire (gratuit, pendant ton tour). C’est la seule façon de lui faire perdre des PV.</li>
                <li>Plus la carte est rare, plus sa jauge est longue et plus son pouvoir est fort : {SORTES.map((r) => `${RARETE[r].nom} ${RARETE[r].jauge} gemmes (${textePouvoir(r)})`).join(' ; ')}.</li>
              </ul>
            </details>
          </aside>
        </div>
        <p className="gm-retour"><Link to={retour} viewTransition>← Retour {mode === 'histoire' ? 'à la carte' : mode === 'ami' ? 'à En ligne' : 'aux modes de jeu'}</Link></p>
        <DefsGemmes />
      </main>
    );
  }

  return (
    <Page id="gemmes" classes={classes} titre="Gemmes du Codex">
      {contenu}
    </Page>
  );
}
