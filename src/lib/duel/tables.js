// =====================================================================
//  Les tables du duel : le plateau sur lequel la partie se joue (Bois, Glace, Automne, Braise).
//  Le joueur la choisit pendant le duel (les losanges en haut de l'écran) ; son choix est retenu dans
//  le navigateur. Rien à voir avec les plateaux achetés en boutique (ils habillent les Gemmes).
//  public/img/Tables duel/<id>.webp (1280 × 720, vue de dessus, cadre compris)
//
//  L'ambiance : un seul canvas plein écran, sous les cartes (poussière dorée, neige, feuilles, braises),
//  et les éclats low poly qui jaillissent d'une carte posée, frappée ou détruite (au-dessus de tout).
//  Coupées avec les animations ; moins nombreuses en effets réduits / mode performance.
// =====================================================================
import { animationsReduites, effetsLegers } from '../preferences.js';
import { urlPublique } from '../chemins.js';

export const TABLES = [
  { id: 'bois', nom: 'Bois', acc: '#e0a24e', amb: 'poussiere' },
  { id: 'glace', nom: 'Glace', acc: '#8fc8ff', amb: 'neige' },
  { id: 'automne', nom: 'Automne', acc: '#ff9a3a', amb: 'feuilles' },
  { id: 'braise', nom: 'Braise', acc: '#ff6a2a', amb: 'braises' },
];
const CLE = 'duel-table';
export const imageTable = (id) => urlPublique(`img/Tables duel/${id}.webp`);
export function lireTable() {
  try { const id = localStorage.getItem(CLE); return TABLES.find((t) => t.id === id) ?? TABLES[0]; } catch { return TABLES[0]; }
}
export function ecrireTable(id) {
  try { localStorage.setItem(CLE, id); } catch { /* stockage indisponible */ }
}

const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const FEUILLES = ['#e8541c', '#f08a22', '#c43a1a', '#f4b030'];

// Les éclats en cours, partagés entre le canvas d'ambiance (qui les dessine) et eclats() (qui les lance)
let eclatsEnCours = [];
let toile = null;   // le canvas des éclats, au-dessus de la page

// Des éclats triangulaires qui jaillissent du centre d'un élément (ou d'un point { x, y }) et retombent
export function eclats(cible, couleurs, n = 16, force = 1) {
  if (!toile || !cible || animationsReduites() || document.hidden) return;
  let x = cible.x; let y = cible.y;
  if (cible.getBoundingClientRect) {
    const r = cible.getBoundingClientRect();
    x = r.left + r.width / 2; y = r.top + r.height / 2;
  }
  if (effetsLegers()) n = Math.ceil(n / 2);
  const t0 = performance.now() / 1000;
  for (let i = 0; i < n; i++) {
    const a = rnd(0, TAU); const v = rnd(120, 420) * force;
    eclatsEnCours.push({
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 160 * force, r: rnd(0, TAU), vr: rnd(-9, 9),
      z: rnd(5, 13) * (0.8 + force * 0.3), c: couleurs[i % couleurs.length], t0, max: rnd(0.55, 0.95),
    });
  }
  if (eclatsEnCours.length > 260) eclatsEnCours.splice(0, eclatsEnCours.length - 260);
}

