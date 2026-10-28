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

// Les cinq portes de la salle, de gauche à droite : l'ouverture de chacune en pixels de l'image (1910 × 823),
// et ce qu'elle ouvre (un jeu, ou le portail), avec la teinte de sa lumière (r, v, b) et l'inclinaison du mur
// où elle est percée (le mur est courbe : la plaque scellée au-dessus suit le mur)
const PORTES = [
  { cle: 'portail', nom: 'Le portail', sous: 'Revenir à l\'arche', teinte: '236,228,210', incline: 30, pts: [[117, 415], [118, 200], [130, 160], [165, 120], [211, 94], [235, 135], [250, 180], [254, 215], [254, 415]] },
  { g: 0, teinte: '214,96,48', incline: 16, pts: [[487, 420], [487, 255], [500, 225], [530, 190], [562, 170], [595, 200], [615, 235], [622, 265], [622, 420]] },
  { g: 1, teinte: '214,176,104', incline: 0, pts: [[884, 425], [884, 277], [898, 240], [920, 215], [950, 194], [980, 215], [1002, 240], [1016, 277], [1016, 425]] },
  { g: 2, teinte: '200,58,70', incline: -16, pts: [[1267, 420], [1267, 265], [1280, 230], [1305, 192], [1335, 167], [1368, 195], [1390, 225], [1403, 250], [1403, 420]] },
  { g: 3, bord: true, teinte: '79,190,180', incline: -30, pts: [[1640, 415], [1638, 210], [1650, 160], [1670, 120], [1696, 93], [1740, 120], [1770, 160], [1790, 215], [1792, 415]] },
].map((p) => {
  const xs = p.pts.map(([x]) => x), ys = p.pts.map(([, y]) => y);
  const x = Math.min(...xs), y = Math.min(...ys), l = Math.max(...xs) - x, h = Math.max(...ys) - y;
  // la pointe de l'arche (le point le plus haut) : le nom gravé se centre dessus (le mur est vu de biais)
  const pointe = p.pts.reduce((m, q) => (q[1] < m[1] ? q : m));
  return {
    ...p, ...(p.g !== undefined ? { nom: JEUX[p.g].nom, sous: JEUX[p.g].sous, image: JEUX[p.g].image } : {}),
    pointe: `${(((pointe[0] - x) / l) * 100).toFixed(1)}%`,
    place: { left: `${(x / 1910) * 100}%`, top: `${(y / 823) * 100}%`, width: `${(l / 1910) * 100}%`, height: `${(h / 823) * 100}%` },
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
            <span>Nocthémar</span>
            {/* le titre suit la courbe du mur du fond (un arc de cercle, plus bas au milieu) ; le texte réel reste lisible
                par les lecteurs d'écran */}
            <h1 id="cav-hall-titre">
              <span className="cav-hall__lu">La Caverne aux Trésors</span>
              <svg className="cav-hall__arc" viewBox="0 0 1000 170" aria-hidden="true">
                <defs>
                  <linearGradient id="cav-titre-or" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#fff4d8" /><stop offset=".4" stopColor="#f0cf86" />
                    <stop offset=".65" stopColor="#c5933f" /><stop offset="1" stopColor="#8c6326" />
                  </linearGradient>
                  <path id="cav-titre-courbe" d="M 60 60 A 2600 2600 0 0 0 940 60" />
                </defs>
                <text><textPath href="#cav-titre-courbe" startOffset="50%" textAnchor="middle">La Caverne aux Trésors</textPath></text>
              </svg>
            </h1>
            <p>Quatre portes, quatre jeux. Une seule règle : savoir s&apos;arrêter à temps.</p>
          </header>
          {PORTES.map((p) => (
            <div key={p.cle ?? p.g} className={`cav-porte${p.bord ? ' cav-porte--bord' : ''}`} style={{ ...p.place, '--pointe': p.pointe, '--teinte': p.teinte, '--incline': `${p.incline}deg` }}>
              <button type="button" className="cav-porte__ouverture" style={{ clipPath: p.forme }}
                onClick={() => passer(p)} aria-label={`${p.nom} : ${p.sous}`}>
                <span className="cav-porte__lueur" />
              </button>
              {/* le nom du jeu, gravé dans la pierre au-dessus de l'arche */}
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
