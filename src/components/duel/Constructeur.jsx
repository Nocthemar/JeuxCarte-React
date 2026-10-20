// =====================================================================
//  Le constructeur de deck, « Choisir mes cartes » (ancien htmlConstructeur / majConstructeur de JS/jeu-cartes.js)
//  À gauche le Grimoire (limites, courbe des coûts, cartes choisies), à droite la réserve avec ses
//  filtres (type, rareté, Veine, coût, recherche, tri).
//  Un clic sur une carte de la réserve ajoute un exemplaire (un clic de plus au maximum la retire) ;
//  un clic sur une ligne du Grimoire retire un exemplaire.
// =====================================================================
import { useState } from 'react';
import CarteDuel from './CarteDuel.jsx';
import { RARETES, VEINES } from '../../data/affichage.js';
import { TAILLE_DECK, COPIES_MAX, OBJETS_MAX, TRANSCENDANTES_MAX } from '../../data/regles.js';
import { grimoire, peutAjouter, estObjet, estTranscendante } from '../../moteur/index.js';
import { cleCarte, exemplaires, genreDe, rareteGrimoire, ORDRE_RARETE } from '../../lib/grimoire.js';

const NOMS_RARETE = { base: 'Troupe du Codex', sort: 'Sort du Codex', objet: 'Objet de pouvoir', ...RARETES };
const coutDans = (c, f) => (!f ? true : f === '0-1' ? c.c <= 1 : f === '6+' ? c.c >= 6 : c.c === Number(f));

