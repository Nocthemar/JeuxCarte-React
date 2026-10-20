// =====================================================================
//  Le grimoire ouvert (ancien JS/collection.js, même HTML)
//  - 9 pochettes par page, en double page (une seule page sur téléphone) ; on tourne les pages
//    (boutons, flèches du clavier, ou en s'attardant sur « page suivante » en glissant une carte) ;
//  - rangement libre : glisser une carte vers une pochette (au doigt : appui long), ou la toucher puis
//    toucher la pochette ; enregistré par move_card ; une pochette occupée échange sa carte ;
//  - le deck du profil (5 cartes) : glisser une carte sur un emplacement, ou son étoile ★ ;
//  - doublons : « ×N » sur la pochette, ♻ pour en recycler, « Tout recycler » (recycler_carte, recycler_doublons).
//
//  props : moi (le joueur), cartes (Map id -> { carte, page, slot, quantite }), majCartes(fn),
//          deck (lib/deck.js : useDeck), surLoupe(carte), anime (ouverture animée)
// =====================================================================
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import Carte from '../Carte.jsx';
import Deck from '../Deck.jsx';
import Recyclage from './Recyclage.jsx';
import { valeurCarte, texteGains } from '../../lib/collection.js';
import { supabase } from '../../lib/supabase.js';
import { useNotifier } from '../../lib/notification.js';
import { activerGlisser } from '../../lib/glisser.js';
import { animationsReduites } from '../../lib/preferences.js';

const PAR_PAGE = 9;
const PAGES_MAX = 100;
const DUREE_SURVOL_PAGE = 650;   // ms à survoler « page suivante » en glissant une carte pour tourner la page

// Une seule page visible sur téléphone
const REQUETE_SIMPLE = '(max-width: 800px)';
const abonnerSimple = (rappel) => { const m = matchMedia(REQUETE_SIMPLE); m.addEventListener('change', rappel); return () => m.removeEventListener('change', rappel); };
const useModeSimple = () => useSyncExternalStore(abonnerSimple, () => matchMedia(REQUETE_SIMPLE).matches);

// Toujours au moins une page libre après la dernière utilisée, en nombre pair (doubles pages)
function totalPages(cartes) {
  let derniere = 0;
  for (const { page } of cartes.values()) derniere = Math.max(derniere, page);
  const total = Math.min(PAGES_MAX, Math.max(2, derniere + 1));
  return total + (total % 2);
}

