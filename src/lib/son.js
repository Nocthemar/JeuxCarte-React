// =====================================================================
//  Duel des Couronnes — sons :
//  - de vrais enregistrements (public/sons, domaine public CC0 : voir sons/LICENCE.txt) pour les dés,
//    les cartes, les armes, les boucliers, les cloches, le feu, la magie… plusieurs variantes de chacun ;
//  - des sons créés par le navigateur (Web Audio) pour le reste (tonnerre, rêve, cœur, cire…), et en
//    renfort de certains enregistrements (fanfare, couronne, soin) ; une ambiance musicale générée.
//  Trois volumes (page Paramètres, et le curseur du duel pour le général) :
//    général (tout), effets (les sons du jeu), musique (l'ambiance). Le bouton « son » coupe tout.
//  Tous les choix sont retenus dans le navigateur.
// =====================================================================
import { urlPublique } from './chemins.js';

const CLE_MUET = 'duel-couronnes-muet';
const CLE_VOLUME = 'duel-couronnes-volume';
const CLE_EFFETS = 'duel-couronnes-volume-effets';
const CLE_MUSIQUE = 'duel-couronnes-volume-musique';
let ctx = null;
let general = null;   // volume général : tous les sons passent par ce gain
let busEffets = null;
let busMusique = null;
let muet = false;
let volume = 0.8;     // de 0 à 1
let volEffets = 1;
let volMusique = 0.4;
const lireNombre = (cle, defaut) => { const v = parseFloat(localStorage.getItem(cle)); return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : defaut; };
try {
  muet = localStorage.getItem(CLE_MUET) === '1';
  volume = lireNombre(CLE_VOLUME, volume);
  volEffets = lireNombre(CLE_EFFETS, volEffets);
  volMusique = lireNombre(CLE_MUSIQUE, volMusique);
} catch { /* stockage indisponible */ }

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    general = ctx.createGain();
    general.gain.value = muet ? 0 : volume;
    general.connect(ctx.destination);
    busEffets = ctx.createGain();
    busEffets.gain.value = volEffets;
    busEffets.connect(general);
    busMusique = ctx.createGain();
    busMusique.gain.value = volMusique;
    busMusique.connect(general);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// Enveloppe : montée rapide puis décroissance exponentielle
function enveloppe(g, t, crete, attaque, duree) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(crete, t + attaque);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attaque + duree);
}

function sortie(volume = 0.6) {
  const g = ctx.createGain();
  g.gain.value = volume;
  g.connect(busEffets);
  return g;
}

let tamponBruit = null;
function bruit() {
  if (!tamponBruit) {
    tamponBruit = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = tamponBruit.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ctx.createBufferSource();
  s.buffer = tamponBruit;
  return s;
}

// Bruit filtré, joué entre t et t + duree
function souffle(t, duree, { type = 'lowpass', freq = 1000, q = 1, crete = 0.5, attaque = 0.005, vers } = {}) {
  const s = bruit();
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (vers) f.frequency.exponentialRampToValueAtTime(vers, t + duree);
  const g = ctx.createGain();
  enveloppe(g, t, crete, attaque, duree);
  s.connect(f).connect(g).connect(sortie());
  s.start(t, Math.random()); s.stop(t + attaque + duree + 0.05);
}

// Note simple
function note(t, freq, duree, { type = 'sine', crete = 0.3, attaque = 0.005, vers } = {}) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (vers) o.frequency.exponentialRampToValueAtTime(vers, t + duree);
  const g = ctx.createGain();
  enveloppe(g, t, crete, attaque, duree);
  o.connect(g).connect(sortie());
  o.start(t); o.stop(t + attaque + duree + 0.05);
}

