// =====================================================================
//  La barre de navigation latérale (ancien JS/barre-laterale.js, styles/barre-laterale.css)
//  De haut en bas : le lien vers le site Nocthémar, le compte Discord, puis les pages du jeu.
//  Même HTML que l'ancienne barre (classes rail-…), donc même apparence.
// =====================================================================
import { Link, useLocation } from 'react-router-dom';
import { NOCTHEMAR_SITE, lienSite } from '../lib/lienSite.js';
import { useAuth, connexionDiscord, deconnexion } from '../lib/auth.js';

const ICONES = {
  accueil: <><path d="M4 11l8-7 8 7" /><path d="M6 10v10h12V10" /><path d="M10 20v-5h4v5" /></>,
  cartes: <><rect x="3" y="6" width="11" height="15" rx="1.5" transform="rotate(-8 8.5 13.5)" /><rect x="10" y="3" width="11" height="15" rx="1.5" transform="rotate(8 15.5 10.5)" /></>,
  pass: <><path d="M6 3h12v18l-6-4-6 4z" /><path d="M9 8l3 2 3-2M9 12l3 2 3-2" /></>,
  collection: <><path d="M5 3h11l3 3v15H5z" /><path d="M9 3v6l2-1.5L13 9V3" /></>,
  catalogue: <><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="9" rx="1" /><rect x="3" y="15" width="7" height="6" rx="1" /><rect x="14" y="15" width="7" height="6" rx="1" /></>,
  boutique: <><path d="M5 8h14l-1.2 12H6.2z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>,
  marche: <><path d="M12 3v18M7 21h10" /><path d="M4 7h16" /><path d="M6 7l-3 7a3 3 0 0 0 6 0zM18 7l-3 7a3 3 0 0 0 6 0z" /></>,
  reglages: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" /></>,
  succes: <><circle cx="12" cy="9" r="6" /><path d="M8.5 14L7 22l5-3 5 3-1.5-8" /></>,
};

function Icone({ nom }) {
  return (
    <span className="rail-ico">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {ICONES[nom]}
      </svg>
    </span>
  );
}

// Les pages du jeu, dans l'ordre de l'ancienne barre.
// actifSur : d'autres chemins où l'élément est éclairé (« Modes de jeu » : le Duel et l'Histoire)
const PAGES = [
  { icone: 'cartes', libelle: 'Modes de jeu', chemin: '/duel', actifSur: ['/histoire'] },
  { icone: 'pass', libelle: 'Pass de saison', chemin: '/pass' },
  { icone: 'collection', libelle: 'Collection', chemin: '/collection' },
  { icone: 'catalogue', libelle: 'Toutes les cartes', chemin: '/toutes-les-cartes' },
  { icone: 'succes', libelle: 'Succès', chemin: '/succes' },
  { icone: 'boutique', libelle: 'Boutique', chemin: '/boutique' },
  { icone: 'marche', libelle: 'Marché', chemin: '/marche' },
  { icone: 'reglages', libelle: 'Paramètres', chemin: '/parametres' },
];

function LiensDuJeu() {
  const { pathname } = useLocation();
  return (
    <div className="rail-compte-liens">
      {PAGES.map(({ icone, libelle, chemin, actifSur = [] }) => {
        // La page en cours, ou un des chemins de actifSur
        const actif = pathname === chemin || actifSur.includes(pathname);
        return (
          <Link key={chemin} to={chemin} className={`rail-item${actif ? ' is-active' : ''}`}
            aria-label={libelle} aria-current={actif ? 'page' : undefined}>
            <Icone nom={icone} />
            <span className="rail-label">{libelle}</span>
          </Link>
        );
      })}
    </div>
  );
}

export default function BarreLaterale() {
  return (
    <nav className="rail" aria-label="Navigation">
      {/* Lien direct vers le site Nocthémar (adresse dans lib/lienSite.js) */}
      <a className="rail-item" href={NOCTHEMAR_SITE} aria-label="Site Nocthémar">
        <Icone nom="accueil" />
        <span className="rail-label">Site Nocthémar</span>
      </a>
      <span className="rail-sep" />
      <Compte />
    </nav>
  );
}

// Le compte Discord (ancien JS/auth.js) : le bouton de connexion, ou l'avatar et le pseudo du joueur
// (lien vers son profil), puis les pages du jeu, puis la déconnexion et, pour un MJ, le panneau MJ du site
function Compte() {
  const { joueur, chargement } = useAuth();

  // Pendant le chargement (une fraction de seconde) : ni bouton ni avatar, seulement les liens des pages
  if (chargement) return <div id="discord-auth"><LiensDuJeu /></div>;

  if (!joueur) {
    return (
      <div id="discord-auth">
        <button type="button" className="btn-discord" aria-label="Connecter Discord" onClick={connexionDiscord}>
          <span className="btn-discord__logo" aria-hidden="true" />
          <span className="btn-discord__texte">Connecter Discord</span>
        </button>
        <LiensDuJeu />
      </div>
    );
  }

  // Le pseudo est affiché comme du texte par React : un pseudo ne peut pas injecter de code dans la page
  return (
    <div id="discord-auth">
      <Link className="auth-user" to="/profil">
        {joueur.avatar_url && <img className="auth-user__avatar" src={joueur.avatar_url} alt="" />}
        <span className="auth-user__nom">{joueur.username ?? 'Mon profil'}</span>
      </Link>
      <LiensDuJeu />
      <div className="auth-actions">
        <button type="button" className="btn-deco" title="Se déconnecter" aria-label="Se déconnecter" onClick={deconnexion}>
          {/* Le symbole ⏻ manque dans les polices d'Android (un carré vide s'affichait) : icône dessinée */}
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M12 3v8" /><path d="M7 6.5a7 7 0 1 0 10 0" />
          </svg>
        </button>
        {joueur.is_mj && <a className="lien-mj" href={lienSite('mj.html')} title="Panneau MJ" aria-label="Panneau MJ">MJ</a>}
      </div>
    </div>
  );
}
