// =====================================================================
//  Les fenêtres du duel (anciens <dialog> de jeu-cartes.html, même HTML) :
//  renvoi de main, Méditer, contenu d'un Tombeau, loupe d'une carte, et l'écran de fin.
// =====================================================================
import { useEffect, useRef } from 'react';
import CarteDuel from './CarteDuel.jsx';
import { Codex } from '../ApercuCarte.jsx';
import { CAPACITES, JETS, SEUIL_BASE, DEFENSE_HEROS } from '../../data/regles.js';
import { RARETES, VEINES, RANGS } from '../../data/affichage.js';
import { UNIQUES, coutDe, actionsDe, capsDe, attaqueDe, defenseDe, peutAttaquer } from '../../moteur/index.js';

// Une fenêtre native <dialog> : ouverte pilote showModal / close.
// bloquante : Échap ne la ferme pas (il faut choisir : renvoi de main, Méditer)
export function Fenetre({ ouverte, surFermeture, bloquante = false, className = 'fenetre-jeu', children, ...props }) {
  const d = useRef(null);
  useEffect(() => {
    if (ouverte && !d.current.open) d.current.showModal();
    if (!ouverte && d.current.open) d.current.close();
  }, [ouverte]);
  return (
    <dialog className={className} ref={d} {...props}
      onCancel={(e) => { e.preventDefault(); if (!bloquante) surFermeture?.(); }}
      onClick={(e) => { if (!bloquante && e.target === d.current) surFermeture?.(); }}>
      {ouverte && children}
    </dialog>
  );
}

// Renvoi de main (début de partie) : touche les cartes à renvoyer dans le Grimoire
export function Renvoi({ ouverte, main, premier, choisies, attente, surBasculer, surValider, loupe }) {
  const n = choisies.size;
  return (
    <Fenetre ouverte={ouverte} bloquante id="renvoi" aria-labelledby="renvoi-titre">
      <h2 id="renvoi-titre">Ta main de départ</h2>
      <p className="fenetre-jeu__texte">
        {premier
          ? 'Tu commences : 3 cartes. Touche celles que tu veux renvoyer dans ton Grimoire, tu en repiocheras autant.'
          : 'Ton adversaire commence : tu as 4 cartes. Touche celles que tu veux renvoyer dans ton Grimoire, tu en repiocheras autant.'}
      </p>
      <div className="fenetre-jeu__cartes" id="renvoi-main">
        {main.map((c, i) => (
          <CarteDuel key={i} c={c} index={i} choisie={choisies.has(i)} onClick={() => !attente && surBasculer(i)} {...loupe({ def: c })} />
        ))}
      </div>
      <p className="fenetre-jeu__attente" hidden={!attente}>En attente de ton adversaire…</p>
      <button type="button" className="btn-dc btn-dc--ambre" disabled={attente} onClick={surValider}>
        {n ? `Renvoyer ${n} carte${n > 1 ? 's' : ''}` : 'Garder ma main'}
      </button>
    </Fenetre>
  );
}

// Méditer : les 3 prochaines cartes du Grimoire ; on peut en placer une dessous
export function Meditation({ cartes, surPlacer, loupe }) {
  return (
    <Fenetre ouverte={!!cartes} bloquante id="meditation" aria-labelledby="meditation-titre">
      <h2 id="meditation-titre">Méditer</h2>
      <p className="fenetre-jeu__texte">Les 3 prochaines cartes de ton Grimoire, de la première à la dernière. Touche une carte pour la placer sous ton Grimoire ; les autres gardent leur ordre.</p>
      <div className="fenetre-jeu__cartes" id="meditation-cartes">
        {(cartes ?? []).map((c, i) => (
          <span key={i} className="meditation__carte">
            <CarteDuel c={c} index={i} onClick={() => surPlacer(i)} {...loupe({ def: c })} />
            <small>{i + 1}{i === 0 ? ' · la prochaine' : ''}</small>
          </span>
        ))}
      </div>
      <button type="button" className="btn-dc" onClick={() => surPlacer(null)}>Ne rien changer</button>
    </Fenetre>
  );
}

