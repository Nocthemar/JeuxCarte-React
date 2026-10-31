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
import { reserveGemmes, cartesDuChoix, lireChoix, garderChoix, cartesOmbre, NOM_RARETE } from '../lib/gemmes/choix.js';
import { COULEURS, COULEUR, FORCE, PV_DEPART, ECHANGES_PAR_TOUR, effetCarte } from '../moteur/gemmes.js';
import { nouvelleGraine } from '../moteur/hasard.js';
import { DIFFICULTES } from '../data/regles.js';
import { urlPublique } from '../lib/chemins.js';
import { jouerSon } from '../lib/son.js';

const CLE_DIFFICULTE = 'gemmes-difficulte';
const lireDifficulte = () => { try { const d = localStorage.getItem(CLE_DIFFICULTE); return DIFFICULTES[d] ? d : 'normal'; } catch { return 'normal'; } };
const NOM_DIFFICULTE = { facile: 'Facile', normal: 'Normale', difficile: 'Difficile' };

// Les trois emplacements (Sang, Ambre, Azur) et la réserve où l'on choisit
function ChoixCartes({ reserve, choisies, surChoisir, bloque }) {
  const [place, setPlace] = useState(0);
  const prendre = (carte) => {
    if (bloque) return;
    const cles = choisies.map((c) => c?.cle ?? null);
    const deja = cles.indexOf(carte.cle);
    if (deja >= 0) cles[deja] = cles[place];   // déjà placée ailleurs : les deux s'échangent
    cles[place] = carte.cle;
    surChoisir(cles);
    jouerSon('pose');
    setPlace((place + 1) % 3);
  };
  return (
    <div className="gm-choix">
      <div className="gm-places" role="radiogroup" aria-label="Emplacement à remplir">
        {COULEURS.map((couleur, k) => {
          const c = choisies[k];
          const effet = c ? effetCarte({ couleur, rarete: c.rarete }) : null;
          return (
            <button key={couleur} type="button" role="radio" aria-checked={place === k} disabled={bloque}
              className={`gm-place gm-place--${couleur}${place === k ? ' est-choisie' : ''}`} onClick={() => setPlace(k)}>
              <span className="gm-place__gemme"><Gemme sorte={couleur} /></span>
              <span className="gm-place__couleur">{COULEUR[couleur].nom}</span>
              <span className="gm-place__image" style={c?.image ? { backgroundImage: `url("${urlPublique(c.image)}")` } : undefined} />
              <span className="gm-place__nom">{c?.n ?? 'Choisis une carte'}</span>
              {c && <span className="gm-place__force">{NOM_RARETE[c.rarete]} · {effet.degats} dégâts{effet.soin ? ` · +${effet.soin} PV` : ''}{effet.echange ? ' · +1 échange' : ''}</span>}
              <span className="gm-place__effet">{COULEUR[couleur].effet}</span>
            </button>
          );
        })}
      </div>
      <p className="gm-choix__aide">
        Choisis l’emplacement, puis une carte de ta collection. Plus elle est rare, plus son attaque frappe fort une fois sa jauge pleine.
      </p>
      <ul className="gm-reserve" aria-label="Ta collection">
        {reserve.map((c) => {
          const k = choisies.findIndex((x) => x?.cle === c.cle);
          return (
            <li key={c.cle}>
              <button type="button" disabled={bloque} onClick={() => prendre(c)}
                className={`gm-mini gm-mini--${c.rarete}${k >= 0 ? ` est-prise gm-mini--${COULEURS[k]}` : ''}`}
                title={`${c.n} — ${NOM_RARETE[c.rarete]} (force ${FORCE[c.rarete]})${c.pretee ? ', prêtée par le Codex' : ''}`}>
                <span className="gm-mini__image" style={c.image ? { backgroundImage: `url("${urlPublique(c.image)}")` } : undefined} />
                <span className="gm-mini__nom">{c.n}</span>
                {c.pretee && <span className="gm-mini__pretee">prêtée</span>}
                {k >= 0 && <span className="gm-mini__gemme"><Gemme sorte={COULEURS[k]} /></span>}
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
  const [mode, setMode] = useState(params.has('salon') ? 'ami' : 'ombre');
  const [difficulte, setDifficulte] = useState(lireDifficulte);
  const [cles, setCles] = useState(lireChoix);
  const [partie, setPartie] = useState(null);   // contre l'Ombre : { combattants, graine, n }
  const reserve = useMemo(() => (donnees.pret ? reserveGemmes(donnees.collection, donnees.catalogue) : []), [donnees]);
  const choisies = useMemo(() => cartesDuChoix(cles, reserve), [cles, reserve]);
  const mesCartes = useMemo(() => choisies.filter(Boolean).map(({ cle, n, image, rarete }) => ({ cle, n, image, rarete })), [choisies]);
  const salon = useSalonGemmes({ joueur, cartes: mesCartes });


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
          <p>Échange deux gemmes voisines pour en aligner trois ou plus. Chaque couleur charge la carte qui lui est liée ; jauge pleine, la carte attaque l’adversaire.</p>
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
                <li>Un échange doit aligner 3 gemmes ou plus. Les gemmes ne blessent pas : chaque gemme <b className="gm-txt--sang">Sang</b>, <b className="gm-txt--ambre">Ambre</b> ou <b className="gm-txt--azur">Azur</b> alignée charge d’une part la jauge de ta carte de cette couleur (aligner 4, c’est 4 parts). L’Os et la Pierre ne chargent rien.</li>
                <li>Les chutes provoquent des chaînes : +25 % de charge par maillon, sans coûter d’échange.</li>
                <li>Jauge pleine : appuie sur la carte pour lancer son attaque sur l’adversaire (gratuit, pendant ton tour). C’est la seule façon de lui faire perdre des PV.</li>
                <li>Sang attaque fort mais se charge lentement ({COULEUR.sang.jauge} gemmes), Ambre attaque et rend un échange ({COULEUR.ambre.jauge}), Azur attaque moins mais soigne et se charge vite ({COULEUR.azur.jauge}). Plus la carte est rare, plus elle frappe fort.</li>
              </ul>
            </details>
          </aside>
        </div>
        <p className="gm-retour"><Link to="/duel" viewTransition>← Retour aux modes de jeu</Link></p>
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
