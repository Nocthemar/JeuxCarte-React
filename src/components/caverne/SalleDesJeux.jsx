// =====================================================================
//  La salle des jeux de la Caverne aux Trésors : le hall d'entrée (les quatre jeux en grandes cartes), l'en-tête
//  (« ← La Caverne » et le jeu ouvert, bourses, temps restant, son), et la scène de chaque jeu avec sa barre
//  de mise. Ce n'est que le décor : lib/caverne/caverne.js s'y branche (par les id) et anime tout ; choisir
//  une carte du hall « clique » l'onglet du jeu, que le script écoute. Styles : styles/caverne.css.
//  props : temps (le temps d'accès qui reste, en mots), surPortail() : revenir au portail (bouton du hall)
// =====================================================================
import { useRef, useState } from 'react';

const JEUX = [
  { g: 0, image: 's3', nom: 'Le Dragon Dormant', sous: 'Vole l\'or avant son réveil', texte: 'Le butin grossit tant que le dragon dort. Fuis avant que ses yeux ne s\'ouvrent.' },
  { g: 1, image: 'bag', nom: 'Les Bourses du Marchand', sous: 'Évite les bourses piégées', texte: 'Ouvre les bourses une à une ; chacune paie plus. Une bourse piégée, et tout est perdu.' },
  { g: 2, image: 'pont', nom: 'Le Pont Maudit', sous: 'Traverse avant que ça cède', texte: 'Douze planches au-dessus du gouffre, de plus en plus fragiles. Rebrousse chemin à temps.' },
  { g: 3, image: 'lac', nom: 'Le Lac des Esprits', sous: 'Écoute la tension de la ligne', texte: 'Une prise invisible mord à ta ligne. Seule sa tension trahit ce qu\'elle est.' },
];

export default function SalleDesJeux({ temps, surPortail }) {
  const [jeu, setJeu] = useState(null);   // le jeu ouvert, ou null : le hall
  const onglets = useRef(null);
  const choisir = (g) => { onglets.current.querySelector(`.tab[data-g="${g}"]`).click(); setJeu(g); };
  // pas de retour au hall pendant une partie (le script verrouille alors les onglets)
  const auHall = () => { if (!onglets.current.classList.contains('lock')) setJeu(null); };

  return (
    <>
      {/* Le hall : les quatre jeux, une carte chacun (toujours là, caché pendant un jeu : ses images restent chargées) */}
      <section className="cav-hall" hidden={jeu !== null} aria-labelledby="cav-hall-titre">
        <header className="cav-hall__tete">
          {surPortail && <button type="button" className="cav-portail" onClick={surPortail}><span aria-hidden="true">←</span> Retour au portail</button>}
          <span>Nocthémar</span>
          <h1 id="cav-hall-titre">La Caverne aux Trésors</h1>
          <p>Quatre jeux, une seule règle : savoir s&apos;arrêter à temps.</p>
        </header>
        <div className="cav-hall__jeux">
          {JEUX.map((j) => (
            <button key={j.g} type="button" className={`cav-carte cav-carte--${j.g}`} onClick={() => choisir(j.g)}>
              <span className="cav-carte__scene"><img data-k={j.image} alt="" /></span>
              <span className="cav-carte__nom">{j.nom}</span>
              <span className="cav-carte__sous">{j.sous}</span>
              <span className="cav-carte__texte">{j.texte}</span>
              <span className="cav-carte__entrer">Entrer <span aria-hidden="true">→</span></span>
            </button>
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
