// =====================================================================
//  Le menu du Duel des Couronnes (ancien écran d'accueil de jeu-cartes.html et JS/jeu-cartes.js)
//  - les trois modes : contre l'Ombre, en ligne, Histoire (une autre page) ;
//  - la difficulté de l'Ombre (retenue dans le navigateur) ;
//  - le Grimoire en éventail sur l'autel, et le constructeur de deck (« Choisir mes cartes ») ;
//  - le panneau du mode en ligne : partie privée (le salon), classé.
// =====================================================================
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import CarteDuel from './CarteDuel.jsx';
import Constructeur from './Constructeur.jsx';
import { DIFFICULTES, TAILLE_DECK, OBJETS_MAX, TRANSCENDANTES_MAX } from '../../data/regles.js';
import { grimoire, estObjet, estTranscendante, copiesMax } from '../../moteur/index.js';
import {
  reserve, cartesChoisies, choixParDefaut, lireChoix, garderChoix, cleCarte, exemplaires,
} from '../../lib/grimoire.js';
import { supabase } from '../../lib/supabase.js';
import { connexionDiscord } from '../../lib/auth.js';
import { nouveauCode, codeValide } from '../../lib/salon.js';
import { estHote, lienInvitation, palierDe, classeAbsent } from '../../lib/ligne.js';
import { useNotifier } from '../../lib/notification.js';
import { animationsReduites } from '../../lib/preferences.js';
import { jouerSon } from '../../lib/son.js';

const CLE_DIFFICULTE = 'duel-couronnes-difficulte';
const lireDifficulte = () => { try { const d = localStorage.getItem(CLE_DIFFICULTE); return DIFFICULTES[d] ? d : 'normal'; } catch { return 'normal'; } };