// Les sons (SND) : chaque entrée reçoit l'heure de départ
export const SND = {
  choc(t)      { souffle(t, 0.18, { freq: 900, crete: 0.7 }); note(t, 110, 0.25, { vers: 45, crete: 0.6 }); },
  acier(t)     { [1870, 2610, 3920].forEach((f, i) => note(t, f, 0.35 - i * 0.07, { type: 'triangle', crete: 0.12 })); souffle(t, 0.05, { type: 'highpass', freq: 4000, crete: 0.3 }); },
  tonnerre(t)  { souffle(t, 1.6, { freq: 380, vers: 90, crete: 0.8, attaque: 0.02 }); souffle(t + 0.12, 0.9, { freq: 220, crete: 0.5 }); },
  feu(t)       { souffle(t, 0.8, { type: 'bandpass', freq: 1400, q: 0.8, crete: 0.35, attaque: 0.05 }); for (let i = 0; i < 6; i++) souffle(t + Math.random() * 0.6, 0.03, { type: 'highpass', freq: 2500, crete: 0.25 }); },
  cloche(t)    { [[660, 0.25], [1328, 0.12], [1990, 0.08], [2640, 0.05]].forEach(([f, c]) => note(t, f, 1.5, { crete: c, attaque: 0.003 })); },
  de(t)        { for (let i = 0; i < 7; i++) souffle(t + i * 0.07 + Math.random() * 0.03, 0.025, { type: 'highpass', freq: 1800 + Math.random() * 1500, crete: 0.35 }); },
  fanfare(t)   { [523, 659, 784, 1047].forEach((f, i) => note(t + i * 0.12, f, i === 3 ? 0.7 : 0.14, { type: 'triangle', crete: 0.22 })); },
  pose(t)      { note(t, 150, 0.22, { vers: 60, crete: 0.5 }); souffle(t, 0.12, { freq: 600, crete: 0.25 }); },
  soin(t)      { note(t, 520, 0.5, { vers: 880, crete: 0.15, attaque: 0.05 }); note(t + 0.05, 780, 0.5, { vers: 1320, crete: 0.08, attaque: 0.05 }); },
  echec(t)     { note(t, 300, 0.5, { type: 'sawtooth', vers: 70, crete: 0.12 }); souffle(t, 0.3, { freq: 500, crete: 0.3 }); },
  pioche(t)    { souffle(t, 0.12, { type: 'bandpass', freq: 3000, q: 2, crete: 0.2, attaque: 0.02 }); },
  clic(t)      { note(t, 880, 0.05, { type: 'square', crete: 0.05 }); },
  // Attaques (une couleur sonore par Veine, JS/jeu-cartes-attaques.js)
  elan(t)      { souffle(t, 0.28, { type: 'bandpass', freq: 600, vers: 2400, q: 1.2, crete: 0.3, attaque: 0.08 }); },
  griffe(t)    { [0, 0.06, 0.12].forEach((d) => souffle(t + d, 0.09, { type: 'bandpass', freq: 3200, vers: 1200, q: 2, crete: 0.4 })); },
  eau(t)       { souffle(t, 0.6, { type: 'lowpass', freq: 1800, vers: 300, crete: 0.45, attaque: 0.02 }); for (let i = 0; i < 5; i++) note(t + i * 0.05, 700 + Math.random() * 900, 0.08, { vers: 300, crete: 0.06 }); },
  sombre(t)    { note(t, 70, 0.9, { type: 'sawtooth', vers: 40, crete: 0.12, attaque: 0.1 }); souffle(t, 0.8, { freq: 300, vers: 80, crete: 0.35, attaque: 0.1 }); },
  magie(t)     { [880, 1175, 1568, 2093].forEach((f, i) => note(t + i * 0.05, f, 0.6, { type: 'sine', crete: 0.07 })); },
  reve(t)      { [1568, 1319, 1047, 784].forEach((f, i) => note(t + i * 0.09, f, 0.7, { type: 'sine', crete: 0.06, attaque: 0.03 })); },
  gluant(t)    { note(t, 180, 0.25, { vers: 60, crete: 0.3 }); souffle(t + 0.05, 0.3, { type: 'lowpass', freq: 500, vers: 150, crete: 0.35 }); },
  chaine(t)    { for (let i = 0; i < 5; i++) [2400, 3600].forEach((f) => note(t + i * 0.055, f + Math.random() * 300, 0.12, { type: 'triangle', crete: 0.06 })); },
  coeur(t)     { [0, 0.22].forEach((d, i) => note(t + d, i ? 55 : 65, 0.18, { vers: 35, crete: 0.6 })); },
  forge(t)     { note(t, 95, 0.3, { vers: 50, crete: 0.6 }); [1200, 2470, 3300].forEach((f) => note(t, f, 0.6, { type: 'triangle', crete: 0.08 })); souffle(t, 0.1, { freq: 2000, crete: 0.4 }); },
  // Le sceau de cire posé sur un contrat : un petit choc mat et un crépitement
  cire(t)      { note(t, 150, 0.16, { vers: 70, crete: 0.45 }); souffle(t, 0.07, { type: 'bandpass', freq: 1600, q: 1.5, crete: 0.3 }); for (let i = 0; i < 4; i++) souffle(t + 0.05 + Math.random() * 0.2, 0.02, { type: 'highpass', freq: 3500, crete: 0.12 }); },
  couronne(t)  { [523, 784, 1047].forEach((f) => note(t, f, 0.9, { type: 'triangle', crete: 0.1 })); souffle(t, 0.4, { type: 'highpass', freq: 3000, crete: 0.15, attaque: 0.05 }); },
};

