// =====================================================================
//  La roue des apparences, ouverte en grand (ancien JS/collection-roue.js, même HTML)
//  Quatre catégories : plateaux du Duel, thèmes, titres, bannières (ce que le joueur possède).
//  Les objets de la catégorie sont posés tout autour de la roue ; on la fait tourner (glisser, molette,
//  flèches du clavier ou boutons ‹ ›) : celui qui arrive sous le repère du haut s'affiche au centre,
//  avec « Appliquer » (ou « Retirer » s'il est déjà équipé).
//  Équiper : equip_cosmetic / unequip_cosmetic (thèmes, titres, bannières),
//            equiper_plateau (plateaux ; null = plateau par défaut, l'arène de pierre).
//
//  props : objets ({ plateau, theme, title, banner } : listes chargées par la page),
//          equipes ({ plateau, theme, title, banner } : id équipé de chaque sorte), surEquiper(kind, id), anime
// =====================================================================
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase.js';
import { useNotifier } from '../../lib/notification.js';
import { animationsReduites } from '../../lib/preferences.js';
import { urlPublique } from '../../lib/chemins.js';
import { lienSite } from '../../lib/lienSite.js';

const CATEGORIES = [
  { kind: 'plateau', titre: 'Plateaux', vide: 'Aucun plateau', icone: '▣' },
  { kind: 'theme', titre: 'Thèmes', vide: 'Aucun thème', icone: '◐' },
  { kind: 'title', titre: 'Titres', vide: 'Aucun titre', icone: '❝' },
  { kind: 'banner', titre: 'Bannières', vide: 'Aucune bannière', icone: '⚑' },
];
const LIBELLE = { plateau: 'Plateau de duel', theme: 'Thème', title: 'Titre', banner: 'Bannière' };
const CLE_CATEGORIE = 'collection-roue-categorie';
const couleur = (c) => (/^#[0-9a-f]{3,8}$/i.test(c ?? '') ? c : null);
const mod = (n, m) => ((n % m) + m) % m;

function lireCategorie() {
  try { const c = localStorage.getItem(CLE_CATEGORIE); return CATEGORIES.some((x) => x.kind === c) ? c : 'plateau'; } catch { return 'plateau'; }
}

// Petit aperçu d'un objet (sur la roue et, en grand, au centre)
function Apercu({ o }) {
  if (o.kind === 'plateau') return <img className="apercu-roue apercu-roue--plateau" src={urlPublique(o.image)} alt="" draggable="false" />;
  if (o.kind === 'banner') {
    // (les images des bannières restent sur le site Nocthémar, comme en boutique)
    return o.payload.image
      ? <img className="apercu-roue apercu-roue--banniere" src={lienSite(o.payload.image)} alt="" draggable="false" />
      : <span className="apercu-roue apercu-roue--vide">✦</span>;
  }
  if (o.kind === 'theme') {
    const c1 = couleur(o.payload.accent) ?? '#c9a24a';
    const c2 = couleur(o.payload.accent2) ?? c1;
    return <span className="apercu-roue apercu-roue--theme" style={{ '--c1': c1, '--c2': c2 }} />;
  }
  return <span className="apercu-roue apercu-roue--titre">«{' '}{o.payload.text ?? o.nom}{' '}»</span>;
}

export default function Roue({ objets, equipes, surEquiper, anime }) {
  const notifier = useNotifier();
  const [categorie, setCategorie] = useState(lireCategorie);
  const liste = objets[categorie];
  const pas = 360 / Math.max(1, liste.length);
  const estEquipe = (o) => (o.id ?? null) === (equipes[o.kind] ?? null);
  // La roue s'ouvre sur l'objet équipé ; angle : rotation du disque, en degrés (cumulée : plusieurs tours possibles)
  const angleEquipe = (kind) => -Math.max(0, objets[kind].findIndex((o) => (o.id ?? null) === (equipes[kind] ?? null))) * (360 / Math.max(1, objets[kind].length));
  const [rotation, setRotation] = useState(() => ({ angle: angleEquipe(lireCategorie()), anime: false }));
  const [occupe, setOccupe] = useState(false);
  const roue = useRef(null);
  const glisse = useRef(null);

  const n = Math.max(1, liste.length);
  const i = mod(Math.round(-rotation.angle / pas), n);
  const o = liste[i];

  const tourner = (angle, avecAnimation = true) => setRotation({ angle, anime: avecAnimation });
  // Tourne de k crans (k > 0 : vers la droite, l'objet suivant arrive sous le repère)
  const cran = (k) => { if (liste.length) tourner(Math.round(rotation.angle / pas) * pas - k * pas); };
  // Amène l'objet j sous le repère par le plus court chemin
  const allerA = (j) => tourner(rotation.angle + mod(-j * pas - rotation.angle + 180, 360) - 180);

  const choisirCategorie = (kind) => {
    if (kind === categorie) return;
    setCategorie(kind);
    try { localStorage.setItem(CLE_CATEGORIE, kind); } catch { /* stockage indisponible */ }
    tourner(angleEquipe(kind), false);
  };

  // ---- Appliquer / retirer
  const agir = async (action) => {
    if (occupe || !o) return;
    setOccupe(true);
    let error;
    let id = null;
    if (o.kind === 'plateau') {
      id = action === 'retirer' ? null : o.id;
      ({ error } = await supabase.rpc('equiper_plateau', { p_plateau_id: id }));
    } else if (action === 'retirer') {
      ({ error } = await supabase.rpc('unequip_cosmetic', { p_kind: o.kind }));
    } else {
      id = o.id;
      ({ error } = await supabase.rpc('equip_cosmetic', { p_item_id: o.id }));
    }
    setOccupe(false);
    if (error) { notifier(error.message || 'Impossible pour l\'instant.', 'erreur'); return; }
    surEquiper(o.kind, id);
    notifier(action === 'retirer'
      ? (o.kind === 'plateau' ? 'Retour au plateau par défaut.' : `${LIBELLE[o.kind]} retiré${o.kind === 'banner' ? 'e' : ''}.`)
      : `${o.nom} : appliqué !`);
  };

  // ---- Commandes : clavier, glisser (la roue suit le pointeur autour de son centre), molette
  const surTouche = (e) => {
    if (e.target !== roue.current) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); cran(1); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); cran(-1); }
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      roue.current.querySelector('[data-roue-action]')?.click();
    }
  };
  const angleDe = (e) => {
    const r = roue.current.getBoundingClientRect();
    return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI;
  };
  const appui = (e) => {
    if (e.button !== 0 || e.target.closest('.roue__centre') || !liste.length) return;
    glisse.current = { id: e.pointerId, dernier: angleDe(e), total: 0, cible: e.target.closest('.roue__objet') };
    roue.current.setPointerCapture(e.pointerId);
    setRotation((r) => ({ ...r, anime: false }));
  };
  const bouge = (e) => {
    const g = glisse.current;
    if (!g || e.pointerId !== g.id) return;
    const a = angleDe(e);
    const d = mod(a - g.dernier + 180, 360) - 180;
    g.dernier = a;
    g.total += Math.abs(d);
    setRotation((r) => ({ angle: r.angle + d, anime: false }));
  };
  const lache = (e) => {
    const g = glisse.current;
    if (!g || e.pointerId !== g.id) return;
    glisse.current = null;
    // Simple clic sur un objet : on l'amène sous le repère ; sinon la roue se cale sur le cran le plus proche
    if (g.total < 4 && g.cible) allerA(Number(g.cible.dataset.i));
    else tourner(Math.round(rotation.angle / pas) * pas);
  };
  // Molette : un cran à la fois (écouteur non « passif », pour empêcher la page de défiler)
  const cranRef = useRef(cran);
  useEffect(() => { cranRef.current = cran; });
  useEffect(() => {
    const el = roue.current;
    let derniere = 0;
    const molette = (e) => {
      if (!el.querySelector('.roue__objet')) return;
      e.preventDefault();
      const maintenant = performance.now();
      if (maintenant - derniere < 180) return;
      derniere = maintenant;
      cranRef.current(e.deltaY > 0 || e.deltaX > 0 ? 1 : -1);
    };
    el.addEventListener('wheel', molette, { passive: false });
    el.focus({ preventScroll: true });
    return () => el.removeEventListener('wheel', molette);
  }, []);

  const cat = CATEGORIES.find((c) => c.kind === categorie);
  const equipe = o && estEquipe(o);
  const retirable = equipe && (o.kind !== 'plateau' || o.id);

  return (
    <section id="vue-roue" className={`vue-roue${anime && !animationsReduites() ? ' vue-roue--ouverture' : ''}`} aria-labelledby="roue-titre">
      <h1 className="choix__titre" id="roue-titre">La roue des apparences</h1>
      {/* Une barre de bronze en quatre cases ; un curseur d'or glisse sous la case choisie (--i) */}
      <div className="roue-categories" id="roue-categories" role="tablist" aria-label="Que veux-tu changer ?"
        style={{ '--n': CATEGORIES.length, '--i': CATEGORIES.findIndex((c) => c.kind === categorie) }}>
        <span className="roue-categories__curseur" aria-hidden="true" />
        {CATEGORIES.map((c) => (
          <button key={c.kind} type="button" className="roue-categorie" role="tab" data-categorie={c.kind} aria-selected={c.kind === categorie}
            aria-label={`${c.titre} (${objets[c.kind].length})`} onClick={() => choisirCategorie(c.kind)}>
            <span className="roue-categorie__icone" aria-hidden="true">{c.icone}</span>
            <span className="roue-categorie__nom" aria-hidden="true">{c.titre}</span>
            <span className="roue-categorie__nb" aria-hidden="true">{objets[c.kind].length}</span>
          </button>
        ))}
      </div>
      <div className="roue" id="roue" tabIndex={0} aria-roledescription="roue" aria-describedby="roue-aide" ref={roue}
        onKeyDown={surTouche} onPointerDown={appui} onPointerMove={bouge} onPointerUp={lache} onPointerCancel={lache}>
        <span className="roue__repere" aria-hidden="true" />
        <div className={`roue__disque${!rotation.anime || animationsReduites() ? ' sans-transition' : ''}`} id="roue-disque"
          style={{ '--n': liste.length, '--angle': `${rotation.angle}deg` }}>
          {liste.map((x, j) => (
            <button key={`${x.kind}-${x.id}`} type="button" className={`roue__objet${estEquipe(x) ? ' est-equipe' : ''}${j === i ? ' est-face' : ''}`}
              data-i={j} style={{ '--a': `${(j * pas).toFixed(3)}deg` }} tabIndex={-1} aria-label={`${LIBELLE[x.kind]} : ${x.nom}`}>
              <span className="roue__jeton"><Apercu o={x} /></span>
            </button>
          ))}
        </div>
        <div className="roue__centre" id="roue-centre" aria-live="polite">
          {!o ? (
            <>
              <span className="roue__vide">{cat.vide} pour l&apos;instant.</span>
              <Link className="roue__lien" to="/boutique?echoppe=plateaux">Voir la boutique</Link>
            </>
          ) : (
            <>
              <span className="roue__apercu"><Apercu o={o} /></span>
              <span className="roue__type">{LIBELLE[o.kind]}{liste.length > 1 ? ` · ${i + 1} / ${liste.length}` : ''}</span>
              <strong className="roue__nom">{o.nom}</strong>
              {o.defaut && <small className="roue__note">Gratuit : l’arène de pierre</small>}
              {retirable && <small className="roue__note">Équipé</small>}
              {retirable
                ? <button type="button" className="roue__action roue__action--retirer" data-roue-action="retirer" disabled={occupe} onClick={() => agir('retirer')}>Retirer</button>
                : equipe
                  ? <span className="roue__etat">Équipé</span>
                  : <button type="button" className="roue__action" data-roue-action="appliquer" disabled={occupe} onClick={() => agir('appliquer')}>Appliquer</button>}
            </>
          )}
        </div>
      </div>
      <div className="roue__nav">
        <button type="button" className="roue__fleche" id="roue-prec" aria-label="Tourner vers la gauche" onClick={() => cran(-1)}>‹</button>
        <small className="choix__aide" id="roue-aide">Fais tourner la roue (glisse, molette ou flèches), puis applique</small>
        <button type="button" className="roue__fleche" id="roue-suiv" aria-label="Tourner vers la droite" onClick={() => cran(1)}>›</button>
      </div>
    </section>
  );
}
