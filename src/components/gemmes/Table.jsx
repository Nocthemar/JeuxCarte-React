// =====================================================================
//  La table des Gemmes : l'adversaire à gauche, la grille au milieu, le joueur à droite.
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
const SON_CARTE = { commune: 'choc', eveillee: 'soin', mythique: 'magie', legendaire: 'tonnerre', transcendante: 'couronne' };
const vueDe = (etat) => ({
  grille: etat.grille.map(({ id, s }) => ({ id, s })),
  pv: etat.joueurs.map((j) => j.pv),
  jauges: etat.joueurs.map((j) => j.cartes.map((c) => c.jauge)),
});
let numero = 0;

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
//  La table
//  combattants : [{ nom, avatar, cartes }] dans l'ordre de jeu ; moi : ma place (0 ou 1)
//  ligne : le salon (contre un ami) ou null (contre l'Ombre, de niveau « difficulte »)
// ---------------------------------------------------------------------
export default function Table({ combattants, graine, moi, ligne = null, difficulte = 'normal', surRejouer, surQuitter }) {
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
  const annoncer = useCallback(async (texte, ms = 950, genre = '') => {
    setBanniere({ texte, genre, id: ++numero });
    await attendre(duree(ms));
    if (vivant.current) setBanniere(null);
  }, []);
  // Les jauges chargées : la carte s'illumine et un « +n » s'envole au-dessus
  const [charges, setCharges] = useState(null);   // { qui, parts: { k: n }, id }
  const charger = useCallback((qui, parts) => {
    const id = ++numero;
    setCharges({ qui, parts, id });
    setTimeout(() => { if (vivant.current) setCharges((c) => (c?.id === id ? null : c)); }, 900);
  }, []);
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
      const g = v.grille.slice();
      [g[action.a], g[action.b]] = [g[action.b], g[action.a]];
      montrer({ ...v, grille: g });
      jouerSon('pose');
      await attendre(duree(230));
      for (const etape of res.etapes) {
        if (!vivant.current) return;
        v = vueRef.current;
        if (etape.rebattue) {
          await annoncer('Plus aucun échange : la grille est rebattue', 1100, 'info');
          montrer({ ...v, grille: etape.grille.map(({ id, s }) => ({ id, s, neuve: true })) });
          await attendre(duree(500));
          continue;
        }
        // les gemmes éclatent : des éclats à leur place, et les jauges des cartes de leur rareté se chargent (pas de dégâts)
        const places = v.grille.map((x, i) => (etape.retirees.includes(x.id) ? i : -1)).filter((i) => i >= 0);
        setEclats(new Set(etape.retirees));
        setEclairs(places.map((i) => ({ id: ++numero, i, sorte: SORTES[v.grille[i].s] })));
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
        await attendre(duree(300));
        if (!vivant.current) return;
        // les gemmes tombent, les nouvelles arrivent d'en haut
        setEclats(new Set());
        setEclairs([]);
        montrer({ ...vueRef.current, grille: etape.grille.map(({ id, s, neuve }) => ({ id, s, neuve, chute: etape.chutes[id] ?? 0 })) });
        await attendre(duree(etape.chaine >= 2 ? 420 : 360));
        if (etape.chaine >= 2) setBanniere(null);
      }
    } else if (action.t === 'carte') {
      const c = res.etat.joueurs[qui].cartes[res.carte.k];
      setActivation({ qui, k: res.carte.k, carte: c, effet: res.carte, id: ++numero });
      jouerSon(SON_CARTE[c.rarete]);
      await attendre(duree(900));
      if (!vivant.current) return;
      v = vueRef.current;
      const pv = v.pv.slice();
      const jauges = v.jauges.map((l) => l.slice());
      pv[cible] = Math.max(0, pv[cible] - res.carte.degats);
      jauges[qui][res.carte.k] = 0;
      flotter(cible, `−${res.carte.degats}`, c.gemme);
      frapper(cible, true);
      jouerSon('choc');
      if (res.carte.soin) {
        pv[qui] = Math.min(res.etat.joueurs[qui].pvMax, pv[qui] + res.carte.soin);
        flotter(qui, `+${res.carte.soin}`, 'soin');
        jouerSon('soin', 0.15);
      }
      if (res.carte.echange) flotter(qui, '+1 échange', 'mythique');
      montrer({ ...v, pv, jauges });
      await attendre(duree(650));
      if (vivant.current) setActivation(null);
    }
    if (!vivant.current) return;
    montrer({ ...vueDe(res.etat), grille: vueRef.current.grille });
    if (res.etat.fin) return;
    if (res.tourFini) {
      const aMoi = res.etat.actif === moi;
      if (aMoi) jouerSon('cloche');
      await annoncer(aMoi ? 'À toi de jouer' : `Au tour de ${res.etat.joueurs[res.etat.actif].nom}`, 950, aMoi ? 'moi' : 'autre');
    }
  }, [annoncer, charger, flotter, frapper, montrer, moi]);

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
      await annoncer(aMoi ? 'Tu commences' : `${etatRef.current.joueurs[etatRef.current.actif].nom} commence`, 1100, aMoi ? 'moi' : 'autre');
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
    const t = setTimeout(() => pousser(etat.actif, choixOmbre(etat, etat.actif, difficulte)), duree(650) + 120);
    return () => clearTimeout(t);
  }, [ligne, occupe, etat, abandonOmbre, moi, difficulte, pousser]);

  // La fin de la partie
  const finir = ligne?.finir;
  useEffect(() => {
    if (!etat.fin) return;
    jouerSon(etat.fin.gagnant === moi ? 'fanfare' : 'sombre');
    finir?.();
  }, [etat.fin, moi, finir]);

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
    else pousser(moi, action);
    return true;
  };
  // Un échange refusé : les deux gemmes font l'aller-retour
  const refuser = async (a, b) => {
    setOccupe(true);
    const v = vueRef.current;
    const g = v.grille.slice();
    [g[a], g[b]] = [g[b], g[a]];
    montrer({ ...v, grille: g });
    await attendre(duree(200));
    jouerSon('echec');
    montrer(v);
    await attendre(duree(220));
    if (vivant.current) setOccupe(false);
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
  // Glisser une gemme vers sa voisine
  const appuyer = (i, e) => { if (monTour) glisse.current = { i, x: e.clientX, y: e.clientY, fait: false }; };
  const bouger = (e) => {
    const g = glisse.current;
    if (!g || g.fait || !grilleEl.current) return;
    const cote = grilleEl.current.clientWidth / TAILLE;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < cote * 0.38) return;
    g.fait = true;
    const r = Math.floor(g.i / TAILLE), c = g.i % TAILLE;
    let j = null;
    if (Math.abs(dx) > Math.abs(dy)) { if (dx > 0 && c < TAILLE - 1) j = g.i + 1; else if (dx < 0 && c > 0) j = g.i - 1; }
    else if (dy > 0 && r < TAILLE - 1) j = g.i + TAILLE; else if (dy < 0 && r > 0) j = g.i - TAILLE;
    if (j !== null) echanger(g.i, j);
  };
  const lacher = () => { setTimeout(() => { glisse.current = null; }, 0); };
  // Les flèches du clavier : la gemme choisie s'échange avec sa voisine
  const clavier = (i, e) => {
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
    else setAbandonOmbre(true);
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
    <section className={`gm-table${secousse ? ' est-secouee' : ''}`} aria-label="Partie de Gemmes">
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
        <div className={`gm-grille${monTour ? ' est-mon-tour' : ''}`} ref={grilleEl} role="grid" aria-label="Grille de gemmes"
          onPointerMove={bouger} onPointerUp={lacher} onPointerLeave={lacher} onPointerCancel={lacher}>
          {vue.grille.map((x, i) => {
            const sorte = SORTES[x.s];
            const classes = ['gm-gemme', `gm-gemme--${sorte}`];
            if (eclats.has(x.id)) classes.push('est-eclatee');
            if (choisie === i) classes.push('est-choisie');
            if (indice && indice.includes(i)) classes.push('est-indice');
            if (x.neuve) classes.push('est-neuve');
            return (
              <button key={x.id} type="button" data-i={i} className={classes.join(' ')}
                style={{ '--x': i % TAILLE, '--y': Math.floor(i / TAILLE), '--chute': x.chute ?? 0 }}
                aria-label={`${sorte}, ligne ${Math.floor(i / TAILLE) + 1}, colonne ${(i % TAILLE) + 1}${choisie === i ? ', choisie' : ''}`}
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
          {banniere && <div key={banniere.id} className={`gm-banniere gm-banniere--${banniere.genre}`} role="status">{banniere.texte}</div>}
          {activation && (
            <div key={activation.id} className={`gm-activation gm-activation--${activation.carte.gemme} gm-activation--${activation.qui === moi ? 'droite' : 'gauche'}`} aria-hidden="true">
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
    </section>
  );
}