// Lance l'ambiance sur deux canvas (fond : particules du plateau ; dessus : éclats). Rend arreter().
export function lancerAmbiance(fond, dessus) {
  const cf = fond.getContext('2d'); const cd = dessus.getContext('2d');
  let W = 0; let H = 0; let raf = 0; let last = 0; let amb = 'poussiere'; let A = [];
  toile = dessus;
  const ajuster = () => {
    const d = Math.min(2, devicePixelRatio || 1);
    W = innerWidth; H = innerHeight;
    for (const [cv, c] of [[fond, cf], [dessus, cd]]) { cv.width = W * d >> 0; cv.height = H * d >> 0; c.setTransform(d, 0, 0, d, 0, 0); }
  };
  ajuster();
  addEventListener('resize', ajuster);
  const monte = () => amb === 'braises' || amb === 'poussiere';
  const creer = (partout) => ({ x: rnd(0, W), y: partout ? rnd(0, H) : (monte() ? H + 10 : -10), s: rnd(0.5, 1.6), p: rnd(0, TAU), r: rnd(0, TAU), k: Math.random() });

  function boucle(t) {
    raf = requestAnimationFrame(boucle);
    const dt = Math.min(0.05, (t - last) / 1000 || 0); last = t;
    cf.clearRect(0, 0, W, H);
    if (!animationsReduites()) {
      for (const a of A) {
        a.p += dt;
        if (amb === 'neige') {
          a.y += (22 + a.s * 26) * dt; a.x += Math.sin(a.p * 1.3 + a.k * 6) * 14 * dt;
          cf.globalAlpha = 0.55 + a.k * 0.4; cf.fillStyle = '#fff'; cf.beginPath(); cf.arc(a.x, a.y, a.s * 1.7, 0, TAU); cf.fill();
        } else if (amb === 'feuilles') {
          a.y += (28 + a.s * 22) * dt; a.x += Math.sin(a.p * 1.1 + a.k * 6) * 26 * dt + 8 * dt; a.r += dt * (a.k - 0.5) * 4;
          cf.save(); cf.translate(a.x, a.y); cf.rotate(a.r); cf.scale(1, 0.55 + 0.45 * Math.abs(Math.sin(a.p * 1.4)));
          cf.globalAlpha = 0.85; cf.fillStyle = FEUILLES[(a.k * 4) | 0]; const s = 4 + a.s * 3;
          cf.beginPath(); cf.moveTo(0, -s); cf.lineTo(s * 0.7, 0); cf.lineTo(0, s * 1.1); cf.lineTo(-s * 0.7, 0); cf.fill(); cf.restore();
        } else if (amb === 'braises') {
          a.y -= (20 + a.s * 28) * dt; a.x += Math.sin(a.p * 1.7 + a.k * 6) * 16 * dt;
          cf.globalAlpha = Math.max(0, 0.35 + 0.3 * Math.sin(a.p * 3 + a.k * 9) + 0.3); cf.fillStyle = a.k > 0.5 ? '#ff8a2a' : '#ffd070';
          cf.save(); cf.translate(a.x, a.y); cf.rotate(a.p); const s = 1 + a.s * 1.4; cf.fillRect(-s, -s, s * 2, s * 2); cf.restore();
        } else {
          a.y -= (6 + a.s * 7) * dt; a.x += Math.sin(a.p * 0.7 + a.k * 6) * 7 * dt;
          cf.globalAlpha = 0.12 + 0.22 * Math.abs(Math.sin(a.p * 0.9 + a.k * 9)); cf.fillStyle = '#ffd9a0';
          cf.beginPath(); cf.arc(a.x, a.y, a.s * 1.6, 0, TAU); cf.fill();
        }
        if (a.y < -14 || a.y > H + 14 || a.x < -20 || a.x > W + 20) Object.assign(a, creer(false));
      }
    }
    cf.globalAlpha = 1;
    // Les éclats : rien à dessiner, rien à effacer (le canvas reste vide le plus souvent)
    if (eclatsEnCours.length || dessus.dataset.sale) {
      cd.clearRect(0, 0, W, H);
      dessus.dataset.sale = eclatsEnCours.length ? '1' : '';
      for (let i = eclatsEnCours.length - 1; i >= 0; i--) {
        const s = eclatsEnCours[i]; const k = (t / 1000 - s.t0) / s.max;
        if (k >= 1) { eclatsEnCours.splice(i, 1); continue; }
        s.vy += 900 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.r += s.vr * dt;
        cd.save(); cd.translate(s.x, s.y); cd.rotate(s.r); cd.globalAlpha = 1 - k * k; cd.fillStyle = s.c;
        const z = s.z * (1 - k * 0.35);
        cd.beginPath(); cd.moveTo(0, -z); cd.lineTo(z * 0.9, z * 0.7); cd.lineTo(-z * 0.8, z * 0.6); cd.closePath(); cd.fill();
        cd.strokeStyle = 'rgba(0,0,0,.35)'; cd.lineWidth = 1; cd.stroke(); cd.restore();
      }
      cd.globalAlpha = 1;
    }
  }
  raf = requestAnimationFrame(boucle);
  return {
    // Change l'ambiance (une table) : de nouvelles particules, réparties sur tout l'écran
    regler(table) {
      amb = table.amb;
      const n = animationsReduites() ? 0 : effetsLegers() ? 18 : 46;
      A = Array.from({ length: n }, () => creer(true));
    },
    arreter() {
      cancelAnimationFrame(raf);
      removeEventListener('resize', ajuster);
      if (toile === dessus) toile = null;
      eclatsEnCours = [];
    },
  };
}
