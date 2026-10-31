// =====================================================================
//  Écran « Mode Histoire » : la campagne, pays après pays
//  - en tête : le pays (le chapitre), sa progression, les autres pays (les verrouillés restent visibles, grisés) ;
//  - la carte du pays dans son cadre d'or : les niveaux reliés par la route (dorée là où tu es passé),
//    3 états (terminé / disponible / verrouillé), le boss plus grand ;
//  - à côté, le journal de campagne : le niveau choisi (l'adversaire, ses cartes, les récompenses), « Combattre » ;
//  - chaque niveau se joue aux Gemmes du Codex (#/gemmes?histoire=<id>, arbitré par le serveur) ;
//  - au retour, le résultat laissé par la partie est affiché (victoire, récompenses).
//  Données : src/data/histoire.js — Progression : table histoire_progression
// =====================================================================
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Page from '../components/Page.jsx';
import Carte from '../components/Carte.jsx';
import ApercuCarte from '../components/ApercuCarte.jsx';
import Gemme, { DefsGemmes } from '../components/gemmes/Gemme.jsx';
import { supabase } from '../lib/supabase.js';
import { useAuth, connexionDiscord } from '../lib/auth.js';
import { useNotifier } from '../lib/notification.js';
import { urlPublique } from '../lib/chemins.js';
import { prechargerEcran } from '../lib/ecrans.js';
import { lireResultatHistoire, oublierResultatHistoire } from '../lib/histoire.js';
import { CHAPITRES, DIFFICULTES_HISTOIRE, trouverNiveau, chapitreOuvert, etatNiveau } from '../data/histoire.js';
import { RARETE, PV_DEPART } from '../moteur/gemmes.js';

const LIBELLES_ETAT = { termine: 'Remporté', disponible: 'À conquérir', verrouille: 'Verrouillé' };

const Cadenas = () => <svg className="ico-cadenas" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>;
const Coche = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
const Couronne = () => <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 18l1.6-10 4.4 4.6L12 5l3 7.6L19.4 8 21 18z" /><rect x="3" y="19" width="18" height="2" rx="1" /></svg>;
const Fleche = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>;

// Le message de la dernière partie (victoire / défaite, récompenses)
function Resultat({ resultat, surFermer, surCarte }) {
  const { niveau: idNiveau, gagne, recompenses: r, erreur } = resultat;
  const trouve = trouverNiveau(idNiveau);
  const [carte, setCarte] = useState(null);   // la carte gagnée, lue dans le catalogue
  useEffect(() => {
    if (!r?.carte) return;
    supabase.from('cards').select('*').eq('name', r.carte).maybeSingle().then(({ data }) => setCarte(data));
  }, [r]);
  if (!trouve) return null;
  const { chapitre, niveau } = trouve;
  // Dans une phrase : « Tu as vaincu la garde du pont » (minuscule au début du nom)
  const adv = niveau.adversaire.charAt(0).toLowerCase() + niveau.adversaire.slice(1);
  let texte;
  let gains = null;
  if (!gagne) texte = `${niveau.adversaire} t'a vaincu. Le niveau t'attend : retente ta chance quand tu veux.`;
  else if (erreur) texte = `Victoire, mais elle n'a pas pu être enregistrée : ${erreur}`;
  else if (!r || r.deja) texte = 'Victoire ! Ce niveau était déjà remporté : pas de nouvelle récompense.';
  else {
    texte = r.chapitre_termine ? `Tu as vaincu ${adv} : le pays de ${chapitre.nom} est conquis !` : `Tu as vaincu ${adv}. La route continue.`;
    gains = (
      <ul className="resultat__gains">
        {r.or > 0 && <li><img src={urlPublique('img/Equipement/Or-icone.webp')} alt="" /> +{r.or} pièces</li>}
        {r.xp > 0 && <li><span className="resultat__xp">XP</span> +{r.xp} XP de pass</li>}
        {r.carte && (
          <li className="resultat__carte">
            <span className="resultat__vignette" title={carte ? 'Voir la carte en grand' : undefined} onClick={() => carte && surCarte(carte)}>
              {carte ? <Carte carte={carte} /> : r.carte_image && <img src={urlPublique(r.carte_image)} alt="" />}
            </span>
            {' '}Nouvelle carte : <strong>{r.carte}</strong>
          </li>
        )}
      </ul>
    );
  }
  return (
    <div className={`resultat ${gagne ? 'resultat--victoire' : 'resultat--defaite'}`} role="status" aria-live="polite">
      <span className="resultat__sceau" aria-hidden="true">{gagne ? <Couronne /> : <Cadenas />}</span>
      <div className="resultat__corps">
        <p className="resultat__sur">{niveau.nom}</p>
        <h2 className="resultat__titre">{gagne ? 'Victoire' : 'Défaite'}</h2>
        <p className="resultat__texte">{texte}</p>
        {gains}
      </div>
      <button type="button" className="resultat__fermer" aria-label="Fermer le message" onClick={surFermer}>×</button>
    </div>
  );
}

