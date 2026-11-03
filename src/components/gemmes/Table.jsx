// =====================================================================
//  La table des Gemmes : le joueur à gauche, la grille au milieu, l'adversaire à droite (l'ordre vient du CSS :
//  dans le code, le joueur reste le côté « droite », l'adversaire le côté « gauche »).
//  Les règles (moteur/gemmes.js) donnent tout de suite le nouvel état ; la table, elle, le montre pas à pas :
//  l'échange qui glisse, les gemmes qui éclatent, les dégâts qui volent, les chutes, les chaînes,
//  la carte déclenchée, le tour qui passe. Pendant ce temps, on ne joue pas.
//
//  Contre l'Ombre, ses actions viennent de choixOmbre ; contre un ami, toutes les actions (les miennes
//  aussi) passent par le journal du salon (lib/gemmes/useSalonGemmes.js), dans le même ordre des deux côtés.
// =====================================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import Gemme, { DefsGemmes } from './Gemme.jsx';
import ReglageSon from './ReglageSon.jsx';
import {
  nouvellePartie, appliquer, choixOmbre, coupsPossibles, voisins,
  TAILLE, SORTES, RARETE, ECHANGES_PAR_TOUR, textePouvoir,
} from '../../moteur/gemmes.js';
import { urlPublique } from '../../lib/chemins.js';
import { duree } from '../../lib/preferences.js';
import { jouerSon } from '../../lib/son.js';

const attendre = (ms) => new Promise((ok) => setTimeout(ok, ms));
const SON_RARETE = { commune: 'pose', eveillee: 'elan', mythique: 'eau', legendaire: 'griffe', transcendante: 'forge' };
// L'attaque d'une carte déclenchée, selon sa rareté (son pouvoir) : de plus en plus grande à mesure que la carte est rare.
// depart : l'élan (la carte s'illumine dans son panneau, ou surgit au milieu de la grille : revele) ; trajet : le vol
// jusqu'à l'adversaire ; impact : l'éclat sur lui (les dégâts tombent au début de l'impact). Temps en ms ; les sons
// sont ceux du jeu (lib/son.js) ; secousse : la table tremble.
const ATTAQUES = {
  commune: { depart: 120, trajet: 280, impact: 320, sons: ['pose', 'choc'] },
  eveillee: { depart: 200, trajet: 380, impact: 380, sons: ['elan', 'choc'] },
  mythique: { depart: 420, trajet: 400, impact: 420, revele: true, sons: ['magie', 'eau'] },
  legendaire: { depart: 520, trajet: 380, impact: 560, revele: true, secousse: true, sons: ['feu', 'tonnerre'] },
  transcendante: { depart: 560, trajet: 520, impact: 620, revele: true, secousse: true, sons: ['couronne', 'tonnerre'] },
};
const vueDe = (etat) => ({
  grille: etat.grille.map(({ id, s }) => ({ id, s })),
  pv: etat.joueurs.map((j) => j.pv),
  jauges: etat.joueurs.map((j) => j.cartes.map((c) => c.jauge)),
});
let numero = 0;
// Les temps du plateau (ms) : l'échange, l'éclat, et la chute (plus longue de loin, mais pas en proportion :
// comme une vraie chute, la vitesse grandit en tombant). Le CSS les reçoit en variables, pour rester accordé
// aux pauses d'ici, même quand les animations sont réduites.
const T_ECHANGE = 190;
const T_ECLAT = 280;
const tChute = (n) => Math.round(110 + 95 * Math.sqrt(n));
// une grille sans les marques d'une animation passée (chute, nouvelle, au premier plan…)
const nette = (grille) => grille.map(({ id, s }) => ({ id, s }));
const ligneDe = (i) => Math.floor(i / TAILLE);
const colonneDe = (i) => i % TAILLE;

