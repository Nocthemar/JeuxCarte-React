// =====================================================================
//  La barre de navigation du jeu (styles/barre-jeu.css), dans la direction artistique de Nocthémar :
//  dark medieval fantasy en low poly, charbon et pierre, ivoire et or vieilli, un accent rouge sang.
//   - en haut, le portrait du joueur dans un hexagone à double filet, pointes en losange ;
//   - un panneau sombre taillé en facettes, à cadre doré (une image : public/img/HUD/panneau-hud-v3.webp) ;
//   - les écrans en rangées ; celui où l'on est devient une plaque rouge sang bordée d'or,
//     dont la pointe déborde du panneau.
//  Grand écran : toujours ouverte ; écran moyen : icônes seules ; téléphone (max-width 700px) :
//  une barre en bas à 5 boutons (Jouer, Collection, le portrait au centre, Boutique, « Plus »),
//  les autres écrans dans le menu Plus.
//  data-place : la place du bouton dans la barre du téléphone ; « menu » : dans le menu Plus.
//  Sur le médaillon du portrait (ordinateur) : le sceau du panneau MJ (#/mj), pour les MJ.
// =====================================================================
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { NOCTHEMAR_SITE } from '../lib/lienSite.js';
import { useAuth, connexionDiscord, deconnexion } from '../lib/auth.js';
import { supabase } from '../lib/supabase.js';
import OrAnime from './OrAnime.jsx';
import { urlPublique } from '../lib/chemins.js';
import { prechargerEcran } from '../lib/ecrans.js';
import { useAmis } from '../lib/amis.js';

// La bourse du joueur, sous les écrans (ordinateur) : l’or et les cristaux, à égalité. Relue à chaque changement d'écran (après un achat,
// une récompense…), au retour sur l'onglet, et toutes les minutes.
function Bourse({ discordId }) {
  const { pathname } = useLocation();
  const [bourse, setBourse] = useState({ pour: null, solde: null, cristaux: 0 });
  const [relire, setRelire] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setRelire((n) => n + 1), 60000);
    const vu = () => { if (document.visibilityState === 'visible') setRelire((n) => n + 1); };
    document.addEventListener('visibilitychange', vu);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vu); };
  }, []);
  useEffect(() => {
    if (!discordId) return undefined;
    let actif = true;
    supabase.from('wallets').select('*').eq('discord_id', discordId).maybeSingle()
      .then(({ data }) => { if (actif) setBourse({ pour: discordId, solde: data?.balance ?? 0, cristaux: data?.cristaux ?? 0 }); });
    return () => { actif = false; };
  }, [discordId, pathname, relire]);
  if (!discordId || bourse.pour !== discordId || bourse.solde === null) return null;
  return (
    <div className="barre__bourse" data-place="menu" title="Ta bourse">
      {/* deux lignes de même taille : l'or (qui scintille), puis les cristaux (qui luisent) */}
      <span className="barre__bourse-ligne">
        <span className="barre__bourse-or"><OrAnime solde={bourse.solde} /></span>
        <span className="barre__bourse-texte">
          <b>{bourse.solde.toLocaleString('fr-FR')}</b>
          <small>pièces d’or</small>
        </span>
      </span>
      <span className="barre__bourse-ligne barre__bourse-ligne--cristaux">
        <span className="barre__bourse-cristal"><img src={urlPublique('img/OR/cristal.webp')} alt="" /></span>
        <span className="barre__bourse-texte">
          <b>{bourse.cristaux.toLocaleString('fr-FR')}</b>
          <small>cristaux</small>
        </span>
      </span>
    </div>
  );
}

