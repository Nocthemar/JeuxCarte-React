// =====================================================================
//  La salle des jeux de la Caverne aux Trésors : le hall d'entrée (la salle aux cinq portes, img/Fond/Caverne.webp :
//  celle de gauche ramène au portail, les quatre autres mènent aux quatre jeux), l'en-tête
//  (« ← La Caverne » et le jeu ouvert, bourses, temps restant, son), et la scène de chaque jeu avec sa barre
//  de mise. Ce n'est que le décor : lib/caverne/caverne.js s'y branche (par les id) et anime tout ; passer
//  une porte du hall « clique » l'onglet du jeu, que le script écoute. Styles : styles/caverne.css.
//  props : temps (le temps d'accès qui reste, en mots), surPortail() : revenir au portail (la porte de gauche du hall)
// =====================================================================
import { useEffect, useRef, useState } from 'react';
import { urlPublique } from '../../lib/chemins.js';

const JEUX = [
  { g: 0, image: 's3', nom: 'Le Dragon Dormant', sous: 'Vole l\'or avant son réveil', texte: 'Le butin grossit tant que le dragon dort. Fuis avant que ses yeux ne s\'ouvrent.' },
  { g: 1, image: 'bag', nom: 'Les Bourses du Marchand', sous: 'Évite les bourses piégées', texte: 'Ouvre les bourses une à une ; chacune paie plus. Une bourse piégée, et tout est perdu.' },
  { g: 2, image: 'pont', nom: 'Le Pont Maudit', sous: 'Traverse avant que ça cède', texte: 'Douze planches au-dessus du gouffre, de plus en plus fragiles. Rebrousse chemin à temps.' },
  { g: 3, image: 'lac', nom: 'Le Lac des Esprits', sous: 'Écoute la tension de la ligne', texte: 'Une prise invisible mord à ta ligne. Seule sa tension trahit ce qu\'elle est.' },
];

// Les cinq portes de la salle, de gauche à droite : l'ouverture de chacune en pixels de l'image (IMAGE),
// et ce qu'elle ouvre (un jeu, ou le portail), avec la teinte de sa lumière (r, v, b)
const IMAGE = { l: 1672, h: 941 };
const PORTES = [
  { cle: 'portail', nom: 'Le portail', sous: 'Revenir à l\'arche', teinte: '236,228,210', pts: [[88, 520], [88, 255], [100, 215], [125, 185], [165, 163], [205, 185], [232, 215], [243, 255], [243, 520]] },
  { g: 0, teinte: '214,96,48', pts: [[420, 532], [420, 320], [432, 285], [457, 258], [494, 238], [530, 258], [555, 285], [567, 320], [567, 532]] },
  { g: 1, teinte: '214,176,104', pts: [[757, 538], [757, 335], [770, 300], [797, 272], [835, 252], [873, 272], [900, 300], [913, 335], [913, 538]] },
  { g: 2, teinte: '200,58,70', pts: [[1107, 532], [1107, 320], [1119, 285], [1143, 258], [1177, 238], [1213, 258], [1239, 285], [1251, 320], [1251, 532]] },
  { g: 3, teinte: '79,190,180', pts: [[1427, 520], [1427, 255], [1438, 215], [1465, 185], [1507, 163], [1548, 185], [1575, 215], [1588, 255], [1588, 520]] },
].map((p) => {
  const xs = p.pts.map(([x]) => x), ys = p.pts.map(([, y]) => y);
  const x = Math.min(...xs), y = Math.min(...ys), l = Math.max(...xs) - x, h = Math.max(...ys) - y;
  return {
    ...p, ...(p.g !== undefined ? { nom: JEUX[p.g].nom, sous: JEUX[p.g].sous, image: JEUX[p.g].image } : {}),
    place: { left: `${(x / IMAGE.l) * 100}%`, top: `${(y / IMAGE.h) * 100}%`, width: `${(l / IMAGE.l) * 100}%`, height: `${(h / IMAGE.h) * 100}%` },
    forme: `polygon(${p.pts.map(([px, py]) => `${(((px - x) / l) * 100).toFixed(1)}% ${(((py - y) / h) * 100).toFixed(1)}%`).join(', ')})`,
  };
});

