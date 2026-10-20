// =====================================================================
//  Le plateau du duel (ancien rendre() de JS/jeu-cartes-arene.js et <section id="ecran-duel">, même HTML)
//  Il ne fait qu'AFFICHER l'état de la partie : chaque clic est remonté à l'écran Duel (props « sur… »),
//  qui décide quoi faire et demande l'action au moteur.
//  sel : la sélection en cours du joueur { monTour, attaquant, sortIndex, capacite, cibles, defausse }
// =====================================================================
import { useLayoutEffect, useRef } from 'react';
import CarteDuel, { FaceCarte, Capacites, Stats } from './CarteDuel.jsx';
import { animationsReduites } from '../../lib/preferences.js';
import { CAPACITES, ENERGIE_MAX, COUT_DESTIN, COUT_DEFAUSSE, COUT_MEDITER } from '../../data/regles.js';
import {
  peutJouer, peutAttaquer, peutDefendre, peutActiver, capaciteActive, peutDestin, peutDefausser, peutMediter,
  coutDe, actionsDe, capsDe, attaqueDe, defenseDe, trouver, terrainDe,
} from '../../moteur/index.js';

const rarete = (c) => c.carte?.rarity ?? (c.t === 's' ? 'sort' : 'commune');
const memeCible = (c, camp, uid) => c.camp === camp && c.uid === uid;

// Une unité sur le terrain : la face de sa carte, ses statistiques du moment et ses états
function Unite({ etat, u, camp, sel, ...props }) {
  const monTour = sel.monTour && camp === 'joueur';
  const pret = monTour && etat.camps.joueur.actions > 0 && (peutAttaquer(u) || peutDefendre(u) || peutActiver(etat, 'joueur', u.uid));
  const cible = sel.cibles?.some((c) => memeCible(c, camp, u.uid));
  const atk = attaqueDe(etat, camp, u);
  const def = defenseDe(u, etat);
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
  ].filter(Boolean).join(' ');
  const caps = capsDe(u).map((k) => CAPACITES[k]?.nom).filter(Boolean);
  return (
    <button type="button" className={classes} data-uid={u.uid} data-camp={camp} {...props}
      aria-label={`${u.n}, ${atk} attaque, ${def} défense, ${u.h} PV${caps.length ? `, ${caps.join(', ')}` : ''}${etats.length ? `, ${etats.map((e) => e[0]).join(', ')}` : ''}`}>
      <span className="dc-unite__corps">
        <FaceCarte c={u.def} />
        <Capacites c={u} />
        {etats.length > 0 && (
          <span className="dc-etats">{etats.map(([t, k]) => <span key={k} className={`dc-etat dc-etat--${k}`}>{t}</span>)}</span>
        )}
        <Stats a={atk} d={def} h={u.h} aMod={atk !== u.a} dMod={def - u.d} />
      </span>
    </button>
  );
}

// Les 5 places d'un camp : ses unités, et des places vides
function Rangee({ etat, qui, sel, surUnite, loupe }) {
  return (
    <div className="terrain" id={`terrain-${qui}`} aria-label={qui === 'joueur' ? 'Tes troupes' : 'Troupes adverses'}>
      {etat.camps[qui].terrain.map((u, i) => (u
        ? <Unite key={u.uid} etat={etat} u={u} camp={qui} sel={sel} onClick={() => surUnite({ camp: qui, uid: u.uid })} {...loupe({ def: u.def, u, camp: qui })} />
        : <span key={`vide-${i}`} className="dc-place" aria-hidden="true" />))}
    </div>
  );
}

// Les actions du tour : des pastilles (pleines = restantes)
function Actions({ camp }) {
  const max = Math.max(camp.actionsMax || 2, camp.actions);
  return (
    <>
      <span className="actions__titre">Actions</span>
      {Array.from({ length: max }, (_, i) => <i key={i} className={`action-pip${i < camp.actions ? ' action-pip--pleine' : ''}`} />)}
      <span className="actions__texte">{camp.actions} / {camp.actionsMax || 2}</span>
    </>
  );
}

function Energie({ camp }) {
  return (
    <>
      {Array.from({ length: ENERGIE_MAX }, (_, i) => {
        const e = i < camp.energie ? 'plein' : i < camp.energieMax ? 'vide' : 'eteint';
        return <i key={i} className={`cristal cristal--${e}`} />;
      })}
      <span className="energie__texte">{camp.energie} / {camp.energieMax}</span>
    </>
  );
}

const COURONNE = <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8l4 3 5-6 5 6 4-3-2 11H5z" /></svg>;

