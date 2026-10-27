// =====================================================================
//  Écran « La Caverne aux Trésors » (#/caverne) : trois jeux de hasard, avec l'or ou les cristaux du jeu.
//   I.   Le Dragon Dormant : voler l'or avant son réveil ;
//   II.  Les Bourses du Marchand : éviter les cristaux maudits ;
//   III. Le Pont Maudit : traverser avant que ça cède ;
//   IV.  Le Lac des Esprits : remonter la ligne, seule la tension trahit la prise ;
//   V.   Le Roi Liche : un combat en cinq manches, fuir à temps.
//  Le serveur (supabase/caverne.sql) prend la mise, tire le hasard et paie ; le dessin et l'animation
//  sont dans lib/caverne/caverne.js, branché ici une fois la bourse du joueur lue.
//  On y entre depuis la barre latérale. Elle est scellée : sans badge activé (lib/caverne/badges.js),
//  la page montre la porte scellée, les badges du joueur à activer et le chemin de la Boutique.
// =====================================================================
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Page from '../components/Page.jsx';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../lib/auth.js';
import { useNotifier } from '../lib/notification.js';
import { monterCaverne } from '../lib/caverne/caverne.js';
import { lireBadges, accesOuvert, tempsRestant } from '../lib/caverne/badges.js';
import BadgesCaverne from '../components/BadgesCaverne.jsx';

// Une fonction du serveur : sa réponse, ou une erreur avec le message à montrer
async function rpc(nom, args) {
  const { data, error } = await supabase.rpc(nom, args);
  if (error) throw new Error(error.message);
  return data;
}
const SERVEUR = {
  commencer: (jeu, monnaie, mise, option = null) => rpc('caverne_commencer', { p_jeu: jeu, p_monnaie: monnaie, p_mise: mise, p_option: option }),
  voir: () => rpc('caverne_dragon_voir'),
  ouvrir: (i) => rpc('caverne_bourse_ouvrir', { p_case: i }),
  avancer: (n) => rpc('caverne_pont_avancer', { p_pas: n }),
  tirer: () => rpc('caverne_lac_tirer'),
  agir: (action) => rpc('caverne_liche_agir', { p_action: action }),
  encaisser: () => rpc('caverne_encaisser'),
};

// L'onglet du Roi Liche : sa couronne
const COURONNE = (
  <svg className="tab__ico" viewBox="0 0 44 44" aria-hidden="true">
    <path d="M7 32 L5 12 L15 21 L22 7 L29 21 L39 12 L37 32 Z" fill="#8a7648" stroke="#e2d2a4" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M7 32 H37 V37 H7 Z" fill="#5e4f2c" stroke="#e2d2a4" strokeWidth="1.5" />
    <circle cx="22" cy="27" r="2.6" fill="#7ef0e6" />
  </svg>
);