// Son de chaque sort (SM : effet du sort -> son)
export const SM = {
  unit: 'feu', face: 'tonnerre', heal: 'soin', buff: 'cloche', draw: 'pioche', aoe: 'tonnerre',
  ready: 'acier', rage: 'feu', talisman: 'de', coffre: 'pioche', jeton: 'cloche',   // objets
};

// Les sons enregistrés : nom du jeu -> [fichiers public/sons/<fichier>-1.mp3 … -<n>.mp3, n, volume,
// garder aussi le son créé (vrai : les deux se superposent)]. Les autres noms restent des sons créés.
const ENREGISTRES = {
  de:       ['de', 7, 0.8],
  pose:     ['pose', 4, 0.75],
  pioche:   ['pioche', 4, 0.5],
  elan:     ['elan', 4, 0.45],
  choc:     ['choc', 5, 0.8],
  acier:    ['acier', 8, 0.55],
  forge:    ['forge', 5, 0.6],
  cloche:   ['cloche', 5, 0.4],
  echec:    ['echec', 5, 0.65],
  clic:     ['clic', 5, 0.35],
  chaine:   ['chaine', 3, 0.55],
  griffe:   ['griffe', 5, 0.55],
  feu:      ['feu', 5, 0.55],
  magie:    ['magie', 2, 0.6],
  gluant:   ['gluant', 4, 0.55],
  soin:     ['gemme', 4, 0.45, true],
  couronne: ['cloche', 5, 0.45, true],
  fanfare:  ['cloche', 5, 0.35, true],
};
const tampons = {};   // fichier -> les variantes décodées
let chargement = null;
// Charge tous les enregistrements (environ 300 Ko), une fois, au premier son joué
function chargerEnregistrements() {
  if (chargement) return;
  const fichiers = new Map(Object.values(ENREGISTRES).map(([f, n]) => [f, n]));
  chargement = Promise.all([...fichiers].flatMap(([f, n]) => Array.from({ length: n }, (_, i) => fetch(urlPublique(`sons/${f}-${i + 1}.mp3`))
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
    .then((octets) => ctx.decodeAudioData(octets))
    .then((tampon) => { (tampons[f] ??= []).push(tampon); })
    .catch(() => { /* ce fichier manque : son créé à la place */ }))));
}
// Joue une variante au hasard, un peu plus aiguë ou plus grave et plus ou moins forte : jamais deux
// fois tout à fait le même son. Faux si l'enregistrement n'est pas (encore) chargé.
function jouerEnregistre(fichier, t, vol) {
  const variantes = tampons[fichier];
  if (!variantes?.length) return false;
  const source = ctx.createBufferSource();
  source.buffer = variantes[Math.floor(Math.random() * variantes.length)];
  source.playbackRate.value = 0.94 + Math.random() * 0.12;
  const g = ctx.createGain();
  g.gain.value = vol * (0.85 + Math.random() * 0.15);
  source.connect(g).connect(busEffets);
  source.start(t);
  return true;
}