function Choix({ id, label, valeur, surChoix, options }) {
  return (
    <select id={id} aria-label={label} value={valeur} onChange={(e) => surChoix(e.target.value)}>
      {options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
    </select>
  );
}

// cartes : les cartes choisies ; toutes : la réserve ; connecte : le joueur est connecté
export default function Constructeur({ cartes, toutes, connecte, surBasculer, surRetirer, surVider }) {
  const [filtres, setFiltres] = useState({ texte: '', type: '', rarete: '', veine: '', cout: '', tri: 'cout' });
  const filtrer = (champ) => (v) => setFiltres((f) => ({ ...f, [champ]: v }));

  const complet = grimoire(cartes);
  const nbObjets = cartes.filter(estObjet).length;
  const nbTrans = cartes.filter(estTranscendante).length;
  const nbBase = complet.length - cartes.length;

  // Courbe des coûts : le Grimoire tel qu'il sera joué (cartes de base comprises)
  const tranches = [0, 1, 2, 3, 4, 5, 6, 7];
  const parCout = tranches.map((k) => complet.filter((c) => (k === 7 ? c.c >= 7 : c.c === k)).length);
  const max = Math.max(1, ...parCout);

  // Les cartes choisies, une ligne par carte (coût, nom, exemplaires)
  const uniques = [...new Map(cartes.map((c) => [cleCarte(c), c])).values()]
    .sort((a, b) => a.c - b.c || a.n.localeCompare(b.n, 'fr'));

  // La réserve, filtrée et triée
  const texte = filtres.texte.trim().toLowerCase();
  const rang = (c) => ORDRE_RARETE.indexOf(rareteGrimoire(c));
  const liste = toutes.filter((c) => (!filtres.type || genreDe(c) === filtres.type)
    && (!filtres.rarete || rareteGrimoire(c) === filtres.rarete || (filtres.rarete === 'base' && rareteGrimoire(c) === 'sort'))
    && (!filtres.veine || c.veine === filtres.veine)
    && coutDans(c, filtres.cout)
    && (!texte || c.n.toLowerCase().includes(texte)))
    .sort((a, b) => (filtres.tri === 'nom' ? a.n.localeCompare(b.n, 'fr')
      : filtres.tri === 'rarete' ? rang(b) - rang(a) || a.c - b.c
        : a.c - b.c || rang(b) - rang(a) || a.n.localeCompare(b.n, 'fr')));
  const plein = cartes.length >= TAILLE_DECK;

  return (
    <div className="constructeur">
      <aside className="constructeur__grimoire" aria-label="Ton Grimoire">
        <h3 className="choix-deck__titre">Ton Grimoire <span>{cartes.length} / {TAILLE_DECK}</span></h3>
        <p className="constructeur__limites">
          <span>Objets <b>{nbObjets} / {OBJETS_MAX}</b></span>
          <span>Transcendantes <b>{nbTrans} / {TRANSCENDANTES_MAX}</b></span>
          <span>{nbBase ? `+ ${nbBase} carte${nbBase > 1 ? 's' : ''} de base pour compléter` : 'Grimoire complet'}</span>
        </p>
        <div className="constructeur__courbe" aria-label="Courbe des coûts en énergie">
          {tranches.map((k, i) => (
            <span key={k} className="courbe__col" title={`${parCout[i]} carte${parCout[i] > 1 ? 's' : ''} à ${k === 7 ? '7 et plus' : k} d'énergie`}>
              <b style={{ '--h': `${(parCout[i] / max * 100).toFixed(0)}%` }}>{parCout[i] || ''}</b><small>{k === 7 ? '7+' : k}</small>
            </span>
          ))}
        </div>
        <ol className="constructeur__liste">
          {uniques.length ? uniques.map((c) => (
            <li key={cleCarte(c)} className={`ligne-grimoire rar-${rareteGrimoire(c)}`}>
              <button type="button" title="Retirer un exemplaire" onClick={() => surRetirer(cleCarte(c))}>
                <span className="ligne-grimoire__cout">{c.c}</span>
                <span className="ligne-grimoire__nom">{c.n}</span>
                <span className="ligne-grimoire__nb">×{exemplaires(cartes, c)}</span>
              </button>
            </li>
          )) : <li className="ligne-grimoire ligne-grimoire--vide">Aucune carte choisie : ton Grimoire sera fait de cartes de base.</li>}
        </ol>
        <button type="button" className="btn-dc" onClick={surVider}>Tout retirer</button>
      </aside>
      <div className="constructeur__reserve">
        <div className="constructeur__filtres">
          <input type="search" id="cf-texte" placeholder="Chercher une carte…" aria-label="Chercher une carte"
            value={filtres.texte} onChange={(e) => filtrer('texte')(e.target.value)} />
          <Choix id="cf-type" label="Type" valeur={filtres.type} surChoix={filtrer('type')} options={[['', 'Tous les types'], ['collection', 'Ta collection'], ['troupe', 'Troupes du Codex'], ['sort', 'Sorts du Codex'], ['objet', 'Objets de pouvoir']]} />
          <Choix id="cf-rarete" label="Rareté" valeur={filtres.rarete} surChoix={filtrer('rarete')} options={[['', 'Toutes les raretés'], ...Object.entries(RARETES), ['base', 'Codex (troupes et sorts)'], ['objet', 'Objets']]} />
          <Choix id="cf-veine" label="Veine" valeur={filtres.veine} surChoix={filtrer('veine')} options={[['', 'Toutes les Veines'], ...Object.entries(VEINES).map(([k, [nom, ico]]) => [k, `${ico} ${nom}`])]} />
          <Choix id="cf-cout" label="Coût en énergie" valeur={filtres.cout} surChoix={filtrer('cout')} options={[['', 'Tous les coûts'], ['0-1', '0 ou 1 énergie'], ['2', '2 énergie'], ['3', '3 énergie'], ['4', '4 énergie'], ['5', '5 énergie'], ['6+', '6 et plus']]} />
          <Choix id="cf-tri" label="Trier" valeur={filtres.tri} surChoix={filtrer('tri')} options={[['cout', 'Trier par coût'], ['rarete', 'Trier par rareté'], ['nom', 'Trier par nom']]} />
        </div>
        <p className="choix-deck__aide">
          {liste.length} carte{liste.length > 1 ? 's' : ''}. Un clic ajoute un exemplaire ({COPIES_MAX} au plus, 1 seul d&apos;une Transcendante), un clic de plus au maximum la retire.
        </p>
        <div className="choix-deck__cartes">
          {liste.length ? liste.map((c) => {
            const n = exemplaires(cartes, c);
            const bloquee = !n && (plein || !peutAjouter(cartes, c));
            return (
              <span key={cleCarte(c)} className={`deck-place${bloquee ? ' est-bloquee' : ''}`} title={NOMS_RARETE[rareteGrimoire(c)] ?? ''}
                onClick={() => surBasculer(cleCarte(c))}>
                <CarteDuel c={c} choisie={n > 0} />
                {n > 0 && <span className="deck-place__nb">×{n}</span>}
              </span>
            );
          }) : (
            <p className="choix-deck__vide">
              {connecte || filtres.type !== 'collection' ? 'Aucune carte ne correspond à ces filtres.' : 'Connecte-toi pour voir ta collection.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