// Le contenu d'un Tombeau (visible des deux joueurs), de la plus récente à la plus ancienne
export function FenetreTombeau({ titre, cartes, surFermeture, loupe }) {
  return (
    <Fenetre ouverte={!!cartes} surFermeture={surFermeture} className="fenetre-jeu fenetre-jeu--large" id="tombeau" aria-labelledby="tombeau-titre">
      <h2 id="tombeau-titre">{titre}</h2>
      <p className="fenetre-jeu__texte">De la plus récente à la plus ancienne : troupes mortes, sorts joués, cartes brûlées et défaussées.</p>
      <div className="fenetre-jeu__cartes" id="tombeau-cartes">
        {cartes?.length ? [...cartes].reverse().map((c, i) => <CarteDuel key={i} c={c} index={i} {...loupe({ def: c })} />)
          : <p className="vide">Aucune carte au Tombeau pour l&apos;instant.</p>}
      </div>
      <button type="button" className="btn-dc" onClick={surFermeture}>Fermer</button>
    </Fenetre>
  );
}

// ---------------------------------------------------------------------
//  Loupe : une carte en grand, et tout ce qu'elle fait (clic droit ou appui long sur une carte)
//  info : { def, u (l'unité sur le plateau), camp, main (carte de ma main : coût réel) }
// ---------------------------------------------------------------------
function FicheLoupe({ etat, info, nomAdverse }) {
  const { def, u, camp, main } = info;
  const carte = def.carte;   // vraie carte du catalogue (sinon : troupe, sort ou objet du Codex)
  const unite = def.t === 'u';
  const type = def.fx && def.image ? 'Objet de pouvoir' : def.t === 's' ? 'Sort du Codex' : carte ? 'Unité' : 'Troupe du Codex';
  const details = [type];
  if (carte?.rarity) details.push(RARETES[carte.rarity] ?? carte.rarity);
  if (carte?.rank) details.push(`Rang ${RANGS[carte.rank] ?? carte.rank}`);
  const cout = main ? coutDe(etat.camps.joueur, def) : def.c;
  const a = unite ? (u ? attaqueDe(etat, camp, u) : def.a) : 0;
  const d = unite ? (u ? defenseDe(u, etat) : (def.d ?? 0)) : 0;

  const etats = [];
  if (u) {
    if (u.defend) etats.push('En garde : +2 Défense et Riposte jusqu’à son prochain tour');
    else if (u.aAttaque) etats.push('A déjà agi ce tour');
    else if (peutAttaquer(u)) etats.push('Prête à attaquer');
    else if (!u.prete) etats.push("Vient d'arriver : attaquera au prochain tour");
    if (u.bloquee || u.gele) etats.push('Gelée : ne peut ni attaquer ni défendre ce tour');
    if (u.expose) etats.push('Exposée : -2 Défense jusqu’à son prochain tour');
    if (u.bouclier) etats.push('Bouclier prêt : les premiers dégâts seront annulés');
    if (u.h < u.hMax) etats.push(`Blessée (${u.hMax - u.h} PV perdus)`);
  }
  const caps = unite ? capsDe(def).filter((k) => CAPACITES[k]) : [];
  const unique = unite ? UNIQUES[def.unique] : null;
  const besoinHeros = Math.min(20, Math.max(2, SEUIL_BASE + DEFENSE_HEROS - a));
  const degats = { echec: 0, faible: 0, eraflure: Math.min(1, a), normal: a, solide: a + 1, critique: a * 2 };
  const attaques = carte ? [carte.attack_1, carte.attack_2].filter((x) => x?.nom) : [];

  return (
    <>
      {/* en-tête fixe : nom, type, coût, attaque et vie restent en place quand la fiche défile */}
      <div className="loupe__entete">
        <h2 id="loupe-titre" className="loupe__nom">{def.n}</h2>
        <p className="loupe__type">
          {details.join(' · ')}
          {camp && <> · <span className="loupe__camp">{camp === 'joueur' ? 'À toi' : nomAdverse}</span></>}
        </p>
        <dl className="loupe__stats">
          <div className="loupe__ligne"><dt>Coût</dt><dd><b className="loupe__energie">{cout}</b> énergie{cout !== def.c && <> <small>(au lieu de {def.c})</small></>}{actionsDe(def) > 1 ? <> · <b>{actionsDe(def)}</b> actions</> : ' · 1 action'}</dd></div>
          {unite && <>
            <div className="loupe__ligne"><dt>Attaque</dt><dd><b className="loupe__stat loupe__stat--a">{a}</b>{u && a !== def.a && <> <small>(de base : {def.a})</small></>}</dd></div>
            <div className="loupe__ligne"><dt>Défense</dt><dd><b className="loupe__stat loupe__stat--d">{d}</b>{u && d !== (def.d ?? 0) && <> <small>(de base : {def.d ?? 0})</small></>} <small>· pour la toucher : {SEUIL_BASE + d}</small></dd></div>
            <div className="loupe__ligne"><dt>PV</dt><dd><b className="loupe__stat loupe__stat--h">{u ? u.h : def.h}</b>{u && ` / ${u.hMax}`}{u && u.hMax !== def.h && <> <small>(de base : {def.h})</small></>}</dd></div>
          </>}
        </dl>
      </div>
      {etats.length > 0 && <p className="loupe__etat">{etats.join(' · ')}</p>}
      {caps.length > 0 && <>
        <h3 className="loupe__titre">Capacité{caps.length > 1 ? 's' : ''}</h3>
        {caps.map((k) => <p key={k} className="loupe__texte"><b>{CAPACITES[k].nom}</b> : {CAPACITES[k].texte}</p>)}
      </>}
      {unique && <>
        <h3 className="loupe__titre">Capacité unique</h3>
        <p className="loupe__texte"><b>{unique.nom}</b> : {unique.texte}</p>
        {unique.actif && <p className="loupe__texte"><b>{unique.actif.nom}</b> : {unique.actif.texte}</p>}
      </>}
      {unite && def.condition === 'allie' && <p className="loupe__note">Invocation : il faut déjà une de tes unités en jeu pour la poser.</p>}
      {def.t === 's' && def.d && <><h3 className="loupe__titre">Effet</h3><p className="loupe__texte">{def.d}</p></>}
      {unite && <>
        <h3 className="loupe__titre">En attaquant (d20 + {a} contre 8 + Défense)</h3>
        <ul className="loupe__jets">
          {JETS.map((j) => (
            <li key={j.q} className={`jet--${j.q}`}><span>{j.jet}</span><b>{degats[j.q]}</b><small>{j.label} · {j.texte}</small></li>
          ))}
        </ul>
        <p className="loupe__texte">
          Contre un héros (Défense {DEFENSE_HEROS}), elle touche sur <b>{besoinHeros}</b> ou plus au d20.
          {capsDe(def).includes('riposte') && <> Attaquée, elle riposte avec <b>{a}</b> dégât{a > 1 ? 's' : ''}.</>}
        </p>
      </>}
      {attaques.length > 0 && <>
        <h3 className="loupe__titre">Attaques</h3>
        <ul className="loupe__attaques">
          {attaques.map((x, i) => {
            const [veine, icone] = VEINES[x.veine] ?? ['Veine inconnue', '✦'];
            return (
              <li key={i}>
                <span className="loupe__veine" title={veine}>{icone}</span>
                <span><b>{x.nom}</b>{x.puissance != null && <> <em>{x.puissance}</em></>}{x.effet && <small>{x.effet}</small>}<small className="loupe__veine-nom">{veine}</small></span>
              </li>
            );
          })}
        </ul>
        {attaques.length > 1 && <p className="loupe__note">Sur un jet de 15 ou plus, c&apos;est la plus puissante des deux qui est lancée.</p>}
      </>}
      {carte && <Codex carte={carte} />}
    </>
  );
}