export function jouerSon(nom, delai = 0) {
  if (muet || volume === 0 || volEffets === 0 || !(SND[nom] || ENREGISTRES[nom])) return;
  try {
    if (!audio()) return;
    chargerEnregistrements();
    const t = ctx.currentTime + delai;
    const [fichier, , vol, couche] = ENREGISTRES[nom] ?? [];
    const enregistre = fichier && jouerEnregistre(fichier, t, vol);
    if (!enregistre || couche) SND[nom]?.(t);
  } catch { /* son indisponible : le jeu continue */ }
}

export const estMuet = () => muet;
export function basculerMuet() {
  muet = !muet;
  try { localStorage.setItem(CLE_MUET, muet ? '1' : '0'); } catch { /* rien */ }
  if (general) general.gain.setTargetAtTime(muet ? 0 : volume, ctx.currentTime, 0.02);
  return muet;
}

// Volume général, de 0 à 1. Monter le volume réactive le son s'il était coupé.
export const lireVolume = () => volume;
export function reglerVolume(v) {
  volume = Math.min(1, Math.max(0, v));
  if (volume > 0 && muet) basculerMuet();
  if (general) general.gain.setTargetAtTime(muet ? 0 : volume, ctx.currentTime, 0.02);
  try { localStorage.setItem(CLE_VOLUME, String(volume)); } catch { /* rien */ }
}

// Volumes des effets et de la musique (page Paramètres)
export const lireVolumes = () => ({ general: volume, effets: volEffets, musique: volMusique });
export function reglerVolumeEffets(v) {
  volEffets = Math.min(1, Math.max(0, v));
  if (busEffets) busEffets.gain.setTargetAtTime(volEffets, ctx.currentTime, 0.02);
  try { localStorage.setItem(CLE_EFFETS, String(volEffets)); } catch { /* rien */ }
}
export function reglerVolumeMusique(v) {
  volMusique = Math.min(1, Math.max(0, v));
  if (busMusique) busMusique.gain.setTargetAtTime(volMusique, ctx.currentTime, 0.05);
  try { localStorage.setItem(CLE_MUSIQUE, String(volMusique)); } catch { /* rien */ }
  if (volMusique > 0) demarrerMusique(); else arreterMusique();
}


// ---------------------------------------------------------------------
//  L'ambiance musicale, générée : une harpe qui égrène lentement les accords d'une ballade médiévale
//  (ré mineur, si bémol, fa, do), sur un fond de cordes très doux et une basse posée à chaque accord,
//  le tout dans une salle de pierre (un écho long). Les notes sont tirées au hasard dans l'accord :
//  la mélodie ne se répète jamais tout à fait. Elle démarre au premier geste du joueur
//  (les navigateurs l'exigent) et suit le volume « musique ».
// ---------------------------------------------------------------------
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
// Les accords (notes MIDI) : la basse, puis les notes que la harpe peut jouer (deux octaves)
const ACCORDS = [
  { basse: 38, notes: [62, 65, 69, 74, 77, 81] },   // ré mineur
  { basse: 34, notes: [62, 65, 70, 74, 77, 82] },   // si bémol
  { basse: 41, notes: [60, 65, 69, 72, 77, 81] },   // fa
  { basse: 36, notes: [60, 64, 67, 72, 76, 79] },   // do
];
const TEMPS = 0.62;          // durée d'une note de harpe (s)
const NOTES_PAR_ACCORD = 12;
let musique = null;

// La salle de pierre : un écho long, fait d'un bruit qui s'éteint
function salle() {
  const duree = 3.2, n = Math.floor(ctx.sampleRate * duree);
  const ir = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2.6;
  }
  const echo = ctx.createConvolver();
  echo.buffer = ir;
  return echo;
}

