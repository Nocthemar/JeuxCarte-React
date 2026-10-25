// =====================================================================
//  Une carte du catalogue (ancien htmlCarte et htmlInfos de JS/cartes.js, même HTML)
//  - l'illustration, et en bas le cadre d'informations : nom, rang, chiffres du duel (énergie, PV, bouclier), rareté ;
//  - une infobulle avec tout le texte de la carte (lisible même quand la carte est petite) ;
//  - image introuvable : on garde le cadre de la carte avec son nom.
//  Styles : styles/cartes-jeu.css (.carte-jeu) et styles/carte-infos.css (.carte-infos).
// =====================================================================
import { useState } from 'react';
import { RARETES, VEINES, RANGS, rareteDe, attaquesDe } from '../data/affichage.js';
import { urlPublique } from '../lib/chemins.js';
import { uniteDepuisCarte } from '../moteur/index.js';
import { CAPACITES } from '../data/regles.js';
import { modePerformance, niveauAnimationsChoisi } from '../lib/preferences.js';

// La carte suit la souris : elle s'incline en 3D (et, pour une Transcendante, le reflet suit le pointeur).
// Pour la fluidité : la position de la carte est mesurée une seule fois à l'entrée de la souris (une carte
// penchée change de contour, la re-mesurer à chaque mouvement la ferait trembler), et la carte n'est
// mise à jour qu'une fois par image (requestAnimationFrame), directement par son transform.
// Souris seulement ; coupée par les Paramètres du jeu (animations coupées, mode performance), pas par ceux de Windows.
const suivi = new WeakMap();
function entrer(e) {
  if (e.pointerType !== 'mouse' || niveauAnimationsChoisi() === 'coupees' || modePerformance()) return;
  const el = e.currentTarget;
  suivi.set(el, { r: el.getBoundingClientRect(), x: 0.5, y: 0.5, image: 0, reflet: !el.classList.contains('carte-jeu--commune') });
  el.classList.add('est-penchee');
  // un bref éclat de lumière quand la souris arrive sur la carte
  el.classList.remove('eclat-entree'); void el.offsetWidth; el.classList.add('eclat-entree');
}
function suivre(e) {
  const el = e.currentTarget;
  const s = suivi.get(el);
  if (!s || e.buttons) return;
  s.x = Math.min(1, Math.max(0, (e.clientX - s.r.left) / s.r.width));
  s.y = Math.min(1, Math.max(0, (e.clientY - s.r.top) / s.r.height));
  if (s.image) return;
  s.image = requestAnimationFrame(() => {
    s.image = 0;
    el.style.transform = `perspective(700px) rotateX(${((0.5 - s.y) * 30).toFixed(2)}deg) rotateY(${((s.x - 0.5) * 34).toFixed(2)}deg) translateY(-4px) scale(1.03)`;
    el.style.setProperty('--sx', `${((0.5 - s.x) * 16).toFixed(1)}px`);
    el.style.setProperty('--sy', `${(8 + (0.5 - s.y) * 12).toFixed(1)}px`);
    if (s.reflet) {
      el.style.setProperty('--mx', `${(s.x * 100).toFixed(1)}%`);
      el.style.setProperty('--my', `${(s.y * 100).toFixed(1)}%`);
    }
  });
}
function relacher(e) {
  const el = e.currentTarget;
  const s = suivi.get(el);
  if (s?.image) cancelAnimationFrame(s.image);
  suivi.delete(el);
  el.classList.remove('est-penchee');
  el.style.transform = '';
}

// Les mêmes chiffres en coins, pour une carte sans panneau d'informations
function StatsCarte({ carte }) {
  const u = uniteDepuisCarte(carte);
  return (
    <span className="carte-stats" aria-hidden="true">
      <span className="carte-stats__cout" title="Coût d'énergie">{u.c}</span>
      <span className="carte-stats__pv" title="Points de vie">{u.h}</span>
      <span className="carte-stats__bouclier" title="Bouclier (Défense)">{u.d}</span>
    </span>
  );
}

// Le Trait de la carte (« Tenace »), ou sa Veine et la capacité qu'elle donne (« Veine du Sang · Drain »)
function libelleTrait(u) {
  const cap = CAPACITES[u.caps[0]];
  if (!cap) return null;
  return u.veineNom ? `${u.veineNom} · ${cap.nom}` : cap.nom;
}

