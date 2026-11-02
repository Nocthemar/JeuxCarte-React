// =====================================================================
//  Le plateau du duel : une table vue de dessus (Bois, Glace, Automne, Braise : lib/duel/tables.js)
//  À gauche, chaque camp : sa plaque (portrait, PV, énergie, actions), son Grimoire et son Tombeau ;
//  au centre, les deux rangées de 5 places et la ligne du d20 ; à droite, les commandes du tour ;
//  en haut à droite, le journal (terrain, derniers jets, outils, choix de la table) ; en bas, ta main en
//  éventail : touche une carte pour la jouer, ou glisse-la sur la table (ou sur ton Tombeau pour la défausser).
//  Il ne fait qu'AFFICHER l'état de la partie : chaque geste est remonté à TableDuel (props « sur… »).
//  Les animations (lib/duel/animations.js) retrouvent les éléments par leurs identifiants et classes :
//  #terrain-*, .dc-unite[data-uid], [data-heros], #main-*, #pioche-*, #tombeau-*, #d20, #banniere, #apercu.
//  sel : la sélection en cours du joueur { monTour, attaquant, sortIndex, capacite, cibles, defausse }
//  Styles : styles/duel-tables.css
// =====================================================================
import { createPortal } from 'react-dom';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import CarteDuel, { FaceCarte, Capacites, Stats } from './CarteDuel.jsx';
import { animationsReduites } from '../../lib/preferences.js';
import { TABLES, imageTable, lireTable, ecrireTable, lancerAmbiance } from '../../lib/duel/tables.js';
import { jouerSon } from '../../lib/son.js';
import { urlPublique } from '../../lib/chemins.js';
import { CAPACITES, ENERGIE_MAX, COUT_DESTIN, COUT_DEFAUSSE, COUT_MEDITER } from '../../data/regles.js';
import {
  peutJouer, peutAttaquer, peutDefendre, peutActiver, capaciteActive, peutDestin, peutDefausser, peutMediter,
  coutDe, actionsDe, capsDe, attaqueDe, defenseDe, trouver, terrainDe, ciblesSort,
} from '../../moteur/index.js';

const rarete = (c) => c.carte?.rarity ?? (c.t === 's' ? 'sort' : 'commune');
const memeCible = (c, camp, uid) => c.camp === camp && c.uid === uid;
// Chaque carte posée penche un peu, toujours du même côté (d'après son uid)
const penche = (uid) => `${(([...String(uid)].reduce((h, ch) => h + ch.charCodeAt(0), 0) % 7) - 3) * 0.5}deg`;

