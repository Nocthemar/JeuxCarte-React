// =====================================================================
//  Écran « Mode Histoire » (ancien histoire.html + JS/histoire.js, même HTML)
//  - les chapitres (un pays chacun) : les verrouillés restent visibles, grisés ;
//  - la carte du chapitre : niveaux reliés par un chemin, 3 états (terminé / disponible / verrouillé),
//    le boss plus grand ;
//  - un clic sur un niveau ouvre sa fiche ; « Combattre » lance le duel (#/duel?histoire=<id>) ;
//  - au retour, le résultat laissé par le duel est affiché (victoire, récompenses).
//  Données : src/data/histoire.js — Progression : table histoire_progression
// =====================================================================
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Page from '../components/Page.jsx';
import Carte from '../components/Carte.jsx';
import ApercuCarte from '../components/ApercuCarte.jsx';
import { supabase } from '../lib/supabase.js';
import { useAuth, connexionDiscord } from '../lib/auth.js';
import { useNotifier } from '../lib/notification.js';
import { urlPublique } from '../lib/chemins.js';
import { lireResultatHistoire, oublierResultatHistoire } from '../lib/histoire.js';
import { CHAPITRES, DIFFICULTES_HISTOIRE, trouverNiveau, chapitreOuvert, etatNiveau } from '../data/histoire.js';

const LIBELLES_ETAT = { termine: 'terminé', disponible: 'disponible', verrouille: 'verrouillé' };

const Cadenas = () => <svg className="ico-cadenas" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>;
const Coche = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
const Couronne = () => <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 18l1.6-10 4.4 4.6L12 5l3 7.6L19.4 8 21 18z" /><rect x="3" y="19" width="18" height="2" rx="1" /></svg>;