// Le cadre d'informations du bas de la carte, à la manière d'une carte Pokémon. Seulement pour les
// cartes qui ont un rang ou des attaques, et pour les Transcendantes (illustration pleine carte).
// Le nom sur la plaque : « Elfe des Neiges dorée » s'affiche « Elfe des Neiges » (la base garde le nom complet)
const nomAffiche = (nom) => nom.replace(/\s+dorée$/i, '');
const aUnPanneau = (carte, rarete) => !!carte.rank || attaquesDe(carte).length > 0 || rarete === 'transcendante';
export function CarteInfos({ carte, rarete = rareteDe(carte) }) {
  if (!aUnPanneau(carte, rarete)) return null;
  const rang = RANGS[carte.rank];
  const u = uniteDepuisCarte(carte);
  const sousTitre = libelleTrait(u);
  // Une plaque sombre : la rareté en petit, le nom en grand, le Trait (ou la Veine) en sous-titre, puis les chiffres.
  // Un nom long s'écrit plus petit, sur une ligne, pour laisser la place au Trait.
  const nom = nomAffiche(carte.name);
  return (
    <div className={`carte-infos carte-plaque carte-infos--${rarete}${nom.length > 20 ? ' carte-plaque--long' : ''}`}>
      <span className="carte-plaque__rarete">{RARETES[rarete]}{rang && <> · Rang {rang}</>}</span>
      <span className="carte-plaque__nom">{nom}</span>
      {sousTitre && <span className="carte-plaque__sous">{sousTitre}</span>}
      <span className="carte-plaque__chiffres">
        <span title="Coût d'énergie">Coût <b>{u.c}</b></span>
        <span title="Attaque">Atk <b>{u.a}</b></span>
        <span title="Points de vie">PV <b>{u.h}</b></span>
        <span title="Bouclier (Défense)">Déf <b>{u.d}</b></span>
      </span>
    </div>
  );
}

// Infobulle : tout le texte de la carte
function infobulleDe(carte, rarete) {
  const rang = RANGS[carte.rank];
  const lignes = [`${carte.name}${rang ? ` — Rang ${rang}` : ''} — ${RARETES[rarete]}`];
  const u = uniteDepuisCarte(carte);
  const cap = CAPACITES[u.caps[0]];
  if (cap) lignes.push(`${libelleTrait(u)} : ${cap.texte}`);
  for (const a of attaquesDe(carte)) {
    const puissance = a.puissance != null ? ` (${a.puissance})` : '';
    lignes.push(`${VEINES[a.veine]?.[1] ?? '✦'} ${a.nom}${puissance}${a.effet ? ` : ${a.effet}` : ''}`);
  }
  if (carte.description) lignes.push(carte.description);
  return lignes.join('\n');
}

// Les scintillements des cartes rares : des éclats qui naissent, jaillissent en croix de lumière et
// s'éteignent, chacun à son rythme. Positions tirées une fois pour toutes d'après l'id de la carte.
// Deux profondeurs (près / loin) qui se décalent avec l'inclinaison : effet de relief.
function Scintilles({ id, nombre }) {
  let graine = (Number(String(id).replace(/\D/g, '')) || 7) * 7919 % 2147483647 || 7;
  const hasard = () => { graine = (graine * 16807) % 2147483647; return (graine - 1) / 2147483646; };
  const eclats = Array.from({ length: nombre }, (_, i) => ({
    x: 8 + hasard() * 84, y: 6 + hasard() * 56,
    t: 0.6 + hasard() * 0.9, d: -(hasard() * 7), v: 4.5 + hasard() * 3.5, loin: i % 2,
  }));
  return (
    <span className="scintilles" aria-hidden="true">
      {[0, 1].map((plan) => (
        <span key={plan} className={`scintilles__plan scintilles__plan--${plan ? 'loin' : 'pres'}`}>
          {eclats.filter((e) => e.loin === plan).map((e, k) => (
            <i key={k} style={{ left: `${e.x}%`, top: `${e.y}%`, '--t': e.t, animationDelay: `${e.d}s`, animationDuration: `${e.v}s` }} />
          ))}
        </span>
      ))}
    </span>
  );
}

export default function Carte({ carte }) {
  const [imageCassee, setImageCassee] = useState(false);
  const rarete = rareteDe(carte);
  const avecImage = !!carte.image && !imageCassee;
  return (
    <div className={`carte-jeu carte-jeu--${rarete}${avecImage ? '' : ' carte-jeu--sans-image'}`}
      data-carte={carte.id} title={infobulleDe(carte, rarete)}
      style={avecImage ? { '--image': `url("${urlPublique(carte.image)}")` } : undefined}
      onPointerEnter={avecImage ? entrer : undefined} onPointerMove={avecImage ? suivre : undefined} onPointerLeave={avecImage ? relacher : undefined}>
      {avecImage && (
        <img src={urlPublique(carte.image)} alt="" draggable="false" loading="lazy" onError={() => setImageCassee(true)} />
      )}
      {/* comme avant : le cadre d'informations reste si l'image n'a pas pu se charger */}
      {carte.image && <CarteInfos carte={carte} rarete={rarete} />}
      <span className="carte-jeu__nom">{carte.name}</span>
      {avecImage && !aUnPanneau(carte, rarete) && <StatsCarte carte={carte} />}
      {avecImage && rarete !== 'commune' && <span className="carte-cadre-lumiere" aria-hidden="true" />}
      {avecImage && (rarete === 'transcendante' || rarete === 'legendaire') && <Scintilles id={carte.id} nombre={rarete === 'transcendante' ? 16 : 10} />}
    </div>
  );
}