// Une unité sur le terrain : la face de sa carte, ses statistiques du moment et ses états
function Unite({ etat, u, camp, sel, ...props }) {
  const monTour = sel.monTour && camp === 'joueur';
  const pret = monTour && etat.camps.joueur.actions > 0 && (peutAttaquer(u) || peutDefendre(u) || peutActiver(etat, 'joueur', u.uid));
  const cible = sel.cibles?.some((c) => memeCible(c, camp, u.uid));
  const atk = attaqueDe(etat, camp, u);
  const def = defenseDe(u, etat);
  // Une vraie carte : son image sert de masque à son ombre et à sa lueur (styles/duel-tables.css)
  const image = u.def.carte?.image ? urlPublique(u.def.carte.image) : null;
  const etats = [
    u.defend ? ['En garde', 'defense'] : null,
    u.bloquee || u.gele ? ['Gelée', 'gelee'] : null,
    u.expose ? ['Exposée', 'exposee'] : null,
    u.bouclier ? ['Bouclier', 'bouclier'] : null,
  ].filter(Boolean);
  const classes = [
    'dc-unite', `rar-${rarete(u.def)}`,
    capsDe(u).includes('garde') || capsDe(u).includes('provocation') ? 'a-garde' : '', pret ? 'est-prete' : '',
    !u.prete || u.aAttaque || u.bloquee ? 'est-epuisee' : '',
    u.defend ? 'a-defense' : '', u.bouclier ? 'a-bouclier' : '', u.bloquee || u.gele ? 'est-gelee' : '',
    sel.attaquant === u.uid ? 'est-choisie' : '', cible ? 'est-ciblable' : '',
    sel.cibles && !cible && camp === 'adverse' ? 'est-hors-cible' : '',
    u.h < u.hMax ? 'est-blessee' : '',
    image ? 'a-image' : '',
  ].filter(Boolean).join(' ');
  const caps = capsDe(u).map((k) => CAPACITES[k]?.nom).filter(Boolean);
  return (
    <button type="button" className={classes} data-uid={u.uid} data-camp={camp} style={{ '--penche': penche(u.uid), ...(image ? { '--masque': `url('${image}')` } : {}) }} {...props}
      aria-label={`${u.n}, ${atk} attaque, ${def} défense, ${u.h} PV${caps.length ? `, ${caps.join(', ')}` : ''}${etats.length ? `, ${etats.map((e) => e[0]).join(', ')}` : ''}`}>
      <span className="dc-unite__corps">
        <FaceCarte c={u.def} />
        <Capacites c={u} />
        {etats.length > 0 && (
          <span className="dc-etats">{etats.map(([t, k]) => <span key={k} className={`dc-etat dc-etat--${k}`}>{t}</span>)}</span>
        )}
        <Stats a={atk} d={def} h={u.h} aMod={atk !== u.a} dMod={def - u.d} imprime={{ a: u.def.a, d: u.def.d ?? 1, h: u.def.h }} />
      </span>
    </button>
  );
}

// Les 5 places d'un camp : ses unités, et des places gravées dans la table
function Rangee({ etat, qui, sel, surUnite, loupe, depot = false }) {
  return (
    <div className={`pt-rangee pt-rangee--${qui}${depot ? ' est-depot' : ''}`} id={`terrain-${qui}`} aria-label={qui === 'joueur' ? 'Tes troupes' : 'Troupes adverses'}>
      {etat.camps[qui].terrain.map((u, i) => (u
        ? <Unite key={u.uid} etat={etat} u={u} camp={qui} sel={sel} onClick={() => surUnite({ camp: qui, uid: u.uid })} {...loupe({ def: u.def, u, camp: qui })} />
        : <span key={`vide-${i}`} className="pt-place" aria-hidden="true" />))}
    </div>
  );
}

// L'énergie (des billes bleues : pleines, dépensées, pas encore gagnées) et les actions du tour (losanges)
function Ressources({ camp }) {
  const max = Math.max(camp.actionsMax || 2, camp.actions);
  return (
    <span className="pt-ressources">
      <span className="pt-energie" title={`Énergie : ${camp.energie} sur ${camp.energieMax}`}>
        {Array.from({ length: ENERGIE_MAX }, (_, i) => (
          <i key={i} className={i < camp.energie ? 'est-pleine' : i < camp.energieMax ? 'est-vide' : 'est-eteinte'} />
        ))}
        <b>{camp.energie}/{camp.energieMax}</b>
      </span>
      <span className="pt-actions" title={`Actions : ${camp.actions} sur ${camp.actionsMax || 2} ce tour (2 par tour, 3 à partir du tour 5)`}>
        {Array.from({ length: max }, (_, i) => <i key={i} className={i < camp.actions ? 'est-pleine' : ''} />)}
        <b>{camp.actions} action{camp.actions > 1 ? 's' : ''}</b>
      </span>
    </span>
  );
}

const COURONNE = <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8l4 3 5-6 5 6 4-3-2 11H5z" /></svg>;

