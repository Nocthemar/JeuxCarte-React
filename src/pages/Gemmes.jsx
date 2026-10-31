// =====================================================================
//  Écran « Gemmes du Codex » (#/gemmes), un mode de « Jouer » (le menu du Duel y mène)
//  L'accueil : contre l'Ombre ou contre un ami (le salon, #/gemmes?salon=CODE), les trois cartes du joueur
//  (une par couleur, choisies dans sa collection), la difficulté ; puis la table (components/gemmes/Table.jsx).
//  Les règles : moteur/gemmes.js.
// =====================================================================
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
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
import { reserveGemmes, cartesDuChoix, lireChoix, garderChoix, cartesOmbre } from '../lib/gemmes/choix.js';
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

// Le salon contre un ami
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
  if (!vue.code) return (
    <div className="gm-ami">
      <p>Crée un salon et envoie le lien à ton ami, ou rejoins le sien avec son code. Mêmes règles, chacun ses trois cartes.</p>
      <div className="gm-ami__actions">
        <button type="button" className="gm-bouton gm-bouton--or" onClick={() => salon.entrer(nouveauCode(), 'hote')}>Créer un salon</button>
        <form className="gm-ami__code" onSubmit={rejoindre}>
          <label htmlFor="gm-code" className="gm-cache">Code du salon</label>
          <input id="gm-code" maxLength={5} autoComplete="off" spellCheck="false" placeholder="CODE" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          <button type="submit" className="gm-bouton">Rejoindre</button>
        </form>
      </div>
    </div>
  );
  const [a, b] = [vue.dedans.find((x) => x.role === 'hote'), vue.dedans.find((x) => x.role === 'invite')];
  return (
    <div className="gm-ami gm-ami--salon">
      <div className="gm-ami__tete">
        <span>Salon <strong>{vue.code}</strong></span>
        <button type="button" className="gm-bouton" onClick={copier}>Copier le lien</button>
        <button type="button" className="gm-bouton" onClick={salon.quitterSalon}>Quitter</button>
      </div>
      <div className="gm-ami__joueurs">
        {[a, b].map((x, k) => (
          <div key={x?.cle ?? k} className={`gm-ami__joueur${x?.pret ? ' est-pret' : ''}`}>
            {x?.avatar ? <img src={x.avatar} alt="" /> : <span className="gm-ami__avatar" aria-hidden="true">{x ? x.nom.slice(0, 1) : '?'}</span>}
            <span>{x ? x.nom : 'Place libre'}</span>
            <small>{x ? (x.pret ? 'Prêt' : 'Choisit ses cartes…') : 'En attente…'}</small>
          </div>
        ))}
      </div>
      <p className="gm-ami__etat" aria-live="polite">{vue.erreur || vue.texte}</p>
      <button type="button" className={`gm-bouton${vue.pret ? '' : ' gm-bouton--or'}`} disabled={!cartesPretes} onClick={salon.basculerPret}>
        {vue.pret ? 'Je ne suis plus prêt' : 'Je suis prêt'}
      </button>
    </div>
  );
}