function romain(n) {
  const chiffres = [[100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let s = '';
  for (const [valeur, lettres] of chiffres) {
    while (n >= valeur) { s += lettres; n -= valeur; }
  }
  return s;
}

// Attend la fin d'une animation ou d'une transition (avec un filet de sécurité si elle ne vient jamais)
const attendre = (el, ms) => new Promise((ok) => {
  el?.addEventListener('animationend', ok, { once: true });
  el?.addEventListener('transitionend', ok, { once: true });
  setTimeout(ok, ms);
});

// Une page du grimoire : 9 pochettes
function PageGrimoire({ num, cote, total, cartes, deck, selection }) {
  if (num < 1 || num > total) return <div className={`page page--${cote} page--vierge`} />;
  const index = new Map();
  for (const [id, c] of cartes) if (c.page === num) index.set(c.slot, id);
  return (
    <div className={`page page--${cote}`} data-page={num}>
      <div className="page__grille">
        {Array.from({ length: PAR_PAGE }, (_, k) => {
          const slot = k + 1;
          const id = index.get(slot);
          if (id == null) return <div key={slot} className="pochette" data-page={num} data-slot={slot} />;
          const c = cartes.get(id);
          const auDeck = deck.contient(id);
          return (
            <div key={slot} className={`pochette pochette--pleine${selection === id ? ' pochette--selection' : ''}`} data-page={num} data-slot={slot}>
              <Carte carte={c.carte} />
              {c.quantite > 1 && (
                <>
                  <span className="pochette__nb" title={`${c.quantite} exemplaires`}>×{c.quantite}</span>
                  <button type="button" className="carte-recycler" data-recycler={id} title="Recycler les doublons" aria-label="Recycler les doublons">♻</button>
                </>
              )}
              <button type="button" className={`carte-etoile${auDeck ? ' carte-etoile--active' : ''}`} data-etoile={id}
                aria-pressed={auDeck} title={auDeck ? 'Retirer du deck' : 'Ajouter au deck'}>★</button>
              <button type="button" className="carte-loupe" data-action="loupe" data-loupe={id} title="Voir la carte en grand" aria-label="Voir la carte en grand">🔍</button>
            </div>
          );
        })}
      </div>
      <span className="page__num">{romain(num)}</span>
    </div>
  );
}

export default function VueGrimoire({ moi, cartes, majCartes, deck, surLoupe, anime }) {
  const notifier = useNotifier();
  const simple = useModeSimple();
  const pas = simple ? 1 : 2;
  const total = totalPages(cartes);
  const [pageVoulue, setPageVoulue] = useState(1);   // page affichée (page de gauche en double page)
  const [selection, setSelection] = useState(null);  // id de la carte touchée, en attente d'une pochette
  const [tour, setTour] = useState(null);            // page qui tourne : { sens, cible, phase }
  const [recyclage, setRecyclage] = useState(null);  // id de la carte à recycler
  const [toutRecycler, setToutRecycler] = useState(false);
  const zone = useRef(null);
  const gauche = useRef(null);
  const feuille = useRef(null);

  // La page courante reste valide si le livre rétrécit, et impaire en double page
  let courante = Math.max(1, Math.min(pageVoulue, simple ? total : total - 1));
  if (!simple && courante % 2 === 0) courante -= 1;

  // ---- Tourner les pages
  const tourner = (sens) => {
    const cible = courante + sens * pas;
    if (tour || cible < 1 || cible > total) return;
    if (animationsReduites()) { setPageVoulue(cible); return; }
    setTour({ sens, cible, phase: 'part' });
  };
  // Double page : une feuille (recto = page qui part, verso = page qui arrive) pivote sur le dos
  useLayoutEffect(() => {
    if (!tour || simple || !feuille.current) return undefined;
    let fini = false;
    const el = feuille.current;
    el.getBoundingClientRect();   // force le navigateur à poser l'état de départ
    el.classList.add('feuille--tournee');
    attendre(el, 1100).then(() => {
      if (fini) return;
      setPageVoulue(tour.cible);
      setTour(null);
    });
    return () => { fini = true; };
  }, [tour, simple]);
  // Une seule page : elle pivote sur la reliure, puis la suivante apparaît
  useEffect(() => {
    if (!tour || !simple) return undefined;
    let fini = false;
    attendre(gauche.current, 400).then(() => {
      if (fini) return;
      if (tour.phase === 'part') { setPageVoulue(tour.cible); setTour({ ...tour, phase: 'arrive' }); } else setTour(null);
    });
    return () => { fini = true; };
  }, [tour, simple]);

  // ---- Ranger une carte : tout de suite à l'écran (la pochette occupée échange sa carte), puis move_card
  const deplacer = async (id, page, slot) => {
    const c = cartes.get(id);
    if (!c || (c.page === page && c.slot === slot)) return;
    const depart = { page: c.page, slot: c.slot };
    const occupant = [...cartes.entries()].find(([, o]) => o.page === page && o.slot === slot)?.[0];
    const poser = (a, b) => majCartes((m) => {
      const n = new Map(m);
      n.set(id, { ...n.get(id), ...a });
      if (occupant != null) n.set(occupant, { ...n.get(occupant), ...b });
      return n;
    });
    poser({ page, slot }, depart);
    const { error } = await supabase.rpc('move_card', { p_card_id: id, p_page: page, p_slot: slot });
    if (error) {
      poser(depart, { page, slot });
      notifier(error.message, 'erreur');
    }
  };

  // ---- Les gestes, gardés à jour pour les écouteurs posés une seule fois
  const gestes = useRef(null);
  useEffect(() => {
    gestes.current = {
      tourner,
      deposer: (el, cible) => {
        const id = Number(el.dataset.carte);
        if (cible.matches('.deck-emplacement')) deck.placer(id, Number(cible.dataset.position), cartes.get(id)?.carte);
        else if (cible.matches('.pochette') && el.closest('.pochette')) deplacer(id, Number(cible.dataset.page), Number(cible.dataset.slot));
      },
      clavier: (e) => {
        if (e.target.closest('input, textarea, dialog')) return;
        if (e.key === 'ArrowLeft') tourner(-1);
        if (e.key === 'ArrowRight') tourner(1);
        if (e.key === 'Escape' && selection != null) setSelection(null);
      },
    };
  });
  useEffect(() => {
    const arreter = activerGlisser(zone.current, {
      poignee: '.pochette .carte-jeu, .deck-emplacement .carte-jeu',
      cible: '.pochette, .deck-emplacement',
      deposer: (el, cible) => gestes.current.deposer(el, cible),
    });
    const clavier = (e) => gestes.current.clavier(e);
    document.addEventListener('keydown', clavier);
    // En glissant une carte, s'attarder sur « page suivante / précédente » tourne la page
    let survol = { bouton: null, minuteur: null };
    const bouger = (e) => {
      const bouton = document.body.classList.contains('glisser-actif')
        ? document.elementFromPoint(e.clientX, e.clientY)?.closest('.btn-page:not(:disabled)') ?? null
        : null;
      if (bouton === survol.bouton) return;
      clearInterval(survol.minuteur);
      survol = { bouton, minuteur: null };
      if (bouton) survol.minuteur = setInterval(() => gestes.current.tourner(bouton.id === 'page-suiv' ? 1 : -1), DUREE_SURVOL_PAGE);
    };
    const lacher = () => { clearInterval(survol.minuteur); survol = { bouton: null, minuteur: null }; };
    window.addEventListener('pointermove', bouger);
    window.addEventListener('pointerup', lacher);
    return () => {
      arreter();
      document.removeEventListener('keydown', clavier);
      window.removeEventListener('pointermove', bouger);
      window.removeEventListener('pointerup', lacher);
      lacher();
    };
  }, []);

  // ---- Les clics (une seule écoute pour tout l'écran, comme avant) : loupe, ♻, ★, ranger la carte touchée
  const surClic = (e) => {
    const loupe = e.target.closest('#double [data-loupe]');
    if (loupe) return surLoupe(cartes.get(Number(loupe.dataset.loupe))?.carte);
    const recycler = e.target.closest('[data-recycler]');
    if (recycler) return setRecyclage(Number(recycler.dataset.recycler));
    const etoile = e.target.closest('[data-etoile]');
    if (etoile) {
      const id = Number(etoile.dataset.etoile);
      return deck.basculer(id, cartes.get(id).carte);
    }
    const pochette = e.target.closest('#double .pochette');
    const emplacement = e.target.closest('#deck .deck-emplacement');
    if (selection != null && (pochette || emplacement) && !e.target.closest('[data-action]')) {
      const id = selection;
      setSelection(null);
      if (pochette) deplacer(id, Number(pochette.dataset.page), Number(pochette.dataset.slot));
      else deck.placer(id, Number(emplacement.dataset.position), cartes.get(id).carte);
      return;
    }
    const carte = e.target.closest('#double .pochette .carte-jeu');
    if (carte) setSelection(Number(carte.dataset.carte));
  };

  // ---- Doublons
  let nbDoublons = 0;
  let orDoublons = 0;
  for (const { carte, quantite } of cartes.values()) {
    if (quantite > 1) { nbDoublons += quantite - 1; orDoublons += (quantite - 1) * valeurCarte(carte); }
  }
  const recyclerTout = async () => {
    if (!confirm(`Recycler tous tes doublons ? Tu gardes un exemplaire de chaque carte. (${texteGains(orDoublons, nbDoublons)})`)) return;
    setToutRecycler(true);
    const { data, error } = await supabase.rpc('recycler_doublons');
    setToutRecycler(false);
    if (error) { notifier(error.message || 'Recyclage impossible.', 'erreur'); return; }
    majCartes((m) => new Map([...m].map(([id, c]) => [id, { ...c, quantite: 1 }])));
    notifier(`♻ ${data.exemplaires} doublon${data.exemplaires > 1 ? 's' : ''} recyclé${data.exemplaires > 1 ? 's' : ''} : ${texteGains(data.or, data.exemplaires)}`);
  };

  // ---- Ce qui est affiché pendant qu'une page tourne
  const enDouble = tour && !simple;
  const pageGauche = enDouble && tour.sens < 0 ? tour.cible : courante;
  const pageDroite = enDouble && tour.sens > 0 ? tour.cible + 1 : courante + 1;
  const classeGauche = tour && simple ? (tour.phase === 'part' ? (tour.sens > 0 ? ' tourne-suiv' : ' tourne-prec') : ' page-arrivee') : '';
  const page = (num, cote) => <PageGrimoire num={num} cote={cote} total={total} cartes={cartes} deck={deck} selection={selection} />;
  const c = recyclage != null ? cartes.get(recyclage) : null;

  return (
    <div id="collection" className={anime && !animationsReduites() ? 'collection--ouverture' : ''} ref={zone} onClick={surClic}>
      <p id="collection-vide" className="collection-vide" hidden={cartes.size > 0}>
        Ton grimoire est encore vide. Les cartes s&apos;obtiennent à la boutique, lors d&apos;événements
        ou en récompense ; chaque nouvelle carte se range d&apos;elle-même dans la première pochette libre.
      </p>

      <div className="grimoire" id="grimoire">
        <div className="grimoire__couverture">
          <span className="grimoire__coin grimoire__coin--hg" aria-hidden="true" />
          <span className="grimoire__coin grimoire__coin--hd" aria-hidden="true" />
          <span className="grimoire__coin grimoire__coin--bg" aria-hidden="true" />
          <span className="grimoire__coin grimoire__coin--bd" aria-hidden="true" />
          <span className="grimoire__signet" aria-hidden="true" />
          <h1 className="grimoire__titre" id="grimoire-titre">Grimoire de {moi.username ?? 'l’aventurier'}</h1>

          <div className="grimoire__double" id="double">
            <div className={`grimoire__gauche${classeGauche}`} id="page-gauche" ref={gauche}>{page(pageGauche, 'gauche')}</div>
            <div className="grimoire__droite" id="page-droite">{!simple && page(pageDroite, 'droite')}</div>
            {enDouble && (
              <div className={`feuille feuille--${tour.sens > 0 ? 'suivante' : 'precedente'}`} inert ref={feuille}>
                <div className="feuille__face feuille__recto">{tour.sens > 0 ? page(courante + 1, 'droite') : page(courante, 'gauche')}</div>
                <div className="feuille__face feuille__verso">{tour.sens > 0 ? page(tour.cible, 'gauche') : page(tour.cible + 1, 'droite')}</div>
              </div>
            )}
          </div>
        </div>

        <nav className="grimoire__nav" aria-label="Pages du grimoire">
          <button type="button" className="btn-page" id="page-prec" disabled={courante <= 1} onClick={() => tourner(-1)}>‹ Page précédente</button>
          <span className="grimoire__folio" id="folio" aria-live="polite">
            {simple ? `Folio ${romain(courante)} sur ${romain(total)}` : `Folios ${romain(courante)}–${romain(courante + 1)} sur ${romain(total)}`}
          </span>
          <button type="button" className="btn-page" id="page-suiv" disabled={courante + pas > total} onClick={() => tourner(1)}>Page suivante ›</button>
        </nav>
        {/* Doublons : tout recycler d'un coup */}
        <div className="grimoire__doublons" id="doublons-tout" hidden={nbDoublons === 0}>
          <span className="doublons__medaillon" aria-hidden="true">♻</span>
          <span className="doublons__texte">
            <strong id="doublons-nombre">{nbDoublons} doublon{nbDoublons > 1 ? 's' : ''} à recycler</strong>
            <small id="doublons-gain">{nbDoublons ? texteGains(orDoublons, nbDoublons) : ''}</small>
          </span>
          <button type="button" className="btn-recycler btn-recycler--plein" id="btn-recycler-tout" disabled={toutRecycler} onClick={recyclerTout}>Tout recycler</button>
        </div>

        <p className="grimoire__aide">
          Glisse une carte vers n&apos;importe quelle pochette pour la ranger (sur téléphone : appui long).
          Tu peux aussi toucher une carte, puis la pochette où la poser.
        </p>
      </div>

      {/* Deck du profil : on y glisse des cartes du grimoire */}
      <section className="carte deck">
        {deck.deck && <Deck deck={deck.deck} editable surRetirer={deck.retirer} surRenommer={deck.renommer} surLoupe={surLoupe} />}
        <p className="deck-aide">Glisse une carte du grimoire sur un emplacement, ou touche l&apos;étoile ★ d&apos;une carte. 5 cartes au maximum.</p>
      </section>

      {c && (
        <Recyclage id={recyclage} entree={c} surFermeture={() => setRecyclage(null)}
          surRecycle={(restants) => majCartes((m) => new Map(m).set(recyclage, { ...m.get(recyclage), quantite: restants }))} />
      )}
    </div>
  );
}