// Un héros : portrait dans un cadre hexagonal, PV dans une goutte de sang, nom sur un cartouche
function Heros({ camp, qui, avatar, sel, onClick }) {
  const cible = sel.cibles?.some((c) => c.camp === qui && c.heros);
  const pct = Math.max(0, camp.pv) / camp.pvMax * 100;
  return (
    <button type="button" className={`dc-heros${cible ? ' est-ciblable' : ''}${camp.pv <= 5 ? ' est-en-danger' : ''}`} data-heros={qui}
      aria-label={`${camp.nom}, ${camp.pv} PV sur ${camp.pvMax}`} style={{ '--pv': `${pct.toFixed(0)}%` }} onClick={onClick}>
      <span className="dc-heros__cadre"><span className="dc-heros__portrait">{avatar ? <img src={avatar} alt="" /> : COURONNE}</span></span>
      <span className="dc-heros__pv"><span>{Math.max(0, camp.pv)}</span></span>
      <span className="dc-heros__nom">{camp.nom}</span>
    </button>
  );
}

// Le Tombeau, posé sur le tapis : la dernière carte arrivée, face visible, et le nombre de cartes
function Tombeau({ camp, qui, surOuvrir, cible = false, ...props }) {
  const n = camp.tombeau?.length ?? 0;
  const dessus = n ? camp.tombeau[n - 1] : null;
  const ouvrir = () => surOuvrir(qui);
  return (
    <div className={`tombeau tombeau--${qui}${cible ? ' est-cible' : ''}`} id={`tombeau-${qui}`} role="button" tabIndex={0}
      aria-label={qui === 'joueur' ? 'Voir ton Tombeau (glisse une carte dessus pour la défausser)' : "Voir le Tombeau de l'adversaire"}
      title={`Tombeau : ${n} carte${n > 1 ? 's' : ''} (toucher pour voir)`}
      onClick={ouvrir} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ouvrir(); } }} {...props}>
      {dessus && <span className="tombeau__carte"><CarteDuel c={dessus} as="span" /></span>}
      <span className="tombeau__compte" title="Tombeau">
        <svg viewBox="0 0 24 28" aria-hidden="true"><path d="M4 27V10a8 8 0 0 1 16 0v17z" /><path d="M12 8v8M8.5 11h7" /></svg><b>{n}</b>
      </span>
    </div>
  );
}

// Le Grimoire, posé sur la pile peinte du tapis : son nombre de cartes
const Pile = ({ n }) => <b title={`Grimoire : ${n} carte${n > 1 ? 's' : ''} restante${n > 1 ? 's' : ''}`}>{n}</b>;

// L'éventail d'une main : --k = place de la carte par rapport au centre
const eventail = (i, n) => ({ '--k': (i - (n - 1) / 2).toFixed(1) });

// Les cartes qui viennent d'arriver dans une main (pioche) glissent depuis le Grimoire
// (ancien animerPioche) : on compare avec la main affichée juste avant ; les cartes ajoutées à la fin
// sont les nouvelles. Directement sur la page, juste après l'affichage (useLayoutEffect).
function usePioche(main, nAdverse) {
  const avant = useRef(null);
  useLayoutEffect(() => {
    const cles = main.map((c) => c.id ?? c.n);
    const prec = avant.current;
    if (prec && !animationsReduites()) {
      if (cles.length > prec.cles.length && prec.cles.every((k, i) => cles[i] === k)) {
        [...document.getElementById('main-joueur').children].slice(prec.cles.length).forEach((el, i) => {
          el.classList.add('fx-piochee');
          el.style.setProperty('--d', `${i * 110}ms`);
          setTimeout(() => el.classList.remove('fx-piochee'), 700 + i * 110);
        });
      }
      if (nAdverse > prec.nAdverse) {
        [...document.getElementById('main-adverse').children].slice(prec.nAdverse).forEach((el, i) => {
          el.classList.add('fx-piochee');
          el.style.setProperty('--d', `${i * 110}ms`);
        });
      }
    }
    avant.current = { cles, nAdverse };
  }, [main, nAdverse]);
}

const nbCartes = (n) => `${n} carte${n > 1 ? 's' : ''}`;