// ---------------------------------------------------------------------
//  Un combattant : portrait, PV, échanges restants, ses trois cartes et leurs jauges
// ---------------------------------------------------------------------
function Combattant({ j, cote, pv, jauges, actif, echanges, peutDeclencher, surDeclencher, textes, touche, carteActive, parts }) {
  const part = Math.max(0, pv / j.pvMax);
  return (
    <aside className={`gm-combattant gm-combattant--${cote}${actif ? ' est-actif' : ''}${touche ? ' est-touche' : ''}`} aria-label={j.nom}>
      <div className="gm-combattant__tete">
        <span className="gm-combattant__portrait">
          {j.avatar ? <img src={j.avatar} alt="" /> : <span aria-hidden="true">{j.nom.slice(0, 1).toUpperCase()}</span>}
        </span>
        <span className="gm-combattant__role">{cote === 'droite' ? 'Toi' : 'Adversaire'}</span>
        <span className="gm-combattant__nom">{j.nom}</span>
        <span className="gm-combattant__tour" aria-live="polite">{actif ? 'À son tour' : ''}</span>
      </div>
      <div className="gm-pv" role="meter" aria-label="Points de vie" aria-valuemin={0} aria-valuemax={j.pvMax} aria-valuenow={pv}>
        <span className="gm-pv__traine" style={{ '--part': part }} />
        <span className="gm-pv__barre" style={{ '--part': part }} />
        <span className="gm-pv__texte">{pv} / {j.pvMax}</span>
        {textes.map((t) => <span key={t.id} className={`gm-flottant gm-flottant--${t.sorte}`}>{t.texte}</span>)}
      </div>
      <div className="gm-echanges" aria-label={actif ? `${echanges} échange(s) restant(s)` : undefined}>
        {actif && Array.from({ length: Math.max(ECHANGES_PAR_TOUR, echanges) }, (_, k) => <i key={k} className={k < echanges ? 'est-plein' : ''} />)}
      </div>
      <ul className="gm-cartes">
        {j.cartes.map((c, k) => {
          const jauge = jauges[k];
          const pleine = jauge >= c.max;
          const titre = `${c.n} — ${RARETE[c.rarete].nom} : se charge avec les gemmes ${RARETE[c.gemme].nom.toLowerCase()}s. Pouvoir : ${textePouvoir(c.rarete)}`;
          return (
            <li key={k}>
              <button type="button" className={`gm-carte gm-carte--${c.gemme}${pleine ? ' est-pleine' : ''}${carteActive === k ? ' est-declenchee' : ''}${parts?.[k] ? ' est-chargee' : ''}`}
                disabled={!(pleine && peutDeclencher)} onClick={() => surDeclencher(k)} title={titre}>
                <span className="gm-carte__aura" aria-hidden="true" />
                <span className="gm-carte__image" style={c.image ? { backgroundImage: `url("${urlPublique(c.image)}")` } : undefined} />
                <span className="gm-carte__nom">{c.n}</span>
                {/* la ligne de la jauge : la gemme qui la charge, la barre, l'état */}
                <span className="gm-carte__ligne">
                  <span className="gm-carte__gemme"><Gemme sorte={c.gemme} /></span>
                  <span className="gm-carte__jauge" style={{ '--part': Math.min(1, jauge / c.max) }}><i /></span>
                  <span className="gm-carte__etat">{pleine ? (peutDeclencher ? 'Attaquer' : 'Prête') : `${jauge}/${c.max}`}</span>
                </span>
                {parts?.[k] ? <span key={parts.id} className="gm-carte__plus" aria-hidden="true">+{parts[k]}</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

// ---------------------------------------------------------------------
//  L'attaque d'une carte, par-dessus toute la table : le départ, le vol jusqu'au portrait de la cible, l'impact.
//  Tout est animé par le CSS (styles/gemmes.css, « L'attaque d'une carte ») avec les temps de ATTAQUES ;
//  les <i> sont les éclats, braises, feuilles… de chaque rareté (le CSS choisit lesquels montrer).
// ---------------------------------------------------------------------
const parcelles = (n) => Array.from({ length: n }, (_, k) => <i key={k} style={{ '--k': k, '--n': n }} />);
function Attaque({ activation: { carte, effet, t, geo, revele } }) {
  const px = (n) => `${Math.round(n)}px`;
  const style = {
    '--x0': px(geo.x0), '--y0': px(geo.y0), '--x1': px(geo.x1), '--y1': px(geo.y1), '--dx': px(geo.dx), '--dy': px(geo.dy),
    '--xs': px(geo.xs), '--ys': px(geo.ys), '--angle': `${geo.angle}rad`, '--long': px(geo.long),
    '--bosse': px(Math.min(90, geo.long * 0.22)),
    '--montee': px(geo.montee), '--angle-lance': `${geo.angleLance}rad`, '--long-lance': px(geo.longLance),
    '--t-depart': `${t.depart}ms`, '--t-trajet': `${t.trajet}ms`, '--t-impact': `${t.impact}ms`,
  };
  return (
    <div className={`gm-attaque gm-attaque--${carte.rarete}`} style={style} aria-hidden="true">
      {/* le départ : un éclat sur la carte du panneau, et son nom (quand elle ne surgit pas au milieu) */}
      {!revele && <span className="gm-attaque__depart"><i /></span>}
      {!revele && <span className="gm-attaque__nom">{carte.n}</span>}
      {/* le vol : en largeur, puis en hauteur (deux élans : une courbe), puis le projectile tourné vers la cible */}
      <span className="gm-attaque__vol"><span className="gm-attaque__arc">
        <span className="gm-attaque__projectile"><span className="gm-attaque__traine">{parcelles(4)}</span><span className="gm-attaque__coeur" /></span>
      </span></span>
      {carte.rarete === 'transcendante' && <span className="gm-attaque__rayon" />}
      <span className="gm-attaque__impact"><span className="gm-attaque__onde" /><span className="gm-attaque__onde" /><span className="gm-attaque__eclair" />{parcelles(8)}</span>
      {effet.soin > 0 && <span className="gm-attaque__soin">{parcelles(5)}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------
//  La table
//  combattants : [{ nom, avatar, cartes }] dans l'ordre de jeu ; moi : ma place (0 ou 1)
//  ligne : le salon (contre un ami) ou null (contre l'Ombre, de niveau « difficulte »)
//  Mode Histoire (moteur/histoireGemmes.js) : hasardOmbre, le hasard de l'adversaire tiré de la graine du serveur ;
//  surJournal(action) reçoit chacune de mes actions (l'arbitre rejoue la partie avec) ; surFin({ gagne, abandon })
//  à la fin ; messageFin : la ligne des récompenses, sur l'écran de fin
// ---------------------------------------------------------------------
export default function Table({ combattants, graine, moi, ligne = null, difficulte = 'normal', surRejouer, surQuitter,
  hasardOmbre = Math.random, surJournal = null, surFin = null, messageFin = '' }) {
  const [etat, setEtat] = useState(() => {
    const e = nouvellePartie(combattants, graine);
    e.joueurs.forEach((j, k) => { j.avatar = combattants[k].avatar ?? null; });
    return e;
  });
  const etatRef = useRef(etat);
  const [vue, setVue] = useState(() => vueDe(etat));
  const vueRef = useRef(vue);
  const [occupe, setOccupe] = useState(true);
  const [choisie, setChoisie] = useState(null);
  const [eclats, setEclats] = useState(() => new Set());
  const [textes, setTextes] = useState([]);
  const [eclairs, setEclairs] = useState([]);
  const [banniere, setBanniere] = useState(null);
  const [touche, setTouche] = useState(null);
  const [activation, setActivation] = useState(null);
  const [indice, setIndice] = useState(null);
  const [secousse, setSecousse] = useState(false);
  const [visees, setVisees] = useState(null);     // l'échange que l'adversaire s'apprête à faire : [a, b]
  const [compte, setCompte] = useState(null);     // « +n » au milieu des gemmes d'un grand alignement
  // Abandonner : un premier clic demande confirmation ; contre l'Ombre, la défaite est donnée ici
  const [confirmer, setConfirmer] = useState(false);
  const [abandonOmbre, setAbandonOmbre] = useState(false);
  const file = useRef([]);
  const enCours = useRef(false);
  const vivant = useRef(true);
  const lus = useRef(0);
  const glisse = useRef(null);
  const grilleEl = useRef(null);
  const autre = 1 - moi;

  const montrer = useCallback((v) => { vueRef.current = v; setVue(v); }, []);
  const flotter = useCallback((cible, texte, sorte) => {
    const id = ++numero;
    setTextes((l) => [...l, { id, cible, texte, sorte }]);
    setTimeout(() => { if (vivant.current) setTextes((l) => l.filter((t) => t.id !== id)); }, 1400);
  }, []);
  // (bloquer = false : l'annonce passe sans retenir les commandes, quand c'est à moi de jouer)
  const annoncer = useCallback(async (texte, ms = 950, genre = '', bloquer = true) => {
    const id = ++numero;
    setBanniere({ texte, genre, id });
    const fin = attendre(duree(ms)).then(() => { if (vivant.current) setBanniere((b) => (b?.id === id ? null : b)); });
    if (bloquer) await fin;
  }, []);
  // Les jauges chargées : la carte s'illumine et un « +n » s'envole au-dessus
  const [charges, setCharges] = useState(null);   // { qui, parts: { k: n }, id }
  const charger = useCallback((qui, parts) => {
    const id = ++numero;
    setCharges({ qui, parts, id });
    setTimeout(() => { if (vivant.current) setCharges((c) => (c?.id === id ? null : c)); }, 900);
  }, []);
  // Le trajet d'une attaque, mesuré sur la table telle qu'elle est affichée (ordinateur ou téléphone) : du départ
  // (la carte dans le panneau du lanceur, ou le milieu de la grille quand la carte y surgit) au portrait de la cible ;
  // et le portrait du lanceur (pour le soin). Positions en px dans la table.
  const tableEl = useRef(null);
  const mesurer = useCallback((qui, k, revele) => {
    const table = tableEl.current;
    if (!table) return null;
    const o = table.getBoundingClientRect();
    const centre = (el) => { const r = el?.getBoundingClientRect(); return r ? [r.left + r.width / 2 - o.left, r.top + r.height / 2 - o.top] : null; };
    const lanceur = qui === moi ? 'droite' : 'gauche', visee = qui === moi ? 'gauche' : 'droite';
    const de = centre(revele ? grilleEl.current : table.querySelector(`.gm-combattant--${lanceur} .gm-cartes > li:nth-child(${k + 1}) .gm-carte__image`));
    const vers = centre(table.querySelector(`.gm-combattant--${visee} .gm-combattant__portrait`));
    const soi = centre(table.querySelector(`.gm-combattant--${lanceur} .gm-combattant__portrait`));
    if (!de || !vers || !soi) return null;
    const [dx, dy] = [vers[0] - de[0], vers[1] - de[1]];
    // (la lance de la transcendante part d'un point au-dessus du départ, où l'orbe est monté)
    const montee = Math.min(110, de[1] * 0.4);
    const [lx, ly] = [vers[0] - de[0], vers[1] - (de[1] - montee)];
    return {
      x0: de[0], y0: de[1], x1: vers[0], y1: vers[1], dx, dy, xs: soi[0], ys: soi[1], angle: Math.atan2(dy, dx), long: Math.hypot(dx, dy),
      montee, angleLance: Math.atan2(ly, lx), longLance: Math.hypot(lx, ly),
    };
  }, [moi]);
  const frapper = useCallback((cible, fort) => {
    setTouche(cible);
    if (fort) setSecousse(true);
    setTimeout(() => { if (vivant.current) { setTouche(null); setSecousse(false); } }, 420);
  }, []);

  // ---------- Montrer une action, pas à pas ----------
  const animer = useCallback(async (res, qui, action) => {
    const cible = 1 - qui;
    let v = vueRef.current;
    if (action.t === 'echange') {
      // l'adversaire montre d'abord les deux gemmes qu'il va échanger
      if (qui !== moi) {
        setVisees([action.a, action.b]);
        await attendre(duree(260));
        if (!vivant.current) return;
        setVisees(null);
        v = vueRef.current;
      }
      const g = nette(v.grille);
      [g[action.a], g[action.b]] = [g[action.b], { ...g[action.a], devant: true }];
      montrer({ ...v, grille: g });
      jouerSon('pose');
      await attendre(duree(T_ECHANGE) + 30);
      for (const etape of res.etapes) {
        if (!vivant.current) return;
        v = vueRef.current;
        if (etape.rebattue) {
          await annoncer('Plus aucun échange : la grille est rebattue', 1100, 'info');
          montrer({ ...v, grille: etape.grille.map(({ id, s }) => ({ id, s, rebattue: true })) });
          await attendre(duree(560));
          continue;
        }
        // les gemmes éclatent : des éclats à leur place, et les jauges des cartes de leur rareté se chargent (pas de dégâts)
        const places = v.grille.map((x, i) => (etape.retirees.includes(x.id) ? i : -1)).filter((i) => i >= 0);
        setEclats(new Set(etape.retirees));
        setEclairs(places.map((i) => ({ id: ++numero, i, sorte: SORTES[v.grille[i].s] })));
        // un grand alignement (4 gemmes et plus) : le nombre s'élève au milieu, discret
        if (places.length >= 4) {
          const id = ++numero;
          const x = places.reduce((t, i) => t + colonneDe(i), 0) / places.length;
          const y = places.reduce((t, i) => t + ligneDe(i), 0) / places.length;
          setCompte({ id, x, y, n: places.length });
          setTimeout(() => { if (vivant.current) setCompte((c) => (c?.id === id ? null : c)); }, 900);
        }
        const chargees = Object.keys(etape.charges).map(Number);
        const cartes = etatRef.current.joueurs[qui].cartes;
        chargees.forEach((k, n) => jouerSon(SON_RARETE[cartes[k].gemme], n * 0.06));
        if (!chargees.length) jouerSon('pioche');
        if (etape.chaine >= 2) { jouerSon('chaine'); setBanniere({ texte: `Chaîne ×${etape.chaine}`, genre: 'chaine', id: ++numero }); }
        const jauges = v.jauges.map((l) => l.slice());
        chargees.forEach((k) => {
          const avant = jauges[qui][k];
          jauges[qui][k] = Math.min(cartes[k].max, avant + etape.charges[k]);
          if (avant < cartes[k].max && jauges[qui][k] >= cartes[k].max) jouerSon('couronne', 0.15);   // la jauge vient d'être pleine
        });
        if (chargees.length) charger(qui, etape.charges);
        montrer({ ...v, jauges });
        await attendre(duree(T_ECLAT));
        if (!vivant.current) return;
        // les gemmes tombent, les nouvelles arrivent d'en haut ; chacune selon sa hauteur, et toutes se posent
        // avant la suite (vague : de quoi relancer l'atterrissage d'une gemme qui tombe deux fois de suite)
        setEclats(new Set());
        setEclairs([]);
        const vague = etape.chaine % 2;
        const plusHaute = Math.max(0, ...Object.values(etape.chutes));
        montrer({ ...vueRef.current, grille: etape.grille.map(({ id, s, neuve }) => ({ id, s, neuve, chute: etape.chutes[id] ?? 0, vague })) });
        await attendre(duree(tChute(plusHaute)) + 40);
        if (etape.chaine >= 2) setBanniere((b) => (b?.genre === 'chaine' ? null : b));
      }
    } else if (action.t === 'carte') {
      const c = res.etat.joueurs[qui].cartes[res.carte.k];
      const a = ATTAQUES[c.rarete] ?? ATTAQUES.commune;
      const t = { depart: duree(a.depart), trajet: duree(a.trajet), impact: duree(a.impact) };
      setActivation({ qui, k: res.carte.k, carte: c, effet: res.carte, id: ++numero, t, revele: a.revele, geo: t.trajet ? mesurer(qui, res.carte.k, a.revele) : null });
      jouerSon(a.sons[0]);
      await attendre(t.depart + t.trajet);
      if (!vivant.current) return;
      v = vueRef.current;
      const pv = v.pv.slice();
      const jauges = v.jauges.map((l) => l.slice());
      pv[cible] = Math.max(0, pv[cible] - res.carte.degats);
      jauges[qui][res.carte.k] = 0;
      flotter(cible, `−${res.carte.degats}`, c.rarete);
      frapper(cible, a.secousse);
      jouerSon(a.sons[1]);
      if (a.secousse) jouerSon('choc', 0.04);
      if (res.carte.soin) {
        pv[qui] = Math.min(res.etat.joueurs[qui].pvMax, pv[qui] + res.carte.soin);
        flotter(qui, `+${res.carte.soin}`, 'soin');
        jouerSon('soin', 0.15);
      }
      if (res.carte.echange) flotter(qui, '+1 échange', 'mythique');
      montrer({ ...v, pv, jauges });
      await attendre(t.impact);
      if (vivant.current) setActivation(null);
    }
    if (!vivant.current) return;
    // une fois les gemmes posées (le tassement fini), leurs marques de chute s'effacent : sans quoi le tassement
    // rejouerait quand une autre animation de la gemme (choisie, indice) s'arrête
    const posee = { ...vueDe(res.etat), grille: vueRef.current.grille };
    montrer(posee);
    setTimeout(() => { if (vivant.current && vueRef.current === posee) montrer({ ...posee, grille: nette(posee.grille) }); }, duree(240));
    if (res.etat.fin) return;
    if (res.tourFini) {
      const aMoi = res.etat.actif === moi;
      if (aMoi) jouerSon('cloche');
      await annoncer(aMoi ? 'À toi de jouer' : `Au tour de ${res.etat.joueurs[res.etat.actif].nom}`, 950, aMoi ? 'moi' : 'autre', !aMoi);
    }
  }, [annoncer, charger, flotter, frapper, mesurer, montrer, moi]);

  // ---------- La file des actions : une à la fois ----------
  const traiter = useCallback(async () => {
    if (enCours.current) return;
    enCours.current = true;
    setOccupe(true);
    while (file.current.length && vivant.current) {
      const { qui, action } = file.current.shift();
      const res = appliquer(etatRef.current, qui, action);
      if (!res) continue;   // refusée par les règles (des deux côtés, en ligne)
      etatRef.current = res.etat;
      await animer(res, qui, action);
      if (vivant.current) setEtat(res.etat);
    }
    enCours.current = false;
    if (vivant.current) setOccupe(false);
  }, [animer]);
  const pousser = useCallback((qui, action) => { file.current.push({ qui, action }); traiter(); }, [traiter]);

  // Le début : qui commence
  useEffect(() => {
    vivant.current = true;
    (async () => {
      await attendre(duree(350));
      const aMoi = etatRef.current.actif === moi;
      if (aMoi) jouerSon('cloche');
      await annoncer(aMoi ? 'Tu commences' : `${etatRef.current.joueurs[etatRef.current.actif].nom} commence`, 1100, aMoi ? 'moi' : 'autre', !aMoi);
      if (vivant.current && !enCours.current) setOccupe(false);
    })();
    return () => { vivant.current = false; };
  }, [annoncer, moi]);

  // En ligne : les actions du journal (les deux joueurs), dans l'ordre
  useEffect(() => {
    if (!ligne) return;
    const l = ligne.journal.current;
    while (lus.current < l.length) { const x = l[lus.current]; lus.current += 1; pousser(x.qui, x.action); }
  }, [ligne, ligne?.version, pousser]);

  // L'Ombre joue quand c'est son tour
  useEffect(() => {
    if (ligne || occupe || etat.fin || abandonOmbre || etat.actif === moi) return undefined;
    const t = setTimeout(() => pousser(etat.actif, choixOmbre(etat, etat.actif, difficulte, hasardOmbre)), duree(650) + 120);
    return () => clearTimeout(t);
  }, [ligne, occupe, etat, abandonOmbre, moi, difficulte, hasardOmbre, pousser]);

  // La fin de la partie
  const finir = ligne?.finir;
  useEffect(() => {
    if (!etat.fin) return;
    jouerSon(etat.fin.gagnant === moi ? 'fanfare' : 'sombre');
    finir?.();
    surFin?.({ gagne: etat.fin.gagnant === moi });   // (surFin : une fonction stable, useCallback)
  }, [etat.fin, moi, finir, surFin]);

  // Un indice si le joueur hésite (une dizaine de secondes)
  const monTour = !occupe && !etat.fin && !abandonOmbre && etat.actif === moi && !ligne?.partie?.fini;
  useEffect(() => {
    if (!monTour) return undefined;
    const t = setTimeout(() => { const c = coupsPossibles(etatRef.current.grille); if (c.length) setIndice(c[0]); }, 10000);
    return () => { clearTimeout(t); setIndice(null); };
  }, [monTour, etat]);

  // ---------- Mes gestes ----------
  const agir = (action) => {
    if (!monTour) return false;
    if (!appliquer(etatRef.current, moi, action)) return false;
    setChoisie(null);
    setIndice(null);
    if (ligne) ligne.jouer(action);
    else { surJournal?.(action); pousser(moi, action); }
    return true;
  };
  // Un échange refusé : les deux gemmes font l'aller-retour
  // (elles reviennent en tremblant un peu : l'échange ne fait aucun alignement)
  const refuser = async (a, b) => {
    setOccupe(true);
    const v = { ...vueRef.current, grille: nette(vueRef.current.grille) };
    const g = v.grille.slice();
    [g[a], g[b]] = [g[b], { ...g[a], devant: true }];
    montrer({ ...v, grille: g });
    await attendre(duree(T_ECHANGE));
    if (!vivant.current) return;
    jouerSon('echec');
    const retour = v.grille.slice();
    retour[a] = { ...retour[a], devant: true, refusee: true };
    retour[b] = { ...retour[b], refusee: true };
    const revenue = { ...v, grille: retour };
    montrer(revenue);
    await attendre(duree(T_ECHANGE) + 30);
    if (!vivant.current) return;
    setOccupe(false);
    // le tremblement fini, ses marques s'effacent (sinon il rejouerait après une autre animation de la gemme)
    setTimeout(() => { if (vivant.current && vueRef.current === revenue) montrer(v); }, duree(320));
  };
  const echanger = (a, b) => {
    if (!voisins(a, b)) return;
    if (!agir({ t: 'echange', a, b })) { setChoisie(null); if (monTour) refuser(a, b); }
  };
  const cliquer = (i) => {
    if (!monTour) return;
    if (glisse.current?.fait) return;
    if (choisie === null) { setChoisie(i); jouerSon('clic'); return; }
    if (choisie === i) { setChoisie(null); return; }
    if (voisins(choisie, i)) echanger(choisie, i);
    else { setChoisie(i); jouerSon('clic'); }
  };
  // Glisser une gemme vers sa voisine : elle suit le doigt (dans un seul sens, jusqu'au seuil), puis l'échange part.
  // Elle est tirée par des variables posées à la main sur le bouton : pas de rendu React à chaque mouvement.
  const relacher = (g) => {
    if (!g?.el) return;
    delete g.el.dataset.tiree;
    g.el.style.removeProperty('--tire-x');
    g.el.style.removeProperty('--tire-y');
  };
  const appuyer = (i, e) => { if (monTour) glisse.current = { i, x: e.clientX, y: e.clientY, fait: false, el: e.currentTarget }; };
  const bouger = (e) => {
    const g = glisse.current;
    if (!g || g.fait || !grilleEl.current) return;
    const cote = grilleEl.current.clientWidth / TAILLE;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    const loin = Math.max(Math.abs(dx), Math.abs(dy));
    if (loin < cote * 0.38) {
      if (loin < 4) return;
      const horizontal = Math.abs(dx) > Math.abs(dy);
      g.el.dataset.tiree = '';
      g.el.style.setProperty('--tire-x', `${horizontal ? dx : 0}px`);
      g.el.style.setProperty('--tire-y', `${horizontal ? 0 : dy}px`);
      return;
    }
    g.fait = true;
    relacher(g);
    const r = Math.floor(g.i / TAILLE), c = g.i % TAILLE;
    let j = null;
    if (Math.abs(dx) > Math.abs(dy)) { if (dx > 0 && c < TAILLE - 1) j = g.i + 1; else if (dx < 0 && c > 0) j = g.i - 1; }
    else if (dy > 0 && r < TAILLE - 1) j = g.i + TAILLE; else if (dy < 0 && r > 0) j = g.i - TAILLE;
    if (j !== null) echanger(g.i, j);
  };
  const lacher = () => { relacher(glisse.current); setTimeout(() => { glisse.current = null; }, 0); };
  // Les flèches du clavier : la gemme choisie s'échange avec sa voisine
  const clavier = (i, e) => {
    if (e.key === 'Escape' && choisie !== null) { setChoisie(null); return; }
    const pas = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: TAILLE, ArrowUp: -TAILLE }[e.key];
    if (!pas) return;
    e.preventDefault();
    const j = i + pas;
    if (j < 0 || j >= TAILLE * TAILLE || !voisins(i, j)) return;
    if (choisie === i) echanger(i, j);
    else grilleEl.current?.querySelector(`[data-i="${j}"]`)?.focus();
  };

  const fin = etat.fin ? { gagne: etat.fin.gagnant === moi }
    : ligne?.partie?.abandon !== undefined ? { gagne: ligne.partie.abandon !== moi, abandon: true }
      : abandonOmbre ? { gagne: false, abandon: true } : null;
  const abandonner = () => {
    if (!confirmer) { setConfirmer(true); jouerSon('clic'); setTimeout(() => { if (vivant.current) setConfirmer(false); }, 4000); return; }
    setConfirmer(false);
    file.current = [];
    jouerSon('sombre');
    if (ligne) ligne.abandonner();
    else { surJournal?.({ t: 'abandon' }); setAbandonOmbre(true); surFin?.({ gagne: false, abandon: true }); }
  };
  const joueurs = etat.joueurs;
  const actif = etat.actif;
  const textesDe = (k) => textes.filter((t) => t.cible === k);
  const carteActiveDe = (k) => (activation?.qui === k ? activation.k : null);
  const coteDe = (k) => ({
    j: joueurs[k], pv: vue.pv[k], jauges: vue.jauges[k], actif: !fin && actif === k, echanges: etat.echanges,
    textes: textesDe(k), touche: touche === k, carteActive: carteActiveDe(k), parts: charges?.qui === k ? { ...charges.parts, id: charges.id } : null,
  });

  return (
    <section ref={tableEl} className={`gm-table${secousse ? ' est-secouee' : ''}`} aria-label="Partie de Gemmes">
      <DefsGemmes />
      <Combattant cote="gauche" {...coteDe(autre)} peutDeclencher={false} surDeclencher={() => {}} />

      <div className="gm-centre">
        <div className="gm-bandeau">
          <span className="gm-bandeau__tour">Tour {etat.tour}</span>
          <span className="gm-bandeau__qui" aria-live="polite">
            {fin ? 'Partie terminée' : monTour ? `À toi : ${etat.echanges} échange${etat.echanges > 1 ? 's' : ''}` : occupe ? (etat.actif === moi ? 'À toi…' : `Au tour de ${joueurs[etat.actif].nom}`) : `${joueurs[etat.actif].nom} réfléchit…`}
          </span>
          <button type="button" className="gm-bouton gm-bouton--fin" disabled={!monTour} onClick={() => agir({ t: 'fin' })}>Fin du tour</button>
        </div>

        <div className="gm-cadre">
        <div className={`gm-grille${monTour ? ' est-mon-tour' : ''}${monTour && choisie !== null ? ' a-un-choix' : ''}`} ref={grilleEl} role="grid" aria-label="Grille de gemmes"
          style={{ '--t-echange': `${duree(T_ECHANGE)}ms`, '--t-eclat': `${duree(T_ECLAT)}ms` }}
          onPointerMove={bouger} onPointerUp={lacher} onPointerLeave={lacher} onPointerCancel={lacher}>
          {/* les gemmes, toujours dans le même ordre (leur numéro), quelle que soit leur case : si React déplaçait
              un bouton dans la page à chaque échange ou chute, ce bouton perdrait sa transition et sauterait d'un coup */}
          {vue.grille.map((x, i) => [x, i]).sort((p, q) => p[0].id - q[0].id).map(([x, i]) => {
            const sorte = SORTES[x.s];
            const classes = ['gm-gemme', `gm-gemme--${sorte}`];
            if (eclats.has(x.id)) classes.push('est-eclatee');
            const voisine = monTour && choisie !== null && voisins(choisie, i);
            if (choisie === i && monTour) classes.push('est-choisie');
            if (voisine) classes.push('est-voisine');
            if (visees?.includes(i)) classes.push('est-visee');
            if (indice && indice.includes(i)) classes.push('est-indice');
            if (x.neuve) classes.push('est-neuve');
            if (x.chute) classes.push(`est-tombe-${x.vague ? 'b' : 'a'}`);
            if (x.rebattue) classes.push('est-rebattue');
            if (x.devant) classes.push('est-devant');
            if (x.refusee) classes.push('est-refusee');
            const style = { '--x': colonneDe(i), '--y': ligneDe(i), '--chute': x.chute ?? 0 };
            if (x.chute) style['--duree-chute'] = `${duree(tChute(x.chute))}ms`;
            // une voisine de la gemme choisie se penche vers elle au survol
            if (voisine) { style['--vers-x'] = colonneDe(choisie) - colonneDe(i); style['--vers-y'] = ligneDe(choisie) - ligneDe(i); }
            return (
              // (une seule gemme dans l'ordre du Tab : la choisie, sinon la première ; les flèches font le reste)
              <button key={x.id} type="button" data-i={i} className={classes.join(' ')} style={style} tabIndex={i === (choisie ?? 0) ? 0 : -1}
                aria-label={`${sorte}, ligne ${ligneDe(i) + 1}, colonne ${colonneDe(i) + 1}${choisie === i ? ', choisie' : voisine ? ', échangeable' : ''}`}
                onClick={() => cliquer(i)} onPointerDown={(e) => appuyer(i, e)} onKeyDown={(e) => clavier(i, e)}>
                <Gemme sorte={sorte} />
              </button>
            );
          })}
          {eclairs.map((e) => (
            <span key={e.id} className={`gm-eclat gm-eclat--${e.sorte}`} style={{ '--x': e.i % TAILLE, '--y': Math.floor(e.i / TAILLE) }} aria-hidden="true">
              <i /><i /><i /><i /><i /><i />
            </span>
          ))}
          {compte && (
            <span key={compte.id} className="gm-compte" style={{ '--x': compte.x, '--y': compte.y }} aria-hidden="true">+{compte.n}</span>
          )}
          {banniere && <div key={banniere.id} className={`gm-banniere gm-banniere--${banniere.genre}`} role="status">{banniere.texte}</div>}
          {activation?.revele && (
            <div key={activation.id} className={`gm-activation gm-activation--${activation.carte.rarete} gm-activation--${activation.qui === moi ? 'droite' : 'gauche'}`}
              style={{ '--t-revele': `${activation.t.depart + activation.t.trajet * 0.6}ms` }} aria-hidden="true">
              <span className="gm-activation__carte" style={activation.carte.image ? { backgroundImage: `url("${urlPublique(activation.carte.image)}")` } : undefined} />
              <span className="gm-activation__nom">{activation.carte.n}</span>
              <span className="gm-activation__effet">{activation.effet.degats} dégâts{activation.effet.soin ? ` · +${activation.effet.soin} PV` : ''}{activation.effet.echange ? ' · +1 échange' : ''}</span>
            </div>
          )}
          {fin && (
            <div className={`gm-fin${fin.gagne ? ' gm-fin--victoire' : ' gm-fin--defaite'}`} role="dialog" aria-label="Fin de la partie">
              <span className="gm-fin__sur">{fin.abandon ? (fin.gagne ? 'Ton adversaire a quitté la partie' : 'Tu as abandonné') : 'Fin de la partie'}</span>
              <strong className="gm-fin__titre">{fin.gagne ? 'Victoire' : 'Défaite'}</strong>
              <span className="gm-fin__texte">
                {fin.gagne ? `${joueurs[autre].nom} s’effondre en ${etat.tour} tour${etat.tour > 1 ? 's' : ''}.` : `${joueurs[autre].nom} l’emporte avec ${vue.pv[autre]} PV.`}
              </span>
              {messageFin && <span className="gm-fin__message">{messageFin}</span>}
              <div className="gm-fin__boutons">
                {surRejouer && <button type="button" className="gm-bouton gm-bouton--or" onClick={surRejouer}>{ligne ? 'Revanche' : 'Rejouer'}</button>}
                <button type="button" className="gm-bouton" onClick={surQuitter}>Retour</button>
              </div>
            </div>
          )}
        </div>
        {/* le cadre de la grille : quatre coins d’or */}
        <span className="gm-coins" aria-hidden="true"><i /><i /><i /><i /></span>
        </div>
        {/* sous la grille : abandonner (ou quitter, la partie finie), et le son */}
        <div className="gm-outils">
          {fin ? (
            <button type="button" className="gm-outil gm-outil--texte" onClick={surQuitter}>Quitter</button>
          ) : (
            <button type="button" className={`gm-outil gm-outil--texte gm-outil--danger${confirmer ? ' est-confirme' : ''}`}
              onClick={abandonner} title="Abandonner la partie (c’est une défaite)">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 21V4" /><path d="M6 4h11l-2.5 4L17 12H6" /></svg>
              {confirmer ? 'Vraiment abandonner ?' : 'Abandonner'}
            </button>
          )}
          <ReglageSon />
        </div>
      </div>

      <Combattant cote="droite" {...coteDe(moi)} peutDeclencher={monTour} surDeclencher={(k) => agir({ t: 'carte', k })} />
      {activation?.geo && <Attaque key={activation.id} activation={activation} />}
    </section>
  );
}
