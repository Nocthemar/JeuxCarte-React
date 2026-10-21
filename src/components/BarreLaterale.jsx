// =====================================================================
//  La barre de navigation du jeu (styles/barre-jeu.css)
//  Un panneau de jeu : bleu nuit, double filet doré, ornements en haut et en bas, le portrait du
//  joueur dans un médaillon, puis les écrans ; celui où l'on est devient une bannière dorée qui
//  déborde du panneau. En bas : le site Nocthémar, le panneau MJ, la déconnexion.
//   - grand écran : toujours ouverte, icônes et noms ;
//   - écran moyen : icônes seules (le nom en infobulle) ;
//   - téléphone (max-width 700px) : une barre en bas à 5 boutons (Jouer, Collection, le profil au
//     centre, Boutique, « Plus ») ; les autres écrans sont dans le menu Plus.
//  data-place : la place du bouton dans la barre du téléphone ; « menu » : dans le menu Plus.
// =====================================================================
import { Fragment, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { NOCTHEMAR_SITE, lienSite } from '../lib/lienSite.js';
import { useAuth, connexionDiscord, deconnexion } from '../lib/auth.js';

const ICONES = {
  accueil: <><path d="M4 11l8-7 8 7" /><path d="M6 10v10h12V10" /><path d="M10 20v-5h4v5" /></>,
  // deux épées croisées
  jouer: <><path d="M4 4l10 10M4 4v4M4 4h4" /><path d="M20 4L10 14M20 4v4M20 4h-4" /><path d="M7 15l2 2M17 15l-2 2" /><path d="M5.5 18.5l2-2M18.5 18.5l-2-2" /><path d="M4 20l1.5-1.5M20 20l-1.5-1.5" /></>,
  pass: <><path d="M6 3h12v18l-6-4-6 4z" /><path d="M9 8l3 2 3-2M9 12l3 2 3-2" /></>,
  collection: <><rect x="5" y="3" width="14" height="18" rx="1.5" /><path d="M9 3v7l3-2 3 2V3" /></>,
  catalogue: <><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="9" rx="1" /><rect x="3" y="15" width="7" height="6" rx="1" /><rect x="14" y="15" width="7" height="6" rx="1" /></>,
  boutique: <><path d="M5 8h14l-1.2 12H6.2z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>,
  marche: <><path d="M12 3v18M7 21h10" /><path d="M4 7h16" /><path d="M6 7l-3 7a3 3 0 0 0 6 0zM18 7l-3 7a3 3 0 0 0 6 0z" /></>,
  reglages: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5l1.6 2.7 3.1-.7.7 3.1 2.7 1.6-1.6 2.8 1.6 2.8-2.7 1.6-.7 3.1-3.1-.7L12 21.5l-1.6-2.7-3.1.7-.7-3.1-2.7-1.6L5.5 12 3.9 9.2l2.7-1.6.7-3.1 3.1.7z" /></>,
  succes: <><circle cx="12" cy="9" r="6" /><path d="M8.5 14L7 22l5-3 5 3-1.5-8" /></>,
  profil: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  plus: <><circle cx="5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="19" cy="12" r="1.3" /></>,
  deconnexion: <><path d="M12 3v8" /><path d="M7 6.5a7 7 0 1 0 10 0" /></>,
};

function Icone({ nom }) {
  return (
    <span className="barre-ico">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {ICONES[nom]}
      </svg>
    </span>
  );
}

// La silhouette du panneau (style « jeu ») : un étendard suspendu. En haut, une tringle dorée (deux
// embouts en losange) d'où pend le tissu par des passants ; en bas, une queue d'aronde (deux pointes),
// une gemme et un pompon au creux. Double filet doré tout autour.
// Dessinée derrière le contenu (et non découpée) : la bannière dorée de l'écran en cours peut déborder.
// (vector-effect : le trait garde son épaisseur quand la forme s'étire)
const PASSANTS = [40, 92, 144, 196];
const FOND = (
  <span className="barre__fond" aria-hidden="true">
    <svg className="barre__fond-haut" viewBox="0 0 236 64" preserveAspectRatio="none">
      <defs>
        <linearGradient id="barre-or" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff1c8" /><stop offset=".45" stopColor="#d9a441" /><stop offset="1" stopColor="#7a5418" />
        </linearGradient>
      </defs>
      {/* le haut du tissu */}
      <path className="barre__fond-plein" d="M12 24 L224 24 L224 65 L12 65 Z" />
      <path className="barre__fond-trait" vectorEffect="non-scaling-stroke" d="M12 65 L12 24 L224 24 L224 65" />
      <path className="barre__fond-trait barre__fond-trait--fin" vectorEffect="non-scaling-stroke" d="M17 65 L17 29 L219 29 L219 65" />
      {/* la tringle et ses embouts */}
      <rect x="7" y="11" width="222" height="6" rx="3" fill="url(#barre-or)" />
      <path d="M1 14 L7 8 L13 14 L7 20 Z M223 14 L229 8 L235 14 L229 20 Z" fill="url(#barre-or)" />
      {/* les passants de tissu qui entourent la tringle */}
      {PASSANTS.map((x) => <rect key={x} className="barre__passant" x={x - 7} y="7" width="14" height="19" rx="3" />)}
    </svg>
    <span className="barre__fond-milieu" />
    <svg className="barre__fond-bas" viewBox="0 0 212 130" preserveAspectRatio="none">
      <path className="barre__fond-plein" d="M0 -1 L212 -1 L212 104 L106 58 L0 104 Z" />
      <path className="barre__fond-trait" vectorEffect="non-scaling-stroke" d="M0 -1 L0 104 L106 58 L212 104 L212 -1" />
      <path className="barre__fond-trait barre__fond-trait--fin" vectorEffect="non-scaling-stroke" d="M5 -1 L5 96 L106 52 L207 96 L207 -1" />
      {/* la gemme au creux, et le pompon qui pend */}
      <path className="barre__pompon-fil" vectorEffect="non-scaling-stroke" d="M106 64 L106 92" />
      <path className="barre__pompon" d="M106 90 C99 98 99 112 106 124 C113 112 113 98 106 90 Z" />
      <path className="barre__gemme" d="M106 50 L113 58 L106 66 L99 58 Z" />
    </svg>
  </span>
);

// Les ornements dorés du haut et du bas du panneau
const ORNEMENT_HAUT = (
  <svg className="barre__ornement barre__ornement--haut" viewBox="0 0 120 34" aria-hidden="true">
    <path d="M2 33 C28 33 40 24 52 14 M118 33 C92 33 80 24 68 14" />
    <path d="M60 2 L66 12 L60 22 L54 12 Z" />
    <path d="M44 22 L60 30 L76 22" />
    <circle cx="60" cy="12" r="1.6" />
  </svg>
);
const ORNEMENT_BAS = (
  <svg className="barre__ornement barre__ornement--bas" viewBox="0 0 120 70" aria-hidden="true">
    <path d="M60 2 L60 36" />
    <path d="M60 36 L65 44 L60 52 L55 44 Z" />
    <path d="M60 52 L64 60 L60 68 L56 60 Z" />
    <path d="M2 40 C30 42 44 50 54 60 M118 40 C90 42 76 50 66 60" />
  </svg>
);

// Les écrans du jeu, dans l'ordre de la barre (Profil est en tête quand on est connecté)
// actifSur : d'autres adresses où l'écran est éclairé (Jouer : le Duel et l'Histoire)
// famille : un filet doré sépare les familles (jouer et collectionner ; progresser ; régler)
const PAGES = [
  { icone: 'collection', libelle: 'Collection', chemin: '/collection', place: 2, famille: 1 },
  { icone: 'jouer', libelle: 'Jouer', chemin: '/duel', actifSur: ['/histoire'], place: 1, famille: 1 },
  { icone: 'boutique', libelle: 'Boutique', chemin: '/boutique', place: 4, famille: 1 },
  { icone: 'marche', libelle: 'Marché', chemin: '/marche', famille: 1 },
  { icone: 'pass', libelle: 'Pass de saison', chemin: '/pass', famille: 2 },
  { icone: 'succes', libelle: 'Succès', chemin: '/succes', famille: 2 },
  { icone: 'catalogue', libelle: 'Toutes les cartes', chemin: '/toutes-les-cartes', famille: 2 },
  { icone: 'reglages', libelle: 'Paramètres', chemin: '/parametres', famille: 3 },
];
// Le filet doré entre deux familles
const Separateur = () => <span className="barre__sep" aria-hidden="true"><i /></span>;
const DANS_LE_MENU = PAGES.filter((p) => !p.place);

// Un écran de la barre ; l'écran en cours devient une bannière dorée
function Entree({ icone, libelle, chemin, actif, place }) {
  return (
    <Link to={chemin} className={`barre-entree${actif ? ' est-actif' : ''}`} data-place={place ?? 'menu'}
      title={libelle} aria-label={libelle} aria-current={actif ? 'page' : undefined}>
      <Icone nom={icone} />
      <span className="barre-entree__nom">{libelle}</span>
    </Link>
  );
}

// ESSAI : deux styles à comparer, « jeu » (bannière dorée, bleu nuit) et « classe » (obsidienne et or).
// En développement seulement, un bouton permet de passer de l'un à l'autre ; à retirer une fois le style choisi.
const STYLE_PAR_DEFAUT = 'jeu';
const lireStyle = () => {
  if (!import.meta.env.DEV) return STYLE_PAR_DEFAUT;
  try { return localStorage.getItem('barre-style-essai') ?? STYLE_PAR_DEFAUT; } catch { return STYLE_PAR_DEFAUT; }
};

export default function BarreLaterale() {
  const { joueur, chargement } = useAuth();
  const { pathname } = useLocation();
  const surProfil = pathname === '/profil';
  const [style, setStyle] = useState(lireStyle);
  const changerStyle = () => {
    const s = style === 'jeu' ? 'classe' : 'jeu';
    try { localStorage.setItem('barre-style-essai', s); } catch { /* stockage indisponible */ }
    setStyle(s);
  };
  return (
    <nav className={`barre${style === 'classe' ? ' barre--classe' : ''}`} aria-label="Navigation">
      {import.meta.env.DEV && (
        <button type="button" onClick={changerStyle}
          style={{ position: 'fixed', left: 240, bottom: 12, whiteSpace: 'nowrap', zIndex: 60, padding: '6px 12px', font: '600 12px sans-serif', background: '#2b2f3a', color: '#fff', border: '1px solid #888', cursor: 'pointer' }}>
          Essai · barre : {style === 'jeu' ? 'Jeu' : 'Classe'} (changer)
        </button>
      )}
      {FOND}
      {ORNEMENT_HAUT}

      {/* Le médaillon : le portrait du joueur (vers son profil), ou la connexion Discord */}
      <div className="barre__medaillon" data-place="3">
        {chargement ? <span className="barre__portrait barre__portrait--vide" />
          : joueur ? (
            <Link to="/profil" className={`barre__portrait${surProfil ? ' est-actif' : ''}`} aria-label={`Mon profil (${joueur.username ?? 'joueur'})`} title={joueur.username ?? 'Mon profil'}>
              {joueur.avatar_url ? <img src={joueur.avatar_url} alt="" /> : <Icone nom="profil" />}
            </Link>
          ) : (
            <button type="button" className="barre__portrait barre__discord" onClick={connexionDiscord} aria-label="Connecter Discord" title="Connecter Discord">
              <span className="btn-discord__logo" aria-hidden="true" />
            </button>
          )}
        <span className="barre__chevron" aria-hidden="true" />
        {!chargement && !joueur && <button type="button" className="barre__connexion" onClick={connexionDiscord}>Se connecter</button>}
      </div>

      <div className="barre__entrees">
        {joueur && <Entree icone="profil" libelle="Profil" chemin="/profil" actif={surProfil} place="profil" />}
        {PAGES.map((p, i) => (
          <Fragment key={p.chemin}>
            {i > 0 && PAGES[i - 1].famille !== p.famille && <Separateur />}
            <Entree {...p} actif={pathname === p.chemin || (p.actifSur ?? []).includes(pathname)} />
          </Fragment>
        ))}
      </div>

      {/* En bas : le site, le panneau MJ, la déconnexion */}
      <div className="barre__pied" data-place="menu">
        <a className="barre__petit" href={NOCTHEMAR_SITE} title="Site Nocthémar" aria-label="Site Nocthémar"><Icone nom="accueil" /></a>
        {joueur?.is_mj && <a className="barre__petit barre__petit--mj" href={lienSite('mj.html')} title="Panneau MJ" aria-label="Panneau MJ">MJ</a>}
        {joueur && <button type="button" className="barre__petit barre__petit--sortie" onClick={deconnexion} title="Se déconnecter" aria-label="Se déconnecter"><Icone nom="deconnexion" /></button>}
      </div>
      {ORNEMENT_BAS}

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
            <a className="barre-menu__item" role="menuitem" href={NOCTHEMAR_SITE}><Icone nom="accueil" /><span>Site Nocthémar</span></a>
            {joueur?.is_mj && <a className="barre-menu__item" role="menuitem" href={lienSite('mj.html')}><span className="barre-ico barre-ico--texte">MJ</span><span>Panneau MJ</span></a>}
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