const ICONES = {
  // deux épées croisées
  jouer: <><path d="M4 4l10 10M4 4v4M4 4h4" /><path d="M20 4L10 14M20 4v4M20 4h-4" /><path d="M7 15l2 2M17 15l-2 2" /><path d="M5.5 18.5l2-2M18.5 18.5l-2-2" /><path d="M4 20l1.5-1.5M20 20l-1.5-1.5" /></>,
  // deux cartes
  collection: <><rect x="3" y="6" width="11" height="15" rx="1.5" transform="rotate(-8 8.5 13.5)" /><rect x="10" y="3" width="11" height="15" rx="1.5" transform="rotate(8 15.5 10.5)" /></>,
  // une bourse
  boutique: <><path d="M9 3h6l-1.6 3.2h-2.8z" /><path d="M10.4 6.2C7 8.5 4.5 12.3 4.5 15.6 4.5 18.9 7 21 10 21h4c3 0 5.5-2.1 5.5-5.4 0-3.3-2.5-7.1-5.9-9.4" /><path d="M13.6 12.2c-.4-.6-1-.9-1.7-.9-1 0-1.8.6-1.8 1.4 0 1.9 3.8 1.1 3.8 3 0 .8-.9 1.5-2 1.5-.8 0-1.5-.4-1.9-1M12 10.3v1M12 17.2v1" /></>,
  // un coffre au trésor (la Caverne aux Trésors)
  caverne: <><path d="M3.5 10.5a8.5 5.5 0 0 1 17 0V20h-17z" /><path d="M3.5 10.5h17M3.5 14h17" /><path d="M10.5 12.5h3v3.5h-3z" /><path d="M8 6v4.5M16 6v4.5" /></>,
  // deux compagnons, épaule contre épaule
  amis: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20a6 6 0 0 1 12 0" /><circle cx="16.5" cy="9" r="2.6" /><path d="M15.5 14.2A5 5 0 0 1 21 19" /></>,
  // une balance
  marche: <><path d="M12 3v18M7 21h10" /><path d="M4 7h16" /><path d="M6 7l-3 7a3 3 0 0 0 6 0zM18 7l-3 7a3 3 0 0 0 6 0z" /></>,
  // un heaume
  profil: <><path d="M5 13a7 7 0 0 1 14 0v8h-4.5v-5.5h-5V21H5z" /><path d="M12 6v9.5" /><path d="M8 11h2.5M13.5 11H16" /></>,
  // deux ailes
  pass: <><path d="M12 7v13" /><path d="M11 9C8.5 5.5 5 4.5 2.5 5.5 3.3 8.8 6.6 12 11 12.6" /><path d="M13 9c2.5-3.5 6-4.5 8.5-3.5-.8 3.3-4.1 6.5-8.5 7.1" /><path d="M11 13.5c-2.2.3-4.4 1.4-5.5 3M13 13.5c2.2.3 4.4 1.4 5.5 3" /></>,
  // un trophée
  succes: <><path d="M8 4h8v5a4 4 0 0 1-8 0z" /><path d="M8 6H5.5a2.5 2.5 0 0 0 2.6 4M16 6h2.5a2.5 2.5 0 0 1-2.6 4" /><path d="M12 13v3M9 21h6M10 16h4l.5 5h-5z" /></>,
  catalogue: <><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="9" rx="1" /><rect x="3" y="15" width="7" height="6" rx="1" /><rect x="14" y="15" width="7" height="6" rx="1" /></>,
  reglages: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5l1.6 2.7 3.1-.7.7 3.1 2.7 1.6-1.6 2.8 1.6 2.8-2.7 1.6-.7 3.1-3.1-.7L12 21.5l-1.6-2.7-3.1.7-.7-3.1-2.7-1.6L5.5 12 3.9 9.2l2.7-1.6.7-3.1 3.1.7z" /></>,
  // une porte entrouverte
  retour: <><path d="M5 3h9v18H5z" /><path d="M14 4.5l5 1.5v12l-5 1.5" /><circle cx="11.5" cy="12" r=".9" /></>,
  mj: <><path d="M4 18h16M5 18l1.5-9 4 4L12 6l1.5 7 4-4L19 18" /></>,
  plus: <><circle cx="5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="19" cy="12" r="1.3" /></>,
  deconnexion: <><path d="M12 3v8" /><path d="M7 6.5a7 7 0 1 0 10 0" /></>,
  silhouette: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
};

function Icone({ nom }) {
  return (
    <span className="barre-ico">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {ICONES[nom]}
      </svg>
    </span>
  );
}

// Le panneau : l'image du panneau taillé à cadre doré (public/img/HUD/panneau-barre-v2.webp), posée
// derrière le contenu ; elle s'étire seulement en son milieu (styles/barre-jeu.css, border-image) :
// les coins du haut et la pointe du bas gardent leur forme. La plaque de l'écran en cours peut déborder.
// Le panneau : une image (public/img/HUD/panneau-hud-v3.webp, 248 × 985 px) — cadre d'or, médaillon ovale,
// gemmes turquoise, tissu bleu. Le portrait se pose dans l'ovale, les écrans dans le panneau
// (positions en pixels de l'image, mises à l'échelle : styles/barre-jeu.css).
const FOND = <span className="barre__fond barre__image" aria-hidden="true" />;

