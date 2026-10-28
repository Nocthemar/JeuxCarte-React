// =====================================================================
//  Le portail de la Caverne (pages/Caverne.jsx) : là où l'on arrive sans badge activé.
//  L'arche de pierre sur la mer (img/Fond/LaPorte.webp), en plein écran ; sur les marches, sous l'arche, le socle :
//  on le touche pour choisir un badge à poser (lib/caverne/badges.js) ; on peut aussi le faire glisser ailleurs. Badge posé : le portail s'allume. Un clic au milieu de l'arche :
//  la vue avance dans le portail, puis surEntree() mène à la salle des jeux.
//  La lumière est dessinée en SVG aux mesures de l'image (LARGEUR × HAUTEUR : 1704 × 923) : dans l'arche, un puits de lumière
//  (tourbillon, anneaux aspirés, particules, bords dans l'ombre) ; sur le décor, sa lueur mêlée à l'image
//  (pierres, marches, reflet sur la mer). La scène garde les proportions de l'image et couvre l'écran,
//  donc tout reste à sa place à toute taille.
//  Le portail prend la couleur du badge posé (argent, bleu, rouge, or : COULEURS) ; on y revient depuis la salle
//  des jeux, le portail encore ouvert, et on le refranchit.
//  props : badges (caverne_badges_etat, ou { erreur }), surEtat(nouvel état), surEntree()
//  Styles : styles/caverne-portail.css
// =====================================================================
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { urlPublique } from '../../lib/chemins.js';
import { useNotifier } from '../../lib/notification.js';
import { accesOuvert, activerBadge, tempsRestant } from '../../lib/caverne/badges.js';
import { niveauAnimationsChoisi } from '../../lib/preferences.js';

const AVANCEE = 1500;   // ms : la vue avance dans le portail

// L'ouverture de l'arche, en pixels de l'image (tracée sur LaPorte.png : tout ce qui n'est pas de la pierre,
// depuis le centre de l'arche, jusqu'aux marches)
const ARCHE = 'M871 135 L881 147 L897 159 L912 171 L924 183 L934 195 L945 207 L956 219 L962 231 L971 243 L975 255'
  + ' L980 275 L982 300 L986 320 L987 420 L989 440 L989 560 L985 580 L976 592 L950 602 L931 615 L908 621'
  + ' L852 624 L760 620 L747 612 L734 600 L726 585 L728 560 L722 540 L721 440 L713 427 L708 422 L708 330'
  + ' L709 300 L710 270 L714 255 L722 243 L735 231 L745 219 L757 207 L770 195 L783 183 L795 171 L811 159'
  + ' L829 147 L847 135 L859 130 Z';
const LARGEUR = 1704, HAUTEUR = 923;   // l'image, en pixels
const CENTRE = { x: 848, y: 380 };
// Le socle : sa place de départ (sur l'eau, au pied des marches), en pixels de l'image ; le joueur peut le
// faire glisser ailleurs, et sa place est retenue dans ce navigateur
const SOCLE = { x: 852, y: 688 };
const CLE_SOCLE = 'caverne-socle-2';   // (2 : la place se mesure sur la nouvelle image)
// Les couleurs du portail, celles du badge posé (le dernier posé est retenu dans ce navigateur)
const COULEURS = {
  '24h': { coeur: ['#ffffff', '#e6ebf3', '#aab5c7', '#4f596b', '#161a22'], halo: '#cdd7e8', bras: '#f4f7fc', bord: '#e8eef8', ombre: '#07090d' },
  '1semaine': { coeur: ['#f2f7ff', '#bcd3ff', '#5b8cf0', '#1f3f8f', '#0a1736'], halo: '#5b8cff', bras: '#dbe7ff', bord: '#a9c6ff', ombre: '#040a1c' },
  '1mois': { coeur: ['#fff3ea', '#ffc4b6', '#e2545d', '#8e1f29', '#3d0a11'], halo: '#ff5a5f', bras: '#ffd9cf', bord: '#ffb3a8', ombre: '#1e0407' },
  '3mois': { coeur: ['#fff9ea', '#ffe1a0', '#e7b24a', '#8a5a14', '#2e1d05'], halo: '#ffbe4a', bras: '#fff0c8', bord: '#ffd98a', ombre: '#160d02' },
};
const CLE_BADGE = 'caverne-badge-pose';
function badgeRetenu() {
  try { const id = localStorage.getItem(CLE_BADGE); if (COULEURS[id]) return id; } catch { /* rien de retenu */ }
  return '1mois';
}
function placeRetenue() {
  try {
    const p = JSON.parse(localStorage.getItem(CLE_SOCLE));
    if (Number.isFinite(p?.x) && Number.isFinite(p?.y)) return p;
  } catch { /* rien de retenu */ }
  return SOCLE;
}
// Le cadre de l'arche (pour le bouton qu'on touche), et son contour en % de ce cadre
const CADRE = { x: 706, y: 128, l: 285, h: 498 };
const CONTOUR = ARCHE.replace(/[MLZ]/g, ' ').trim().split(/\s+/).reduce((t, v, i, a) => (i % 2 ? t : [...t,
  `${(((+v - CADRE.x) / CADRE.l) * 100).toFixed(1)}% ${(((+a[i + 1] - CADRE.y) / CADRE.h) * 100).toFixed(1)}%`]), []).join(', ');