export default function Caverne() {
  const { joueur } = useAuth();
  const discordId = joueur?.discord_id ?? null;
  const notifier = useNotifier();
  const racine = useRef(null);
  const [bourse, setBourse] = useState(null);
  const [badges, setBadges] = useState(null);   // caverne_badges_etat, ou { erreur }
  const [maintenant, setMaintenant] = useState(() => Date.now());

  // La bourse du joueur, lue une fois ; ensuite, chaque réponse du serveur la donne
  useEffect(() => {
    if (!discordId) return undefined;
    let actif = true;
    supabase.from('wallets').select('balance, cristaux').eq('discord_id', discordId).maybeSingle()
      .then(({ data }) => { if (actif) setBourse({ or: data?.balance ?? 0, cristaux: data?.cristaux ?? 0 }); });
    lireBadges().then((e) => { if (actif) setBadges(e); }).catch((e) => { if (actif) setBadges({ erreur: e.message }); });
    return () => { actif = false; };
  }, [discordId]);
  // Le temps qui reste (chaque minute)
  useEffect(() => {
    const t = setInterval(() => setMaintenant(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  // La Caverne est scellée tant qu'aucun badge n'est activé (le serveur le revérifie à chaque partie)
  const ouverte = accesOuvert(badges);
  const pret = bourse !== null && ouverte;
  useEffect(() => {
    if (!pret || !racine.current) return undefined;
    return monterCaverne(racine.current, { serveur: SERVEUR, notifier, bourse });
    // une seule fois, quand la bourse est connue : le jeu tient ensuite son propre état
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pret]);

  return (
    <Page id="caverne" classes="page-caverne" titre="La Caverne aux Trésors">
      <div className="caverne" ref={racine}>
        <canvas id="bg" />
        {badges && !ouverte && (
          <section className="caverne-porte">
            <h1>La Caverne est scellée</h1>
            {badges.erreur ? <p className="caverne-porte__texte">La Caverne n&apos;est pas encore prête. Reviens un peu plus tard.</p> : (
              <>
                <p className="caverne-porte__texte">
                  Seul un badge brise le sceau, pour le temps écrit dessus.
                  {badges.badges.some((x) => x.nombre > 0) ? ' Active l\'un des tiens pour descendre.' : ' Tu n\'en as aucun pour l\'instant.'}
                </p>
                {badges.badges.some((x) => x.nombre > 0) && (
                  <BadgesCaverne etat={{ ...badges, badges: badges.badges.filter((x) => x.nombre > 0) }} surEtat={setBadges} />
                )}
                <Link className="caverne-porte__lien" to="/boutique?echoppe=boosters">Acheter un badge à la Boutique →</Link>
              </>
            )}
          </section>
        )}
        {!pret ? null : (
          <>
            <div className="hdr">
              <div className="bals">
                <button type="button" className="panel bal on" data-m="or" title="Miser de l'or"><img data-k="coin" alt="" /><span>0</span><small>PIÈCES</small></button>
                <button type="button" className="panel bal" data-m="cristaux" title="Miser des cristaux"><img data-k="gem" alt="" /><span>0</span><small>CRISTAUX</small></button>
              </div>
              <div className="ttl">LA CAVERNE AUX TRÉSORS</div>
              <div className="hr">
                {!badges.mj && <span className="panel caverne-temps" title="Active un autre badge à la Boutique pour rester plus longtemps">Encore <b>{tempsRestant(badges.jusqu_a, maintenant)}</b></span>}
                <Link className="panel retour" to="/boutique" title="Retour à la Boutique">← <b>BOUTIQUE</b></Link>
                <button type="button" className="panel snd" id="snd">SON : OUI</button>
              </div>
            </div>

            <nav className="tabs" id="tabs">
              <button type="button" className="tab on" data-g="0"><img data-k="s3" alt="" /><span><b>Le Dragon Dormant</b><small>Vole l&apos;or avant son réveil</small></span></button>
              <button type="button" className="tab" data-g="1"><img data-k="bag" alt="" /><span><b>Bourses du Marchand</b><small>Évite les cristaux maudits</small></span></button>
              <button type="button" className="tab" data-g="2"><img data-k="crystal" alt="" /><span><b>Le Pont Maudit</b><small>Traverse avant que ça cède</small></span></button>
              <button type="button" className="tab" data-g="3"><img data-k="gem" alt="" /><span><b>Le Lac des Esprits</b><small>Écoute la tension de la ligne</small></span></button>
              <button type="button" className="tab" data-g="4">{COURONNE}<span><b>Le Roi Liche</b><small>Fuis avant qu&apos;il te vainque</small></span></button>
            </nav>

            <div className="jeux">
              {/* ===== JEU 1 : DRAGON ===== */}
              <section className="game on" id="g1">
                <div className="stage" id="dStage">
                  <canvas id="dc" />
                  <div className="chips" id="dHist" />
                  <div id="dHud"><div id="dm">×1.00</div><div id="ds">Le dragon dort sur son trésor…</div></div>
                </div>
                <div className="panel bar">
                  <div className="lockable" id="dBet" />
                  <label className="auto lockable" id="dAutoW">ENCAISSE AUTO ×<input id="dAuto" type="number" step="0.1" min="1.1" max="100" placeholder="—" inputMode="decimal" /></label>
                  <button type="button" className="btn pri" id="dGo"><span id="dGoT">Voler le trésor</span><small id="dGoS">ESPACE</small></button>
                </div>
              </section>

              {/* ===== JEU 2 : BOURSES ===== */}
              <section className="game" id="g2">
                <div className="stage">
                  <div className="stats">
                    <div className="panel stat"><div className="lbl">BOURSES OUVERTES</div><b id="bOpen">0 / 22</b></div>
                    <div className="panel stat nx"><div className="lbl">PROCHAINE BOURSE</div><b id="bNext">×1.0</b></div>
                    <div className="panel stat"><div className="lbl">GAIN ACTUEL</div><b id="bCur">0</b></div>
                  </div>
                  <div className="grid" id="bGrid" />
                  <div className="say2" id="bSay">Choisis ta mise, puis pose-la sur la table.</div>
                </div>
                <div className="panel bar">
                  <div className="lockable" id="bBet" />
                  <div className="grp lockable" id="bMines"><span className="lbl">CRISTAUX MAUDITS</span></div>
                  <button type="button" className="btn pri" id="bGo"><span id="bGoT">Poser la mise</span><small id="bGoS">ESPACE</small></button>
                </div>
              </section>

              {/* ===== JEU 3 : PONT MAUDIT ===== */}
              <section className="game" id="g3">
                <div className="stage" id="cStage">
                  <canvas id="cc" />
                  <div className="chips" id="cHist" />
                  <div id="cHud"><div id="cm">×1.00</div><div id="cs">Le pont t&apos;attend, voyageur.</div></div>
                </div>
                <div className="panel bar">
                  <div className="lockable" id="cBet" />
                  <button type="button" className="btn pri" id="cGo"><span id="cGoT">Traverser le pont</span><small id="cGoS">ESPACE</small></button>
                  <button type="button" className="btn blue" id="cStep" style={{ display: 'none' }}><span id="cStepT">Avancer</span><small id="cStepS" /></button>
                  <button type="button" className="btn sec" id="cLeap" style={{ display: 'none' }}><span>Sauter 2 planches</span><small id="cLeapS" /></button>
                  <button type="button" className="btn out" id="cCash" style={{ display: 'none' }}><span id="cCashT">Encaisser</span><small id="cCashS" /></button>
                </div>
              </section>

              {/* ===== JEU 4 : LAC DES ESPRITS ===== */}
              <section className="game" id="g4">
                <div className="stage" id="lStage">
                  <canvas id="lc" />
                  <div className="chips" id="lHist" />
                  <div id="lHud">
                    <div className="lbl">TENSION DE LA LIGNE</div>
                    <div id="lm">0 %</div>
                    <div className="jauge"><i id="lJauge" /></div>
                    <div className="lbl">TIRAGES <b id="lTirages">0 / 5</b></div>
                    <div id="ls">Le lac attend ta ligne.</div>
                  </div>
                </div>
                <div className="panel bar">
                  <div className="lockable" id="lBet" />
                  <button type="button" className="btn pri" id="lGo"><span id="lGoT">Lancer la ligne</span><small id="lGoS">ESPACE</small></button>
                  <button type="button" className="btn blue" id="lTirer" style={{ display: 'none' }}><span>Remonter</span><small id="lTirerS" /></button>
                  <button type="button" className="btn sec" id="lCouper" style={{ display: 'none' }}><span>Couper la ligne</span><small id="lCouperS" /></button>
                </div>
              </section>

              {/* ===== JEU 5 : LE ROI LICHE ===== */}
              <section className="game" id="g5">
                <div className="stage" id="kStage">
                  <canvas id="kc" />
                  <div className="chips" id="kHist" />
                  <div id="kHaut">
                    <div className="vie vie--liche"><span className="vie__nom">LE ROI LICHE <small id="kManche">MANCHE 1 / 5</small></span><div className="vie__barre"><i id="kBarL" /></div><span className="vie__pv" id="kPvL" /></div>
                    <div id="kInt">Le Roi Liche attend sur son trône.</div>
                  </div>
                  <div id="kHud"><div id="km">×1.20</div><div className="lbl" id="kmS" /><div id="ks">Le Roi Liche attend sur son trône. Oseras-tu le défier ?</div></div>
                  <div className="vie vie--moi"><span className="vie__nom">TOI</span><div className="vie__barre"><i id="kBarJ" /></div><span className="vie__pv" id="kPvJ" /></div>
                </div>
                <div className="panel bar">
                  <div className="lockable" id="kBet" />
                  <button type="button" className="btn pri" id="kGo"><span id="kGoT">Défier le Roi Liche</span><small id="kGoS">ESPACE</small></button>
                  <button type="button" className="btn out" id="kAtq" style={{ display: 'none' }}><span>Attaquer</span><small>ESPACE</small></button>
                  <button type="button" className="btn blue" id="kDef" style={{ display: 'none' }}><span>Se défendre</span><small>D</small></button>
                  <button type="button" className="btn sec" id="kSoin" style={{ display: 'none' }}><span>Se soigner</span><small id="kSoinS" /></button>
                  <button type="button" className="btn sec fuir" id="kFuir" style={{ display: 'none' }}><span id="kFuirT">Fuir</span><small id="kFuirS" /></button>
                </div>
              </section>
            </div>

            <div id="flashv" />
            <canvas id="fx" />
            <div id="floats" />
          </>
        )}
      </div>
    </Page>
  );
}