// Une corde pincée : une attaque nette, puis la note qui s'éteint (deux harmoniques)
function harpe(sortieMusique, t, freq, force) {
  [[freq, 'triangle', 0.09], [freq * 2, 'sine', 0.025]].forEach(([f, type, crete]) => {
    const o = ctx.createOscillator();
    o.type = type; o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(crete * force, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
    o.connect(g).connect(sortieMusique);
    o.start(t); o.stop(t + 2.5);
  });
}

// Une note tenue (les cordes, la basse) : montée lente, tenue, extinction lente
function tenue(sortieMusique, t, freq, duree, crete, type = 'sine') {
  const o = ctx.createOscillator();
  o.type = type; o.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(crete, t + duree * 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duree * 1.15);
  o.connect(g).connect(sortieMusique);
  o.start(t); o.stop(t + duree * 1.2);
}

export function demarrerMusique() {
  if (musique || volMusique === 0 || !audio()) return;
  const t0 = ctx.currentTime + 0.1;
  // fondu d'entrée, filtre doux, puis le son direct et l'écho de la salle
  const fondu = ctx.createGain();
  fondu.gain.setValueAtTime(0.0001, t0);
  fondu.gain.exponentialRampToValueAtTime(0.9, t0 + 3);
  const doux = ctx.createBiquadFilter();
  doux.type = 'lowpass'; doux.frequency.value = 2600; doux.Q.value = 0.4;
  const echo = salle();
  const mouille = ctx.createGain(); mouille.gain.value = 0.55;
  fondu.connect(doux);
  doux.connect(busMusique);
  doux.connect(echo).connect(mouille).connect(busMusique);

  // On prévoit les notes un peu à l'avance (toutes les 250 ms), au temps près
  let prochaine = t0, n = 0, precedente = 2;
  const planifier = () => {
    // (onglet en arrière-plan : le minuteur a pris du retard, on reprend maintenant au lieu de tout rattraper)
    if (prochaine < ctx.currentTime) prochaine = ctx.currentTime + 0.05;
    while (prochaine < ctx.currentTime + 0.6) {
      const accord = ACCORDS[Math.floor(n / NOTES_PAR_ACCORD) % ACCORDS.length];
      const k = n % NOTES_PAR_ACCORD;
      if (k === 0) {
        const duree = TEMPS * NOTES_PAR_ACCORD;
        tenue(fondu, prochaine, hz(accord.basse), duree, 0.07);
        // les cordes : la tierce et la quinte, très bas
        tenue(fondu, prochaine, hz(accord.notes[0] - 12), duree, 0.018, 'triangle');
        tenue(fondu, prochaine, hz(accord.notes[1] - 12), duree, 0.014, 'triangle');
      }
      // la harpe : souvent la note voisine de la précédente, parfois un saut, parfois un silence
      if (k === 0 || Math.random() > 0.22) {
        const pas = Math.random() < 0.7 ? (Math.random() < 0.5 ? -1 : 1) : Math.round((Math.random() - 0.5) * 6);
        precedente = Math.min(accord.notes.length - 1, Math.max(0, precedente + pas));
        const accent = k % 4 === 0 ? 1 : 0.7 + Math.random() * 0.2;
        harpe(fondu, prochaine + (Math.random() - 0.5) * 0.02, hz(accord.notes[precedente]), accent);
      }
      prochaine += TEMPS * (k % 4 === 3 && Math.random() < 0.3 ? 1.5 : 1);   // un léger rubato
      n += 1;
    }
  };
  planifier();
  musique = { fondu, minuteur: setInterval(planifier, 250) };
}

export function arreterMusique() {
  if (!musique) return;
  const { fondu, minuteur } = musique;
  musique = null;
  clearInterval(minuteur);
  const t = ctx.currentTime;
  fondu.gain.cancelScheduledValues(t);
  fondu.gain.setTargetAtTime(0.0001, t, 0.6);
  setTimeout(() => fondu.disconnect(), 4000);
}

// Lance la musique au premier geste du joueur sur la page (clic, touche)
export function musiqueAuPremierGeste() {
  const lancer = () => { demarrerMusique(); removeEventListener('pointerdown', lancer); removeEventListener('keydown', lancer); };
  addEventListener('pointerdown', lancer);
  addEventListener('keydown', lancer);
}