// Le tourbillon : cinq bras en spirale autour du centre (en cercle : il tourne, puis il est étiré comme l'arche)
const BRAS = Array.from({ length: 5 }, (_, i) => {
  const depart = (i / 5) * Math.PI * 2;
  const pts = Array.from({ length: 40 }, (_, k) => {
    const t = k / 39, ang = depart + t * Math.PI * 1.6, r = 12 + t * 230;
    return `${(CENTRE.x + Math.cos(ang) * r).toFixed(1)} ${(CENTRE.y + Math.sin(ang) * r).toFixed(1)}`;
  });
  return `M${pts.join(' L')}`;
});
// Les particules aspirées vers le cœur : leur point de départ, sur le pourtour (écart au centre), et leur retard
const PARTICULES = Array.from({ length: 16 }, (_, i) => {
  const ang = (i / 16) * Math.PI * 2 + (i % 3) * 0.4;
  return { dx: Math.cos(ang) * (110 + (i % 4) * 14), dy: Math.sin(ang) * (190 + (i % 5) * 16), retard: (i * 0.37) % 4, r: 2 + (i % 3) };
});

export default function Portail({ badges, surEtat, surEntree }) {
  const notifier = useNotifier();
  const [occupe, setOccupe] = useState(false);
  const [pose, setPose] = useState(badgeRetenu);  // le badge posé sur le socle (sa couleur est celle du portail)
  const [avance, setAvance] = useState(false);  // la vue avance dans le portail
  const [choix, setChoix] = useState(false);    // la bulle des badges, ouverte sur le socle
  const [place, setPlace] = useState(placeRetenue);   // où est le socle (pixels de l'image)
  const glisse = useRef(null);                   // le glissement en cours : départ, échelle, a-t-il bougé

  // Faire glisser le socle : on le tient, il suit ; s'il n'a presque pas bougé, c'était un clic
  const tenir = (e) => {
    if (e.button !== 0 || avance) return;
    const scene = e.currentTarget.closest('.portail__scene').getBoundingClientRect();
    glisse.current = { x: e.clientX, y: e.clientY, depart: place, echelle: LARGEUR / scene.width, bouge: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const suivre = (e) => {
    const g = glisse.current;
    if (!g) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (!g.bouge && Math.hypot(dx, dy) < 6) return;
    g.bouge = true;
    setChoix(false);
    setPlace({
      x: Math.min(LARGEUR - 60, Math.max(60, g.depart.x + dx * g.echelle)),
      y: Math.min(HAUTEUR - 62, Math.max(40, g.depart.y + dy * g.echelle)),
    });
  };
  const lacher = () => {
    const g = glisse.current;
    if (!g) return;
    if (g.bouge) setPlace((p) => { try { localStorage.setItem(CLE_SOCLE, JSON.stringify(p)); } catch { /* tant pis */ } return p; });
    // (le clic qui suit un glissement n'ouvre pas la bulle : glisse.current.bouge le dit, puis on l'oublie)
    setTimeout(() => { glisse.current = null; }, 0);
  };
  const toucherSocle = () => { if (!glisse.current?.bouge) setChoix((c) => !c); };
  const prise = { onPointerDown: tenir, onPointerMove: suivre, onPointerUp: lacher, onPointerCancel: lacher };
  const allume = accesOuvert(badges);
  const teinte = COULEURS[pose];
  const imagePose = badges?.badges?.find((x) => x.id === pose)?.image ?? null;
  const miens = badges?.badges?.filter((x) => x.nombre > 0) ?? [];

  async function poser(x) {
    setOccupe(true);
    try {
      const r = await activerBadge(x.id);
      setPose(COULEURS[x.id] ? x.id : '1mois');
      try { localStorage.setItem(CLE_BADGE, x.id); } catch { /* tant pis */ }
      setChoix(false);
      surEtat(r);
      notifier(`Badge ${r.active} posé : le portail s'ouvre pour ${tempsRestant(r.jusqu_a)}.`);
    } catch (e) {
      notifier(e.message || 'Impossible pour le moment.', 'erreur');
    }
    setOccupe(false);
  }

  function entrer() {
    if (!allume || avance) return;
    if (niveauAnimationsChoisi() === 'coupees' || matchMedia('(prefers-reduced-motion: reduce)').matches) { surEntree(); return; }
    setAvance(true);
    setTimeout(surEntree, AVANCEE);
  }

  return (
    <section className={`portail${allume ? ' est-allume' : ''}${avance ? ' est-en-route' : ''}`} style={{ '--teinte': teinte.halo, '--c0': teinte.coeur[0], '--c1': teinte.coeur[1], '--c2': teinte.coeur[2], '--c4': teinte.coeur[4] }}>
      <div className="portail__scene">
        <img className="portail__fond" src={urlPublique('img/Fond/LaPorte.webp')} alt="" draggable="false" />
        {/* La lumière du portail sur le décor (mêlée à l'image : les pierres et la mer rougeoient) */}
        <svg className="portail__eclairage" viewBox={`0 0 ${LARGEUR} ${HAUTEUR}`} aria-hidden="true">
          <defs>
            <radialGradient id="portail-halo" cx={CENTRE.x} cy={CENTRE.y} r="200" gradientUnits="userSpaceOnUse" gradientTransform={`translate(${CENTRE.x} ${CENTRE.y}) scale(1 1.75) translate(${-CENTRE.x} ${-CENTRE.y})`}>
              <stop offset=".45" stopColor={teinte.halo} stopOpacity=".75" />
              <stop offset=".75" stopColor={teinte.coeur[2]} stopOpacity=".3" />
              <stop offset="1" stopColor={teinte.coeur[2]} stopOpacity="0" />
            </radialGradient>
            <linearGradient id="portail-reflet" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={teinte.halo} stopOpacity=".7" />
              <stop offset="1" stopColor={teinte.coeur[2]} stopOpacity="0" />
            </linearGradient>
            <filter id="portail-flou-eclairage" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="22" /></filter>
            <filter id="portail-vague" x="-20%" y="-5%" width="140%" height="110%">
              <feTurbulence type="fractalNoise" baseFrequency=".004 .08" numOctaves="2" seed="4" />
              <feDisplacementMap in="SourceGraphic" scale="34" />
              <feGaussianBlur stdDeviation="3" />
            </filter>
          </defs>
          <rect className="portail__halo" width={LARGEUR} height={HAUTEUR} fill="url(#portail-halo)" />
          <ellipse className="portail__marches" cx={CENTRE.x} cy="652" rx="210" ry="34" fill={teinte.halo} opacity=".55" filter="url(#portail-flou-eclairage)" />
          {/* le reflet sur la mer, qui ondule */}
          <g className="portail__onde" filter="url(#portail-vague)">
            <rect x={CENTRE.x - 95} y="705" width="190" height="218" fill="url(#portail-reflet)" />
          </g>
        </svg>

        {/* Le portail lui-même, dans l'ouverture de l'arche */}
        <svg className="portail__lumiere" viewBox={`0 0 ${LARGEUR} ${HAUTEUR}`} aria-hidden="true">
          <defs>
            <clipPath id="portail-arche"><path d={ARCHE} /></clipPath>
            {/* le fond : un puits de lumière, clair au cœur, sombre vers les bords (allongé comme l'arche) */}
            <radialGradient id="portail-coeur" cx={CENTRE.x} cy={CENTRE.y} r="165" gradientUnits="userSpaceOnUse" gradientTransform={`translate(${CENTRE.x} ${CENTRE.y}) scale(1 1.75) translate(${-CENTRE.x} ${-CENTRE.y})`}>
              {[0, 0.18, 0.42, 0.72, 1].map((o, i) => <stop key={o} offset={o} stopColor={teinte.coeur[i]} />)}
            </radialGradient>
            <filter id="portail-flou" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="16" /></filter>
            <filter id="portail-flou-leger" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3" /></filter>
            {/* les bras du tourbillon ondulent comme une matière vivante */}
            <filter id="portail-remous" x="-30%" y="-30%" width="160%" height="160%">
              <feTurbulence type="fractalNoise" baseFrequency=".018 .012" numOctaves="2" seed="7" />
              <feDisplacementMap in="SourceGraphic" scale="46" />
              <feGaussianBlur stdDeviation="2.5" />
            </filter>
          </defs>
          <g className="portail__voile" clipPath="url(#portail-arche)">
            <rect width={LARGEUR} height={HAUTEUR} fill="url(#portail-coeur)" />
            <g transform={`translate(${CENTRE.x} ${CENTRE.y}) scale(1 1.75) translate(${-CENTRE.x} ${-CENTRE.y})`}>
              <g className="portail__tourbillon" filter="url(#portail-remous)">
                {BRAS.map((p, i) => <path key={i} d={p} fill="none" stroke={teinte.bras} strokeWidth={i % 2 ? 6 : 10} strokeLinecap="round" opacity={i % 2 ? 0.28 : 0.4} />)}
              </g>
            </g>
            {/* des anneaux aspirés vers le cœur, l'un après l'autre */}
            {[0, 1, 2, 3].map((i) => (
              <ellipse key={i} className="portail__anneau" style={{ animationDelay: `${i * 1}s` }}
                cx={CENTRE.x} cy={CENTRE.y} rx="150" ry="255" fill="none" stroke={teinte.bras} strokeWidth="4" filter="url(#portail-flou-leger)" />
            ))}
            {/* des particules qui y tombent */}
            {PARTICULES.map((p, i) => (
              <circle key={i} className="portail__particule" cx={CENTRE.x} cy={CENTRE.y} r={p.r} fill={teinte.coeur[0]}
                style={{ '--dx': `${p.dx.toFixed(0)}px`, '--dy': `${p.dy.toFixed(0)}px`, animationDelay: `${p.retard.toFixed(2)}s` }} />
            ))}
            <circle className="portail__pouls" cx={CENTRE.x} cy={CENTRE.y} r="70" fill={teinte.coeur[0]} filter="url(#portail-flou)" />
            {/* la profondeur : l'ombre des bords, comme l'entrée d'un puits */}
            <path d={ARCHE} fill="none" stroke={teinte.ombre} strokeWidth="70" opacity=".75" filter="url(#portail-flou)" />
          </g>
          {/* le liseré de lumière, au ras de la pierre */}
          <g clipPath="url(#portail-arche)">
            <path className="portail__bord" d={ARCHE} fill="none" stroke={teinte.bord} strokeWidth="4" opacity=".6" filter="url(#portail-flou-leger)" />
          </g>
        </svg>
        <button type="button" className="portail__entree" disabled={!allume || avance} onClick={entrer}
          style={{ left: `${(CADRE.x / LARGEUR) * 100}%`, top: `${(CADRE.y / HAUTEUR) * 100}%`, width: `${(CADRE.l / LARGEUR) * 100}%`, height: `${(CADRE.h / HAUTEUR) * 100}%`, clipPath: `polygon(${CONTOUR})` }}
          aria-label={allume ? 'Franchir le portail' : 'Le portail est éteint'} title={allume ? 'Franchir le portail' : undefined} />
        {/* Le socle, posé dans le décor sur les marches, sous le portail (il suit l'image) : on le touche
            pour choisir son badge ; badge posé, il le garde et dit combien de temps le portail reste ouvert */}
        <div className="portail__place" style={{ left: `${(place.x / LARGEUR) * 100}%`, top: `${(place.y / HAUTEUR) * 100}%` }}>
          {badges.erreur ? (
            <p className="portail__bulle portail__bulle--texte">La Caverne n&apos;est pas encore prête. Reviens un peu plus tard.</p>
          ) : allume ? (
            <>
              <div className="portail__socle est-pose" {...prise}>
                {imagePose ? <img src={urlPublique(imagePose)} alt="" /> : <span className="portail__sceau" />}
              </div>
              <p className="portail__legende">Ouvert encore <b>{tempsRestant(badges.jusqu_a)}</b> · touche le portail</p>
            </>
          ) : (
            <>
              <button type="button" className="portail__socle" aria-expanded={choix} onClick={toucherSocle} {...prise}
                title="Touche pour choisir un badge ; tiens-le pour le déplacer">
                <span>Pose un badge</span>
              </button>
              {choix && (
                <div className="portail__bulle" role="dialog" aria-label="Choisir un badge">
                  {miens.length ? (
                    <div className="portail__badges">
                      {miens.map((x) => (
                        <button key={x.id} type="button" className="portail__badge" disabled={occupe} onClick={() => poser(x)} title={`Poser le badge ${x.nom}`}>
                          <img src={urlPublique(x.image)} alt={`Badge ${x.nom}`} />
                          {x.nombre > 1 && <span>×{x.nombre}</span>}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="portail__bulle--texte">
                      Tu n&apos;as aucun badge. <Link to="/boutique?echoppe=boosters">En acheter un à la Boutique</Link>
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <div className="portail__eclair" aria-hidden="true" />
    </section>
  );
}