export default function SalleDesJeux({ temps, surPortail }) {
  const [jeu, setJeu] = useState(null);   // le jeu ouvert, ou null : le hall
  const onglets = useRef(null);
  const choisir = (g) => { onglets.current.querySelector(`.tab[data-g="${g}"]`).click(); setJeu(g); };
  // pas de retour au hall pendant une partie (le script verrouille alors les onglets)
  const auHall = () => { if (!onglets.current.classList.contains('lock')) setJeu(null); };
  // Si la salle est plus large que l'écran, elle défile de côté (la molette aussi) : on commence au milieu,
  // face au mur du fond
  const salle = useRef(null);
  useEffect(() => {
    const el = salle.current;
    if (!el) return undefined;
    // (recentrée à chaque changement de taille, tant que le joueur ne l'a pas fait défiler lui-même)
    let bouge = false;
    const centrer = () => { if (!bouge) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2; };
    const taille = new ResizeObserver(centrer);
    taille.observe(el);
    taille.observe(el.querySelector('.cav-salle'));
    const main = () => { bouge = true; };
    const roue = (e) => { bouge = true; if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && el.scrollWidth > el.clientWidth) { el.scrollLeft += e.deltaY; e.preventDefault(); } };
    el.addEventListener('wheel', roue, { passive: false });
    el.addEventListener('pointerdown', main);
    el.addEventListener('touchstart', main, { passive: true });
    return () => { taille.disconnect(); el.removeEventListener('wheel', roue); el.removeEventListener('pointerdown', main); el.removeEventListener('touchstart', main); };
  }, []);
  const passer = (p) => {
    if (p.g !== undefined) choisir(p.g);
    else if (p.cle === 'portail') surPortail?.();
  };

  return (
    <>
      {/* Le hall : la salle aux cinq portes (toujours là, cachée pendant un jeu) */}
      <section className="cav-hall" hidden={jeu !== null} aria-labelledby="cav-hall-titre" ref={salle}>
        <div className="cav-salle">
          <img className="cav-salle__fond" src={urlPublique('img/Fond/Caverne.webp')} alt="" draggable="false" />
          <header className="cav-hall__tete">
            {/* le titre, sur deux lignes en or, en haut du mur du fond ; le texte réel reste lisible par les lecteurs d'écran */}
            <h1 id="cav-hall-titre">
              <span className="cav-hall__lu">La Caverne aux Trésors</span>
              <svg className="cav-hall__titre" viewBox="0 0 300 120" aria-hidden="true">
                <defs>
                  <linearGradient id="cav-titre-or" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#fff4d8" /><stop offset=".4" stopColor="#f0cf86" />
                    <stop offset=".65" stopColor="#c5933f" /><stop offset="1" stopColor="#8c6326" />
                  </linearGradient>
                  {/* l'ondulation de l'eau, pour les noms posés sur le bassin (caverne.css, .cav-gravure) */}
                  <filter id="cav-onde" x="-10%" y="-40%" width="120%" height="180%">
                    <feTurbulence type="fractalNoise" baseFrequency="0.006 0.11" numOctaves="1" seed="4">
                      <animate attributeName="baseFrequency" dur="7s" repeatCount="indefinite" values="0.006 0.11;0.008 0.13;0.006 0.11" />
                    </feTurbulence>
                    <feDisplacementMap in="SourceGraphic" scale="3" xChannelSelector="R" yChannelSelector="G" />
                  </filter>
                </defs>
                <text x="150" y="50" fontSize="50" textLength="270" lengthAdjust="spacingAndGlyphs">La Caverne</text>
                <text x="150" y="104" fontSize="40" textLength="210" lengthAdjust="spacingAndGlyphs">aux Trésors</text>
              </svg>
            </h1>
            <p>Quatre portes, quatre jeux. Une seule règle : savoir s&apos;arrêter à temps.</p>
          </header>
          {PORTES.map((p) => (
            <div key={p.cle ?? p.g} className="cav-porte" style={{ ...p.place, '--teinte': p.teinte }}>
              {/* la lumière derrière la porte (hors du bouton : voir caverne.css) */}
              <span className="cav-porte__lueur" style={{ clipPath: p.forme }} aria-hidden="true" />
              <button type="button" className="cav-porte__ouverture" style={{ clipPath: p.forme }}
                onClick={() => passer(p)} aria-label={`${p.nom} : ${p.sous}`} />
              {/* le nom du jeu, en lettres d'or sur l'eau, devant les marches */}
              <span className="cav-gravure" aria-hidden="true"><b>{p.nom}</b><small>{p.sous}</small></span>
              <span className="cav-porte__sol" aria-hidden="true" />
            </div>
          ))}
        </div>
      </section>

      <header className="hdr">
        <nav className={`tabs${jeu === null ? ' tabs--hall' : ''}`} id="tabs" aria-label="Les jeux" ref={onglets}>
          <button type="button" className="cav-retour" onClick={auHall} title="Revenir au hall (pas pendant une partie)"><span aria-hidden="true">←</span> La Caverne</button>
          {JEUX.map((j) => (
            <button key={j.g} type="button" className={`tab${j.g === 0 ? ' on' : ''}`} data-g={j.g} tabIndex={-1}><img data-k={j.image} alt="" /><span><b>{j.nom}</b><small>{j.sous}</small></span></button>
          ))}
        </nav>
        <div className="hr">
          <div className="bals" role="group" aria-label="Miser avec">
            <button type="button" className="bal on" data-m="or" title="Miser de l'or"><img data-k="coin" alt="" /><span>0</span><small>pièces</small></button>
            <button type="button" className="bal" data-m="cristaux" title="Miser des cristaux"><img data-k="gem" alt="" /><span>0</span><small>cristaux</small></button>
          </div>
          {temps && <span className="caverne-temps" title="Active un autre badge à la Boutique pour rester plus longtemps"><small>Ouverte encore</small><b>{temps}</b></span>}
          <button type="button" className="snd" id="snd">Son : oui</button>
        </div>
      </header>

      <div className="jeux">
        {/* ===== I. Le Dragon Dormant ===== */}
        <section className="game on" id="g1">
          <div className="stage" id="dStage">
            <canvas id="dc" />
            <div className="chips" id="dHist" />
            <div className="hud hud--cote" id="dHud"><span className="hud__titre">Le butin</span><div className="hud__mult" id="dm">×1.00</div><div className="hud__texte" id="ds">Le dragon dort sur son trésor…</div></div>
          </div>
          <div className="bar">
            <div className="bar__mise lockable" id="dBet" />
            <label className="auto lockable" id="dAutoW"><span>Encaisser à ×</span><input id="dAuto" type="number" step="0.1" min="1.1" max="100" placeholder="—" inputMode="decimal" /></label>
            <button type="button" className="btn pri" id="dGo"><span id="dGoT">Voler le trésor</span><small id="dGoS">Espace</small></button>
          </div>
        </section>

        {/* ===== II. Les Bourses du Marchand ===== */}
        <section className="game" id="g2">
          <div className="stage">
            <div className="stats">
              <div className="stat"><span className="lbl">Bourses ouvertes</span><b id="bOpen">0 / 22</b></div>
              <div className="stat nx"><span className="lbl">Prochaine bourse</span><b id="bNext">×1.0</b></div>
              <div className="stat"><span className="lbl">Gain actuel</span><b id="bCur">0</b></div>
            </div>
            <div className="grid" id="bGrid" />
            <div className="say2" id="bSay">Choisis ta mise, puis pose-la sur la table.</div>
          </div>
          <div className="bar">
            <div className="bar__mise lockable" id="bBet" />
            <div className="grp lockable" id="bMines"><span className="lbl">Bourses piégées</span></div>
            <button type="button" className="btn pri" id="bGo"><span id="bGoT">Poser la mise</span><small id="bGoS">Espace</small></button>
          </div>
        </section>

        {/* ===== III. Le Pont Maudit ===== */}
        <section className="game" id="g3">
          <div className="stage" id="cStage">
            <canvas id="cc" />
            <div className="chips" id="cHist" />
            <div className="hud hud--haut" id="cHud"><div className="hud__mult" id="cm">×1.00</div><div className="hud__texte" id="cs">Le pont t&apos;attend, voyageur.</div></div>
          </div>
          <div className="bar">
            <div className="bar__mise lockable" id="cBet" />
            <button type="button" className="btn pri" id="cGo"><span id="cGoT">Traverser le pont</span><small id="cGoS">Espace</small></button>
            <button type="button" className="btn blue" id="cStep" style={{ display: 'none' }}><span id="cStepT">Avancer</span><small id="cStepS" /></button>
            <button type="button" className="btn sec" id="cLeap" style={{ display: 'none' }}><span>Sauter deux</span><small id="cLeapS" /></button>
            <button type="button" className="btn out" id="cCash" style={{ display: 'none' }}><span id="cCashT">Encaisser</span><small id="cCashS" /></button>
          </div>
        </section>

        {/* ===== IV. Le Lac des Esprits ===== */}
        <section className="game" id="g4">
          <div className="stage" id="lStage">
            <canvas id="lc" />
            <div className="chips" id="lHist" />
            <div className="hud hud--lac" id="lHud">
              <span className="lbl">Tension de la ligne</span>
              <div className="hud__mult" id="lm">0 %</div>
              <div className="jauge"><i id="lJauge" /></div>
              <span className="lbl">Tirages <b id="lTirages">0 / 5</b></span>
              <div className="hud__texte" id="ls">Le lac attend ta ligne.</div>
            </div>
          </div>
          <div className="bar">
            <div className="bar__mise lockable" id="lBet" />
            <button type="button" className="btn pri" id="lGo"><span id="lGoT">Lancer la ligne</span><small id="lGoS">Espace</small></button>
            <button type="button" className="btn blue" id="lTirer" style={{ display: 'none' }}><span>Remonter</span><small id="lTirerS" /></button>
            <button type="button" className="btn sec" id="lCouper" style={{ display: 'none' }}><span>Couper la ligne</span><small id="lCouperS" /></button>
          </div>
        </section>
      </div>

      <div id="flashv" />
      <canvas id="fx" />
      <div id="floats" />
    </>
  );
}