// Le cadre du portrait : un hexagone à double filet, quatre pointes en losange
const CADRE = (
  <svg className="barre__cadre" viewBox="0 0 140 154" aria-hidden="true">
    <polygon className="barre__cadre-trait" points="70,9 129,42 129,112 70,145 11,112 11,42" />
    <polygon className="barre__cadre-trait barre__cadre-trait--fin" points="70,15 124,45 124,109 70,139 16,109 16,45" />
    <path className="barre__cadre-pointe" d="M70 0 L74 9 L70 20 L66 9 Z M70 134 L74 145 L70 154 L66 145 Z M0 77 L9 73 L18 77 L9 81 Z M140 77 L131 73 L122 77 L131 81 Z" />
  </svg>
);

// Les écrans du jeu, dans l'ordre de la barre
// actifSur : d'autres adresses où l'écran est éclairé (Jouer : le Duel, l'Histoire et les Gemmes)
// place : sa place dans la barre du téléphone ; sans place, l'écran est dans le menu « Plus »
const PAGES = [
  { icone: 'profil', libelle: 'Profil', chemin: '/profil', place: 'profil' },
  { icone: 'jouer', libelle: 'Jouer', chemin: '/duel', actifSur: ['/histoire', '/gemmes'], place: 1 },
  { icone: 'collection', libelle: 'Collection', chemin: '/collection', place: 2 },
  { icone: 'boutique', libelle: 'Boutique', chemin: '/boutique', place: 4 },
  { icone: 'caverne', libelle: 'Caverne', chemin: '/caverne' },
  { icone: 'marche', libelle: 'Marché', chemin: '/marche' },
  { icone: 'amis', libelle: 'Amis', chemin: '/amis' },
  { icone: 'pass', libelle: 'Pass de saison', chemin: '/pass' },
  { icone: 'succes', libelle: 'Succès', chemin: '/succes' },
  { icone: 'catalogue', libelle: 'Toutes les cartes', chemin: '/toutes-les-cartes' },
];
// Paramètres : dans la barre (après les écrans) et dans le menu « Plus » du téléphone
const PARAMETRES = { icone: 'reglages', libelle: 'Paramètres', chemin: '/parametres' };
const DANS_LE_MENU = [...PAGES.filter((p) => typeof p.place !== 'number' && p.place !== 'profil'), PARAMETRES];


// Un écran de la barre ; l'écran en cours devient une plaque rouge sang ; nb : une pastille (ce qui t'y attend)
function Entree({ icone, libelle, chemin, actif, place, nb = 0 }) {
  return (
    <Link to={chemin} className={`barre-entree${actif ? ' est-actif' : ''}`} data-place={place ?? 'menu'}
      onPointerEnter={() => prechargerEcran(chemin)} onFocus={() => prechargerEcran(chemin)} onTouchStart={() => prechargerEcran(chemin)}
      title={nb ? `${libelle} (${nb} en attente)` : libelle} aria-label={nb ? `${libelle}, ${nb} en attente` : libelle} aria-current={actif ? 'page' : undefined}>
      <Icone nom={icone} />
      <span className="barre-entree__nom">{libelle}</span>
      {nb > 0 && <span className="barre-entree__nb" aria-hidden="true">{nb}</span>}
    </Link>
  );
}

// Le bord droit de la barre (--hud, sur <html>) : les fonds des écrans commencent là, au lieu de passer
// derrière la barre (styles/barre-jeu.css). Suivi en direct : la largeur de la barre change avec l'écran.
function useBordDeLaBarre(barre) {
  useEffect(() => {
    const el = barre.current;
    if (!el) return undefined;
    const mesurer = () => document.documentElement.style.setProperty('--hud', `${Math.round(el.getBoundingClientRect().right)}px`);
    mesurer();
    const suivi = new ResizeObserver(mesurer);
    suivi.observe(el);
    window.addEventListener('resize', mesurer);
    return () => {
      suivi.disconnect();
      window.removeEventListener('resize', mesurer);
      document.documentElement.style.removeProperty('--hud');
    };
  }, [barre]);
}