// Un héros : une plaque posée sur la table (portrait, nom, PV, énergie, actions). C'est aussi une cible.
function Plaque({ camp, qui, avatar, sel, onClick }) {
  const cible = sel.cibles?.some((c) => c.camp === qui && c.heros);
  const pct = Math.max(0, camp.pv) / camp.pvMax * 100;
  return (
    <button type="button" className={`pt-plaque pt-plaque--${qui}${cible ? ' est-ciblable' : ''}${camp.pv <= 5 ? ' est-en-danger' : ''}`} data-heros={qui}
      aria-label={`${camp.nom}, ${camp.pv} PV sur ${camp.pvMax}, ${camp.energie} énergie`} style={{ '--pv': `${pct.toFixed(1)}%` }} onClick={onClick}>
      <i className="pt-plaque__halo" aria-hidden="true" />
      <span className="pt-plaque__portrait">{avatar ? <img src={avatar} alt="" draggable="false" /> : COURONNE}</span>
      <span className="pt-plaque__infos">
        <span className="pt-plaque__nom">{camp.nom}</span>
        {/* Les PV : le rouge (ou le vert) descend tout de suite, la traînée claire le rattrape */}
        <span className="pt-pv"><i className="pt-pv__trainee" /><i className="pt-pv__reste" /><b className="pt-pv__chiffre">{Math.max(0, camp.pv)}</b></span>
        <Ressources camp={camp} />
      </span>
    </button>
  );
}

// Le Tombeau : la dernière carte arrivée, face visible, et le nombre de cartes
function Tombeau({ camp, qui, surOuvrir, cible = false }) {
  const n = camp.tombeau?.length ?? 0;
  const dessus = n ? camp.tombeau[n - 1] : null;
  const ouvrir = () => surOuvrir(qui);
  return (
    <div className={`pt-tombeau${cible ? ' est-depot' : ''}`} id={`tombeau-${qui}`} role="button" tabIndex={0}
      aria-label={qui === 'joueur' ? 'Voir ton Tombeau (glisse une carte dessus pour la défausser)' : "Voir le Tombeau de l'adversaire"}
      title={`Tombeau : ${n} carte${n > 1 ? 's' : ''} (toucher pour voir)`}
      onClick={ouvrir} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ouvrir(); } }}>
      {dessus && <span className="pt-tombeau__carte"><CarteDuel c={dessus} as="span" /></span>}
      <span className="pt-compte"><svg viewBox="0 0 24 28" aria-hidden="true"><path d="M4 27V10a8 8 0 0 1 16 0v17z" /><path d="M12 8v8M8.5 11h7" /></svg>{n}</span>
    </div>
  );
}

// Le Grimoire : une pile de dos de cartes, plus ou moins haute, et son nombre de cartes
function Pile({ n, qui }) {
  const couches = Math.max(1, Math.min(7, Math.ceil(n / 3)));
  return (
    <span className="pt-pile" id={`pioche-${qui}`} title={`Grimoire : ${n} carte${n > 1 ? 's' : ''} restante${n > 1 ? 's' : ''}`}>
      {n > 0 && Array.from({ length: couches }, (_, i) => <i key={i} style={{ '--h': i, '--r': `${((i * 7) % 5 - 2) * 0.6}deg` }} />)}
      <b>{n}</b>
    </span>
  );
}

const nbCartes = (n) => `${n} carte${n > 1 ? 's' : ''}`;

// Les cartes qui viennent d'arriver dans une main (pioche) sont distribuées depuis le Grimoire :
// on compare avec la main affichée juste avant ; les cartes ajoutées à la fin sont les nouvelles.
function usePioche(main, nAdverse) {
  const avant = useRef(null);
  useLayoutEffect(() => {
    const cles = main.map((c) => c.id ?? c.n);
    const prec = avant.current;
    // Une carte posée par glisser-déposer garde sa place sur la table le temps de son envol : on la rend à la main
    document.querySelectorAll('#main-joueur > [style*="translate("]').forEach((el) => { el.style.transform = ''; el.classList.remove('est-glissee'); });
    if (prec && !animationsReduites()) {
      if (cles.length > prec.cles.length && prec.cles.every((k, i) => cles[i] === k)) {
        [...document.getElementById('main-joueur').children].slice(prec.cles.length).forEach((el, i) => {
          el.classList.add('fx-donnee');
          el.style.setProperty('--d', `${i * 110}ms`);
          setTimeout(() => el.classList.remove('fx-donnee'), 650 + i * 110);
        });
      }
      if (nAdverse > prec.nAdverse) {
        [...document.getElementById('main-adverse').children].slice(prec.nAdverse).forEach((el, i) => {
          el.classList.add('fx-donnee');
          el.style.setProperty('--d', `${i * 110}ms`);
        });
      }
    }
    avant.current = { cles, nAdverse };
  }, [main, nAdverse]);
}