export default function Gemmes() {
  const { joueur, chargement } = useAuth();
  const donnees = useDonneesDuel(joueur, chargement);
  const [params, setParams] = useSearchParams();
  const [mode, setMode] = useState(params.has('salon') || params.get('mode') === 'ami' ? 'ami' : 'ombre');   // ?mode=ami : venu de « En ligne »
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

  // Quitter le salon : l'adresse ne garde plus son code (une page rechargée n'y retourne pas)
  const quitterSalon = () => { salon.quitter(); setParams({}, { replace: true }); };
  const choisir = (nouvelles) => { setCles(nouvelles); garderChoix(nouvelles); };
  const choisirDifficulte = (d) => { setDifficulte(d); jouerSon('clic'); try { localStorage.setItem(CLE_DIFFICULTE, d); } catch { /* stockage indisponible */ } };
  const changerMode = (m) => {
    if (m === mode) return;
    if (m === 'ombre' && salon.vue.code) quitterSalon();
    setMode(m);
    jouerSon('clic');
  };

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

  const partieAmi = mode === 'ami' ? salon.partie : null;
  const classes = `page-gemmes${partie || partieAmi ? ' en-partie' : ''}`;

  let contenu;
  if (partie && mode === 'ombre') {
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
      <main className="gm-accueil">
        <header className="gm-entete">
          <span className="gm-entete__sur">Jouer · Nouveau mode</span>
          <h1>Les Gemmes du Codex</h1>
          <p>Échange deux gemmes voisines pour en aligner trois ou plus. Chaque gemme charge ta carte de sa rareté ; jauge pleine, la carte lance son pouvoir sur l’adversaire.</p>
        </header>

        <div className="gm-modes" role="tablist" aria-label="Adversaire">
          <button type="button" role="tab" aria-selected={mode === 'ombre'} className={`gm-mode${mode === 'ombre' ? ' est-actif' : ''}`} onClick={() => changerMode('ombre')}>
            <strong>Contre l’Ombre</strong><span>Seul, face à l’IA</span>
          </button>
          <button type="button" role="tab" aria-selected={mode === 'ami'} className={`gm-mode${mode === 'ami' ? ' est-actif' : ''}`} onClick={() => changerMode('ami')}>
            <strong>Contre un ami</strong><span>En ligne, par un salon privé</span>
          </button>
        </div>

        <div className="gm-accueil__corps">
          <section className="gm-bloc gm-bloc--cartes" aria-labelledby="gm-titre-cartes">
            <h2 id="gm-titre-cartes">Tes trois cartes</h2>
            {donnees.pret
              ? <ChoixCartes reserve={reserve} choisies={choisies} surChoisir={choisir} bloque={mode === 'ami' && salon.vue.pret} />
              : <Chargement texte="Ta collection…" />}
          </section>

          <aside className="gm-bloc gm-bloc--lancer">
            {mode === 'ombre' ? (
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
                <h2>Contre un ami</h2>
                <PanneauAmi salon={{ ...salon, quitterSalon }} cartesPretes={mesCartes.length === 3} />
              </>
            )}
            <details className="gm-regles">
              <summary>Les règles</summary>
              <ul>
                <li>Chacun commence avec {PV_DEPART} PV. À ton tour : jusqu’à {ECHANGES_PAR_TOUR} échanges (2 pour celui qui commence la partie), ou « Fin du tour » plus tôt.</li>
                <li>Un échange doit aligner 3 gemmes ou plus. Il y a une gemme par rareté, de sa couleur : {SORTES.map((r, k) => <span key={r}>{k ? (k === SORTES.length - 1 ? ' et ' : ', ') : ''}<b className={`gm-txt--${r}`}>{RARETE[r].nom}</b></span>)}.</li>
                <li>Les gemmes ne blessent pas : chaque gemme alignée charge d’une part la jauge de ta carte de cette rareté (aligner 4, c’est 4 parts). Les gemmes d’une rareté que tu n’as pas ne chargent rien pour toi.</li>
                <li>Les chutes provoquent des chaînes : +25 % de charge par maillon, sans coûter d’échange.</li>
                <li>Jauge pleine : appuie sur la carte pour lancer son pouvoir sur l’adversaire (gratuit, pendant ton tour). C’est la seule façon de lui faire perdre des PV.</li>
                <li>Plus la carte est rare, plus sa jauge est longue et plus son pouvoir est fort : {SORTES.map((r) => `${RARETE[r].nom} ${RARETE[r].jauge} gemmes (${textePouvoir(r)})`).join(' ; ')}.</li>
              </ul>
            </details>
          </aside>
        </div>
        <p className="gm-retour"><Link to={mode === 'ami' ? '/duel?mode=ligne' : '/duel?mode=jeux'} viewTransition>← Retour {mode === 'ami' ? 'au jeu en ligne' : 'aux modes de jeu'}</Link></p>
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