// Le message du dernier duel (victoire / défaite, récompenses)
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
  else if (!r || r.deja) texte = 'Victoire ! Ce niveau était déjà terminé : pas de nouvelle récompense.';
  else {
    texte = r.chapitre_termine ? `Tu as vaincu ${adv} : le chapitre ${chapitre.nom} est terminé !` : `Tu as vaincu ${adv}. La route continue.`;
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

// La carte d'un chapitre : le chemin entre les niveaux, et un cercle par niveau
function CarteChapitre({ chapitre: c, faits, niveauNouveau, surNiveau }) {
  const defile = useRef(null);
  const niveaux = c.niveaux;
  const etats = niveaux.map((_, i) => etatNiveau(c, i, faits));
  const nbFaits = etats.filter((e) => e === 'termine').length;

  // Téléphone : la carte défile ; on la centre sur le niveau à jouer
  useLayoutEffect(() => {
    const zone = defile.current;
    const cible = zone?.querySelector('.etape--nouveau, .etape--disponible');
    if (cible && zone.scrollWidth > zone.clientWidth) {
      requestAnimationFrame(() => { zone.scrollLeft = cible.offsetLeft - zone.clientWidth / 2; });
    }
  }, [c]);

  return (
    <section className="chapitre" aria-live="polite">
      <header className="chapitre__tete">
        <div>
          <h2 className="chapitre__nom">{c.nom}</h2>
          <p className="chapitre__sous">{c.sousTitre ?? ''}</p>
        </div>
        <p className="chapitre__progression"><strong>{nbFaits}</strong> / {niveaux.length} niveaux</p>
      </header>
      {c.description && <p className="chapitre__desc">{c.description}</p>}
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
            const classes = ['etape', `etape--${etat}`, n.est_boss ? 'etape--boss' : '', n.id === niveauNouveau ? 'etape--nouveau' : ''].filter(Boolean).join(' ');
            return (
              <button key={n.id} type="button" className={classes} style={{ left: `${n.x}%`, top: `${n.y}%` }} onClick={() => surNiveau(c, i)}
                aria-label={`${n.est_boss ? 'Boss' : `Niveau ${i + 1}`} : ${n.nom} (${LIBELLES_ETAT[etat]})`}>
                <span className="etape__cercle">
                  {n.est_boss ? <Couronne /> : etat === 'termine' ? <Coche /> : etat === 'verrouille' ? <Cadenas /> : <span>{i + 1}</span>}
                </span>
                <span className="etape__nom">{n.nom}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// La fiche d'un niveau (fenêtre) : nom, adversaire, récompenses, Combattre
function FicheNiveau({ fiche, surFermer }) {
  const d = useRef(null);
  useEffect(() => {
    if (fiche && !d.current.open) d.current.showModal();
    if (!fiche && d.current.open) d.current.close();
  }, [fiche]);
  const { chapitre, niveau, index, etat } = fiche ?? {};
  const r = niveau?.recompenses ?? {};
  return (
    <dialog className={`niveau-fiche${niveau?.est_boss ? ' niveau-fiche--boss' : ''}`} id="niveau-fiche" aria-labelledby="niveau-titre" ref={d}
      onClose={surFermer} onClick={(e) => { if (e.target === d.current) surFermer(); }}>
      {fiche && <>
        <form method="dialog" className="niveau-fiche__fermer"><button type="submit" aria-label="Fermer">×</button></form>
        <p className="niveau-fiche__sur">{niveau.est_boss ? 'Boss' : `Niveau ${index + 1}`} · {chapitre.nom}</p>
        <h2 className="niveau-fiche__titre" id="niveau-titre">{niveau.nom}</h2>
        <dl className="niveau-fiche__infos">
          {[
            ['Adversaire', niveau.adversaire],
            ['Difficulté', DIFFICULTES_HISTOIRE[niveau.difficulte] ?? niveau.difficulte],
            niveau.pv ? ['Héros adverse', `${niveau.pv} PV`] : null,
            niveau.energieBonus ? ['Énergie adverse', `+${niveau.energieBonus} par tour`] : null,
          ].filter(Boolean).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
        <div className="niveau-fiche__recompenses">
          {etat === 'termine' ? <p className="niveau-fiche__deja">Déjà remporté : tu peux rejouer ce duel, sans nouvelle récompense.</p> : <>
            <p className="niveau-fiche__label">Récompenses de la première victoire</p>
            <ul>
              {r.or > 0 && <li><img src={urlPublique('img/Equipement/Or-icone.webp')} alt="" /> {r.or} pièces</li>}
              {r.xp > 0 && <li><span className="resultat__xp">XP</span> {r.xp} XP de pass</li>}
              {r.carte && <li><span className="niveau-fiche__carte" aria-hidden="true" /> Une carte au hasard pour ta collection</li>}
            </ul>
          </>}
        </div>
        <Link className="niveau-fiche__combattre" to={`/duel?histoire=${encodeURIComponent(niveau.id)}`} viewTransition>
          {etat === 'termine' ? 'Rejouer le duel' : niveau.est_boss ? 'Affronter le boss' : 'Combattre'}
        </Link>
      </>}
    </dialog>
  );
}

export default function Histoire() {
  const { joueur, chargement } = useAuth();
  const notifier = useNotifier();
  const [params, setParams] = useSearchParams();
  const [faits, setFaits] = useState(null);         // id des niveaux terminés (null : pas encore lus)
  const [resultat, setResultat] = useState(lireResultatHistoire);   // le message du dernier duel (lu une fois)
  const [fiche, setFiche] = useState(null);
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

  // Chapitre affiché : celui demandé dans l'adresse s'il est ouvert, sinon le dernier ouvert
  const ouverts = faits ? CHAPITRES.filter((c) => chapitreOuvert(c, faits)) : [];
  const chapitreActif = ouverts.find((c) => c.id === params.get('chapitre')) ?? ouverts.at(-1) ?? CHAPITRES[0];

  const choisirChapitre = (c) => {
    if (c === chapitreActif) return;
    if (!chapitreOuvert(c, faits)) {
      notifier(c.niveaux.length ? 'Bats le boss du chapitre précédent pour ouvrir ce pays.' : 'Ce chapitre arrive bientôt.', 'erreur');
      return;
    }
    setParams({ chapitre: c.id }, { replace: true });
  };
  const choisirNiveau = (chapitre, index) => {
    const etat = etatNiveau(chapitre, index, faits);
    const niveau = chapitre.niveaux[index];
    if (etat === 'verrouille') {
      notifier(niveau.est_boss ? 'Termine tous les niveaux du chapitre pour affronter le boss.' : 'Termine d’abord le niveau précédent.', 'erreur');
      return;
    }
    setFiche({ chapitre, niveau, index, etat });
  };

  const pret = !chargement && (!joueur || faits);
  return (
    <Page id="histoire" classes="page-profil page-histoire" titre="Mode Histoire" braises>
      <main className="histoire-wrap">
        <Link className="retour" to="/duel" viewTransition>← Menu du Duel des Couronnes</Link>

        <header className="histoire-tete">
          <p className="histoire-tete__sur">Duel des Couronnes</p>
          <h1>Mode Histoire</h1>
          <p className="histoire-tete__texte">Traverse les pays de Nocthémar, duel après duel. Chaque victoire ouvre la route ; le boss de chaque pays ouvre le suivant.</p>
        </header>

        {!pret && <p className="vide">La carte se déplie…</p>}

        {/* Pas connecté : la progression est liée au compte Discord */}
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

            {/* Les chapitres (un pays chacun) : les verrouillés sont grisés */}
            <nav className="chapitres" aria-label="Chapitres">
              {CHAPITRES.map((c) => {
                const ouvert = chapitreOuvert(c, faits);
                const nbFaits = c.niveaux.filter((n) => faits.has(n.id)).length;
                const etat = !c.niveaux.length ? 'Bientôt' : !ouvert ? 'Verrouillé' : `${nbFaits} / ${c.niveaux.length}`;
                const titre = !c.niveaux.length ? 'Ce chapitre n’est pas encore écrit' : !ouvert ? 'Bats le boss du chapitre précédent pour l’ouvrir' : `Ouvrir ${c.nom}`;
                return (
                  <button key={c.id} type="button" className={`chapitre-onglet${c === chapitreActif ? ' est-actif' : ''}${ouvert ? '' : ' est-verrouille'}`}
                    aria-disabled={ouvert ? undefined : 'true'} title={titre} onClick={() => choisirChapitre(c)}
                    style={c.image ? { '--vignette': `url('${urlPublique(c.image)}')` } : undefined}>
                    <span className="chapitre-onglet__nom">{c.nom}</span>
                    <span className="chapitre-onglet__sous">{c.sousTitre ?? ''}</span>
                    <span className="chapitre-onglet__etat">{!ouvert && <Cadenas />}{etat}</span>
                  </button>
                );
              })}
            </nav>

            <CarteChapitre chapitre={chapitreActif} faits={faits} niveauNouveau={niveauNouveau} surNiveau={choisirNiveau} />
          </div>
        )}
      </main>

      <FicheNiveau fiche={fiche} surFermer={() => setFiche(null)} />
      {apercu && <ApercuCarte carte={apercu} surFermeture={() => setApercu(null)} />}
    </Page>
  );
}
