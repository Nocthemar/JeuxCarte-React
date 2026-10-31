// =====================================================================
//  Le menu « Jouer » (ancien écran d'accueil de jeu-cartes.html et JS/jeu-cartes.js)
//  - l'accueil : trois cartes, Histoire (une autre page), Modes de jeu, En ligne ;
//  - Modes de jeu (?mode=jeux) : contre l'Ombre (sa page, ?mode=ombre) ou les Gemmes (#/gemmes) ;
//  - En ligne (?mode=ligne) : le Duel des Couronnes (sa page, ?mode=duel, et le salon ?salon=CODE)
//    ou les Gemmes contre un ami (#/gemmes?mode=ami) ;
//  - la difficulté de l'Ombre (retenue dans le navigateur) ;
//  - le Grimoire en éventail sur l'autel, et le constructeur de deck (« Choisir mes cartes ») ;
//  - le panneau du Duel en ligne : partie privée (le salon), classé.
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
import { prechargerEcran } from '../../lib/ecrans.js';

const CLE_DIFFICULTE = 'duel-couronnes-difficulte';
const lireDifficulte = () => { try { const d = localStorage.getItem(CLE_DIFFICULTE); return DIFFICULTES[d] ? d : 'normal'; } catch { return 'normal'; } };


const ICONE_EPEE = <><path d="M14.5 17.5L3 6V3h3l11.5 11.5" /><path d="M13 19l6-6" /><path d="M16 16l4 4" /><path d="M19 21l2-2" /></>;
// Les masques de la difficulté : un heaume simple, un heaume à cornes, un masque démoniaque
const MASQUES = {
  facile: <><path d="M6 11a6 6 0 0 1 12 0v6l-2 3H8l-2-3z" /><path d="M9 12h2M13 12h2M12 9v8" /></>,
  normal: <><path d="M6 12a6 6 0 0 1 12 0v5l-2 3H8l-2-3z" /><path d="M6 9L3 4l5 3M18 9l3-5-5 3" /><path d="M9 13h2M13 13h2" /></>,
  difficile: <><path d="M6 12a6 6 0 0 1 12 0c0 4-2 8-6 9-4-1-6-5-6-9z" /><path d="M6.5 9L2 3l6 3.5M17.5 9L22 3l-6 3.5" /><path d="M8.5 12.5l2.5 1M15.5 12.5l-2.5 1" /><path d="M10 17l1 1 1-1 1 1 1-1" /></>,
};
const Svg = ({ children }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const ICONE_EPEES = <>{ICONE_EPEE}<path d="M9.5 17.5L21 6V3h-3L6.5 14.5" /><path d="M11 19l-6-6" /><path d="M8 16l-4 4" /><path d="M5 21l-2-2" /></>;
const ICONE_GEMME = <><path d="M12 3l8 6-8 12-8-12z" /><path d="M4 9h16M9 9l3 12 3-12M8 3.5L9 9M16 3.5L15 9" /></>;

// Une carte de mode : un bouton (un écran du menu) ou un lien (une autre page)
function CarteMode({ classe, num, icone, titre, texte, infos, actif, vers, surClic, survol }) {
  const contenu = (
    <>
      <span className="hall-mode__image" aria-hidden="true" />
      {num && <span className="hall-mode__num" aria-hidden="true">{num}</span>}
      <span className="hall-mode__embleme"><Svg>{icone}</Svg></span>
      <span className="hall-mode__titre">{titre}</span>
      <span className="hall-mode__texte">{texte}</span>
      <span className="hall-mode__infos">{infos}</span>
    </>
  );
  const nom = `hall-mode hall-mode--${classe}${actif ? ' est-actif' : ''}`;
  if (vers) return <Link className={nom} to={vers} viewTransition onPointerEnter={survol} onFocus={survol}>{contenu}</Link>;
  return <button type="button" className={nom} aria-current={actif || undefined} onClick={surClic}>{contenu}</button>;
}

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
// (sur la page du Duel en ligne ; la quitter arrête une recherche classée)
function PanneauLigne({ joueur, ligne }) {
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
    <section className="ligne" id="panneau-ligne">
      <div className="ligne__bloc ligne__bloc--centre" hidden={!!joueur}>
        <p>Le duel en ligne se joue avec les cartes de ton grimoire : connecte-toi avec Discord pour jouer en classé ou défier un ami.</p>
        <button type="button" className="btn-discord" onClick={() => connexionDiscord()}>
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
          {/* pendant la recherche : le losange du jeu tourne à côté du chrono */}
          <p className={`classe__etat${classe.recherche ? ' chargement-jeu' : ''}`} aria-live="polite">
            {classe.recherche && <span className="chargement-jeu__rune" aria-hidden="true"><i /></span>}{classe.texte}
          </p>
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
  const [params, setParams] = useSearchParams();
  // L'écran du menu suit l'adresse (le bouton Retour du navigateur y revient) : l'accueil, Modes de jeu, Contre l'Ombre, En ligne, le Duel en ligne
  const vue = params.has('salon') || params.get('mode') === 'duel' ? 'duel'
    : params.get('mode') === 'ligne' ? 'ligne'
    : params.get('mode') === 'ombre' || params.get('deck') === 'choisir' ? 'ombre'
    : params.get('mode') === 'jeux' ? 'jeux' : 'accueil';
  // Lien « Choisir mes cartes » du profil (?deck=choisir) : le constructeur s'ouvre tout de suite
  const [edition, setEdition] = useState(params.get('deck') === 'choisir');
  const [carrousel, setCarrousel] = useState(3);
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
    if (estTranscendante(c) && cartes.filter(estTranscendante).length >= TRANSCENDANTES_MAX) return notifier(`Une seule Transcendante dans le Grimoire : retire d’abord l’autre.`, 'erreur');
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

  // Changer d'écran du menu ; dans un salon, on le quitte d'abord
  function aller(v) {
    if (ligne.salon) return notifier('Quitte d\'abord le salon.', 'erreur');
    jouerSon('clic');
    setParams(v === 'accueil' ? {} : { mode: v });
    scrollTo(0, 0);
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

  // Le Grimoire en bandeau : les cartes, sans doublon
  const vitrine = pret ? [...new Set(complet)] : [];
  // Le carrousel : la carte au centre (les autres s'écartent de chaque côté)
  const centre = Math.min(Math.max(0, carrousel), Math.max(0, vitrine.length - 1));
  const tourner = (pas) => setCarrousel(Math.min(Math.max(0, centre + pas), vitrine.length - 1));

  // Le Grimoire (le carrousel, « Choisir mes cartes ») : sur la page Contre l'Ombre et sur celle du Duel en ligne
  const blocGrimoire = (
    <div className="hall-grimoire" ref={zoneDeck}>
      <div className="hall-zone__tete">
        <span className="hall-zone__ico"><Svg><rect x="3" y="6" width="11" height="15" rx="1.5" transform="rotate(-8 8.5 13.5)" /><rect x="10" y="3" width="11" height="15" rx="1.5" transform="rotate(8 15.5 10.5)" /></Svg></span>
        <span className="hall-zone__textes">
          <span className="hall-zone__titre">Mon Grimoire</span>
          <span className="hall-zone__sous">{pret ? `${complet.length}/${TAILLE_DECK} cartes · ${parties.join(', ')}` : 'Les cartes sortent du grimoire…'}</span>
        </span>
      </div>
      {/* Le Grimoire en carrousel : flèches, clavier, ou un clic sur une carte pour l'amener au centre */}
      <div className="carrousel" role="group" aria-roledescription="carrousel" aria-label="Cartes de ton Grimoire"
        onKeyDown={(e) => { if (e.key === 'ArrowLeft') { e.preventDefault(); tourner(-1); } if (e.key === 'ArrowRight') { e.preventDefault(); tourner(1); } }}>
        <button type="button" className="carrousel__fleche carrousel__fleche--g" aria-label="Carte précédente" disabled={centre <= 0} onClick={() => tourner(-1)} />
        <div className="hall-grimoire__cartes carrousel__piste" id="accueil-deck">
          {vitrine.map((c, k) => {
            const d = k - centre;
            const n = exemplaires(complet, c);
            return (
              <span key={cleCarte(c)} className={`deck-place carrousel__carte${d === 0 ? ' est-centre' : ''}`}
                style={{ '--d': d, '--a': Math.abs(d), zIndex: 20 - Math.abs(d) }} aria-hidden={Math.abs(d) > 3 ? true : undefined}
                onClick={() => setCarrousel(k)}>
                <CarteDuel c={c} tabIndex={d === 0 ? 0 : -1} />
                {n > 1 && <span className="carrousel__nb">×{n}</span>}
              </span>
            );
          })}
        </div>
        <button type="button" className="carrousel__fleche carrousel__fleche--d" aria-label="Carte suivante" disabled={centre >= vitrine.length - 1} onClick={() => tourner(1)} />
        {vitrine.length > 0 && (
          <div className="carrousel__points" aria-hidden="true">
            {vitrine.map((c, k) => <i key={cleCarte(c)} className={k === centre ? 'est-actif' : undefined} />)}
          </div>
        )}
      </div>
      {pret && (
        <button type="button" className={`hall-plaque hall-plaque--petite${edition ? ' est-actif' : ''}`} onClick={basculerEdition}>
          {edition ? 'Valider mon Grimoire' : 'Choisir mes cartes'}
        </button>
      )}
      {pret && !joueur && <p className="accueil__note">Connecte-toi avec Discord pour jouer avec ta collection : sans compte, ton Grimoire est fait de cartes de base.</p>}
      {pret && joueur && !(donnees.collection ?? []).length && <p className="accueil__note">Ta collection est vide : ton Grimoire est complété avec des cartes de base. Les cartes s&apos;obtiennent à la <Link to="/boutique">boutique</Link>.</p>}
    </div>
  );
  const retour = (v, nom) => (
    <button type="button" className="hall-plaque hall-plaque--petite hall-ecran__retour" onClick={() => aller(v)}>
      <Svg><path d="M15 5l-7 7 7 7" /></Svg><span>{nom}</span>
    </button>
  );
  const boutonRegles = (
    <button type="button" className="hall-plaque menu__regles" onClick={surRegles}>
      <Svg><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4" /><path d="M9 11h7M9 14.5h7M9 18h4" /></Svg>
      <span>Règles du duel</span>
    </button>
  );

  return (
    <section className={`accueil hall${vue === 'ombre' || vue === 'duel' ? ` hall--${vue}` : ''}`} id="ecran-accueil">
      <h1 className="hall__titre-cache">Jouer</h1>
      <div className="menu">
        {/* L'accueil : trois bannières suspendues (styles/duel-accueil.css) */}
        {vue === 'accueil' && (
          <nav className="hall-modes hall-bannieres hall-modes--trois" aria-label="Jouer">
            {/* Mode Histoire : un autre écran, la carte des chapitres */}
            <CarteMode classe="histoire" num="I" vers="/histoire" titre="Histoire" texte="La campagne, pays après pays" infos="1 joueur · or, XP, cartes"
              icone={<><path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z" /><path d="M9 3v15M15 6v15" /></>} />
            <CarteMode classe="ombre" num="II" titre="Modes de jeu" texte="Contre l’Ombre ou les Gemmes, seul face à l’IA du Codex" infos="1 joueur · 2 modes"
              icone={ICONE_EPEES} surClic={() => aller('jeux')} />
            <CarteMode classe="ligne" num="III" titre="En ligne" texte="Tes deux modes de jeu, avec tes amis ou en classé" infos="2 à 4 joueurs · XP du Pass, rang"
              icone={ICONE_EPEES} surClic={() => aller('ligne')} />
          </nav>
        )}

        {/* Modes de jeu : deux bannières, Contre l'Ombre (sa page, ?mode=ombre) et les Gemmes (pages/Gemmes.jsx) */}
        {vue === 'jeux' && <>
          <div className="hall-ecran">{retour('accueil', 'Jouer')}<h2 className="hall-ecran__titre">Modes de jeu</h2></div>
          <nav className="hall-modes hall-bannieres hall-modes--jeux" aria-label="Modes de jeu">
            <CarteMode classe="ombre" num="I" titre="Contre l’Ombre" texte="Le Duel des Couronnes, seul face à l’IA du Codex" infos="1 joueur · XP du Pass, or"
              icone={ICONE_EPEES} surClic={() => aller('ombre')} />
            <CarteMode classe="gemmes" num="II" vers="/gemmes" titre="Gemmes" texte="Aligne les gemmes, charge tes cartes, abats l’Ombre" infos="1 joueur · 3 difficultés"
              icone={ICONE_GEMME} survol={() => prechargerEcran('/gemmes')} />
          </nav>
        </>}

        {/* Contre l'Ombre : sa page, sur la forêt. À gauche le Grimoire ; à droite l'adversaire (la difficulté) et le lancement */}
        {vue === 'ombre' && <>
          <div className="hall-ecran">{retour('jeux', 'Modes de jeu')}<h2 className="hall-ecran__titre">Contre l’Ombre</h2></div>
          <p className="ombre-page__intro">Le Duel des Couronnes, seul face à l’IA du Codex<span className="hall-mode__infos">1 joueur · XP du Pass, or</span></p>
          <div className="ombre-page">
            <section className="ombre-page__panneau ombre-page__panneau--grimoire">{blocGrimoire}</section>
            <section className="ombre-page__panneau ombre-page__panneau--adversaire difficulte" id="choix-difficulte" onKeyDown={clavierDifficulte}>
              <span className="hall-zone__titre" id="difficulte-titre">Ton adversaire</span>
              <div className="ombre-page__niveaux" role="radiogroup" aria-labelledby="difficulte-titre">
                {[['facile', 'Facile'], ['normal', 'Normal'], ['difficile', 'Difficile']].map(([d, t]) => (
                  <button key={d} type="button" className={`hall-hex ombre-niveau hall-hex--${d}`} role="radio" aria-checked={d === difficulte}
                    tabIndex={d === difficulte ? 0 : -1} ref={(el) => { boutonsDifficulte.current[d] = el; }}
                    onClick={() => choisirDifficulte(d)}>
                    <span className="hall-hex__forme"><Svg>{MASQUES[d]}</Svg></span>
                    <span className="ombre-niveau__textes"><b>{t}</b><small>{DIFFICULTES[d].texte}</small></span>
                  </button>
                ))}
              </div>
              <div className="hall-actions accueil__actions">
                <button type="button" className="hall-engager" id="btn-jouer" disabled={!pret} onClick={() => surJouer(cartes, difficulte)}>
                  <Svg>{ICONE_EPEES}</Svg>
                  <span>Engager le duel</span>
                </button>
                {boutonRegles}
              </div>
            </section>
          </div>
        </>}

        {/* En ligne : deux bannières, le Duel des Couronnes (sa page, ?mode=duel) et les Gemmes contre un ami */}
        {vue === 'ligne' && <>
          <div className="hall-ecran">{retour('accueil', 'Jouer')}<h2 className="hall-ecran__titre">En ligne</h2></div>
          <nav className="hall-modes hall-bannieres hall-modes--jeux" aria-label="En ligne">
            <CarteMode classe="ligne" num="I" titre="Duel des Couronnes" texte="Classé 1v1 ou 2v2, ou partie privée entre amis" infos="2 ou 4 joueurs · XP du Pass, rang"
              icone={ICONE_EPEES} surClic={() => aller('duel')} />
            <CarteMode classe="gemmes" num="II" vers="/gemmes?mode=ami" titre="Gemmes" texte="Un salon privé : défie un ami aux Gemmes" infos="2 joueurs · lien d’invitation"
              icone={ICONE_GEMME} survol={() => prechargerEcran('/gemmes')} />
          </nav>
        </>}

        {/* Le Duel en ligne : sa page, sous la lune. À gauche le Grimoire ; à droite la partie privée et la classée
            (puis le salon, une fois dedans) */}
        {vue === 'duel' && <>
          <div className="hall-ecran">{retour('ligne', 'En ligne')}<h2 className="hall-ecran__titre">Duel des Couronnes</h2></div>
          <p className="ombre-page__intro">En ligne : classé 1v1 ou 2v2, ou partie privée entre amis<span className="hall-mode__infos">2 ou 4 joueurs · XP du Pass, rang</span></p>
          <div className="ombre-page ombre-page--duel">
            <section className="ombre-page__panneau ombre-page__panneau--grimoire">
              {blocGrimoire}
              <div className="ombre-page__pied">{boutonRegles}</div>
            </section>
            <PanneauLigne joueur={joueur} ligne={ligne} />
          </div>
        </>}
      </div>

      {/* Choix des cartes du deck (bouton « Choisir mes cartes ») */}
      <div className="choix-deck" id="choix-deck" hidden={!edition || !pret || (vue !== 'ombre' && vue !== 'duel')} ref={zoneChoix}>
        {edition && pret && (
          <Constructeur cartes={cartes} toutes={res.toutes} connecte={!!joueur}
            surBasculer={basculerCarte} surRetirer={retirerUn} surVider={() => enregistrer([], false)} />
        )}
      </div>
    </section>
  );
}