export default function Plateau({
  etat, sel, avatars, consigne, glisse,
  surCarte, surUnite, surHeros, surFin, surDestin, surDefendre, surCapacite, surDefausser, surMediter,
  surTombeau, surGlisser, surDeposer, loupe, outils, surAbandon,
}) {
  const j = etat.camps.joueur;
  const a = etat.camps.adverse;
  // 2 contre 2 : mon allié (à côté de mon héros) et les deux adversaires (en haut)
  const equipes = !!etat.equipes && !!etat.allie;
  const terrain = terrainDe(etat);
  const choisie = sel.attaquant ? trouver(j, sel.attaquant) : null;
  const act = capaciteActive(choisie);
  const glissable = sel.monTour && peutDefausser(etat, 'joueur');
  usePioche(j.main, a.main.length);

  return (
    <section className="table" id="ecran-duel">
      <div className={`table__plateau${sel.monTour ? ' mon-tour' : ''}${sel.cibles ? ' vise' : ''}`} id="scene-table">

        {/* Haut : la main de l'adversaire en éventail, son héros, son énergie */}
        <div className="tg-haut">
          <div className="main-adverse" id="main-adverse" aria-label="Main de l'adversaire">
            {a.main.map((_, i) => <i key={i} className="dos" style={eventail(i, a.main.length)} />)}
          </div>
          <div className="tg-heros" id="heros-adverse">
            <Heros camp={a} qui="adverse" avatar={avatars.adverse} sel={sel} onClick={() => surHeros({ camp: 'adverse', heros: true })} />
          </div>
          <div className="tg-infos tg-infos--adverse">
            <span className="tg-infos__contenu" id="infos-adverse">
              <span className="energie energie--adverse" title="Énergie de l'adversaire"><Energie camp={a} /></span>
              <span className="actions actions--adverse" title="Actions de l'adversaire ce tour"><Actions camp={a} /></span>
            </span>
            <span className="equipe-duel equipe-duel--adverse" id="equipe-adverse" hidden={!equipes}>
              {equipes && etat.ennemis.map((x, i) => (
                <span key={i} className={`equipe-duel__membre${x.actif ? ' est-actif' : ''}`}><b>{x.nom}</b><small>{x.actif ? 'joue…' : nbCartes(x.cartes)}</small></span>
              ))}
            </span>
          </div>
        </div>

        {/* La table de guerre : bois, tapis brodé ; vue en légère perspective */}
        <div className="tg-table">
          <span className="tg-lumiere" aria-hidden="true" />
          <div className="tg-perspective">
            <div className="tg-bord">
              <div className="tg-tapis">
                <span className="plateau-pile plateau-pile--adverse" id="pioche-adverse"><Pile n={a.deck.length} /></span>
                <Tombeau camp={a} qui="adverse" surOuvrir={surTombeau} />
                <Tombeau camp={j} qui="joueur" surOuvrir={surTombeau} cible={glisse}
                  onDragOver={(e) => { if (glisse) e.preventDefault(); }}
                  onDrop={(e) => { e.preventDefault(); surDeposer(Number(e.dataTransfer.getData('text/plain'))); }} />
                <span className="plateau-pile plateau-pile--joueur" id="pioche-joueur"><Pile n={j.deck.length} /></span>
                <Rangee etat={etat} qui="adverse" sel={sel} surUnite={surUnite} loupe={loupe} />
                <div className="centre">
                  <div className="d20" id="d20" aria-hidden="true">
                    <svg viewBox="0 0 100 100"><polygon points="50,4 93,28 93,72 50,96 7,72 7,28" /><path d="M50 4 50 30 93 28M50 30 7 28M50 30 26 70 74 70 50 30M26 70 7 72M26 70 50 96 74 70 93 72M74 70 93 28M26 70 7 28" /></svg>
                    <span className="d20__face" id="d20-face">20</span>
                  </div>
                  <p className="centre__resultat" id="d20-resultat" aria-live="polite" />
                </div>
                <p className="centre__consigne" aria-live="polite">{consigne}</p>
                <Rangee etat={etat} qui="joueur" sel={sel} surUnite={surUnite} loupe={loupe} />
              </div>
            </div>
          </div>
          {/* Sur le côté de la table : fin du tour et Jet du Destin */}
          <div className="tg-cote">
            <button type="button" className={`btn-fin${sel.monTour && j.actions <= 0 ? ' est-suggere' : ''}`} id="btn-fin" disabled={!sel.monTour} onClick={surFin}>
              Fin du tour <small>Espace</small>
            </button>
            <button type="button" className="btn-destin" id="btn-destin" disabled={!sel.monTour || !peutDestin(etat, 'joueur')} onClick={surDestin}
              title={j.destinUtilise ? 'Déjà lancé ce tour-ci' : `Coûte ${COUT_DESTIN} énergie (sans action), une fois par tour`}>
              <svg viewBox="0 0 100 100" aria-hidden="true"><polygon points="50,4 93,28 93,72 50,96 7,72 7,28" /><path d="M50 30 26 70 74 70z" /></svg>
              <span>Destin <small>2 énergie · D</small></span>
            </button>
            {/* L'unité choisie : se mettre en garde, ou activer sa capacité unique */}
            <div className="tg-cote__petits tg-cote__unite">
              <button type="button" className="btn-action btn-action--garde" id="btn-defendre" onClick={surDefendre}
                disabled={!sel.monTour || !choisie || j.actions < 1 || !peutDefendre(choisie)}
                title={choisie ? `${choisie.n} se met en garde : +2 Défense et Riposte jusqu'à ton prochain tour (1 action, elle n'attaque pas)` : 'Choisis d’abord une de tes unités'}>
                Défendre <small>1 action · G</small>
              </button>
              <button type="button" className={`btn-action btn-action--capacite${sel.capacite ? ' est-actif' : ''}`} id="btn-capacite" hidden={!act}
                disabled={!act || !sel.monTour || !peutActiver(etat, 'joueur', choisie.uid)} title={act?.texte} onClick={surCapacite}>
                {act && <>{act.nom} <small>1 action{act.cout ? ` · ${act.cout} énergie` : ''}</small></>}
              </button>
            </div>
            <div className="tg-cote__petits">
              <button type="button" className={`btn-action${sel.defausse ? ' est-actif' : ''}`} id="btn-defausser" disabled={!sel.monTour || !peutDefausser(etat, 'joueur')} onClick={surDefausser}
                title={j.defausseUtilisee ? 'Déjà défaussé ce tour-ci' : `Défausser une carte de ta main et en piocher une (${COUT_DEFAUSSE} énergie, une fois par tour). Tu peux aussi la glisser sur ton Tombeau.`}>
                Défausser <small>1 énergie</small>
              </button>
              <button type="button" className="btn-action" id="btn-mediter" disabled={!sel.monTour || !peutMediter(etat, 'joueur')} onClick={surMediter}
                title={j.mediterUtilise ? 'Déjà médité ce tour-ci' : `Regarder les 3 premières cartes de ton Grimoire (${COUT_MEDITER} énergie, une fois par tour)`}>
                Méditer <small>1 énergie</small>
              </button>
            </div>
          </div>
        </div>

        {/* Bas : l'orbe d'énergie, ton héros */}
        <div className="tg-bas">
          <div className="tg-energie">
            <div className="orbe" aria-hidden="true"><strong>{j.energie}</strong></div>
            <div className="energie" aria-label="Énergie"><Energie camp={j} /></div>
            <div className="actions" aria-label="Actions du tour" title={`Actions : ${j.actions} sur ${j.actionsMax || 2} ce tour (2 par tour, 3 à partir du tour 5)`}><Actions camp={j} /></div>
          </div>
          <div className="tg-heros" id="heros-joueur">
            <Heros camp={j} qui="joueur" avatar={avatars.joueur} sel={sel} onClick={() => surHeros({ camp: 'joueur', heros: true })} />
          </div>
          <div className={`equipe-duel equipe-duel--allie${equipes && etat.allie.actif ? ' est-actif' : ''}`} id="equipe-allie" hidden={!equipes}>
            {equipes && <><span className="equipe-duel__label">Ton allié</span><b>{etat.allie.nom}</b><small>{etat.allie.actif ? 'joue…' : nbCartes(etat.allie.cartes)}</small></>}
          </div>
          <div className="tg-pile" />
        </div>

        <div className={`main${sel.defausse ? ' en-defausse' : ''}`} id="main-joueur" aria-label="Ta main">
          {j.main.map((c, i) => {
            const manque = sel.monTour && (coutDe(j, c) > j.energie || actionsDe(c) > j.actions);
            return (
              <CarteDuel key={i} c={c} index={i} cout={coutDe(j, c)} choisie={sel.sortIndex === i}
                jouable={sel.monTour && !sel.defausse && peutJouer(etat, 'joueur', i)}
                className={manque ? 'est-trop-chere' : undefined} style={eventail(i, j.main.length)}
                draggable={glissable} onDragStart={(e) => surGlisser(e, i)} onDragEnd={() => surGlisser(null)}
                onClick={(e) => surCarte(i, e.currentTarget)} {...loupe({ def: c, main: true })} />
            );
          })}
        </div>
      </div>

      <aside className="historique">
        <div className="terrain-duel" id="terrain-duel">
          {terrain && <><span className="terrain-duel__nom">{terrain.nom}</span><span className="terrain-duel__texte">{terrain.texte}</span></>}
        </div>
        <h2 className="historique__titre">Derniers jets</h2>
        <ol className="historique__liste" id="historique">
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