// Ta main en éventail. Une carte se joue en la touchant, ou en la faisant glisser vers la table
// (au-dessus de la main) ; glissée sur ton Tombeau, elle est défaussée. La loupe (clic droit, appui long)
// reste disponible : ses gestionnaires sont appelés avant ceux du glisser.
function Main({ etat, sel, surCarte, surDeposer, loupe, setDepot }) {
  const j = etat.camps.joueur;
  const zone = useRef(null);
  const geste = useRef(null);
  const n = j.main.length;

  const fin = (g, el) => {
    el.classList.remove('est-glissee');
    setDepot(null);
    geste.current = null;
    // Le « click » qui suit un glisser ne doit pas jouer la carte une deuxième fois
    const bloquer = (c) => { c.stopPropagation(); c.preventDefault(); };
    window.addEventListener('click', bloquer, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', bloquer, { capture: true }), 0);
  };

  const props = (c, i) => {
    const l = loupe({ def: c, main: true });
    return {
      ...l,
      onPointerDown: (e) => {
        l.onPointerDown?.(e);
        if (!sel.monTour || sel.defausse || e.button > 0) return;
        geste.current = { i, x: e.clientX, y: e.clientY, id: e.pointerId, actif: false };
      },
      onPointerMove: (e) => {
        l.onPointerMove?.(e);
        const g = geste.current;
        if (!g || g.id !== e.pointerId) return;
        const el = e.currentTarget;
        const dx = e.clientX - g.x; const dy = e.clientY - g.y;
        if (!g.actif) {
          if (Math.hypot(dx, dy) < 10) return;
          g.actif = true;
          g.jouable = peutJouer(etat, 'joueur', i);
          g.defaussable = peutDefausser(etat, 'joueur');
          el.setPointerCapture(e.pointerId);
          el.classList.add('est-glissee');
        }
        el.style.transform = `translate(${dx}px, ${dy}px) rotate(0deg) scale(1.1)`;
        // la zone visée s'allume : la table (au-dessus de la main) ou le Tombeau
        const r = zone.current.getBoundingClientRect();
        const tombe = document.getElementById('tombeau-joueur')?.getBoundingClientRect();
        const surTombe = tombe && e.clientX >= tombe.left && e.clientX <= tombe.right && e.clientY >= tombe.top && e.clientY <= tombe.bottom;
        setDepot(surTombe ? (g.defaussable ? 'tombeau' : null) : e.clientY < r.top + 10 && g.jouable ? 'table' : null);
        g.surTombe = surTombe; g.surTable = !surTombe && e.clientY < r.top + 10;
      },
      onPointerUp: (e) => {
        l.onPointerUp?.(e);
        const g = geste.current;
        if (!g || g.id !== e.pointerId) return;
        if (!g.actif) { geste.current = null; return; }
        const el = e.currentTarget;
        fin(g, el);
        if (g.surTombe && g.defaussable) { el.style.transform = ''; surDeposer(i); return; }
        if (g.surTable) {
          // Jouée : la carte reste où on l'a lâchée, l'envol vers sa place part de là (usePioche la rend ensuite)
          const carte = j.main[i];
          const attendCible = carte.t === 's' && ciblesSort(etat, 'joueur', carte);
          if (!g.jouable || attendCible) el.style.transform = '';
          else setTimeout(() => { el.style.transform = ''; }, 4000);
          surCarte(i, el);
          return;
        }
        el.style.transform = '';
      },
      onPointerCancel: (e) => {
        l.onPointerCancel?.(e);
        const g = geste.current;
        if (!g || g.id !== e.pointerId) return;
        e.currentTarget.style.transform = '';
        if (g.actif) fin(g, e.currentTarget); else geste.current = null;
      },
    };
  };

  return (
    <div ref={zone} className={`pt-main${sel.defausse ? ' en-defausse' : ''}`} id="main-joueur" aria-label="Ta main" style={{ '--n': n }}>
      {j.main.map((c, i) => {
        const manque = sel.monTour && (coutDe(j, c) > j.energie || actionsDe(c) > j.actions);
        return (
          <CarteDuel key={i} c={c} index={i} cout={coutDe(j, c)} choisie={sel.sortIndex === i}
            jouable={sel.monTour && !sel.defausse && peutJouer(etat, 'joueur', i)}
            className={manque ? 'est-trop-chere' : undefined} style={{ '--k': (i - (n - 1) / 2).toFixed(1) }}
            onClick={(e) => surCarte(i, e.currentTarget)} {...props(c, i)} />
        );
      })}
    </div>
  );
}

// Le fond (la table choisie, en fondu quand on en change) et l'ambiance (canvas sous les cartes, éclats au-dessus)
function Decor({ table }) {
  const [avant, setAvant] = useState(null);
  const courante = useRef(table);
  const fond = useRef(null);
  const dessus = useRef(null);
  const ambiance = useRef(null);
  useEffect(() => {
    ambiance.current = lancerAmbiance(fond.current, dessus.current);
    return () => ambiance.current.arreter();
  }, []);
  useEffect(() => {
    ambiance.current?.regler(table);
    if (courante.current.id === table.id) return undefined;
    setAvant(courante.current);
    courante.current = table;
    const t = setTimeout(() => setAvant(null), 900);
    return () => clearTimeout(t);
  }, [table]);
  return (
    <>
      {avant && <div className="pt-fond" style={{ backgroundImage: `url("${imageTable(avant.id)}")` }} />}
      <div className="pt-fond pt-fond--entree" key={table.id} style={{ backgroundImage: `url("${imageTable(table.id)}")` }} />
      <div className="pt-vignette" />
      <canvas className="pt-ambiance" ref={fond} aria-hidden="true" />
      {createPortal(<canvas className="pt-eclats" ref={dessus} aria-hidden="true" />, document.body)}
    </>
  );
}

export default function Plateau({
  etat, sel, avatars, consigne,
  surCarte, surUnite, surHeros, surFin, surDestin, surDefendre, surCapacite, surDefausser, surMediter,
  surTombeau, surDeposer, loupe, outils, surAbandon,
}) {
  const j = etat.camps.joueur;
  const a = etat.camps.adverse;
  // 2 contre 2 : mon allié (sous ma plaque) et les deux adversaires (sous la leur)
  const equipes = !!etat.equipes && !!etat.allie;
  const terrain = terrainDe(etat);
  const choisie = sel.attaquant ? trouver(j, sel.attaquant) : null;
  const act = capaciteActive(choisie);
  const [table, setTable] = useState(lireTable);
  const [depot, setDepot] = useState(null);   // pendant un glisser : 'table' | 'tombeau' | null
  usePioche(j.main, a.main.length);

  const choisirTable = (t) => {
    if (t.id === table.id) return;
    ecrireTable(t.id);
    setTable(t);
    jouerSon('clic');
  };
  // Plus rien à faire ce tour : « Fin du tour » s'allume
  const rienAFaire = sel.monTour && (j.actions <= 0
    || (!j.main.some((_, i) => peutJouer(etat, 'joueur', i)) && !j.terrain.some((u) => u && (peutAttaquer(u) || peutDefendre(u) || peutActiver(etat, 'joueur', u.uid)))));

  // Mon héros a 5 PV ou moins : les bords de l'écran battent en rouge, comme un cœur
  const enDanger = j.pv > 0 && j.pv <= 5;

  return (
    <section className={`pt pt--${table.id}`} id="ecran-duel" style={{ '--acc': table.acc }}>
      {enDanger && createPortal(<div className="coeur-danger" aria-hidden="true" />, document.body)}
      <Decor table={table} />

      {/* Les dos des cartes de l'adversaire dépassent du haut de l'écran */}
      <div className="pt-main-adverse" id="main-adverse" aria-label={`Main de l'adversaire : ${nbCartes(a.main.length)}`}>
        {a.main.map((_, i) => <i key={i} className="dos" style={{ '--k': (i - (a.main.length - 1) / 2).toFixed(1) }} />)}
      </div>

      <div className={`pt-scene${sel.monTour ? ' mon-tour' : ''}${sel.cibles ? ' vise' : ''}`} id="scene-table">
        <div className="pt-table">
          {/* L'adversaire : sa plaque, puis son Grimoire et son Tombeau */}
          <div className="pt-camp pt-camp--adverse">
            <Plaque camp={a} qui="adverse" avatar={avatars.adverse} sel={sel} onClick={() => surHeros({ camp: 'adverse', heros: true })} />
            <div className="pt-objets">
              <Pile n={a.deck.length} qui="adverse" />
              <Tombeau camp={a} qui="adverse" surOuvrir={surTombeau} />
            </div>
            <span className="equipe-duel equipe-duel--adverse" id="equipe-adverse" hidden={!equipes}>
              {equipes && etat.ennemis.map((x, i) => (
                <span key={i} className={`equipe-duel__membre${x.actif ? ' est-actif' : ''}`}><b>{x.nom}</b><small>{x.actif ? 'joue…' : nbCartes(x.cartes)}</small></span>
              ))}
            </span>
          </div>

          <Rangee etat={etat} qui="adverse" sel={sel} surUnite={surUnite} loupe={loupe} />

          {/* La ligne du milieu : le d20 (pendant un lancer), son résultat, la consigne (conseils) */}
          <div className="pt-milieu">
            <div className="d20" id="d20" aria-hidden="true">
              <svg viewBox="0 0 100 100"><polygon points="50,4 93,28 93,72 50,96 7,72 7,28" /><path d="M50 4 50 30 93 28M50 30 7 28M50 30 26 70 74 70 50 30M26 70 7 72M26 70 50 96 74 70 93 72M74 70 93 28M26 70 7 28" /></svg>
              <span className="d20__face" id="d20-face">20</span>
            </div>
            <p className="centre__resultat" id="d20-resultat" aria-live="polite" />
            <p className="centre__consigne" aria-live="polite">{consigne}</p>
          </div>

          <Rangee etat={etat} qui="joueur" sel={sel} surUnite={surUnite} loupe={loupe} depot={depot === 'table'} />

          {/* Toi : ton Grimoire et ton Tombeau, puis ta plaque */}
          <div className="pt-camp pt-camp--joueur">
            <div className={`equipe-duel equipe-duel--allie${equipes && etat.allie.actif ? ' est-actif' : ''}`} id="equipe-allie" hidden={!equipes}>
              {equipes && <><span className="equipe-duel__label">Ton allié</span><b>{etat.allie.nom}</b><small>{etat.allie.actif ? 'joue…' : nbCartes(etat.allie.cartes)}</small></>}
            </div>
            <div className="pt-objets">
              <Pile n={j.deck.length} qui="joueur" />
              <Tombeau camp={j} qui="joueur" surOuvrir={surTombeau} cible={depot === 'tombeau'} />
            </div>
            <Plaque camp={j} qui="joueur" avatar={avatars.joueur} sel={sel} onClick={() => surHeros({ camp: 'joueur', heros: true })} />
          </div>

          {/* Les commandes du tour */}
          <div className="pt-commandes">
            <button type="button" className={`pt-fin${rienAFaire ? ' est-suggere' : ''}`} id="btn-fin" disabled={!sel.monTour} onClick={surFin}>
              Fin du tour <small>Espace</small>
            </button>
            <button type="button" className="pt-btn pt-btn--destin" id="btn-destin" disabled={!sel.monTour || !peutDestin(etat, 'joueur')} onClick={surDestin}
              title={j.destinUtilise ? 'Déjà lancé ce tour-ci' : `Coûte ${COUT_DESTIN} énergie (sans action), une fois par tour`}>
              <svg viewBox="0 0 100 100" aria-hidden="true"><polygon points="50,4 93,28 93,72 50,96 7,72 7,28" /><path d="M50 30 26 70 74 70z" /></svg>
              <span>Destin <small>{COUT_DESTIN} énergie · D</small></span>
            </button>
            {/* L'unité choisie : se mettre en garde, ou activer sa capacité unique */}
            <div className="pt-commandes__paire">
              <button type="button" className="pt-btn" id="btn-defendre" onClick={surDefendre}
                disabled={!sel.monTour || !choisie || j.actions < 1 || !peutDefendre(choisie)}
                title={choisie ? `${choisie.n} se met en garde : +2 Défense et Riposte jusqu'à ton prochain tour (1 action, elle n'attaque pas)` : 'Choisis d’abord une de tes unités'}>
                Défendre <small>1 action · G</small>
              </button>
              {act && (
                <button type="button" className={`pt-btn pt-btn--capacite${sel.capacite ? ' est-actif' : ''}`} id="btn-capacite"
                  disabled={!sel.monTour || !peutActiver(etat, 'joueur', choisie.uid)} title={act.texte} onClick={surCapacite}>
                  {act.nom} <small>{act.cout ? `${act.cout} énergie` : 'gratuit'} · sans action</small>
                </button>
              )}
            </div>
            <div className="pt-commandes__paire">
              <button type="button" className={`pt-btn${sel.defausse ? ' est-actif' : ''}`} id="btn-defausser" disabled={!sel.monTour || !peutDefausser(etat, 'joueur')} onClick={surDefausser}
                title={j.defausseUtilisee ? 'Déjà défaussé ce tour-ci' : `Défausser une carte de ta main et en piocher une (${COUT_DEFAUSSE} énergie, une fois par tour). Tu peux aussi la glisser sur ton Tombeau.`}>
                Défausser <small>{COUT_DEFAUSSE} énergie</small>
              </button>
              <button type="button" className="pt-btn" id="btn-mediter" disabled={!sel.monTour || !peutMediter(etat, 'joueur')} onClick={surMediter}
                title={j.mediterUtilise ? 'Déjà médité ce tour-ci' : `Regarder les 3 premières cartes de ton Grimoire (${COUT_MEDITER} énergie, une fois par tour)`}>
                Méditer <small>{COUT_MEDITER} énergie</small>
              </button>
            </div>
          </div>
        </div>
      </div>

      <Main etat={etat} sel={sel} surCarte={surCarte} surDeposer={surDeposer} loupe={loupe} setDepot={setDepot} />

      {/* Le journal : la table, le terrain, les derniers jets, les outils */}
      <aside className="pt-journal">
        <div className="pt-tables" role="radiogroup" aria-label="Table">
          {TABLES.map((t) => (
            <button key={t.id} type="button" role="radio" aria-checked={t.id === table.id} className={t.id === table.id ? 'est-choisie' : ''}
              title={`Table : ${t.nom}`} aria-label={t.nom} style={{ '--acc': t.acc }} onClick={() => choisirTable(t)} />
          ))}
          <span>{table.nom}</span>
        </div>
        {terrain && (
          <div className="pt-terrain" title={terrain.texte}>
            <b>{terrain.nom}</b><span>{terrain.texte}</span>
          </div>
        )}
        <ol className="pt-jets" id="historique" aria-label="Derniers jets">
          {etat.jets.length ? etat.jets.map((x, i) => (
            <li key={i} className={`jet jet--${x.q}${x.qui === 'joueur' ? ' jet--moi' : ''}`}>
              <b>{x.de}</b><span>{x.quoi}<small>{x.label}{x.detail ? ` · ${x.detail}` : ''}</small></span>
            </li>
          )) : <li className="jet jet--vide">Aucun jet pour l&apos;instant.</li>}
        </ol>
        {outils(surAbandon)}
      </aside>

      <div className="banniere" id="banniere" aria-live="polite" />
      <div className="apercu" id="apercu" aria-hidden="true" />
    </section>
  );
}