export default function BarreLaterale() {
  const { joueur, chargement } = useAuth();
  const { pathname } = useLocation();
  const barre = useRef(null);
  useBordDeLaBarre(barre);
  const amisEnAttente = useAmis(joueur?.discord_id ?? null);
  return (
    <nav className="barre" aria-label="Navigation" ref={barre}>
      {FOND}

      {/* Le portrait : vers le profil, ou la connexion Discord */}
      <div className="barre__medaillon" data-place="3">
        <span className="barre__cadre-mobile">{CADRE}</span>
        {chargement ? <span className="barre__portrait barre__portrait--vide" />
          : joueur ? (
            <Link to="/profil" className={`barre__portrait${pathname === '/profil' ? ' est-actif' : ''}`} aria-label={`Mon profil (${joueur.username ?? 'joueur'})`} title={joueur.username ?? 'Mon profil'}>
              {joueur.avatar_url ? <img src={joueur.avatar_url} alt="" /> : <Icone nom="silhouette" />}
            </Link>
          ) : (
            <button type="button" className="barre__portrait barre__discord" onClick={() => connexionDiscord()} aria-label="Connecter Discord" title="Connecter Discord">
              <span className="btn-discord__logo" aria-hidden="true" />
            </button>
          )}
        {/* (ordinateur, MJ seulement) le panneau MJ : un sceau hexagonal accroché au médaillon */}
        {joueur?.is_mj && (
          <Link to="/mj" className={`barre__mj${pathname === '/mj' ? ' est-actif' : ''}`} title="Panneau MJ" aria-label="Panneau MJ"><Icone nom="mj" /></Link>
        )}
      </div>
      {!chargement && !joueur && <button type="button" className="barre__connexion" data-place="menu" onClick={() => connexionDiscord()}>Se connecter</button>}
      {/* (ordinateur) le pseudo sous le portrait, et un ornement à losange */}
      <div className="barre__tete" data-place="menu" aria-hidden="true">
        <span className="barre__pseudo">{joueur?.username ?? 'Voyageur'}</span>
        <span className="barre__sous-titre">Duel des Couronnes</span>
        <span className="barre__ornement-ligne"><i /></span>
      </div>

      <div className="barre__entrees">
        {PAGES.map((p) => (
          <Entree key={p.chemin} {...p} actif={pathname === p.chemin || (p.actifSur ?? []).includes(pathname)} nb={p.chemin === '/amis' ? amisEnAttente : 0} />
        ))}
        <Entree {...PARAMETRES} place="menu" actif={pathname === PARAMETRES.chemin} />
        <a className="barre-entree" href={NOCTHEMAR_SITE} data-place="menu" title="Retour au site Nocthémar" aria-label="Retour au site Nocthémar">
          <Icone nom="retour" /><span className="barre-entree__nom">Site Nocthémar</span>
        </a>
      </div>

      {/* (ordinateur) la signature, en bas */}
      <Bourse discordId={joueur?.discord_id ?? null} />
      <div className="barre__pied-signature" data-place="menu" aria-hidden="true"><i />Nocthémar<i /></div>
      <MenuPlus />
    </nav>
  );
}

// Téléphone seulement : le bouton « Plus » et son menu (les écrans qui n'ont pas de place dans la barre)
function MenuPlus() {
  const { pathname } = useLocation();
  const { joueur } = useAuth();
  // Le menu est ouvert « sur » un écran : changer d'écran le referme tout seul
  const [ouvertSur, setOuvertSur] = useState(null);
  const ouvert = ouvertSur === pathname;
  const fermer = () => setOuvertSur(null);
  const actif = DANS_LE_MENU.some((p) => p.chemin === pathname);
  return (
    <>
      <button type="button" className={`barre-entree barre-plus${actif || ouvert ? ' est-actif' : ''}`} data-place="5"
        aria-label="Plus" aria-expanded={ouvert} aria-controls="barre-menu" onClick={() => setOuvertSur(ouvert ? null : pathname)}>
        <Icone nom="plus" />
      </button>
      {ouvert && (
        <>
          <div className="barre-menu-fond" onClick={fermer} aria-hidden="true" />
          <div className="barre-menu" id="barre-menu" role="menu" onKeyDown={(e) => { if (e.key === 'Escape') fermer(); }}>
            {DANS_LE_MENU.map(({ icone, libelle, chemin }) => (
              <Link key={chemin} to={chemin} role="menuitem" className={`barre-menu__item${pathname === chemin ? ' est-actif' : ''}`} onClick={fermer}>
                <Icone nom={icone} /><span>{libelle}</span>
              </Link>
            ))}
            <a className="barre-menu__item" role="menuitem" href={NOCTHEMAR_SITE}><Icone nom="retour" /><span>Site Nocthémar</span></a>
            {joueur?.is_mj && <Link className="barre-menu__item" role="menuitem" to="/mj" onClick={fermer}><Icone nom="mj" /><span>Panneau MJ</span></Link>}
            {joueur && (
              <button type="button" className="barre-menu__item barre-menu__item--sortie" role="menuitem" onClick={() => { fermer(); deconnexion(); }}>
                <Icone nom="deconnexion" /><span>Se déconnecter</span>
              </button>
            )}
          </div>
        </>
      )}
    </>
  );
}
