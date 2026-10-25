// =====================================================================
//  Une carte du duel (ancien htmlCarte de JS/jeu-cartes-arene.js, même HTML), la même partout :
//  menu (Grimoire), constructeur de deck, main, renvoi de main, Méditer, Tombeau, loupe.
//  - vraie carte du catalogue : son illustration en entier, avec le cadre d'informations ;
//  - carte du Codex (troupe, sort) : un fond « low poly » teinté par sa Veine et une silhouette,
//    dans le cadre argenté ; objet de pouvoir : son image, dans le cadre doré ;
//  - en haut : le coût (et les actions s'il en faut 2), les capacités en icônes (couronne : capacité unique) ;
//  - en bas : Attaque, Défense, PV des unités.
//  Styles : styles/jeu-cartes.css (.dc-carte, .dc-face…).
// =====================================================================
import { CAPACITES } from '../../data/regles.js';
import { capsDe, actionsDe, UNIQUES } from '../../moteur/index.js';
import { CarteInfos } from '../Carte.jsx';
import { urlPublique } from '../../lib/chemins.js';

// Couleur sourde de chaque Veine (fond low poly des troupes et des sorts)
const TEINTES = {
  forge: [176, 112, 60], ombre: [74, 79, 106], racine: [95, 125, 79], trone: [179, 149, 64],
  regard: [109, 127, 168], sang: [142, 59, 59], maree: [63, 111, 134],
};
// Silhouettes des sorts et des troupes, en 24 × 24
const ICON = {
  unit: 'M12 2c1 4 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-7 1 1 2 3 2 4 1-2 1-4 1-7z',
  face: 'M13 2 4 14h6l-1 8 9-12h-6z',
  heal: 'M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z',
  buff: 'M3 8l4 3 5-6 5 6 4-3-2 11H5z',
  draw: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zm10 4a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  aoe: 'M2 15c3-4 5-4 7 0s4 4 7 0 4-4 6 0v5H2z',
  epee: 'M14 3h7v7L10 21l-3-3L18 7V3zM4 15l5 5-2 2-5-5z',
  bouclier: 'M12 2 4 5v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V5z',
  arc: 'M6 2c9 4 9 16 0 20l-1-2c7-3 7-13 0-16zM5 12h15l-3-3m3 3-3 3',
  croc: 'M3 4c4 1 6 4 6 9l3 7 3-7c0-5 2-8 6-9-2 4-2 8-3 11l-6 7-6-7C5 12 5 8 3 4z',
  lance: 'M20 2l-2 6-2-2zM17 7 4 20l-1-1L16 6z',
};
// Icônes des capacités (24 × 24, remplies)
const ICONES_CAP = {
  garde: 'M12 2 4 5v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V5z',
  provocation: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12zm0 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  charge: 'M13 2 4 14h6l-1 8 9-12h-6z',
  riposte: 'M4 3h3l9 9-3 3-9-9zM20 3h-3l-4 4 3 3 4-4zM3 18l3-3 3 3-3 3zM21 18l-3-3-3 3 3 3z',
  interception: 'M12 2 4 5v6c0 5 3.5 9 8 11zM14 8h4l-2-3zM14 10h6v3h-6zM14 15h4l-2 3z',
  esquive: 'M3 7h11a3 3 0 1 0-3-3h2a1 1 0 1 1 1 1H3zM3 11h16a3 3 0 1 1-3 3h2a1 1 0 1 0 1-1H3zM3 16h8v2H3z',
  bouclier: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 3 5 2v4c0 3.5-2.2 6-5 7.5C9.2 17 7 14.5 7 11V7z',
  soin: 'M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11zm-1 7v3H8v2h3v3h2v-3h3v-2h-3v-3z',
  inspiration: 'M3 8l4 3 5-6 5 6 4-3-2 11H5z',
  percee: 'M2 11h14l-4-4 2-2 8 7-8 7-2-2 4-4H2z',
  drain: 'M12 21 4 13a5 5 0 0 1 8-6 5 5 0 0 1 8 6zM11 9v3H8v2h3v3h2v-3h3v-2h-3V9z',
  rapide: 'M3 5l7 7-7 7-1.5-1.5L7 12 1.5 6.5zM12 5l7 7-7 7-1.5-1.5L16 12l-5.5-5.5z',
  tenace: 'M5 3h14v3h-2v12h2v3H5v-3h2V6H5zm5 3v12h4V6z',
};

// Fond low poly (grille de triangles) teinté par la Veine, avec une silhouette au centre.
// Le tirage dépend de l'id de la carte : la même carte a toujours le même fond.
function ArtSVG({ c }) {
  let s = [...String(c.id)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const [R, G, B] = TEINTES[c.veine] ?? [107, 111, 120];
  const W = 60; const H = 44; const n = 4; const m = 3; const pts = [];
  for (let j = 0; j <= m; j++) {
    pts[j] = [];
    for (let i = 0; i <= n; i++) {
      const bord = i === 0 || i === n || j === 0 || j === m;
      pts[j][i] = [i * W / n + (bord ? 0 : (r() - 0.5) * 9), j * H / m + (bord ? 0 : (r() - 0.5) * 9)];
    }
  }
  const tri = [];
  const teinte = (y) => {
    const l = 0.35 + (1 - y / H) * 0.35 + r() * 0.18;
    return `rgb(${Math.round(R * l)},${Math.round(G * l)},${Math.round(B * l)})`;
  };
  for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) {
    const a = pts[j][i]; const b = pts[j][i + 1]; const cc = pts[j + 1][i + 1]; const d = pts[j + 1][i];
    const P = (x, y, z) => tri.push({ d: `M${x}L${y}L${z}Z`, fill: teinte((x[1] + y[1] + z[1]) / 3) });
    P(a, b, cc); P(a, cc, d);
  }
  const icone = ICON[c.fx ?? c.icone] ?? ICON.epee;
  return (
    <svg className="dc-art-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {tri.map((t, i) => <path key={i} d={t.d} fill={t.fill} />)}
      <path d={icone} transform="translate(18 10) scale(1)" fill="rgba(240,236,227,.88)" stroke="rgba(0,0,0,.35)" strokeWidth=".6" />
    </svg>
  );
}