const ICONE_EPEE = <><path d="M14.5 17.5L3 6V3h3l11.5 11.5" /><path d="M13 19l6-6" /><path d="M16 16l4 4" /><path d="M19 21l2-2" /></>;
const Svg = ({ children }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

// Le rang classé du joueur (table rangs)
function RangClasse({ joueur }) {
  const [rang, setRang] = useState(null);   // { cote, victoires, defaites } ou { erreur: true }
  useEffect(() => {
    supabase.from('rangs').select('cote, victoires, defaites').eq('discord_id', joueur.discord_id).maybeSingle()
      .then(({ data, error }) => setRang(error ? { erreur: true } : (data ?? { cote: 1000, victoires: 0, defaites: 0 })));
  }, [joueur]);
  if (!rang) return <p className="classe__rang">Ton rang…</p>;
  if (rang.erreur) return <p className="classe__rang">Le classé n’est pas encore installé (SQL/classe.sql).</p>;
  const palier = palierDe(rang.cote);
  return (
    <p className="classe__rang">
      <b className={`classe__palier classe__palier--${palier.toLowerCase()}`}>{palier}</b>{' '}
      <span>{rang.cote} points · {rang.victoires} victoire{rang.victoires > 1 ? 's' : ''} · {rang.defaites} défaite{rang.defaites > 1 ? 's' : ''}</span>
    </p>
  );
}

// Un joueur du salon (ou une place libre)
function FicheJoueur({ x, salon, vide }) {
  if (!x) return (
    <div className="salon__joueur salon__joueur--vide">
      <span className="salon__avatar" aria-hidden="true">?</span>
      <span className="salon__nom">{vide}</span>
    </div>
  );
  return (
    <div className={`salon__joueur${x.pret ? ' est-pret' : ''}`}>
      {x.avatar ? <img className="salon__avatar" src={x.avatar} alt="" /> : <span className="salon__avatar" aria-hidden="true">✦</span>}
      <span className="salon__nom">{x.nom}{x.cle === salon.cle && <> <small>(toi)</small></>}</span>
      <span className="salon__role">{x.role === 'hote' ? 'Hôte' : 'Invité'}</span>
      <span className="salon__pret">{x.pret ? 'Prêt' : 'Prépare son deck…'}</span>
    </div>
  );
}

// Les joueurs du salon : deux places, ou (2 contre 2) deux équipes de deux places
function JoueursSalon({ salon }) {
  if (salon.format === '2v2') return (
    <div className="salon__joueurs salon__joueurs--equipes" id="salon-joueurs">
      {['A', 'B'].map((eq) => {
        const membres = salon.dedans.filter((x) => x.equipe === eq).slice(0, 2);
        return (
          <div key={eq} className="salon__equipe">
            <h4 className="salon__equipe-titre">Équipe {eq}{salon.equipe === eq && <> <small>(la tienne)</small></>}</h4>
            {[0, 1].map((i) => <FicheJoueur key={membres[i]?.cle ?? i} x={membres[i]} salon={salon} vide="Place libre" />)}
          </div>
        );
      })}
    </div>
  );
  return (
    <div className="salon__joueurs" id="salon-joueurs">
      {[0, 1].map((i) => <FicheJoueur key={salon.dedans[i]?.cle ?? i} x={salon.dedans[i]} salon={salon} vide="En attente d'un adversaire…" />)}
    </div>
  );
}

// Le salon : son code, le lien à copier, le format, les joueurs (les équipes), « Je suis prêt »
function Salon({ ligne }) {
  const notifier = useNotifier();
  const { salon } = ligne;
  const copier = async () => {
    const lien = lienInvitation(salon.code);
    try {
      await navigator.clipboard.writeText(lien);
      notifier(salon.format === '2v2' ? 'Lien du salon copié : envoie-le à tes amis.' : 'Lien du salon copié : envoie-le à ton ami.');
    } catch {
      prompt('Copie ce lien et envoie-le à ton ami :', lien);
    }
  };
  // Le format se choisit par l'hôte, avant d'être prêt (fixé en classé)
  const formatBloque = salon.role !== 'hote' || salon.formatFixe || salon.pret || salon.enDuel;
  const choisir = (f) => { if (!formatBloque && f !== salon.format) { jouerSon('clic'); ligne.choisirFormat(f); } };
  const changer = async () => { if (await ligne.changerEquipe()) jouerSon('clic'); };
  return (
    <div className="salon" id="ligne-salon">
      <div className="salon__tete">
        <div className="salon__code">
          <span className="salon__label">Salon</span>
          <strong id="salon-code">{salon.code}</strong>
        </div>
        <div className="salon__boutons">
          <button type="button" className="btn-dc" id="btn-copier" onClick={copier}>Copier le lien</button>
          <button type="button" className="btn-dc" id="btn-quitter" onClick={ligne.quitter}>Quitter</button>
        </div>
      </div>
      <div className="salon__format" id="salon-format" role="radiogroup" aria-label="Format du duel" hidden={salon.formatFixe}
        title={salon.role === 'hote' ? '' : 'Le format est choisi par l’hôte du salon'}>
        <button type="button" className="salon__format-btn" role="radio" aria-checked={salon.format === '1v1'} data-format="1v1"
          disabled={formatBloque} onClick={() => choisir('1v1')}>1 contre 1</button>
        <button type="button" className="salon__format-btn" role="radio" aria-checked={salon.format === '2v2'} data-format="2v2"
          disabled={formatBloque} onClick={() => choisir('2v2')}>2 contre 2 <small>camp partagé</small></button>
      </div>
      <JoueursSalon salon={salon} />
      <button type="button" className="btn-dc salon__equipe-btn" id="btn-equipe" hidden={salon.format !== '2v2' || salon.formatFixe}
        disabled={salon.pret || salon.enDuel} onClick={changer}>Changer d’équipe</button>
      <p className="salon__etat" id="salon-etat" aria-live="polite">{salon.etat}</p>
      <button type="button" className={`btn-dc salon__pret-btn${salon.pret ? '' : ' btn-dc--ambre'}`} id="btn-pret"
        onClick={ligne.basculerPret}>{salon.pret ? 'Je ne suis plus prêt' : 'Je suis prêt'}</button>
    </div>
  );
}

// La recherche d'une partie classée : le serveur apparie deux joueurs de cote proche et leur donne
// le même salon (le plus ancien dans la file en est l'hôte ; en 2v2, avec les équipes) ; tous s'y déclarent prêts tout seuls
function useRechercheClassee(ligne) {
  const [recherche, setRecherche] = useState(null);   // { debut, mode } pendant la recherche
  const [texte, setTexte] = useState('');
  const minuteur = useRef(null);
  const enCours = useRef(null);

  const arreter = () => { clearInterval(minuteur.current); minuteur.current = null; enCours.current = null; setRecherche(null); };
  const chercher = async (r) => {
    const { data, error } = await supabase.rpc('chercher_classee', { p_mode: r.mode });
    if (enCours.current !== r) return;   // recherche annulée entre-temps
    if (error) {
      arreter();
      setTexte(classeAbsent(error) ? 'Le classé n’est pas encore installé (SQL/classe.sql).' : (error.message || 'Recherche impossible.'));
      return;
    }
    if (data?.salon) {
      arreter();
      setTexte(r.mode === '2v2' ? 'Équipes formées ! Le duel commence…' : 'Adversaire trouvé ! Le duel commence…');
      jouerSon('cloche');
      ligne.entrer(data.salon, data.role, { classe: true, format: r.mode, equipe: data.equipe ?? null });
      return;
    }
    const s = Math.floor((Date.now() - r.debut) / 1000);
    setTexte(`Recherche ${r.mode === '2v2' ? 'de trois joueurs' : 'd’un adversaire'}… ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
  };
  const basculer = (mode) => {
    if (enCours.current) {
      arreter();
      setTexte('Recherche annulée.');
      supabase.rpc('quitter_classee');
      return;
    }
    const r = { debut: Date.now(), mode };
    enCours.current = r;
    setRecherche(r);
    setTexte(mode === '2v2' ? 'Recherche de trois joueurs… 0:00' : 'Recherche d’un adversaire… 0:00');
    jouerSon('clic');
    minuteur.current = setInterval(() => chercher(r), 2500);
    chercher(r);
  };
  // Quitter la page (ou l'écran) en pleine recherche : on sort de la file
  useEffect(() => {
    const partir = () => { if (enCours.current) supabase.rpc('quitter_classee'); };
    addEventListener('pagehide', partir);
    return () => {
      removeEventListener('pagehide', partir);
      clearInterval(minuteur.current);
      partir();
      enCours.current = null;
    };
  }, []);
  return { recherche, texte, basculer };
}

// Le panneau du mode en ligne (connexion, partie privée, classé, puis le salon)
// cache : l'onglet « Contre l'Ombre » est choisi (le panneau reste là : une recherche classée continue)
function PanneauLigne({ joueur, ligne, cache }) {
  const notifier = useNotifier();
  const [codeOuvert, setCodeOuvert] = useState(false);
  const [code, setCode] = useState('');
  const [modeClasse, setModeClasse] = useState('1v1');
  const champCode = useRef(null);
  const classe = useRechercheClassee(ligne);
  useEffect(() => { if (codeOuvert) champCode.current?.focus(); }, [codeOuvert]);
  const { salon } = ligne;

  const rejoindre = (e) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (!codeValide(c)) return notifier('Ce code n\'est pas valide : cinq lettres ou chiffres.', 'erreur');
    ligne.entrer(c, estHote(c) ? 'hote' : 'invite');
  };
  const chercher = () => classe.basculer(modeClasse);

  return (
    <section className="ligne" id="panneau-ligne" hidden={cache}>
      <div className="ligne__bloc ligne__bloc--centre" hidden={!!joueur}>
        <p>Le duel en ligne se joue avec les cartes de ton grimoire : connecte-toi avec Discord pour jouer en classé ou défier un ami.</p>
        <button type="button" className="btn-discord" onClick={connexionDiscord}>
          <span className="btn-discord__logo" aria-hidden="true" />
          Connecter Discord
        </button>
      </div>

      <div className="ligne__accueil" hidden={!joueur || !!salon}>
        <h3 className="ligne__sous-titre">Partie privée</h3>
        <div className="ligne__bloc prive">
          <h3>Jouer avec un ami</h3>
          <p>Crée un salon (1 contre 1, ou 2 contre 2 à quatre) et envoie le lien à tes amis, ou rejoins le leur avec son code.</p>
          <div className="prive__boutons">
            <button type="button" className="btn-dc btn-dc--ambre" id="btn-creer" onClick={() => ligne.entrer(nouveauCode(), 'hote')}>Créer un salon</button>
            <button type="button" className="btn-dc btn-dc--ambre" id="btn-ouvrir-code" aria-expanded={codeOuvert}
              aria-controls="form-rejoindre" onClick={() => setCodeOuvert((o) => !o)}>Rejoindre un salon</button>
          </div>
          <form className="prive__code" id="form-rejoindre" hidden={!codeOuvert} onSubmit={rejoindre}>
            <label htmlFor="code-salon">Code du salon (cinq lettres)</label>
            <div className="ligne__rejoindre">
              <input type="text" id="code-salon" maxLength={5} autoComplete="off" spellCheck="false" placeholder="CODE" required
                ref={champCode} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
              <button type="submit" className="btn-dc">Rejoindre</button>
            </div>
          </form>
        </div>
        <h3 className="ligne__sous-titre">Partie classée</h3>
        <div className={`ligne__bloc classe${classe.recherche ? ' est-en-recherche' : ''}`} id="bloc-classe">
          <h3>Affronter un joueur de ton niveau</h3>
          {/* (relu à chaque retour à l'accueil du mode en ligne : la cote a pu bouger) */}
          {joueur && !salon && <RangClasse joueur={joueur} />}
          <div className="classe__modes" role="radiogroup" aria-label="Mode classé">
            {[['1v1', '1v1 classé', undefined], ['2v2', '2v2 classé', 'Deux équipes de deux : un héros et une rangée partagés par équipe']].map(([m, t, titre]) => (
              <button key={m} type="button" className="classe__mode" role="radio" aria-checked={modeClasse === m} title={titre}
                onClick={() => { if (!classe.recherche) setModeClasse(m); }}>{t}</button>
            ))}
          </div>
          <button type="button" className={`btn-dc classe__chercher${classe.recherche ? '' : ' btn-dc--ambre'}`} id="btn-chercher" onClick={chercher}>
            {classe.recherche ? 'Annuler la recherche' : 'Rechercher une partie'}
          </button>
          <p className="classe__etat" aria-live="polite">{classe.texte}</p>
        </div>
      </div>

      {salon && <Salon ligne={ligne} />}
    </section>
  );
}

// donnees : useDonneesDuel ; surJouer(grimoireChoisi, difficulte) lance le duel contre l'Ombre
// ligne : le salon en ligne (lib/duel/useLigne.js)
export default function Menu({ joueur, donnees, ligne, surRegles, surJouer }) {
  const notifier = useNotifier();
  const [params] = useSearchParams();
  const [mode, setMode] = useState(params.get('mode') === 'ligne' || params.has('salon') ? 'ligne' : 'solo');
  // Lien « Choisir mes cartes » du profil (?deck=choisir) : le constructeur s'ouvre tout de suite
  const [edition, setEdition] = useState(params.get('deck') === 'choisir');
  const [difficulte, setDifficulte] = useState(lireDifficulte);
  const [choix, setChoix] = useState(lireChoix);   // clés des cartes choisies (null : rien d'enregistré)
  const zoneChoix = useRef(null);
  const zoneDeck = useRef(null);
  const boutonsDifficulte = useRef({});

  const { pret } = donnees;
  const res = reserve(donnees.collection ?? [], donnees.objets ?? []);
  // Rien d'enregistré : le Grimoire proposé d'office (la collection, favorites d'abord, et les objets)
  const choixEffectif = choix ?? choixParDefaut(res, donnees.favorites ?? []);
  const cartes = pret ? cartesChoisies(choixEffectif, res.toutes) : [];
  const complet = grimoire(cartes);
  const nbObjets = cartes.filter(estObjet).length;
  const nbBase = complet.length - cartes.length;
  const parties = [`${cartes.length} choisie${cartes.length > 1 ? 's' : ''}`];
  if (nbObjets) parties.push(`dont ${nbObjets} objet${nbObjets > 1 ? 's' : ''}`);
  if (nbBase) parties.push(`+ ${nbBase} de base`);

  useEffect(() => {
    if (pret && params.get('deck') === 'choisir') zoneDeck.current?.scrollIntoView({ block: 'start' });
  }, [pret, params]);

  const enregistrer = (nouveau, son = true) => { setChoix(nouveau); garderChoix(nouveau); if (son) jouerSon('clic'); };

  // Un clic sur une carte de la réserve : un exemplaire de plus, ou (au maximum) on la retire
  function basculerCarte(cle) {
    const c = res.toutes.find((x) => cleCarte(x) === cle);
    if (!c) return;
    const n = exemplaires(cartes, c);
    if (n >= copiesMax(c)) return enregistrer(cartes.filter((x) => x !== c).map(cleCarte));
    if (cartes.length >= TAILLE_DECK) return notifier(`Ton Grimoire est plein (${TAILLE_DECK} cartes) : retire d'abord une carte.`, 'erreur');
    if (estTranscendante(c) && cartes.filter(estTranscendante).length >= TRANSCENDANTES_MAX) return notifier(`${TRANSCENDANTES_MAX} Transcendantes au plus dans le Grimoire.`, 'erreur');
    if (estObjet(c) && cartes.filter(estObjet).length >= OBJETS_MAX) {
      if (!n) return notifier(`${OBJETS_MAX} objets au plus dans le Grimoire.`, 'erreur');
      return enregistrer(cartes.filter((x) => x !== c).map(cleCarte));
    }
    return enregistrer([...cartes.map(cleCarte), cle]);
  }
  // Un clic sur une ligne du Grimoire : un exemplaire de moins
  function retirerUn(cle) {
    const actuelles = cartes.map(cleCarte);
    const i = actuelles.lastIndexOf(cle);
    if (i < 0) return;
    actuelles.splice(i, 1);
    enregistrer(actuelles);
  }

  function basculerEdition() {
    setEdition((e) => !e);
    if (!edition) setTimeout(() => zoneChoix.current?.scrollIntoView({ behavior: animationsReduites() ? 'auto' : 'smooth', block: 'nearest' }), 0);
  }

  // Dans un salon, on le quitte d'abord pour jouer en solo
  function choisirSolo() {
    if (ligne.salon) return notifier('Quitte d\'abord le salon pour jouer en solo.', 'erreur');
    setMode('solo');
  }

  function choisirDifficulte(d, focus = false) {
    setDifficulte(d);
    try { localStorage.setItem(CLE_DIFFICULTE, d); } catch { /* stockage indisponible */ }
    if (focus) boutonsDifficulte.current[d]?.focus();
  }
  // Flèches gauche / droite : comme un groupe de boutons radio
  function clavierDifficulte(e) {
    const pas = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!pas) return;
    e.preventDefault();
    const ids = Object.keys(DIFFICULTES);
    choisirDifficulte(ids[(ids.indexOf(difficulte) + pas + ids.length) % ids.length], true);
  }

  return (
    <section className="accueil" id="ecran-accueil">
      <div className="menu">
        <header className="menu__tete">
          <span className="accueil__sur">Jeu de cartes de Nocthémar</span>
          <h1 className="accueil__titre">Duel des <span>Couronnes</span></h1>
          <p className="accueil__texte">Fais tomber les 20 PV de ton adversaire avant qu&apos;il ne fasse tomber les tiens. Pose tes troupes, sers-toi de tes objets de pouvoir, et que chaque coup se joue au d20.</p>
        </header>

        {/* Mode de jeu : trois bannières */}
        <div className="modes" role="tablist" aria-label="Mode de jeu">
          <button type="button" className={`mode${mode === 'solo' ? ' est-actif' : ''}`} role="tab" aria-selected={mode === 'solo'} onClick={choisirSolo}>
            <span className="mode__ico"><Svg>{ICONE_EPEE}</Svg></span>
            <span className="mode__corps">
              <span className="mode__titre">Contre l&apos;Ombre</span>
              <span className="mode__texte">Seul, face à l&apos;IA du Codex</span>
            </span>
            <span className="mode__fleche" aria-hidden="true">›</span>
          </button>
          <button type="button" className={`mode${mode === 'ligne' ? ' est-actif' : ''}`} role="tab" aria-selected={mode === 'ligne'} onClick={() => setMode('ligne')}>
            <span className="mode__ico"><Svg>{ICONE_EPEE}<path d="M9.5 17.5L21 6V3h-3L6.5 14.5" /><path d="M11 19l-6-6" /><path d="M8 16l-4 4" /><path d="M5 21l-2-2" /></Svg></span>
            <span className="mode__corps">
              <span className="mode__titre">En ligne</span>
              <span className="mode__texte">Classé 1v1 ou 2v2, ou partie privée entre amis</span>
            </span>
            <span className="mode__fleche" aria-hidden="true">›</span>
          </button>
          {/* Mode Histoire : un autre écran, la carte des chapitres */}
          <Link className="mode mode--lien" to="/histoire" viewTransition>
            <span className="mode__ico"><Svg><path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z" /><path d="M9 3v15M15 6v15" /></Svg></span>
            <span className="mode__corps">
              <span className="mode__titre">Histoire</span>
              <span className="mode__texte">La campagne, pays après pays</span>
            </span>
            <span className="mode__fleche" aria-hidden="true">›</span>
          </Link>
        </div>

        {/* La salle : réglages et lancement à gauche, le Grimoire en éventail à droite */}
        <div className="menu__salle">
          <div className="menu__gauche">
            <div className="difficulte" id="choix-difficulte" hidden={mode !== 'solo'} onKeyDown={clavierDifficulte}>
              <span className="difficulte__titre" id="difficulte-titre">Difficulté</span>
              <div className="difficulte__choix" role="radiogroup" aria-labelledby="difficulte-titre">
                {[['facile', 'Facile'], ['normal', 'Normal'], ['difficile', 'Difficile']].map(([d, t]) => (
                  <button key={d} type="button" className="difficulte__btn" role="radio" aria-checked={d === difficulte}
                    tabIndex={d === difficulte ? 0 : -1} ref={(el) => { boutonsDifficulte.current[d] = el; }}
                    onClick={() => choisirDifficulte(d)}>{t}</button>
                ))}
              </div>
              <p className="difficulte__texte">{DIFFICULTES[difficulte].texte}</p>
            </div>

            <PanneauLigne joueur={joueur} ligne={ligne} cache={mode !== 'ligne'} />

            <div className="accueil__actions">
              <button type="button" className="btn-dc btn-dc--ambre menu__jouer" id="btn-jouer" hidden={mode !== 'solo'} disabled={!pret}
                onClick={() => surJouer(cartes, difficulte)}>Engager le duel</button>
              <button type="button" className="btn-dc menu__regles" onClick={surRegles}>
                <span className="menu__regles-ico"><Svg><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" /><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5" /></Svg></span> Règles du duel
              </button>
            </div>
          </div>

          {/* Le Grimoire en éventail sur un autel */}
          <div className="menu__droite">
            <div className="menu__autel">
              <h2 className="accueil__deck-titre">{pret ? `Ton Grimoire (${complet.length} cartes) : ${parties.join(', ')}` : 'Ton deck'}</h2>
              <div className={`accueil__deck${edition ? ' est-en-edition' : ''}`} id="accueil-deck" ref={zoneDeck}>
                {!pret ? <p className="vide">Les cartes sortent du grimoire…</p> : (
                  <>
                    {[...new Set(complet)].slice(0, 5).map((c) => (
                      <span key={cleCarte(c)} className="deck-place">
                        <CarteDuel c={c} />
                        {exemplaires(complet, c) > 1 && <span className="deck-place__nb">×{exemplaires(complet, c)}</span>}
                      </span>
                    ))}
                    <button type="button" className={`btn-dc deck-modifier${edition ? ' btn-dc--ambre' : ''}`} onClick={basculerEdition}>
                      {edition ? 'Valider mon Grimoire' : 'Choisir mes cartes'}
                    </button>
                    {!joueur ? <p className="accueil__note">Connecte-toi avec Discord pour jouer avec ta collection : sans compte, ton Grimoire est fait de cartes de base.</p>
                      : !(donnees.collection ?? []).length ? <p className="accueil__note">Ta collection est vide : ton Grimoire est complété avec des cartes de base. Les cartes s&apos;obtiennent à la <Link to="/boutique">boutique</Link>.</p>
                        : null}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Le duel en quatre mots */}
        <ul className="menu__atouts" aria-label="Le duel en bref">
          <li><strong>20</strong><span>PV par héros</span></li>
          <li><strong>10</strong><span>énergie max.</span></li>
          <li><strong>d20</strong><span>à chaque attaque</span></li>
          <li><strong>20</strong><span>cartes au Grimoire</span></li>
        </ul>
      </div>

      {/* Choix des cartes du deck (bouton « Choisir mes cartes ») */}
      <div className="choix-deck" id="choix-deck" hidden={!edition || !pret} ref={zoneChoix}>
        {edition && pret && (
          <Constructeur cartes={cartes} toutes={res.toutes} connecte={!!joueur}
            surBasculer={basculerCarte} surRetirer={retirerUn} surVider={() => enregistrer([], false)} />
        )}
      </div>
    </section>
  );
}