// La carte d'un pays : la route entre les niveaux, et un sceau par niveau (le choisi est mis en avant)
function CarteChapitre({ chapitre: c, faits, choisi, niveauNouveau, surNiveau }) {
  const defile = useRef(null);
  const niveaux = c.niveaux;
  const etats = niveaux.map((_, i) => etatNiveau(c, i, faits));

  // Téléphone : la carte défile ; on la centre sur le niveau choisi
  useLayoutEffect(() => {
    const zone = defile.current;
    const cible = zone?.querySelector('.etape.est-choisie');
    if (cible && zone.scrollWidth > zone.clientWidth) {
      requestAnimationFrame(() => { zone.scrollLeft = cible.offsetLeft - zone.clientWidth / 2; });
    }
  }, [c, choisi]);

  return (
    <div className="campagne-carte">
      <span className="campagne-carte__coins" aria-hidden="true"><i /><i /><i /><i /></span>
      <div className="carte-defile" ref={defile}>
        <div className="carte-histoire" style={{ aspectRatio: c.ratio ?? '16 / 9', ...(c.image ? { backgroundImage: `url('${urlPublique(c.image)}')` } : {}) }}>
          <svg className="carte-histoire__chemins" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {niveaux.slice(1).map((n, i) => {
              const a = niveaux[i];
              const etat = etats[i] === 'termine' && etats[i + 1] === 'termine' ? 'fait' : etats[i] === 'termine' ? 'ouvert' : 'ferme';
              return <line key={n.id} className={`chemin chemin--${etat}`} x1={a.x} y1={a.y} x2={n.x} y2={n.y} vectorEffect="non-scaling-stroke" />;
            })}
          </svg>
          {niveaux.map((n, i) => {
            const etat = etats[i];
            const classes = ['etape', `etape--${etat}`, n.est_boss ? 'etape--boss' : '', n.id === niveauNouveau ? 'etape--nouveau' : '', i === choisi ? 'est-choisie' : '']
              .filter(Boolean).join(' ');
            return (
              <button key={n.id} type="button" className={classes} style={{ left: `${n.x}%`, top: `${n.y}%` }} onClick={() => surNiveau(i)}
                aria-pressed={i === choisi} aria-label={`${n.est_boss ? 'Boss' : `Niveau ${i + 1}`} : ${n.nom} (${LIBELLES_ETAT[etat].toLowerCase()})`}>
                <span className="etape__sceau">
                  {n.est_boss ? <Couronne /> : etat === 'termine' ? <Coche /> : etat === 'verrouille' ? <Cadenas /> : <span>{i + 1}</span>}
                </span>
                <span className="etape__nom">{n.nom}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Le journal de campagne : le niveau choisi (l'adversaire, ses cartes, les récompenses), « Combattre »
function Journal({ chapitre, index, etat, surAutre }) {
  const niveau = chapitre.niveaux[index];
  if (!niveau) return null;
  const r = niveau.recompenses ?? {};
  const dernier = chapitre.niveaux.length - 1;
  return (
    <aside className={`campagne-journal${niveau.est_boss ? ' campagne-journal--boss' : ''}`} aria-labelledby="journal-titre">
      <div className="journal__tete">
        <button type="button" className="journal__fleche" aria-label="Niveau précédent" disabled={index <= 0} onClick={() => surAutre(index - 1)}><Fleche /></button>
        <p className="journal__sur">{niveau.est_boss ? 'Boss du pays' : `Niveau ${index + 1} sur ${dernier + 1}`}</p>
        <button type="button" className="journal__fleche journal__fleche--d" aria-label="Niveau suivant" disabled={index >= dernier} onClick={() => surAutre(index + 1)}><Fleche /></button>
      </div>
      <h2 className="journal__titre" id="journal-titre">{niveau.nom}</h2>
      <p className={`journal__etat journal__etat--${etat}`}>{etat === 'verrouille' && <Cadenas />}{LIBELLES_ETAT[etat]}</p>

      <p className="journal__label">L’adversaire</p>
      <p className="journal__adversaire">{niveau.adversaire}</p>
      <dl className="journal__infos">
        <div><dt>Difficulté</dt><dd>{DIFFICULTES_HISTOIRE[niveau.difficulte] ?? niveau.difficulte}</dd></div>
        <div><dt>Points de vie</dt><dd>{niveau.pv ?? PV_DEPART}</dd></div>
      </dl>
      <ul className="journal__raretes" aria-label="Les raretés de ses cartes">
        {(niveau.ombre ?? []).map((rarete, k) => (
          <li key={k} className={`journal__rarete journal__rarete--${rarete}`}><Gemme sorte={rarete} /><span>{RARETE[rarete]?.nom ?? rarete}</span></li>
        ))}
      </ul>

      {etat === 'termine' ? (
        <p className="journal__deja">Déjà remporté : tu peux rejouer ce combat, sans nouvelle récompense.</p>
      ) : <>
        <p className="journal__label">Première victoire</p>
        <ul className="journal__gains">
          {r.or > 0 && <li><img src={urlPublique('img/Equipement/Or-icone.webp')} alt="" /> {r.or} pièces</li>}
          {r.xp > 0 && <li><span className="resultat__xp">XP</span> {r.xp} XP de pass</li>}
          {r.carte && <li><span className="journal__carte" aria-hidden="true" /> Une carte pour ta collection</li>}
        </ul>
      </>}

      {etat === 'verrouille' ? (
        <p className="journal__verrou">{niveau.est_boss ? 'Remporte tous les niveaux du pays pour affronter le boss.' : 'Remporte d’abord le niveau précédent.'}</p>
      ) : (
        <Link className="journal__combattre" to={`/gemmes?histoire=${encodeURIComponent(niveau.id)}`} viewTransition
          onPointerEnter={() => prechargerEcran('/gemmes')} onFocus={() => prechargerEcran('/gemmes')}>
          {etat === 'termine' ? 'Rejouer le combat' : niveau.est_boss ? 'Affronter le boss' : 'Combattre'}
        </Link>
      )}
      <p className="journal__note">Chaque combat se joue aux Gemmes du Codex, avec tes trois cartes.</p>
    </aside>
  );
}

export default function Histoire() {
  const { joueur, chargement } = useAuth();
  const notifier = useNotifier();
  const [params, setParams] = useSearchParams();
  const [faits, setFaits] = useState(null);         // id des niveaux terminés (null : pas encore lus)
  const [resultat, setResultat] = useState(lireResultatHistoire);   // le message de la dernière partie (lu une fois)
  const [choix, setChoix] = useState(null);         // { chapitre: id, index } : le niveau ouvert dans le journal
  const [apercu, setApercu] = useState(null);
  useEffect(() => { oublierResultatHistoire(); }, []);   // affiché une seule fois

  // La progression du joueur (lisible par lui seul)
  useEffect(() => {
    if (!joueur) return;
    supabase.from('histoire_progression').select('niveau_id').eq('discord_id', joueur.discord_id).then(({ data, error }) => {
      if (error) notifier("Impossible de lire ta progression. Le mode Histoire est-il installé dans Supabase ?", 'erreur');
      setFaits(new Set((data ?? []).map((l) => l.niveau_id)));
    });
  }, [joueur, notifier]);

  // Le niveau tout juste débloqué par une victoire : mis en avant sur la carte
  const trouve = resultat ? trouverNiveau(resultat.niveau) : null;
  const niveauNouveau = trouve && resultat.gagne && resultat.recompenses && !resultat.recompenses.deja
    ? trouve.chapitre.niveaux[trouve.index + 1]?.id ?? null : null;

  // Pays affiché : celui demandé dans l'adresse s'il est ouvert, sinon le dernier ouvert
  const ouverts = faits ? CHAPITRES.filter((c) => chapitreOuvert(c, faits)) : [];
  const chapitreActif = ouverts.find((c) => c.id === params.get('chapitre')) ?? ouverts.at(-1) ?? CHAPITRES[0];
  const etats = faits ? chapitreActif.niveaux.map((_, i) => etatNiveau(chapitreActif, i, faits)) : [];
  const nbFaits = etats.filter((e) => e === 'termine').length;
  // Le niveau du journal : celui choisi, sinon le tout nouveau, sinon le prochain à conquérir, sinon le boss
  const parDefaut = (() => {
    const nouveau = chapitreActif.niveaux.findIndex((n) => n.id === niveauNouveau);
    if (nouveau >= 0) return nouveau;
    const libre = etats.indexOf('disponible');
    return libre >= 0 ? libre : Math.max(0, chapitreActif.niveaux.length - 1);
  })();
  const index = choix?.chapitre === chapitreActif.id ? choix.index : parDefaut;

  const choisirChapitre = (c) => {
    if (c === chapitreActif) return;
    if (!chapitreOuvert(c, faits)) {
      notifier(c.niveaux.length ? 'Bats le boss du pays précédent pour ouvrir celui-ci.' : 'Ce pays arrive bientôt.', 'erreur');
      return;
    }
    setParams({ chapitre: c.id }, { replace: true });
  };
  const choisirNiveau = (i) => setChoix({ chapitre: chapitreActif.id, index: i });

  const pret = !chargement && (!joueur || faits);
  return (
    <Page id="histoire" classes="page-profil page-histoire" titre="Mode Histoire" braises>
      <main className="histoire-wrap">
        <header className="campagne-tete">
          <Link className="campagne-retour" to="/duel" viewTransition><Fleche /><span>Jouer</span></Link>
          <p className="campagne-tete__sur">Mode Histoire</p>
          <h1 className="campagne-tete__titre">{pret && joueur ? chapitreActif.nom : 'La campagne'}</h1>
          <p className="campagne-tete__sous">{pret && joueur ? chapitreActif.sousTitre : 'Traverse les pays de Nocthémar, combat après combat.'}</p>
        </header>

        {!pret && <p className="vide">La carte se déplie…</p>}

        {/* Pas connecté : la progression est liée au compte */}
        {pret && !joueur && (
          <section className="histoire-connexion">
            <p>Le mode Histoire garde ta progression et tes récompenses : connecte-toi avec Discord pour partir en campagne.</p>
            <button type="button" className="btn-discord" onClick={() => connexionDiscord()}>
              <span className="btn-discord__logo" aria-hidden="true" />
              Connecter Discord
            </button>
          </section>
        )}

        {pret && joueur && (
          <div id="histoire">
            {resultat && <Resultat resultat={resultat} surFermer={() => setResultat(null)} surCarte={setApercu} />}

            <div className="campagne-bandeau">
              {/* Les pays : les verrouillés sont grisés */}
              <nav className="chapitres" aria-label="Pays">
                {CHAPITRES.map((c) => {
                  const ouvert = chapitreOuvert(c, faits);
                  const n = c.niveaux.filter((x) => faits.has(x.id)).length;
                  const etat = !c.niveaux.length ? 'Bientôt' : !ouvert ? 'Verrouillé' : `${n} / ${c.niveaux.length}`;
                  const titre = !c.niveaux.length ? 'Ce pays n’est pas encore écrit' : !ouvert ? 'Bats le boss du pays précédent pour l’ouvrir' : `Ouvrir ${c.nom}`;
                  return (
                    <button key={c.id} type="button" className={`chapitre-onglet${c === chapitreActif ? ' est-actif' : ''}${ouvert ? '' : ' est-verrouille'}`}
                      aria-disabled={ouvert ? undefined : 'true'} aria-current={c === chapitreActif || undefined} title={titre} onClick={() => choisirChapitre(c)}>
                      <span className="chapitre-onglet__nom">{c.nom}</span>
                      <span className="chapitre-onglet__etat">{!ouvert && <Cadenas />}{etat}</span>
                    </button>
                  );
                })}
              </nav>
              {/* La progression du pays : un sceau par niveau */}
              <div className="campagne-progres" aria-label={`${nbFaits} niveaux remportés sur ${chapitreActif.niveaux.length}`}>
                <span className="campagne-progres__texte"><strong>{nbFaits}</strong> / {chapitreActif.niveaux.length} remportés</span>
                <span className="campagne-progres__sceaux" aria-hidden="true">
                  {etats.map((e, i) => <i key={i} className={`est-${e}${chapitreActif.niveaux[i].est_boss ? ' est-boss' : ''}`} />)}
                </span>
              </div>
            </div>

            {chapitreActif.description && <p className="campagne-desc">{chapitreActif.description}</p>}

            <div className="campagne">
              <CarteChapitre chapitre={chapitreActif} faits={faits} choisi={index} niveauNouveau={niveauNouveau} surNiveau={choisirNiveau} />
              <Journal chapitre={chapitreActif} index={index} etat={etats[index] ?? 'verrouille'} surAutre={choisirNiveau} />
            </div>
          </div>
        )}
      </main>
      <DefsGemmes />
      {apercu && <ApercuCarte carte={apercu} surFermeture={() => setApercu(null)} />}
    </Page>
  );
}