export function Loupe({ etat, info, nomAdverse, surFermeture }) {
  const fermer = useRef(null);
  useEffect(() => { if (info) fermer.current?.focus(); }, [info]);
  const { def, u, camp, main } = info ?? {};
  // Sur le plateau : la carte montre ses valeurs du moment
  const visible = info && (u ? { ...def, a: attaqueDe(etat, camp, u), d: defenseDe(u, etat), h: u.h } : def);
  return (
    <Fenetre ouverte={!!info} surFermeture={surFermeture} className="fenetre-jeu loupe" id="loupe" aria-labelledby="loupe-titre">
      {info && <>
        <div className="loupe__carte"><CarteDuel c={visible} cout={main ? coutDe(etat.camps.joueur, def) : def.c} /></div>
        <div className="loupe__fiche"><FicheLoupe etat={etat} info={info} nomAdverse={nomAdverse} /></div>
        <button type="button" className="btn-dc loupe__fermer" ref={fermer} onClick={surFermeture}>Fermer</button>
      </>}
    </Fenetre>
  );
}

// ---------------------------------------------------------------------
//  L'écran de fin : victoire, défaite (ou égalité), statistiques, XP de pass, résultat classé
//  fin : { gagne, egalite, raison, supplement, stats, tour, nomAdverse, pass: { texte, vide }, classe: { texte, gain } }
//  boutons : [{ texte, surClic }] (le premier est mis en avant)
// ---------------------------------------------------------------------
export function Fin({ fin, boutons = [] }) {
  const premier = useRef(null);
  useEffect(() => { if (fin) premier.current?.focus(); }, [fin]);
  if (!fin) return null;
  const { gagne, egalite, stats: s, tour } = fin;
  const sur = egalite ? 'Les deux couronnes tombent' : gagne ? 'La couronne est à toi' : `${fin.nomAdverse} l'emporte`;
  const titre = egalite ? 'Égalité' : gagne ? 'Victoire' : 'Défaite';
  const texte = (fin.raison || (egalite ? `Les deux héros sont tombés en même temps, au tour ${tour}.`
    : gagne ? `Le héros adverse est tombé au tour ${tour}.`
      : `Ton héros est tombé au tour ${tour}. Le destin n'était pas de ton côté.`)) + (fin.supplement ? ` ${fin.supplement}` : '');
  return (
    <div className="fin" id="fin" role="dialog" aria-modal="true" aria-labelledby="fin-titre">
      <div className="fin__cadre">
        <span className="fin__sur">{sur}</span>
        <h2 className={`fin__titre ${gagne ? 'fin__titre--victoire' : 'fin__titre--defaite'}`} id="fin-titre">{titre}</h2>
        <p className="fin__texte">{texte}</p>
        {fin.pass && <a className={`fin__pass${fin.pass.vide ? ' fin__pass--vide' : ''}`} href="#/pass">{fin.pass.texte}</a>}
        {/* Le classé : morceaux de texte, en gras un sur deux (points, cote) */}
        {fin.classe && <p className={`fin__classe${fin.classe.gain ? ' fin__classe--gain' : ''}`}>
          {fin.classe.morceaux.map((t, i) => (i % 2 ? <b key={i}>{t}</b> : t))}
        </p>}
        <dl className="fin__stats">
          {[['Jets de d20', s.jets], ['Critiques', s.critiques], ['Échecs critiques', s.echecs],
            ['Cartes jouées', s.cartes], ['Dégâts infligés', s.degats], ['Jets du Destin', s.destins]].map(([k, v]) => (
            <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
          ))}
        </dl>
        <div className="fin__actions">
          {boutons.map((b, i) => (
            <button key={b.texte} type="button" className={`btn-dc${i === 0 ? ' btn-dc--ambre' : ''}`} ref={i === 0 ? premier : undefined} onClick={b.surClic}>{b.texte}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