const rarete = (c) => c.carte?.rarity ?? (c.t === 's' ? 'sort' : 'commune');
const nomsCapacites = (c) => capsDe(c).map((k) => CAPACITES[k]?.nom).filter(Boolean);
// Texte des cartes du Codex : l'effet d'un sort, les capacités d'une troupe
const texteCarte = (c) => (c.t === 's' ? c.d : nomsCapacites(c).join(' · '));

// La face d'une carte
export function FaceCarte({ c }) {
  if (c.carte?.image) {
    return (
      <span className="dc-face dc-face--hote">
        <img className="dc-face dc-face--image" src={urlPublique(c.carte.image)} alt="" draggable="false" loading="lazy" />
        <CarteInfos carte={c.carte} />
      </span>
    );
  }
  // Carte du Codex : le cadre argenté (Cadre-codex) ou doré pour les objets (Cadre-objet)
  return (
    <span className={`dc-face dc-face--codex rar-${c.image ? 'objet' : rarete(c)}`}>
      <span className={`dc-face__art${c.image ? ' dc-face__art--objet' : ''}`}>
        {c.image ? <img src={urlPublique(c.image)} alt="" draggable="false" loading="lazy" /> : <ArtSVG c={c} />}
      </span>
      <img className="dc-face__cadre-img" src={urlPublique(`img/Cartes/${c.image ? 'Cadre-objet' : 'Cadre-codex'}.webp`)} alt="" draggable="false" />
      <span className="dc-face__panneau">
        <span className="dc-face__nom">{c.n}</span>
        <span className="dc-face__texte">{texteCarte(c)}</span>
      </span>
    </span>
  );
}

// Les capacités : une rangée d'icônes en haut à droite (une couronne si la carte a une capacité unique).
// data-infobulle : la bulle qui s'affiche au survol (components/duel/Infobulle.jsx)
export function Capacites({ c }) {
  const caps = capsDe(c);
  const unique = UNIQUES[c.unique ?? c.def?.unique];
  if (!caps.length && !unique) return null;
  return (
    <span className="dc-caps">
      {caps.map((k) => (
        <span key={k} className="dc-k" data-infobulle={`${CAPACITES[k]?.nom ?? k} : ${CAPACITES[k]?.texte ?? ''}`}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path fillRule="evenodd" d={ICONES_CAP[k] ?? ICONES_CAP.garde} /></svg>
        </span>
      ))}
      {unique && (
        <span className="dc-k dc-k--unique" data-infobulle={`${unique.nom} : ${unique.texte}`}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d={ICONES_CAP.inspiration} /></svg>
        </span>
      )}
    </span>
  );
}

// Attaque, Défense, PV (la valeur du moment est mise en avant si elle a changé)
export function Stats({ a, d, h, aMod = false, dMod = 0 }) {
  return (
    <>
      <span className={`dc-stat dc-stat--a${aMod ? ' dc-stat--mod' : ''}`} title="Attaque">{a}</span>
      <span className={`dc-stat dc-stat--d${dMod > 0 ? ' dc-stat--plus' : dMod < 0 ? ' dc-stat--moins' : ''}`} title="Défense">{d}</span>
      <span className="dc-stat dc-stat--h" title="PV">{h}</span>
    </>
  );
}

// Une carte (main, aperçu, menu). Les autres props (onClick, draggable…) vont au bouton.
// as="span" : une carte qu'on ne peut pas toucher (celle posée sur le Tombeau)
export default function CarteDuel({ c, index = null, jouable = false, choisie = false, cout = c.c, className = '', as: Balise = 'button', ...props }) {
  const url = c.carte?.image ? urlPublique(c.carte.image) : null;
  const caps = nomsCapacites(c);
  const etiquette = `${c.n}, coût ${c.c}${actionsDe(c) > 1 ? ` et ${actionsDe(c)} actions` : ''}${c.t === 'u' ? `, ${c.a} attaque, ${c.d ?? 0} défense, ${c.h} PV` : ''}${caps.length ? `, ${caps.join(', ')}` : ''}. ${c.t === 's' ? c.d : ''}`;
  return (
    <Balise type={Balise === 'button' ? 'button' : undefined}
      className={`dc-carte${className ? ` ${className}` : ''} dc-carte--${c.t}${url ? ' dc-carte--image' : ''} rar-${rarete(c)}${jouable ? ' est-jouable' : ''}${choisie ? ' est-choisie' : ''}`}
      data-index={index ?? undefined} aria-label={etiquette} style={url ? { '--masque': `url('${url}')` } : undefined} {...props}>
      <span className="dc-carte__corps">
        <FaceCarte c={c} />
        <span className={`dc-cout${cout < c.c ? ' dc-cout--reduit' : ''}`}>{cout}</span>
        {actionsDe(c) > 1 && <span className="dc-act" title={`${actionsDe(c)} actions pour la jouer`}>{actionsDe(c)}</span>}
        <Capacites c={c} />
        {c.t === 'u' && <Stats a={c.a} d={c.d ?? 0} h={c.h} />}
        <span className={`dc-reflet${url ? '' : ' dc-reflet--codex'}`} />
      </span>
    </Balise>
  );
}
