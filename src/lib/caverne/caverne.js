// =====================================================================
//  La Caverne aux Trésors : le dessin et l'animation des trois jeux (le script d'origine, casino.txt),
//  branchés sur le serveur (supabase/caverne.sql) au lieu d'un solde gardé dans le navigateur :
//  chaque mise, chaque bourse ouverte, chaque pas sur le pont est demandé au serveur, qui répond
//  avec le résultat et la nouvelle bourse. Ici, on ne fait que le montrer.
//
//  const demonter = monterCaverne(racine, { serveur, notifier, bourse: { or, cristaux } });
//   racine : l'élément .caverne de pages/Caverne.jsx (son HTML y est déjà) ;
//   serveur : commencer(jeu, monnaie, mise, option), voir(), ouvrir(i), avancer(n), tirer(), agir(action),
//             encaisser() -> promesses ;
//   demonter() : arrête tout en quittant l'écran.
// =====================================================================
import { urlPublique } from '../chemins.js';
import { estMuet, basculerMuet, lireVolumes } from '../son.js';
import {
  MONNAIES, PLAFOND, CROISSANCE, multDragon, NB_BOURSES, MAUDITES, multBourses, NB_PLANCHES, RISQUES, MULT_PONT, LAC, LICHE,
} from './regles.js';

const IMAGES = {
  crystal: 'img/Caverne/cristal-maudit.png', coin: 'img/Caverne/piece.png', gem: MONNAIES.cristaux.image,
  s1: 'img/Caverne/tas-1.png', s2: 'img/Caverne/tas-2.png', s3: 'img/Caverne/tas-3.png', bag: 'img/Caverne/bourse.png',
};

export function monterCaverne(racine, { serveur, notifier, bourse }) {
  // ================= COMMUN =================
  const SRC = Object.fromEntries(Object.entries(IMAGES).map(([k, c]) => [k, urlPublique(c)]));
  const imgs = {}; Object.keys(SRC).forEach(k => { const i = new Image(); i.src = SRC[k]; imgs[k] = i; });
  racine.querySelectorAll('img[data-k]').forEach(i => { i.src = SRC[i.dataset.k]; });
  const $ = id => racine.querySelector('#' + id);
  const TAU = Math.PI*2;
  const rnd = (a, b) => a + Math.random()*(b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmt = n => Math.round(n).toLocaleString('fr-FR');
  const gain = (mise, m) => fmt(Math.floor(mise*m + 1e-9));   // ce que paierait le serveur (arrondi en dessous)
  const ready = k => imgs[k] && imgs[k].naturalWidth > 0;

  // En quittant l'écran : plus rien ne doit bouger (minuteurs, réponses du serveur qui arrivent après)
  let demonte = false, raf = 0;
  const minuteurs = new Set();
  const plusTard = (f, ms) => { const t = setTimeout(() => { minuteurs.delete(t); if (!demonte) f(); }, ms); minuteurs.add(t); };
  // Une demande au serveur : le résultat, ou null (message affiché) si elle échoue
  async function appel(promesse) {
    try { const r = await promesse; return demonte ? null : r; }
    catch (e) { if (!demonte) notifier(e.message || 'La caverne ne répond pas : réessaie.', 'erreur'); return null; }
  }

  // ---- les deux bourses : l'or et les cristaux ; on mise l'une ou l'autre ----
  const solde = { or: bourse.or ?? 0, cristaux: bourse.cristaux ?? 0 }, disp = { ...solde };
  let monnaie = 'or', tNow = 0, active = 0;
  const BETS = { or: MONNAIES.or.mise, cristaux: MONNAIES.cristaux.mise };
  let BET = BETS.or;
  const M = () => MONNAIES[monnaie];
  const balance = () => solde[monnaie];
  const icone = () => (monnaie === 'or' ? 'coin' : 'gem');
  const unite = () => M().nom;
  function setBourse(b) { if (!b) return; solde.or = b.or; solde.cristaux = b.cristaux; syncBalance(); }
  function annoncerReglee(r) {
    if (!r) return;
    notifier(r.gain > 0 ? `Ta partie laissée en plan est réglée : ${fmt(r.gain)} ${MONNAIES[r.monnaie].nom} récupérés.` : 'Ta partie laissée en plan est réglée : la mise était perdue.');
  }

  // ---- son (le bouton du jeu coupe tout ; le volume des effets s'applique) ----
  let AC = null, NB = null;
  const vol = v => { const { general, effets } = lireVolumes(); return v*general*effets; };
  const ac = () => { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* pas de son */ } } if (AC && AC.state === 'suspended') AC.resume(); return AC; };
  function noise(dur, type, f0, f1, v, when) {
    if (estMuet()) return; const a = ac(); if (!a) return;
    if (!NB) { NB = a.createBuffer(1, a.sampleRate, a.sampleRate); const d = NB.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random()*2 - 1; }
    const t = a.currentTime + (when || 0), s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    s.buffer = NB; s.loop = true; f.type = type; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(Math.max(.0002, vol(v)), t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(a.destination); s.start(t); s.stop(t + dur + .05);
  }
  function tone(f0, f1, dur, type, v, when) {
    if (estMuet()) return; const a = ac(); if (!a) return;
    const t = a.currentTime + (when || 0), o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(Math.max(.0002, vol(v || .08)), t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + .02);
  }
  const sCoins = n => { for (let i = 0; i < n; i++) tone(1500 + Math.random()*900, 2400, .12, 'square', .03, i*.045); };
  const sPing = f => { tone(f, f, .6, 'triangle', .09); tone(f*1.5, f*1.5, .7, 'sine', .05, .06); tone(f*2, f*2, .8, 'sine', .035, .12); };
  const sBoom = () => { noise(.9, 'highpass', 5000, 700, .45); noise(.5, 'lowpass', 900, 80, .5); tone(80, 30, .9, 'sawtooth', .18); };
  const sonTexte = () => { $('snd').textContent = estMuet() ? 'SON : NON' : 'SON : OUI'; };
  $('snd').onclick = () => { basculerMuet(); sonTexte(); };
  sonTexte();

  // ---- fond de caverne + poussières ----
  const bg = $('bg'), bctx = bg.getContext('2d'); let bgc = document.createElement('canvas'), BW = 0, BH = 0;
  function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function caveTexture(w, h, dpr, pal, seed) {
    const c = document.createElement('canvas'); c.width = w*dpr; c.height = h*dpr; const b = c.getContext('2d'); b.setTransform(dpr,0,0,dpr,0,0);
    const r = mulberry(seed);
    let g = b.createLinearGradient(0,0,0,h); g.addColorStop(0,pal[0]); g.addColorStop(.55,pal[1]); g.addColorStop(1,pal[2]); b.fillStyle = g; b.fillRect(0,0,w,h);
    for (let i = 0; i < Math.min(900, w*h/1500); i++) { b.fillStyle = r() > .5 ? pal[3] : 'rgba(0,0,0,.2)'; const s = 1 + r()*3; b.fillRect(r()*w, r()*h, s, s); }
    for (const side of [0, 1]) {
      const x0 = side ? w : 0, dir = side ? -1 : 1; b.beginPath(); b.moveTo(x0, 0);
      let y = 0; while (y < h) { const ww = (w*.05 + r()*w*.06)*(1 + y/h*.4); b.lineTo(x0 + dir*ww, y); y += 30 + r()*50; }
      b.lineTo(x0 + dir*w*.07, h); b.lineTo(x0, h); b.closePath();
      const gg = b.createLinearGradient(x0,0,x0+dir*w*.18,0); gg.addColorStop(0,'#010103'); gg.addColorStop(1,'rgba(2,3,8,0)'); b.fillStyle = gg; b.fill();
    }
    b.fillStyle = '#020309'; b.strokeStyle = pal[4]; b.lineWidth = 1.5;
    let x = -20; while (x < w + 40) { const ww = 40 + r()*90, hh = h*(.05 + r()*.17); b.beginPath(); b.moveTo(x, -4); b.lineTo(x + ww*.5 + (r()-.5)*14, hh); b.lineTo(x + ww, -4); b.closePath(); b.fill(); b.stroke(); x += ww*.7; }
    b.beginPath(); b.moveTo(0, h); let fx = 0; b.lineTo(0, h*.93);
    while (fx < w) { fx += 30 + r()*60; b.lineTo(fx, h*(.91 + r()*.04)); } b.lineTo(w, h); b.closePath(); b.fillStyle = '#04060c'; b.fill();
    return c;
  }
  let motes = Array.from({ length: 55 }, () => ({ x: Math.random(), y: Math.random(), s: rnd(.3,1), z: rnd(.5,2), gold: Math.random() < .25 }));
  function fitBG() {
    const r = racine.getBoundingClientRect(); if (r.width < 10) return;
    BW = r.width; BH = r.height; const dpr = Math.min(2, devicePixelRatio || 1); bg.width = BW*dpr; bg.height = BH*dpr; bctx.setTransform(dpr,0,0,dpr,0,0);
    bgc = caveTexture(BW, BH, dpr, ['#03050c','#0a1020','#04060c','rgba(120,150,255,.035)','rgba(90,130,255,.18)'], 7);
  }
  function drawBG(dt) {
    if (BW < 10) return;
    bctx.drawImage(bgc, 0, 0, BW, BH);
    bctx.save(); bctx.globalCompositeOperation = 'lighter';
    for (const m of motes) {
      m.y -= dt*.012*m.z; m.x += Math.sin(tNow*.6 + m.s*9)*dt*.004; if (m.y < -.02) { m.y = 1.02; m.x = Math.random(); }
      const x = m.x*BW, y = m.y*BH, a = (.25 + .35*Math.sin(tNow*1.5 + m.s*20)**2)*m.s, r = 1 + m.z, c = m.gold ? '255,200,100' : '120,170,255';
      const g = bctx.createRadialGradient(x,y,0,x,y,r*4); g.addColorStop(0, `rgba(${c},${a})`); g.addColorStop(1, `rgba(${c},0)`); bctx.fillStyle = g; bctx.beginPath(); bctx.arc(x,y,r*4,0,TAU); bctx.fill();
    }
    bctx.restore();
  }

  // ---- pièces (ou cristaux) qui volent vers la bourse + textes ----
  const fx = $('fx'), fctx = fx.getContext('2d'); let fparts = [];
  function fitFX() { fx.width = innerWidth; fx.height = innerHeight; }
  function flyCoins(x, y, n) {
    const k = icone();
    for (let i = 0; i < n; i++) fparts.push({ k, x: x + rnd(-20,20), y: y - rnd(0,20), vx: rnd(-240,240), vy: -rnd(260,640), rot: rnd(0,TAU), vr: rnd(-12,12), s: rnd(20,32), life: -i*.02, max: 1.5, fly: false });
  }
  function stepFX(dt) {
    const tg = racine.querySelector(`.bal[data-m="${monnaie}"] img`).getBoundingClientRect(), tx = tg.left + tg.width/2, ty = tg.top + tg.height/2;
    fctx.clearRect(0,0,fx.width,fx.height);
    fparts = fparts.filter(p => {
      p.life += dt; if (p.life < 0) return true;
      if (p.life > .45) { if (!p.fly) { p.fly = true; p.sx = p.x; p.sy = p.y; } const k = Math.min(1, (p.life - .45)/.65), e = k*k*(3 - 2*k); p.x = p.sx + (tx - p.sx)*e; p.y = p.sy + (ty - p.sy)*e; if (k >= 1) return false; }
      else { p.x += p.vx*dt; p.y += p.vy*dt; p.vy += 1500*dt; p.vx *= .99; }
      p.rot += p.vr*dt;
      fctx.save(); fctx.translate(p.x, p.y); fctx.rotate(p.rot*.3); fctx.scale(1, Math.abs(Math.cos(p.rot))*.75 + .25);
      if (ready(p.k)) fctx.drawImage(imgs[p.k], -p.s/2, -p.s/2, p.s, p.s); else { fctx.fillStyle = '#f2b633'; fctx.beginPath(); fctx.arc(0,0,p.s/2,0,TAU); fctx.fill(); }
      fctx.restore(); return true;
    });
  }
  function floatText(x, y, txt, cls) {
    const d = document.createElement('div'); d.className = 'fl ' + (cls || ''); d.textContent = txt; d.style.left = x + 'px'; d.style.top = y + 'px';
    $('floats').appendChild(d); plusTard(() => d.remove(), 1600);
  }
  function flashScreen(col, ms) { const f = $('flashv'); f.style.background = `radial-gradient(circle,transparent 30%,${col})`; f.style.opacity = 1; plusTard(() => { f.style.opacity = 0; }, ms || 120); }

  // ---- mise partagée (dans la monnaie choisie) ----
  const betCtl = [];
  function makeBet(el) {
    const api = { el, monnaie: null, build() {
      api.monnaie = monnaie;
      el.innerHTML = `<div class="grp"><div class="step"><button data-a="m">−</button><b></b><button data-a="p">+</button></div><div class="grp">${M().rapides.map(v => `<button class="q" data-v="${v}">${v}</button>`).join('')}<button class="q" data-v="max">MAX</button></div></div>`;
      el.querySelectorAll('button').forEach(b => b.onclick = () => {
        // − et + : par 10 jusqu'à 50, puis par 25 (l'or) ; par 5 jusqu'à 25, puis par 12 ou 13 (les cristaux)
        const a = b.dataset.a, v = b.dataset.v, s = M().rapides[2];
        if (a) setBet(a === 'm' ? (BET <= s ? BET - s/5 : BET - s/2) : (BET < s ? BET + s/5 : BET + s/2)); else setBet(v === 'max' ? Math.min(balance(), M().max) : +v);
      });
    }, render() {
      if (api.monnaie !== monnaie) api.build();
      el.querySelector('b').textContent = fmt(BET);
      el.querySelectorAll('.q').forEach(b => { const v = b.dataset.v === 'max' ? clamp(balance(), M().min, M().max) : +b.dataset.v; b.classList.toggle('sel', v === BET && b.dataset.v !== 'max'); b.style.opacity = (b.dataset.v !== 'max' && v > balance()) ? .35 : 1; });
    }, lock(f) { el.classList.toggle('lock', f); } };
    betCtl.push(api); api.render(); return api;
  }
  function setBet(v) { const { min, max } = M(); BET = clamp(Math.round(v), min, Math.max(min, Math.min(balance(), max))); BETS[monnaie] = BET; betCtl.forEach(b => b.render()); }
  function syncBalance() { const { min, max } = M(); if (BET > balance() && balance() >= min) BET = Math.min(balance(), max); BETS[monnaie] = BET; betCtl.forEach(b => b.render()); }
  const peutMiser = () => balance() >= M().min && balance() >= BET;

  // ---- les bourses de l'en-tête : choisir sa monnaie ----
  racine.querySelectorAll('.bal').forEach(b => b.onclick = () => {
    if (anyBusy() || b.dataset.m === monnaie) return;
    monnaie = b.dataset.m; BET = BETS[monnaie];
    racine.querySelectorAll('.bal').forEach(x => x.classList.toggle('on', x.dataset.m === monnaie));
    syncBalance(); toutRafraichir();
  });

  // ---- onglets ----
  const busy = [false, false, false, false, false]; const anyBusy = () => busy.some(Boolean);
  // les boutons de chaque jeu (la mise possible dépend de la bourse, commune aux cinq jeux)
  const toutRafraichir = () => { dButton(); bRender(); cButtons(); lButtons(); kButtons(); };
  function setBusy(i, f) { busy[i] = f; $('tabs').classList.toggle('lock', anyBusy()); racine.querySelector('.bals').classList.toggle('lock', anyBusy()); syncBalance(); }
  racine.querySelectorAll('.tab').forEach(t => t.onclick = () => {
    const g = +t.dataset.g; if (g === active) return; if (anyBusy()) return;
    active = g; racine.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', +x.dataset.g === g));
    racine.querySelectorAll('.game').forEach((s, i) => s.classList.toggle('on', i === g)); fitAll(); toutRafraichir();
  });

  // ================= JEU 1 : LE DRAGON DORMANT =================
  // Le réveil est tiré par le serveur et reste secret : on demande régulièrement s'il a eu lieu (voir()),
  // et « Fuir » demande au serveur d'encaisser au multiplicateur du moment.
  const VUE = 1.1;   // secondes entre deux questions au serveur
  const dc = $('dc'), dx = dc.getContext('2d'); let DW = 0, DH = 0, ddpr = 1, dRock = null;
  const D = { state:'idle', t:0, m:1, crashAt:null, tc:Infinity, bet:0, cashM:0, open:0, beat:0, parts:[], hist:[], flame:0, shake:0, flash:0, cr:0, speed:3, auto:0, pile:0, pileFrom:0, pileFade:1, attente:false, vue:VUE, veutFuir:false };
  const dBet = makeBet($('dBet'));
  const GROW = CROISSANCE;
  const pileKey = m => m < 1.8 ? 0 : m < 4 ? 1 : 2;
  const PK = ['s1','s2','s3'];

  function fitD() {
    const r = $('dStage').getBoundingClientRect(); if (r.width < 10) return;
    DW = r.width; DH = r.height; ddpr = Math.min(2, devicePixelRatio || 1); dc.width = DW*ddpr; dc.height = DH*ddpr;
    dRock = caveTexture(DW, DH, ddpr, ['#080204','#170706','#0a0302','rgba(255,120,60,.03)','rgba(255,110,50,.22)'], 21);
  }
  function drawEye(cx, cy, w, h, o, side) {
    dx.save(); dx.translate(cx, cy); dx.rotate(-side*.2);
    // lueur
    dx.globalCompositeOperation = 'lighter';
    const gl = dx.createRadialGradient(0,0,0,0,0,w*1.1); gl.addColorStop(0, `rgba(255,120,25,${.10 + .42*o})`); gl.addColorStop(1, 'rgba(255,80,10,0)'); dx.fillStyle = gl; dx.fillRect(-w*1.2,-w*1.2,w*2.4,w*2.4);
    dx.globalCompositeOperation = 'source-over';
    const eh = h*o;
    if (o < .04) {
      const g = dx.createLinearGradient(-w/2,0,w/2,0); g.addColorStop(0,'rgba(255,140,40,0)'); g.addColorStop(.5,`rgba(255,150,40,${.45 + .2*Math.sin(tNow*2)})`); g.addColorStop(1,'rgba(255,140,40,0)');
      dx.strokeStyle = g; dx.lineWidth = 3; dx.beginPath(); dx.moveTo(-w/2,0); dx.lineTo(w/2,0); dx.stroke();
    } else {
      dx.beginPath(); dx.moveTo(-w/2,0); dx.quadraticCurveTo(0,-eh*1.15,w/2,0); dx.quadraticCurveTo(0,eh*.9,-w/2,0); dx.closePath();
      dx.save(); dx.clip();
      const g = dx.createRadialGradient(0,0,0,0,0,w*.55); g.addColorStop(0,'#fff3a6'); g.addColorStop(.3,'#ffb52e'); g.addColorStop(.7,'#e0570f'); g.addColorStop(1,'#5a1004'); dx.fillStyle = g; dx.fillRect(-w,-h*2,w*2,h*4);
      const lid = dx.createLinearGradient(0,-eh*.6,0,eh*.2); lid.addColorStop(0,'rgba(0,0,0,.85)'); lid.addColorStop(.5,'rgba(0,0,0,0)'); dx.fillStyle = lid; dx.fillRect(-w,-h*2,w*2,h*4);
      dx.fillStyle = '#0d0200'; dx.beginPath(); dx.ellipse(0,0,w*(.035 + .035*(1 - o)),eh*1.2,0,0,TAU); dx.fill();
      dx.restore();
      dx.strokeStyle = '#1a0400'; dx.lineWidth = 4; dx.beginPath(); dx.moveTo(-w/2,0); dx.quadraticCurveTo(0,-eh*1.15,w/2,0); dx.quadraticCurveTo(0,eh*.9,-w/2,0); dx.stroke();
    }
    // arcade sourcilière
    dx.beginPath(); dx.moveTo(-w*.62, h*.1); dx.lineTo(-w*.35, -h*.55 - eh*.2); dx.lineTo(w*.5, -h*.95 - eh*.3); dx.lineTo(w*.7, -h*.35); dx.lineTo(w*.2, -h*.45 - eh*.1); dx.lineTo(-w*.4, h*.0); dx.closePath();
    dx.fillStyle = '#0b0302'; dx.fill(); dx.strokeStyle = 'rgba(255,100,40,.3)'; dx.lineWidth = 2; dx.stroke();
    dx.restore();
  }
  function dragonDraw() {
    dx.setTransform(ddpr,0,0,ddpr,0,0); dx.clearRect(0,0,DW,DH);
    dx.save(); if (D.shake > .1) dx.translate(rnd(-D.shake,D.shake), rnd(-D.shake,D.shake));
    if (dRock) dx.drawImage(dRock, 0, 0, DW, DH);
    const ecx = DW/2, ecy = DH*.19, ew = clamp(DW*.14, 80, 170), eh = ew*.42, ed = clamp(DW*.17, 110, 230);
    // masse du crâne
    const sk = dx.createRadialGradient(ecx, ecy, 0, ecx, ecy, DW*.5); sk.addColorStop(0, 'rgba(60,14,8,.85)'); sk.addColorStop(.6, 'rgba(25,6,4,.5)'); sk.addColorStop(1, 'rgba(0,0,0,0)'); dx.fillStyle = sk; dx.fillRect(0,0,DW,DH*.6);
    // chaleur du trésor
    const heat = dx.createRadialGradient(DW/2, DH, 0, DW/2, DH, DH*.8); heat.addColorStop(0, `rgba(255,140,30,${.18 + .12*Math.min(1, Math.log(D.m)/Math.log(20))})`); heat.addColorStop(1, 'rgba(255,100,20,0)'); dx.fillStyle = heat; dx.fillRect(0,0,DW,DH);
    drawEye(ecx - ed, ecy, ew, eh, D.open, -1); drawEye(ecx + ed, ecy, ew, eh, D.open, 1);
    // naseaux
    dx.fillStyle = '#050101'; for (const s of [-1,1]) { dx.beginPath(); dx.ellipse(ecx + s*ed*.22, ecy + eh*2.8, ew*.07, ew*.04, s*.5, 0, TAU); dx.fill(); }
    dx.globalCompositeOperation = 'lighter'; for (const s of [-1,1]) { const f = dx.createRadialGradient(ecx + s*ed*.22, ecy + eh*2.8, 0, ecx + s*ed*.22, ecy + eh*2.8, ew*.3); f.addColorStop(0, `rgba(255,110,30,${.1 + .25*D.open})`); f.addColorStop(1, 'rgba(255,60,0,0)'); dx.fillStyle = f; dx.fillRect(ecx + s*ed*.22 - ew*.3, ecy + eh*2.8 - ew*.3, ew*.6, ew*.6); }
    dx.globalCompositeOperation = 'source-over';

    // trésor
    const Q = Math.min(DH*.5, DW*.74), growth = 1 + .22*clamp(Math.log(D.m)/Math.log(30), 0, 1), sizes = [.82,.92,1.0];
    const burn = D.state === 'crash' ? clamp(D.cr/.9, 0, 1) : 0;
    const drawPile = (k, a) => { if (a <= .01 || !ready(PK[k])) return; const s = Q*sizes[k]*growth; dx.save(); dx.globalAlpha = a*(1 - burn*.72); dx.shadowColor = 'rgba(0,0,0,.8)'; dx.shadowBlur = 24; dx.drawImage(imgs[PK[k]], DW/2 - s/2, DH - s*.97 + s*.04 + Math.sin(tNow*40)*D.shake*.2, s, s); dx.restore(); };
    drawPile(D.pileFrom, 1 - D.pileFade); drawPile(D.pile, D.pileFade);
    if (burn > 0) { dx.fillStyle = `rgba(20,4,0,${burn*.35})`; dx.fillRect(0, DH*.5, DW, DH*.5); }
    // éclats sur le tas
    for (let i = 0; i < 4; i++) { const ph = (tNow*.7 + i*.27) % 1, a = Math.sin(Math.PI*ph), px = DW/2 + Math.sin(i*12.9)*Q*.25, py = DH - Q*(.12 + (Math.cos(i*7.1)*.5 + .5)*.5); dx.save(); dx.globalCompositeOperation = 'lighter'; dx.strokeStyle = `rgba(255,240,180,${a*.9})`; dx.lineWidth = 1.6; const s = 6*a + 2; dx.beginPath(); dx.moveTo(px-s,py); dx.lineTo(px+s,py); dx.moveTo(px,py-s); dx.lineTo(px,py+s); dx.stroke(); dx.restore(); }

    // particules
    for (const p of D.parts) {
      const k = p.life/p.max; dx.save();
      if (p.k === 'fire') { dx.globalCompositeOperation = 'lighter'; const a = (1 - k)*.9, r = p.r*(1 + k*1.4), g = dx.createRadialGradient(p.x,p.y,0,p.x,p.y,r); g.addColorStop(0, `rgba(255,${200 - k*120|0},${80 - k*60|0},${a})`); g.addColorStop(.5, `rgba(255,90,20,${a*.55})`); g.addColorStop(1, 'rgba(120,20,0,0)'); dx.fillStyle = g; dx.beginPath(); dx.arc(p.x,p.y,r,0,TAU); dx.fill(); }
      else if (p.k === 'coin') { dx.translate(p.x,p.y); dx.rotate(p.rot*.3); dx.scale(1, Math.abs(Math.cos(p.rot))*.75 + .25); dx.globalAlpha = 1 - k*k; if (ready(p.img)) dx.drawImage(imgs[p.img], -p.s/2, -p.s/2, p.s, p.s); }
      else if (p.k === 'ember') { dx.globalCompositeOperation = 'lighter'; const a = (1 - k)*.8, g = dx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r*4); g.addColorStop(0, `rgba(255,170,60,${a})`); g.addColorStop(1, 'rgba(255,60,0,0)'); dx.fillStyle = g; dx.beginPath(); dx.arc(p.x,p.y,p.r*4,0,TAU); dx.fill(); }
      dx.restore();
    }
    if (D.flash > .01) { dx.fillStyle = `rgba(255,150,50,${D.flash*.55})`; dx.fillRect(0,0,DW,DH); }
    const vg = dx.createRadialGradient(DW/2, DH/2, DH*.35, DW/2, DH/2, DH*.95); vg.addColorStop(0,'rgba(0,0,0,0)'); vg.addColorStop(1,'rgba(0,0,0,.6)'); dx.fillStyle = vg; dx.fillRect(0,0,DW,DH);
    dx.restore();
  }
  function dSpawn(dt) {
    const Q = Math.min(DH*.5, DW*.74), top = DH - Q*.8;
    if (D.state === 'run' || D.state === 'cashed') {
      if (Math.random() < dt*(1.5 + Math.min(10, D.m)*.5)) D.parts.push({ k:'coin', img:D.icone, x:DW/2 + rnd(-Q*.25, Q*.25), y:top + Q*.12, vx:rnd(-60,60), vy:-rnd(240,420), rot:rnd(0,TAU), vr:rnd(-10,10), s:rnd(18,28), life:0, max:1.2 });
      if (Math.random() < dt*6*Math.min(4, 1 + Math.log(D.m))) D.parts.push({ k:'ember', x:rnd(DW*.2, DW*.8), y:DH + 5, vx:rnd(-20,20), vy:-rnd(60,180), r:rnd(1,2.4), life:0, max:rnd(1.4,2.6) });
    }
    if (D.flame > 0) {
      D.flame -= dt;
      for (let i = 0; i < 9; i++) { const a = rnd(-.45,.45), v = rnd(520,1000); D.parts.push({ k:'fire', x:DW/2 + rnd(-30,30), y:DH*.28, vx:Math.sin(a)*v*.55, vy:Math.cos(a)*v, r:rnd(20,48), life:0, max:rnd(.5,1.0) }); }
      for (let i = 0; i < 4; i++) D.parts.push({ k:'fire', x:rnd(DW*.2, DW*.8), y:DH - rnd(0, Q*.3), vx:rnd(-40,40), vy:-rnd(80,260), r:rnd(18,44), life:0, max:rnd(.6,1.2) });
    }
  }
  const dHud = { m: $('dm'), s: $('ds') };
  function dColor(m) { return m < 2 ? '#ffe29a' : m < 5 ? '#ffb347' : m < 15 ? '#ff7a3a' : '#fff2d0'; }
  function dSay(t) { dHud.s.textContent = t; }
  function dRenderHist() { $('dHist').innerHTML = D.hist.slice(-9).map(c => `<span class="${c >= 10 ? 'h' : c >= 2 ? 'm' : ''}">×${c.toFixed(2)}</span>`).join(''); }
  function dButton() {
    const go = $('dGo'), t = $('dGoT'), s = $('dGoS');
    if (D.state === 'idle') { go.className = 'btn pri'; go.disabled = D.attente || !peutMiser(); t.textContent = D.attente ? 'La mise est posée…' : 'Voler le trésor'; s.textContent = `MISE ${fmt(BET)} ${unite().toUpperCase()} · ESPACE`; }
    else if (D.state === 'run') { go.className = 'btn out'; go.disabled = D.veutFuir; t.textContent = D.veutFuir ? 'Tu fuis…' : `Fuir avec ${gain(D.bet, D.m)}`; s.textContent = 'ESPACE'; }
    else { go.className = 'btn sec'; go.disabled = true; t.textContent = D.state === 'cashed' ? 'Tu as fui !' : 'Le dragon s\'éveille…'; s.textContent = ''; }
  }
  function dLibre() { setBusy(0, false); dBet.lock(false); $('dAutoW').classList.remove('lock'); }
  async function dStart() {
    if (D.state !== 'idle' || D.attente || !peutMiser()) return; ac();
    const a = parseFloat($('dAuto').value), auto = a >= 1.01 ? Math.min(PLAFOND, Math.round(a*100)/100) : null;
    D.attente = true; setBusy(0, true); dBet.lock(true); $('dAutoW').classList.add('lock'); dButton();
    const r = await appel(serveur.commencer('dragon', monnaie, BET, auto));
    D.attente = false;
    if (!r) { if (!demonte) { dLibre(); dButton(); } return; }
    setBourse(r.bourse); annoncerReglee(r.reglee);
    D.bet = r.mise; D.icone = icone(); D.crashAt = null; D.tc = Infinity; D.t = 0; D.m = 1; D.state = 'run'; D.beat = 0; D.cashM = 0; D.cr = 0; D.flame = 0;
    D.auto = auto || 0; D.vue = VUE; D.veutFuir = false;
    D.pileFrom = D.pile; D.pile = 0; D.pileFade = 1; dSay('Chhht… ne le réveille pas.'); dHud.m.style.color = dColor(1); tone(160, 90, .3, 'sawtooth', .08); dButton();
  }
  // Le serveur a fermé la partie (fuite, encaissement auto ou réveil) : on montre comment
  function dFin(r) {
    setBourse(r.bourse);
    if (r.absente) { D.state = 'idle'; dLibre(); dButton(); return; }
    D.crashAt = Number(r.reveil); D.tc = Math.max(.55, Math.log(D.crashAt)/GROW);
    if (r.gain > 0) dCash(r);
    else { D.m = D.crashAt; dCrash(); }
  }
  async function dVoir() {
    D.attente = true;
    const r = await appel(serveur.voir());
    D.attente = false; D.vue = VUE;
    if (D.state !== 'run') return;
    if (r && r.fini) { dFin(r); return; }
    if (D.veutFuir) dFuir();
    else if (D.auto && D.m >= D.auto) D.vue = .3;   // l'encaissement auto est tout proche : on redemande vite
  }
  async function dFuir() {
    if (D.state !== 'run') return;
    D.veutFuir = true; dButton();
    if (D.attente) return;   // une question est déjà partie : on fuira à sa réponse
    D.attente = true;
    const r = await appel(serveur.encaisser());
    D.attente = false; D.veutFuir = false;
    if (D.state !== 'run') return;
    if (r) dFin(r); else dButton();
  }
  function dCash(r) {
    const pay = r.gain; D.cashM = Number(r.multiplicateur); D.m = Math.max(D.m, D.cashM); D.state = 'cashed';
    D.speed = Math.max(3, (D.tc - D.t)/2.2);
    const rc = dc.getBoundingClientRect(); flyCoins(rc.left + DW/2, rc.top + DH*.8, Math.min(40, 10 + Math.floor(D.cashM*3))); sCoins(12);
    floatText(rc.left + DW/2, rc.top + DH*.2, '+' + fmt(pay), 'big'); dHud.m.textContent = '×' + D.cashM.toFixed(2); dHud.m.style.color = '#8dff9a';
    dSay(`${r.auto ? 'Encaissement automatique : t' : 'T'}u as fui avec ${fmt(pay)} ${unite()} ! Voyons jusqu'où il montait…`); dButton();
  }
  function dCrash() {
    const cashed = D.state === 'cashed'; D.state = 'crash'; D.cr = 0; D.m = D.crashAt; D.hist.push(D.crashAt); dRenderHist();
    D.flame = 1.3; D.flash = 1; D.shake = 34; noise(1.1, 'lowpass', 1500, 120, .5); tone(220, 45, 1.0, 'sawtooth', .16); tone(110, 40, 1.2, 'square', .06, .05);
    flashScreen('rgba(255,90,20,.55)', 160);
    if (!cashed) { dHud.m.textContent = '×' + D.crashAt.toFixed(2); dHud.m.style.color = '#ff5a3a'; dSay('Le dragon s\'éveille ! Ton butin part en fumée.'); const r = dc.getBoundingClientRect(); floatText(r.left + DW/2, r.top + DH*.2, '−' + fmt(D.bet), 'bad'); }
    else dSay(`Le dragon s'est réveillé à ×${D.crashAt.toFixed(2)}. Tu étais déjà loin.`);
    dButton();
  }
  function dragonFrame(dt) {
    if (DW < 10) return;
    D.flash = Math.max(0, D.flash - dt*2.2); D.shake = Math.max(0, D.shake - dt*40);
    D.pileFade = Math.min(1, D.pileFade + dt*4);
    if (D.state === 'run' || D.state === 'cashed') {
      D.t += dt*(D.state === 'cashed' ? D.speed : 1);
      D.m = Math.min(D.crashAt ?? PLAFOND, multDragon(D.t));
      if (D.state === 'cashed') D.m = Math.max(D.m, Math.min(D.cashM, D.crashAt));
      const k = pileKey(D.m); if (k !== D.pile) { D.pileFrom = D.pile; D.pile = k; D.pileFade = 0; tone(700, 1100, .2, 'triangle', .06); }
      if (D.state === 'run') {
        dHud.m.textContent = '×' + D.m.toFixed(2); dHud.m.style.color = dColor(D.m);
        if (!D.veutFuir) $('dGoT').textContent = `Fuir avec ${gain(D.bet, D.m)}`;
        D.beat -= dt; if (D.beat <= 0) { D.beat = clamp(.95 - Math.log(D.m)*.22, .26, .95); tone(72, 44, .17, 'sine', .26); tone(66, 40, .15, 'sine', .16, .13); D.shake = Math.max(D.shake, Math.min(5, Math.log(D.m)*1.6)); }
        if (!D.attente) { D.vue -= dt; if (D.vue <= 0 || (D.auto && D.m >= D.auto && D.vue < VUE - .3)) dVoir(); }
      } else if (D.state === 'cashed') {
        dSay(`Le dragon dormait encore… ×${D.m.toFixed(2)}`);
        if (D.t >= D.tc) dCrash();
      }
    } else if (D.state === 'crash') {
      D.cr += dt; if (D.cr > 2.6) { D.state = 'idle'; D.pileFrom = D.pile; D.pile = 0; D.pileFade = 0; dLibre(); dHud.m.textContent = '×1.00'; dHud.m.style.color = '#ffe29a'; dSay('Le dragon se rendort. Ose revenir…'); dButton(); }
    }
    // ouverture des yeux
    let target = 0;
    if (D.state === 'run' || D.state === 'cashed') target = clamp(.05 + .8*Math.log(D.m)/Math.log(40), 0, .88) + (D.state === 'run' ? Math.sin(tNow*5)*.012*Math.log(D.m + 1) : 0);
    if (D.state === 'crash') target = 1;
    D.open += (target - D.open)*Math.min(1, dt*(D.state === 'crash' ? 14 : 3.5));
    dSpawn(dt);
    D.parts = D.parts.filter(p => { p.life += dt; if (p.k === 'coin') { p.x += p.vx*dt; p.y += p.vy*dt; p.vy += 900*dt; p.rot += p.vr*dt; } else { p.x += p.vx*dt; p.y += p.vy*dt; if (p.k === 'fire') p.vy *= .985; } return p.life < p.max; });
    dragonDraw();
  }
  $('dGo').onclick = () => { ac(); if (D.state === 'idle') dStart(); else if (D.state === 'run') dFuir(); };
  $('dAuto').addEventListener('keydown', e => e.stopPropagation());
  dRenderHist(); dButton();

  // ================= JEU 2 : LES BOURSES DU MARCHAND =================
  // Les cristaux maudits sont placés par le serveur ; on ne les connaît qu'à la fin de la partie.
  const GN = NB_BOURSES;
  const B = { state:'idle', mines:3, picks:0, bet:0, cursed:new Set(), open:new Set(), attente:false };
  const bBet = makeBet($('bBet'));
  const bGrid = $('bGrid'); const tiles = [];
  for (let i = 0; i < GN; i++) {
    const t = document.createElement('button'); t.className = 'tile';
    t.innerHTML = `<div class="in"><div class="f fr"><img alt="" src="${SRC.bag}"></div><div class="f bk"><img alt=""></div></div>`;
    t.onclick = () => bPick(i); bGrid.appendChild(t); tiles.push(t);
  }
  MAUDITES.forEach(m => { const b = document.createElement('button'); b.className = 'q blue'; b.textContent = m; b.dataset.m = m; b.onclick = () => { if (B.state === 'play' || B.attente) return; B.mines = m; bRender(); }; $('bMines').appendChild(b); });
  const bMult = k => multBourses(k, B.mines);
  const bSay = t => { $('bSay').textContent = t; };
  function bRender() {
    racine.querySelectorAll('#bMines .q').forEach(b => b.classList.toggle('sel', +b.dataset.m === B.mines));
    const safe = GN - B.mines; $('bOpen').textContent = `${B.picks} / ${safe}`;
    $('bNext').textContent = B.state === 'play' && B.picks < safe ? '×' + bMult(B.picks + 1).toFixed(2) : '×' + bMult(1).toFixed(2);
    $('bCur').textContent = B.state === 'play' ? gain(B.bet, bMult(B.picks)) : '0';
    bGrid.classList.toggle('live', B.state === 'play' && !B.attente); bGrid.classList.toggle('attente', B.attente);
    const go = $('bGo'), t = $('bGoT'), s = $('bGoS');
    if (B.state === 'play') { go.className = 'btn out'; t.textContent = B.picks ? `Encaisser ${gain(B.bet, bMult(B.picks))}` : 'Ouvre une bourse'; s.textContent = B.picks ? `×${bMult(B.picks).toFixed(2)} · ESPACE` : 'CLIQUE SUR UNE BOURSE'; go.disabled = B.picks < 1 || B.attente; }
    else { go.className = 'btn pri'; go.disabled = B.attente || !peutMiser(); t.textContent = B.attente ? 'La mise est posée…' : 'Poser la mise'; s.textContent = `MISE ${fmt(BET)} ${unite().toUpperCase()} · ESPACE`; }
  }
  function bReset() { tiles.forEach(t => { t.classList.remove('open','curse','ghost'); t.querySelector('.bk img').removeAttribute('src'); }); bGrid.classList.remove('done'); }
  async function bStart() {
    if (B.state === 'play' || B.attente || !peutMiser()) return; ac();
    B.attente = true; setBusy(1, true); bBet.lock(true); $('bMines').classList.add('lock'); bRender();
    const r = await appel(serveur.commencer('bourses', monnaie, BET, B.mines));
    B.attente = false;
    if (!r) { if (!demonte) bEnd(); return; }
    setBourse(r.bourse); annoncerReglee(r.reglee); bReset();
    B.bet = r.mise; B.picks = 0; B.state = 'play'; B.open = new Set(); B.cursed = new Set();
    tone(220, 330, .2, 'triangle', .07); bSay('Une de ces bourses cache-t-elle un cristal maudit ?'); bRender();
  }
  function bFace(i, curse, ghost) {
    const t = tiles[i], im = t.querySelector('.bk img'); im.src = curse ? SRC.crystal : (Math.random() < .5 ? SRC.coin : SRC.s1);
    t.classList.toggle('curse', curse); t.classList.toggle('ghost', !!ghost); t.classList.add('open');
  }
  function bRevealRest() { let n = 0; tiles.forEach((t, i) => { if (!B.open.has(i)) plusTard(() => bFace(i, B.cursed.has(i), true), n++*45); }); }
  async function bPick(i) {
    if (B.state !== 'play' || B.attente || B.open.has(i)) return; ac();
    B.attente = true; bRender();
    const r = await appel(serveur.ouvrir(i));
    B.attente = false;
    if (!r) { if (!demonte) bRender(); return; }
    B.open.add(i); const rc = tiles[i].getBoundingClientRect();
    if (r.maudite) {
      B.cursed = new Set(r.maudites); setBourse(r.bourse);
      bFace(i, true, false); B.state = 'over'; sBoom(); flashScreen('rgba(60,100,255,.6)', 200); bGrid.classList.add('shake'); plusTard(() => bGrid.classList.remove('shake'), 520);
      floatText(rc.left + rc.width/2, rc.top + rc.height*.45, '−' + fmt(B.bet), 'bad'); bSay('Un cristal maudit ! Ta mise est perdue.'); bGrid.classList.add('done'); bRevealRest(); bEnd();
    } else {
      bFace(i, false, false); B.picks = r.fini ? B.picks + 1 : r.ouvertes; sPing(440*Math.pow(1.0595, B.picks*2)); bSay(['De l\'or !','La chance sourit.','Encore une ?','Le marchand sue…','Tu joues avec le feu.'][B.picks % 5]);
      floatText(rc.left + rc.width/2, rc.top + rc.height*.45, '×' + bMult(B.picks).toFixed(2), '');
      if (r.fini) bPaye(r); else bRender();
    }
  }
  async function bCash() {
    if (B.state !== 'play' || B.attente || B.picks < 1) return;
    B.attente = true; bRender();
    const r = await appel(serveur.encaisser());
    B.attente = false;
    if (!r) { if (!demonte) bRender(); return; }
    bPaye(r);
  }
  function bPaye(r) {
    B.cursed = new Set(r.maudites ?? []); setBourse(r.bourse); B.state = 'over'; sCoins(14);
    const rc = bGrid.getBoundingClientRect(); flyCoins(rc.left + rc.width/2, rc.top + rc.height/2, Math.min(40, 10 + B.picks*3)); floatText(rc.left + rc.width/2, rc.top + rc.height*.4, '+' + fmt(r.gain), 'big');
    bSay(`Tu empoches ${fmt(r.gain)} ${unite()} et files avant la malédiction.`); bGrid.classList.add('done'); bRevealRest(); bEnd();
  }
  function bEnd() { setBusy(1, false); bBet.lock(false); $('bMines').classList.remove('lock'); bRender(); }
  $('bGo').onclick = () => { ac(); if (B.state === 'play') bCash(); else bStart(); };
  bRender();

  // ================= JEU 3 : LE PONT MAUDIT =================
  // Chaque pas est tiré par le serveur avant que le voyageur ne pose le pied.
  const cc = $('cc'), cx = cc.getContext('2d'); let CW = 0, CH = 0, cdpr = 1, cRock = null, g = { step: 40, hh: 60, gy: 300, sag: 20, xL: 100, xR: 900, cl: 120, cr: 880, W: 1000, H: 600 };
  const NP = NB_PLANCHES, FAIL = RISQUES, MULT = MULT_PONT;
  const C = { state:'idle', pos:0, bet:0, hist:[], broken:new Set(), falling:[], flash:0, shake:0, hero:{ x:0, y:0, alpha:1, aT:1, rot:0, vy:0, fall:false, walk:null } };
  const cBet = makeBet($('cBet'));
  const xs = p => g.xL + g.step*p;
  const yAt = x => { const u = clamp((x - g.cl)/(g.cr - g.cl), 0, 1); return g.gy + g.sag*4*u*(1 - u); };
  const heroY = x => yAt(x) - g.step*.1;
  const mFmt = m => m >= 10 ? Math.round(m) : m.toFixed(g.step >= 40 ? 2 : 1);

  function cFit() {
    const r = $('cStage').getBoundingClientRect(); if (r.width < 10) return;
    CW = r.width; CH = r.height; cdpr = Math.min(2, devicePixelRatio || 1); cc.width = CW*cdpr; cc.height = CH*cdpr;
    const m = CW < 600 ? .13 : .14, xL = CW*m, xR = CW*(1 - m), step = (xR - xL)/(NP + 1);
    g = { W:CW, H:CH, xL, xR, step, gy:CH*.55, sag:CH*.04, hh:clamp(step*1.55, 38, 96) }; g.cl = xL + step*.5; g.cr = xR - step*.5;
    cRock = caveTexture(CW, CH, cdpr, ['#03050d','#091426','#04070f','rgba(120,160,255,.04)','rgba(100,140,255,.22)'], 33);
  }
  const cScreen = () => { const r = cc.getBoundingClientRect(); return [r.left + C.hero.x, r.top + C.hero.y - g.hh*.5]; };
  const cSay = t => { $('cs').textContent = t; };
  function cHud() {
    const m = MULT[C.pos]; $('cm').textContent = '×' + m.toFixed(2); $('cm').style.color = C.pos === 0 ? '#ffe29a' : m < 2 ? '#ffe29a' : m < 5 ? '#ffb347' : m < 15 ? '#ff7a3a' : '#fff2d0';
  }
  function cHist() { $('cHist').innerHTML = C.hist.slice(-9).map(h => h.fall ? '<span>Chute</span>' : `<span class="${h.m >= 10 ? 'h' : 'm'}">×${h.m.toFixed(2)}</span>`).join(''); }
  function cButtons() {
    const idle = C.state === 'idle' || C.state === 'pose', busyNow = C.state !== 'play';
    $('cGo').style.display = idle ? '' : 'none'; $('cStep').style.display = $('cLeap').style.display = $('cCash').style.display = idle ? 'none' : '';
    $('cGo').disabled = C.state === 'pose' || !peutMiser(); $('cGoT').textContent = C.state === 'pose' ? 'La mise est posée…' : 'Traverser le pont'; $('cGoS').textContent = `MISE ${fmt(BET)} ${unite().toUpperCase()} · ESPACE`;
    if (idle) return;
    const p = C.pos, f1 = FAIL[p] || 0, f2 = p + 1 < NP ? 1 - (1 - FAIL[p])*(1 - FAIL[p + 1]) : 1;
    $('cStep').disabled = busyNow || p >= NP; $('cStepS').textContent = `RISQUE ${Math.round(f1*100)} % · ESPACE`; $('cStepT').textContent = 'Avancer';
    $('cLeap').disabled = busyNow || p + 2 > NP; $('cLeapS').textContent = p + 2 > NP ? 'PLUS ASSEZ DE PLANCHES' : `RISQUE ${Math.round(f2*100)} % · ×${MULT[Math.min(NP, p + 2)].toFixed(2)}`;
    $('cCash').disabled = busyNow || p < 1; $('cCashT').textContent = p < 1 ? 'Encaisser' : `Encaisser ${gain(C.bet, MULT[p])}`; $('cCashS').textContent = p < 1 ? 'AVANCE D\'ABORD' : `×${MULT[p].toFixed(2)} · ENTRÉE`;
  }
  async function cStart() {
    if (C.state !== 'idle' || !peutMiser()) return; ac();
    C.state = 'pose'; setBusy(2, true); cBet.lock(true); cButtons();
    const r = await appel(serveur.commencer('pont', monnaie, BET));
    if (!r) { if (!demonte) { C.state = 'idle'; setBusy(2, false); cBet.lock(false); cButtons(); } return; }
    setBourse(r.bourse); annoncerReglee(r.reglee);
    C.bet = r.mise; C.pos = 0; C.state = 'play'; C.broken.clear(); C.falling = [];
    tone(200, 120, .25, 'triangle', .08); cSay('Le pont craque sous le vent… avance avec prudence.'); cHud(); cButtons();
  }
  async function cAdvance(n) {
    if (C.state !== 'play') return; const p = C.pos, t = p + n; if (t > NP) return; ac(); C.state = 'busy'; cButtons();
    const r = await appel(serveur.avancer(n));
    if (!r) { if (!demonte) { C.state = 'play'; cButtons(); } return; }
    const hr = C.hero;
    hr.walk = { x0:hr.x, x1:xs(t), t:0, dur:n === 1 ? .42 : .64, arc:n === 1 ? g.hh*.06 : g.hh*.8, onEnd:() => cArrive(t, r) };
    noise(.3, 'bandpass', 260, 520, .1); tone(110, 70, .15, 'sine', .2, n === 1 ? .38 : .6);
  }
  function cArrive(t, r) {
    const hr = C.hero;
    if (!r.tombe) {
      C.pos = t; sPing(330*Math.pow(1.07, t)); tone(95, 60, .14, 'sine', .22); C.flash = .25; cHud();
      const [sx, sy] = cScreen(); floatText(sx, sy - g.hh*.7, '×' + MULT[t].toFixed(2), '');
      cSay(['Les planches gémissent.','Ça tient… pour l\'instant.','Ne regarde pas en bas.','Le vent se lève.','Encore un pas ?'][t % 5]);
      if (t >= NP) { C.state = 'busy'; cButtons(); cSay('Le trésor est là, devant toi !'); hr.walk = { x0:hr.x, x1:xs(NP + 1), t:0, dur:.6, arc:0, onEnd:() => cPaye(r, true) }; return; }
      C.state = 'play'; cButtons();
    } else {
      cSay('Crrrrac…'); noise(.35, 'bandpass', 500, 200, .2);
      plusTard(() => {
        setBourse(r.bourse);
        C.state = 'fall'; C.broken.add(t); C.falling.push({ p:t, y:0, vy:0, rot:0, vr:rnd(-4,4) }); hr.fall = true; hr.vy = -140; hr.rot = 0; C.shake = 22; C.flash = .7;
        noise(.5, 'highpass', 3500, 600, .4); tone(700, 120, 1.1, 'sine', .07); tone(120, 40, .8, 'sawtooth', .1, .05); flashScreen('rgba(60,100,255,.5)', 180);
        const [sx, sy] = cScreen(); floatText(sx, sy - g.hh*.5, '−' + fmt(C.bet), 'bad'); cSay('Les planches cèdent ! Tu tombes dans le gouffre… ta mise est perdue.');
        C.hist.push({ fall:true }); cHist(); cButtons(); plusTard(cResetAfter, 2300);
      }, 140);
    }
  }
  function cResetAfter() {
    const hr = C.hero; C.broken.clear(); C.falling = []; hr.fall = false; hr.rot = 0; hr.vy = 0; hr.walk = null; C.pos = 0; hr.alpha = 0; hr.aT = 1; hr.x = xs(0); hr.y = heroY(hr.x);
    C.state = 'idle'; setBusy(2, false); cBet.lock(false); cHud(); cSay('Le pont se reforme dans la brume. Retente ta chance.'); cButtons();
  }
  async function cCash() {
    if (C.state !== 'play' || C.pos < 1) return; ac(); C.state = 'busy'; cButtons();
    const r = await appel(serveur.encaisser());
    if (!r) { if (!demonte) { C.state = 'play'; cButtons(); } return; }
    cPaye(r, false);
  }
  function cPaye(r, jackpot) {
    C.state = 'busy'; setBourse(r.bourse); const m = MULT[C.pos], pay = r.gain; C.hist.push({ m }); cHist();
    const [sx, sy] = cScreen(); flyCoins(sx, sy, Math.min(44, 10 + C.pos*3)); sCoins(12); floatText(sx, sy - g.hh*.7, '+' + fmt(pay), 'big');
    cSay(jackpot ? `Tu atteins le trésor ! ${fmt(pay)} ${unite()} !` : `Tu rebrousses chemin avec ${fmt(pay)} ${unite()}.`); if (jackpot) { C.flash = 1; sPing(880); }
    C.hero.aT = 0; cButtons(); plusTard(() => { const hr = C.hero; hr.walk = null; C.pos = 0; hr.x = xs(0); hr.y = heroY(hr.x); hr.aT = 1; C.state = 'idle'; setBusy(2, false); cBet.lock(false); cHud(); cSay('Le pont t\'attend, voyageur.'); cButtons(); }, 1300);
  }

  function drawHero() {
    const hr = C.hero; if (hr.alpha < .02) return; const h = g.hh, t = tNow, walking = !!hr.walk;
    cx.save(); cx.globalAlpha = hr.alpha; cx.translate(hr.x, hr.y);
    if (hr.fall) { cx.translate(0, -h*.5); cx.rotate(hr.rot); cx.translate(0, h*.5); }
    const bob = walking ? Math.abs(Math.sin(t*16))*h*.03 : Math.sin(t*2)*h*.012; cx.translate(0, -bob); if (walking) cx.rotate(.1);
    // écharpe
    cx.strokeStyle = '#7a1c1c'; cx.lineWidth = Math.max(2, h*.05); cx.lineCap = 'round'; cx.beginPath(); cx.moveTo(-h*.08, -h*.64); cx.quadraticCurveTo(-h*.28, -h*.6 + Math.sin(t*6)*h*.04, -h*.4, -h*.52 + Math.sin(t*6 + 1)*h*.06); cx.stroke();
    // cape
    const cg = cx.createLinearGradient(0, -h*.8, 0, 0); cg.addColorStop(0, '#2b3a6a'); cg.addColorStop(1, '#0a0f22'); cx.fillStyle = cg;
    cx.beginPath(); cx.moveTo(-h*.15, -h*.66); cx.quadraticCurveTo(-h*.37, -h*.2, -h*.3, 0); cx.lineTo(h*.3, 0); cx.quadraticCurveTo(h*.37, -h*.2, h*.15, -h*.66); cx.quadraticCurveTo(0, -h*.74, -h*.15, -h*.66); cx.fill();
    cx.strokeStyle = 'rgba(130,170,255,.45)'; cx.lineWidth = 1.5; cx.beginPath(); cx.moveTo(-h*.15, -h*.66); cx.quadraticCurveTo(-h*.37, -h*.2, -h*.3, 0); cx.stroke();
    // capuche
    cx.fillStyle = '#121a36'; cx.beginPath(); cx.arc(0, -h*.78, h*.15, 0, TAU); cx.fill(); cx.beginPath(); cx.moveTo(-h*.13, -h*.84); cx.lineTo(h*.01, -h*1.03); cx.lineTo(h*.14, -h*.82); cx.closePath(); cx.fill();
    cx.fillStyle = '#03050c'; cx.beginPath(); cx.ellipse(h*.05, -h*.77, h*.09, h*.1, 0, 0, TAU); cx.fill();
    cx.fillStyle = '#ffd36a'; cx.beginPath(); cx.arc(h*.03, -h*.785, Math.max(1, h*.014), 0, TAU); cx.arc(h*.09, -h*.785, Math.max(1, h*.014), 0, TAU); cx.fill();
    // lanterne
    const sw = Math.sin(t*(walking ? 9 : 2.2))*h*.025, lx = h*.32 + sw, ly = -h*.34;
    cx.strokeStyle = '#1c2750'; cx.lineWidth = Math.max(3, h*.06); cx.beginPath(); cx.moveTo(h*.12, -h*.56); cx.lineTo(lx, ly - h*.09); cx.stroke();
    cx.strokeStyle = '#6a5a3a'; cx.lineWidth = 1.5; cx.beginPath(); cx.moveTo(lx, ly - h*.09); cx.lineTo(lx, ly - h*.02); cx.stroke();
    cx.fillStyle = '#2a1c0a'; cx.fillRect(lx - h*.045, ly - h*.025, h*.09, h*.012);
    cx.fillStyle = '#ffd070'; cx.fillRect(lx - h*.035, ly - h*.013, h*.07, h*.09); cx.fillStyle = '#2a1c0a'; cx.fillRect(lx - h*.045, ly + h*.075, h*.09, h*.012);
    cx.globalCompositeOperation = 'lighter'; const lg = cx.createRadialGradient(lx, ly + h*.03, 0, lx, ly + h*.03, h*.9); lg.addColorStop(0, 'rgba(255,190,90,.5)'); lg.addColorStop(1, 'rgba(255,120,30,0)'); cx.fillStyle = lg; cx.fillRect(lx - h, ly - h*.9, h*2, h*2);
    cx.restore();
  }

  function pontFrame(dt) {
    if (CW < 10 || !cRock) return; const hr = C.hero, W = CW, H = CH;
    C.flash = Math.max(0, C.flash - dt*2.5); C.shake = Math.max(0, C.shake - dt*40); hr.alpha += (hr.aT - hr.alpha)*Math.min(1, dt*6);
    if (hr.walk) { const w = hr.walk; w.t += dt; const u = clamp(w.t/w.dur, 0, 1), e = u*u*(3 - 2*u); hr.x = w.x0 + (w.x1 - w.x0)*e; hr.y = heroY(hr.x) - w.arc*Math.sin(Math.PI*u); if (u >= 1) { const cb = w.onEnd; hr.walk = null; cb && cb(); } }
    else if (hr.fall) { hr.vy += 1900*dt; hr.y += hr.vy*dt; hr.rot += dt*5; if (hr.y > H + g.hh*2) hr.alpha = 0; }
    else { hr.x = xs(C.pos); hr.y = heroY(hr.x); }
    for (const f of C.falling) { f.vy += 1500*dt; f.y += f.vy*dt; f.rot += f.vr*dt; } C.falling = C.falling.filter(f => f.y < H);

    cx.setTransform(cdpr,0,0,cdpr,0,0); cx.clearRect(0,0,W,H); cx.save(); if (C.shake > .1) cx.translate(rnd(-C.shake, C.shake), rnd(-C.shake, C.shake));
    cx.drawImage(cRock, 0, 0, W, H);
    // abîme
    let gr = cx.createLinearGradient(0, g.gy, 0, H); gr.addColorStop(0, 'rgba(2,4,12,.9)'); gr.addColorStop(.6, 'rgba(10,30,110,.5)'); gr.addColorStop(1, 'rgba(40,100,255,.55)'); cx.fillStyle = gr; cx.fillRect(0, g.gy, W, H - g.gy);
    cx.save(); cx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) { const mx = W*(.12 + .25*i) + Math.sin(tNow*.3 + i*2)*W*.05, my = H*(.86 + .03*Math.sin(tNow*.4 + i)), mg = cx.createRadialGradient(mx, my, 0, mx, my, W*.22); mg.addColorStop(0, 'rgba(70,120,255,.2)'); mg.addColorStop(1, 'rgba(70,120,255,0)'); cx.fillStyle = mg; cx.fillRect(mx - W*.25, my - W*.25, W*.5, W*.5); }
    cx.restore();
    if (ready('crystal')) { const im = imgs.crystal, ar = im.naturalWidth/im.naturalHeight; [[.22,.34,.55],[.5,.44,.72],[.78,.3,.5],[.36,.2,.35],[.66,.22,.38]].forEach(([fx_, fh, al], i) => { const h = H*fh, w = h*ar, pl = .75 + .25*Math.sin(tNow*1.6 + i*1.7); cx.save(); cx.globalAlpha = al*pl; cx.shadowColor = 'rgba(70,130,255,.9)'; cx.shadowBlur = 30; cx.drawImage(im, W*fx_ - w/2, H - h*.82, w, h); cx.restore(); }); }
    // falaises
    const cliff = side => {
      const x0 = side < 0 ? 0 : W, xe = side < 0 ? g.cl : g.cr, dir = side < 0 ? 1 : -1;
      cx.beginPath(); cx.moveTo(x0, H); cx.lineTo(x0, g.gy - 4); cx.lineTo(xe, g.gy - 4); cx.lineTo(xe - dir*6, g.gy + H*.08); cx.lineTo(xe + dir*4, g.gy + H*.2); cx.lineTo(xe - dir*10, g.gy + H*.34); cx.lineTo(xe + dir*2, H*.8); cx.lineTo(xe - dir*6, H); cx.closePath();
      const cg = cx.createLinearGradient(0, g.gy, 0, H); cg.addColorStop(0, '#141a30'); cg.addColorStop(1, '#04050b'); cx.fillStyle = cg; cx.fill(); cx.strokeStyle = 'rgba(120,160,255,.28)'; cx.lineWidth = 2; cx.stroke();
      cx.fillStyle = '#26305a'; cx.fillRect(Math.min(x0, xe), g.gy - 4, Math.abs(xe - x0), 6);
    };
    cliff(-1); cliff(1);
    // trésor
    if (ready('s3')) { const Q = Math.min((W - g.xR)*1.5, H*.3), px_ = Math.min((g.cr + W)/2, W - Q*.45), by_ = g.gy - 2;
      cx.save(); cx.globalCompositeOperation = 'lighter'; const tg = cx.createRadialGradient(px_, by_ - Q*.4, 0, px_, by_ - Q*.4, Q*.9); tg.addColorStop(0, `rgba(255,170,50,${.28 + .08*Math.sin(tNow*3)})`); tg.addColorStop(1, 'rgba(255,120,20,0)'); cx.fillStyle = tg; cx.fillRect(px_ - Q, by_ - Q*1.5, Q*2, Q*1.8); cx.restore();
      cx.save(); cx.shadowColor = 'rgba(0,0,0,.8)'; cx.shadowBlur = 16; cx.drawImage(imgs.s3, px_ - Q/2, by_ - Q*.93, Q, Q); cx.restore(); }
    // torche
    { const tx = g.xL*.5, ty = g.gy - 4, th = g.hh*1.4; cx.fillStyle = '#2a170a'; cx.fillRect(tx - 3, ty - th, 6, th); cx.fillStyle = '#5b4d3d'; cx.fillRect(tx - 7, ty - th - 3, 14, 6);
      cx.save(); cx.globalCompositeOperation = 'lighter'; const fl = 1 + .1*Math.sin(tNow*17) + .06*Math.sin(tNow*29), fg = cx.createRadialGradient(tx, ty - th - 6, 0, tx, ty - th - 6, g.hh*2.4*fl); fg.addColorStop(0, 'rgba(255,170,60,.45)'); fg.addColorStop(1, 'rgba(255,90,10,0)'); cx.fillStyle = fg; cx.fillRect(tx - g.hh*3, ty - th - g.hh*3, g.hh*6, g.hh*6);
      const ff = cx.createRadialGradient(tx, ty - th - 6, 0, tx, ty - th - 11, 12*fl); ff.addColorStop(0, 'rgba(255,240,170,1)'); ff.addColorStop(.5, 'rgba(255,150,40,.95)'); ff.addColorStop(1, 'rgba(220,60,10,0)'); cx.fillStyle = ff; cx.beginPath(); cx.ellipse(tx, ty - th - 12, 7*fl, 15*fl, 0, 0, TAU); cx.fill(); cx.restore(); }
    // corde-main courante
    const xa = xs(0) - g.step*.25, xb = xs(NP + 1) + g.step*.25, rail = x => yAt(x) - g.hh*.55;
    cx.strokeStyle = '#2f1d0e'; cx.lineWidth = Math.max(2.5, g.step*.09); cx.lineCap = 'round'; cx.beginPath(); for (let x = xa; x <= xb; x += 6) x === xa ? cx.moveTo(x, rail(x)) : cx.lineTo(x, rail(x)); cx.stroke();
    cx.strokeStyle = 'rgba(190,140,80,.35)'; cx.lineWidth = 1; cx.stroke();
    cx.strokeStyle = 'rgba(70,45,22,.8)'; cx.lineWidth = 1; for (let p = .5; p <= NP + .6; p += 1) { const x = xs(p); cx.beginPath(); cx.moveTo(x, rail(x)); cx.lineTo(x, yAt(x)); cx.stroke(); }
    for (const x of [xa, xb]) { cx.fillStyle = '#3a2210'; cx.fillRect(x - Math.max(3, g.step*.1), g.gy - g.hh*.75, Math.max(6, g.step*.2), g.hh*.78); cx.fillStyle = '#6b4524'; cx.fillRect(x - Math.max(4, g.step*.13), g.gy - g.hh*.78, Math.max(8, g.step*.26), 5); }
    // planches
    const nextP = C.state === 'play' ? C.pos + 1 : -1, tk = Math.max(6, g.step*.22);
    for (let p = 1; p <= NP; p++) {
      if (C.broken.has(p)) continue; const x = xs(p), y = yAt(x), a = Math.atan2(yAt(x + 2) - yAt(x - 2), 4), on = !hr.fall && Math.abs(hr.x - x) < g.step*.5, w = g.step*.88;
      cx.save(); cx.translate(x, y + (on ? 2 : 0)); cx.rotate(a);
      const wg = cx.createLinearGradient(0, -tk/2, 0, tk/2); const cl = p <= C.pos; wg.addColorStop(0, cl ? '#a06a30' : '#70492a'); wg.addColorStop(1, cl ? '#4e2e14' : '#2e1d0e'); cx.fillStyle = wg;
      if (cl) { cx.shadowColor = 'rgba(255,190,70,.6)'; cx.shadowBlur = 10; } else if (p === nextP) { cx.shadowColor = 'rgba(110,160,255,.9)'; cx.shadowBlur = 8 + 8*Math.sin(tNow*5); }
      cx.beginPath(); if (cx.roundRect) cx.roundRect(-w/2, -tk/2, w, tk, 2); else cx.rect(-w/2, -tk/2, w, tk); cx.fill(); cx.shadowBlur = 0;
      cx.strokeStyle = cl ? 'rgba(255,210,110,.75)' : p === nextP ? `rgba(130,175,255,${.55 + .35*Math.sin(tNow*5)})` : 'rgba(0,0,0,.6)'; cx.lineWidth = cl || p === nextP ? 1.8 : 1; cx.stroke();
      cx.strokeStyle = 'rgba(0,0,0,.28)'; cx.lineWidth = 1; cx.beginPath(); cx.moveTo(-w*.4, -tk*.12); cx.lineTo(w*.4, -tk*.12); cx.moveTo(-w*.35, tk*.2); cx.lineTo(w*.45, tk*.2); cx.stroke();
      cx.fillStyle = 'rgba(20,12,6,.8)'; cx.beginPath(); cx.arc(-w*.4, 0, Math.max(1, tk*.1), 0, TAU); cx.arc(w*.4, 0, Math.max(1, tk*.1), 0, TAU); cx.fill(); cx.restore();
    }
    // étiquettes sous les planches
    const fs = clamp(g.step*.27, 8, 13); cx.font = `700 ${fs}px Cinzel, "Cinzel Repli", Georgia, serif`; cx.textAlign = 'center'; cx.textBaseline = 'top';
    for (let p = 1; p <= NP; p++) { if (C.broken.has(p)) continue; if (!(g.step >= 40 || p % 3 === 0 || p === nextP || p <= C.pos)) continue; const x = xs(p);
      cx.fillStyle = p <= C.pos ? '#ffe29a' : p === nextP ? '#a9c6ff' : 'rgba(150,165,210,.55)'; cx.fillText('×' + mFmt(MULT[p]), x, yAt(x) + tk*.9 + 2); }
    // planches qui tombent
    for (const f of C.falling) { const x = xs(f.p), y = yAt(x) + f.y, w = g.step*.88; cx.save(); cx.translate(x, y); cx.rotate(f.rot); cx.fillStyle = '#5a3a1c'; cx.strokeStyle = 'rgba(0,0,0,.6)'; cx.fillRect(-w/2, -tk/2, w, tk); cx.strokeRect(-w/2, -tk/2, w, tk); cx.restore(); }
    // éclat lumineux de la lanterne sur le pont
    if (hr.alpha > .1 && !hr.fall) { cx.save(); cx.globalCompositeOperation = 'lighter'; const lx = hr.x + g.hh*.3, ly = hr.y - g.hh*.34, lg = cx.createRadialGradient(lx, ly, 0, lx, ly, g.step*4); lg.addColorStop(0, 'rgba(255,190,90,.22)'); lg.addColorStop(1, 'rgba(255,120,30,0)'); cx.fillStyle = lg; cx.fillRect(lx - g.step*4, ly - g.step*4, g.step*8, g.step*8); cx.restore(); }
    drawHero();
    if (C.flash > .01) { cx.fillStyle = `rgba(150,190,255,${C.flash*.3})`; cx.fillRect(0, 0, W, H); }
    const vg = cx.createRadialGradient(W/2, H/2, H*.35, W/2, H/2, H*.95); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)'); cx.fillStyle = vg; cx.fillRect(0, 0, W, H);
    cx.restore();
  }
  $('cGo').onclick = () => { ac(); cStart(); };
  $('cStep').onclick = () => cAdvance(1); $('cLeap').onclick = () => cAdvance(2); $('cCash').onclick = () => cCash();
  cHud(); cHist(); cButtons();

  // ================= JEU 4 : LE LAC DES ESPRITS =================
  // La prise est tirée par le serveur et reste secrète : chaque tirage renvoie la hausse de tension,
  // ou la ligne qui casse. On ne voit la prise qu'à la fin.
  const lcv = $('lc'), lx = lcv.getContext('2d'); let LW = 0, LH = 0, ldpr = 1, lRock = null;
  const L = { state:'idle', bet:0, tirages:0, tension:0, aff:0, hausse:0, prise:0, hist:[], lance:0, attente:0, tire:0, casse:0, sortie:0, morsure:0, ondes:[], gouttes:[], shake:0, flash:0 };
  const lBet = makeBet($('lBet'));
  const lSay = t => { $('ls').textContent = t; };
  // les cristaux de la rive : [x, hauteur (fraction), image, opacité]
  const RIVE = [[.06,.26,'crystal',.85],[.17,.17,'gem',.9],[.29,.1,'crystal',.6],[.74,.13,'gem',.7],[.86,.24,'crystal',.9],[.96,.15,'gem',.75]];

  function lFit() {
    const r = $('lStage').getBoundingClientRect(); if (r.width < 10) return;
    LW = r.width; LH = r.height; ldpr = Math.min(2, devicePixelRatio || 1); lcv.width = LW*ldpr; lcv.height = LH*ldpr;
    lRock = caveTexture(LW, LH, ldpr, ['#020810','#061a2a','#030b14','rgba(90,200,220,.04)','rgba(80,190,220,.22)'], 45);
  }
  const lSurface = () => LH*.52;
  const lPoint = () => [LW*.64, lSurface()];
  const lRatio = () => clamp(L.aff/LAC.tensionMax, 0, 1);
  function lGeo() {
    const k = lRatio(), base = [LW*.08, LH*1.04], tip = [LW*.34 + k*LW*.04, LH*.2 + k*LH*.12];
    return { base, tip, k };
  }
  function lHud() {
    const k = lRatio(), j = $('lJauge');
    j.style.width = (k*100).toFixed(1) + '%';
    j.style.background = `linear-gradient(90deg, #4fd1c5, hsl(${Math.round(170 - 170*k)}, 85%, ${55 - 10*k}%))`;
    $('lm').textContent = Math.round(k*100) + ' %';
    $('lm').style.color = k < .35 ? '#bff4ee' : k < .65 ? '#ffd27a' : '#ff7a5a';
    $('lTirages').textContent = `${L.tirages} / ${LAC.tirages}`;
  }
  function lHist() { $('lHist').innerHTML = L.hist.slice(-9).map(h => `<span class="${h.casse ? '' : h.mult >= 2 ? 'h' : 'm'}">${h.texte}</span>`).join(''); }
  function lButtons() {
    const idle = L.state === 'idle' || L.state === 'pose';
    $('lGo').style.display = idle ? '' : 'none'; $('lTirer').style.display = $('lCouper').style.display = idle ? 'none' : '';
    $('lGo').disabled = L.state === 'pose' || !peutMiser(); $('lGoT').textContent = L.state === 'pose' ? 'La ligne file…' : 'Lancer la ligne'; $('lGoS').textContent = `MISE ${fmt(BET)} ${unite().toUpperCase()} · ESPACE`;
    if (idle) return;
    const libre = L.state === 'ferre';
    $('lTirer').disabled = !libre; $('lTirerS').textContent = `TIRAGE ${Math.min(LAC.tirages, L.tirages + 1)} / ${LAC.tirages} · ESPACE`;
    $('lCouper').disabled = !libre; $('lCouperS').textContent = `RÉCUPÈRE ${gain(L.bet, LAC.coupe)} · ENTRÉE`;
  }
  function lOnde(x, y, n, f) { for (let i = 0; i < n; i++) L.ondes.push({ x, y, r: 4 + i*10, v: 40 + f*30, a: .7 - i*.12 }); }
  function lEclabousse(x, y, n, f) { for (let i = 0; i < n; i++) L.gouttes.push({ x, y, vx: rnd(-120, 120)*f, vy: -rnd(120, 380)*f, life: 0, max: rnd(.6, 1.1) }); }
  async function lStart() {
    if (L.state !== 'idle' || !peutMiser()) return; ac();
    L.state = 'pose'; setBusy(3, true); lBet.lock(true); lButtons();
    const r = await appel(serveur.commencer('lac', monnaie, BET));
    if (!r) { if (!demonte) { L.state = 'idle'; setBusy(3, false); lBet.lock(false); lButtons(); } return; }
    setBourse(r.bourse); annoncerReglee(r.reglee);
    L.bet = r.mise; L.tirages = 0; L.tension = 0; L.hausse = 0; L.prise = 0; L.lance = 0; L.casse = 0; L.sortie = 0; L.morsure = 0;
    L.state = 'lance'; L.attente = rnd(.7, 1.6);
    noise(.6, 'bandpass', 1400, 300, .1); lSay('La ligne file vers les eaux noires…'); lButtons(); lHud();
  }
  function lMord() {
    L.state = 'ferre'; L.morsure = 1; const [px, py] = lPoint(); lOnde(px, py, 3, 1.5); lEclabousse(px, py, 8, .6);
    noise(.25, 'lowpass', 600, 120, .3); tone(140, 70, .25, 'sine', .25);
    lSay('Quelque chose mord ! Remonte… et écoute la ligne.'); lButtons();
  }
  async function lTirer() {
    if (L.state !== 'ferre') return; ac(); L.state = 'tire'; L.tire = 1; lButtons();
    for (let i = 0; i < 6; i++) tone(900 + i*60, 700, .05, 'square', .025, i*.05);   // le moulinet
    const r = await appel(serveur.tirer());
    if (!r) { if (!demonte) { L.state = 'ferre'; lButtons(); } return; }
    L.tirages = r.tirages;
    if (r.casse) { lCasse(r); return; }
    L.tension = r.tension; L.hausse = r.hausse;
    const k = clamp(r.tension/LAC.tensionMax, 0, 1), [px, py] = lPoint(), rc = lcv.getBoundingClientRect();
    tone(180 + k*500, 140 + k*400, .5, 'sawtooth', .04 + k*.05); L.shake = 2 + k*8; lOnde(px, py, 2, 1 + k);
    floatText(rc.left + px, rc.top + py - LH*.18, '+' + r.hausse, k > .6 ? 'bad' : 'blue');
    if (r.fini) { lSortie(r); return; }
    L.state = 'ferre';
    lSay(r.hausse <= 11 ? 'La ligne se tend à peine.' : r.hausse <= 16 ? 'Ça résiste un peu…' : r.hausse <= 22 ? 'La canne plie ! C\'est lourd…' : 'La ligne hurle ! Une force immense tire vers le fond !');
    lButtons(); lHud();
  }
  function lCasse(r) {
    L.state = 'casse'; L.casse = .0001; L.prise = r.prise; setBourse(r.bourse);
    noise(.4, 'highpass', 4000, 900, .4); tone(1200, 200, .3, 'triangle', .08); flashScreen('rgba(80,200,220,.45)', 160); L.shake = 16;
    const rc = lcv.getBoundingClientRect(), [px, py] = lPoint(); floatText(rc.left + px, rc.top + py - LH*.2, '−' + fmt(L.bet), 'bad');
    lSay(`La ligne casse ! C'était ${LAC.prises[r.prise].nom}…`);
    L.hist.push({ texte: 'Cassée', casse: true }); lHist(); lButtons(); plusTard(lFin, 2300);
  }
  function lSortie(r) {
    L.state = 'sortie'; L.sortie = .0001; L.prise = r.prise; setBourse(r.bourse);
    const p = LAC.prises[r.prise], [px, py] = lPoint();
    lEclabousse(px, py, r.prise === 4 ? 40 : 18, r.prise === 4 ? 1.6 : 1); lOnde(px, py, 4, 2); noise(.6, 'lowpass', 1800, 200, .35);
    if (r.prise === 4) { L.shake = 30; tone(70, 35, 1.4, 'sawtooth', .2); flashScreen('rgba(60,220,200,.4)', 220); }
    lSay(`Tu sors ${p.nom} ! ×${String(p.mult).replace('.', ',')}`);
    plusTard(() => {
      const rc = lcv.getBoundingClientRect();
      if (r.gain > 0) { flyCoins(rc.left + px, rc.top + py - LH*.2, Math.min(44, 6 + Math.round(p.mult*4))); sCoins(r.prise === 1 ? 4 : 12); }
      floatText(rc.left + px, rc.top + py - LH*.3, '+' + fmt(r.gain), p.mult >= 1 ? 'big' : '');
      if (p.mult >= 2) sPing(r.prise === 4 ? 660 : 520);
    }, 900);
    L.hist.push({ texte: p.court, mult: p.mult }); lHist(); lButtons(); plusTard(lFin, 3000);
  }
  async function lCouper() {
    if (L.state !== 'ferre') return; ac(); L.state = 'tire'; lButtons();
    const r = await appel(serveur.encaisser());
    if (!r) { if (!demonte) { L.state = 'ferre'; lButtons(); } return; }
    setBourse(r.bourse); L.state = 'coupe'; L.casse = .0001; noise(.2, 'highpass', 5000, 1500, .2);
    const rc = lcv.getBoundingClientRect(), [px, py] = lPoint(); floatText(rc.left + px, rc.top + py - LH*.2, '+' + fmt(r.gain), 'blue');
    lSay('Tu coupes la ligne. La chose retourne au fond du lac…');
    L.hist.push({ texte: 'Coupée', casse: true }); lHist(); lButtons(); plusTard(lFin, 1500);
  }
  function lFin() {
    L.state = 'idle'; L.tension = 0; L.tirages = 0; L.prise = 0; setBusy(3, false); lBet.lock(false);
    lSay('Le lac attend ta ligne.'); lButtons(); lHud();
  }
  // la prise, qui sort de l'eau (x, y : le bas de l'objet ; s : sa taille)
  function drawPrise(t, x, y, s) {
    lx.save();
    if (t === 1) {   // un poisson pâle, en facettes
      lx.translate(x, y - s*.4); lx.rotate(Math.sin(tNow*9)*.25);
      lx.beginPath(); lx.moveTo(-s*.5, 0); lx.lineTo(-s*.15, -s*.22); lx.lineTo(s*.3, -s*.16); lx.lineTo(s*.42, 0); lx.lineTo(s*.3, s*.15); lx.lineTo(-s*.15, s*.2); lx.closePath();
      const g = lx.createLinearGradient(0, -s*.22, 0, s*.2); g.addColorStop(0, '#cfe4ea'); g.addColorStop(1, '#4e6f80'); lx.fillStyle = g; lx.fill();
      lx.strokeStyle = 'rgba(20,40,50,.6)'; lx.lineWidth = 1.2; lx.beginPath(); lx.moveTo(-s*.15, -s*.22); lx.lineTo(0, s*.18); lx.moveTo(s*.3, -s*.16); lx.lineTo(s*.12, s*.17); lx.stroke();
      lx.beginPath(); lx.moveTo(-s*.48, 0); lx.lineTo(-s*.72, -s*.2); lx.lineTo(-s*.66, 0); lx.lineTo(-s*.72, s*.2); lx.closePath(); lx.fillStyle = '#6f8f9e'; lx.fill();
      lx.fillStyle = '#0a1418'; lx.beginPath(); lx.arc(s*.26, -s*.04, s*.035, 0, TAU); lx.fill();
    } else if (t === 2) {   // la pièce engloutie
      if (ready('coin')) for (let i = 0; i < 3; i++) lx.drawImage(imgs.coin, x - s*.35 + i*s*.12, y - s*.75 + Math.sin(tNow*4 + i)*4, s*.6, s*.6);
    } else if (t === 3) {   // le cristal des esprits
      lx.globalCompositeOperation = 'lighter'; const g = lx.createRadialGradient(x, y - s*.5, 0, x, y - s*.5, s); g.addColorStop(0, 'rgba(120,170,255,.55)'); g.addColorStop(1, 'rgba(120,170,255,0)'); lx.fillStyle = g; lx.fillRect(x - s, y - s*1.5, s*2, s*2);
      lx.globalCompositeOperation = 'source-over'; if (ready('gem')) { const im = imgs.gem, ar = im.naturalWidth/im.naturalHeight; lx.drawImage(im, x - s*ar*.45, y - s*.95, s*ar*.9, s*.9); }
    } else {   // la créature : un serpent des abysses, en facettes ; le cou sort de l'eau, la tête se tourne vers toi
      lx.translate(x, y); const h = s*1.5, w = s*.3;
      lx.beginPath(); lx.moveTo(-w, 0); lx.quadraticCurveTo(-w*1.5, -h*.5, -w*.3, -h*.8); lx.lineTo(w*.6, -h*.74); lx.quadraticCurveTo(-w*.2, -h*.45, w, 0); lx.closePath();
      let g = lx.createLinearGradient(-w, -h, w, 0); g.addColorStop(0, '#2c5a5c'); g.addColorStop(.6, '#0f2c30'); g.addColorStop(1, '#051214'); lx.fillStyle = g; lx.fill();
      lx.strokeStyle = 'rgba(120,220,210,.3)'; lx.lineWidth = 1.5; lx.stroke();
      lx.strokeStyle = 'rgba(0,0,0,.4)'; lx.beginPath(); for (let i = 1; i < 6; i++) { const k = i/6; lx.moveTo(-w*(1 - k*.4) - w*.3*Math.sin(k*3), -h*.8*k); lx.lineTo(w*(1 - k*.5), -h*.74*k); } lx.stroke();
      // la tête : un coin pointé vers la droite, la gueule entrouverte
      lx.beginPath(); lx.moveTo(-w*.6, -h*.72); lx.lineTo(-w*.4, -h*.97); lx.lineTo(w*.6, -h*1.03); lx.lineTo(w*2.1, -h*.9); lx.lineTo(w*2.05, -h*.84); lx.lineTo(w*.9, -h*.82); lx.lineTo(w*1.8, -h*.74); lx.lineTo(w*1.7, -h*.69); lx.lineTo(w*.4, -h*.66); lx.closePath();
      g = lx.createLinearGradient(0, -h*1.03, 0, -h*.66); g.addColorStop(0, '#3a6e6c'); g.addColorStop(1, '#0b2226'); lx.fillStyle = g; lx.fill(); lx.strokeStyle = 'rgba(140,230,220,.4)'; lx.stroke();
      lx.fillStyle = '#020607'; lx.beginPath(); lx.moveTo(w*2.05, -h*.84); lx.lineTo(w*.9, -h*.82); lx.lineTo(w*1.8, -h*.74); lx.closePath(); lx.fill();
      lx.fillStyle = '#d9d2c0'; for (let i = 0; i < 4; i++) { const tx = w*(1.1 + i*.22); lx.beginPath(); lx.moveTo(tx, -h*.835); lx.lineTo(tx + w*.06, -h*.8); lx.lineTo(tx + w*.12, -h*.83); lx.closePath(); lx.fill(); }
      // la crête
      lx.fillStyle = '#163a3c'; lx.beginPath(); lx.moveTo(-w*.4, -h*.97); lx.lineTo(-w*.9, -h*1.12); lx.lineTo(-w*.1, -h*1.0); lx.lineTo(-w*.3, -h*1.18); lx.lineTo(w*.3, -h*1.02); lx.closePath(); lx.fill();
      lx.globalCompositeOperation = 'lighter';
      const g2 = lx.createRadialGradient(w*.85, -h*.92, 0, w*.85, -h*.92, w*.5); g2.addColorStop(0, 'rgba(220,255,140,1)'); g2.addColorStop(.3, 'rgba(120,255,140,.6)'); g2.addColorStop(1, 'rgba(60,200,120,0)'); lx.fillStyle = g2; lx.fillRect(w*.35, -h*.92 - w*.5, w, w);
    }
    lx.restore();
  }
  function lacFrame(dt) {
    if (LW < 10 || !lRock) return;
    L.shake = Math.max(0, L.shake - dt*40); L.morsure = Math.max(0, L.morsure - dt*1.5); L.tire = Math.max(0, L.tire - dt*2.5);
    L.aff += ((L.state === 'idle' ? 0 : L.tension) - L.aff)*Math.min(1, dt*(L.state === 'idle' ? 2 : 5)); lHud();
    if (L.state === 'lance') { L.lance = Math.min(1, L.lance + dt/.8); if (L.lance >= 1) { if (!L.plouf) { L.plouf = true; const [px, py] = lPoint(); lOnde(px, py, 2, .8); noise(.25, 'lowpass', 900, 200, .15); } L.attente -= dt; if (L.attente <= 0) { L.plouf = false; lMord(); } } }
    if (L.casse) L.casse = Math.min(1, L.casse + dt/1.6);
    if (L.sortie) L.sortie = Math.min(1, L.sortie + dt/1.1);
    L.ondes = L.ondes.filter(o => { o.r += o.v*dt; o.a -= dt*.45; return o.a > 0; });
    L.gouttes = L.gouttes.filter(g => { g.life += dt; g.x += g.vx*dt; g.y += g.vy*dt; g.vy += 900*dt; return g.life < g.max; });

    const W = LW, H = LH, sy = lSurface(), [px, py] = lPoint(), { base, tip, k } = lGeo();
    lx.setTransform(ldpr,0,0,ldpr,0,0); lx.clearRect(0,0,W,H); lx.save(); if (L.shake > .1) lx.translate(rnd(-L.shake, L.shake), rnd(-L.shake, L.shake));
    lx.drawImage(lRock, 0, 0, W, H);
    // les cristaux de la rive et leur lumière
    const cristal = (fx_, fh, im, al, refl) => {
      if (!ready(im)) return; const i = imgs[im], h = H*fh, w = h*i.naturalWidth/i.naturalHeight, x = W*fx_, pl = .8 + .2*Math.sin(tNow*1.3 + fx_*9);
      lx.save(); lx.globalAlpha = al*pl*(refl ? .28 : 1);
      if (refl) { lx.translate(x, sy); lx.scale(1, -.7); lx.drawImage(i, -w/2, -h, w, h); }
      else { lx.shadowColor = 'rgba(90,200,230,.9)'; lx.shadowBlur = 26; lx.drawImage(i, x - w/2, sy - h*.95, w, h); }
      lx.restore();
    };
    lx.save(); lx.globalCompositeOperation = 'lighter';
    for (const [fx_, fh] of RIVE) { const x = W*fx_, g = lx.createRadialGradient(x, sy - H*fh*.4, 0, x, sy - H*fh*.4, H*fh*1.6); g.addColorStop(0, 'rgba(70,190,220,.18)'); g.addColorStop(1, 'rgba(70,190,220,0)'); lx.fillStyle = g; lx.fillRect(x - H*fh*1.6, sy - H*fh*2, H*fh*3.2, H*fh*3.2); }
    lx.restore();
    // la rive
    lx.fillStyle = '#04080e'; lx.beginPath(); lx.moveTo(0, sy + 2); for (let x = 0; x <= W; x += W/14) lx.lineTo(x, sy - 6 - 10*Math.abs(Math.sin(x*.031))); lx.lineTo(W, sy + 2); lx.closePath(); lx.fill();
    for (const c of RIVE) cristal(c[0], c[1], c[2], c[3], false);
    // l'eau
    const gw = lx.createLinearGradient(0, sy, 0, H); gw.addColorStop(0, 'rgba(10,52,72,.95)'); gw.addColorStop(.45, 'rgba(4,22,36,.97)'); gw.addColorStop(1, 'rgba(1,6,12,1)'); lx.fillStyle = gw; lx.fillRect(0, sy, W, H - sy);
    for (const c of RIVE) cristal(c[0], c[1], c[2], c[3], true);
    // l'ombre sous l'eau : plus la tension monte par tirage, plus elle est grosse ; elle remonte à chaque tirage
    if (L.state === 'ferre' || L.state === 'tire' || (L.state === 'lance' && L.lance >= 1)) {
      const moy = L.tirages ? L.tension/L.tirages : 10, taille = (14 + moy*2.2)*Math.min(1.4, W/800 + .4), prof = sy + 24 + (1 - L.tirages/LAC.tirages)*(H - sy)*.55;
      const ox = px + Math.sin(tNow*(1.5 + k*6))*(8 + k*24), g = lx.createRadialGradient(ox, prof, 0, ox, prof, taille*2);
      g.addColorStop(0, `rgba(0,0,0,${.35 + .3*k})`); g.addColorStop(1, 'rgba(0,0,0,0)'); lx.fillStyle = g; lx.beginPath(); lx.ellipse(ox, prof, taille*2, taille*.9, 0, 0, TAU); lx.fill();
    }
    // les reflets à la surface
    lx.save(); lx.globalCompositeOperation = 'lighter'; lx.strokeStyle = 'rgba(120,220,240,.16)'; lx.lineWidth = 1.2;
    for (let i = 0; i < 26; i++) { const y = sy + 6 + (i*37 % (H - sy - 10)), x = (i*173 + tNow*(10 + i % 5*4)) % (W + 80) - 40, l = 20 + i % 4*14; lx.beginPath(); lx.moveTo(x, y); lx.lineTo(x + l, y + Math.sin(tNow + i)*1.5); lx.stroke(); }
    for (const o of L.ondes) { lx.strokeStyle = `rgba(150,230,240,${o.a*.6})`; lx.beginPath(); lx.ellipse(o.x, o.y, o.r, o.r*.28, 0, 0, TAU); lx.stroke(); }
    lx.restore();
    // la prise qui sort
    if (L.sortie && L.prise) {
      const u = L.sortie, e = 1 - Math.pow(1 - u, 3), s = (L.prise === 4 ? H*.26 : H*.16)*Math.min(1.3, W/700 + .3), y = sy + s*.3 - e*(L.prise === 4 ? s*.15 : H*.2);
      lx.save(); lx.beginPath(); lx.rect(0, 0, W, sy + (L.prise === 4 ? 0 : H)); lx.clip(); drawPrise(L.prise, px, y, s); lx.restore();
      if (L.prise === 4) { lx.fillStyle = 'rgba(10,52,72,.6)'; lx.fillRect(0, sy, W, 4); }
    }
    // la canne
    const bend = k*.35 + L.tire*.08 + L.morsure*.1, cxr = base[0] + (tip[0] - base[0])*.55 + bend*W*.08, cyr = base[1] + (tip[1] - base[1])*.55 + bend*H*.04;
    lx.lineCap = 'round'; lx.strokeStyle = '#1d120a'; lx.lineWidth = Math.max(5, W*.009); lx.beginPath(); lx.moveTo(base[0], base[1]); lx.quadraticCurveTo(cxr, cyr, tip[0], tip[1]); lx.stroke();
    lx.strokeStyle = 'rgba(190,150,100,.45)'; lx.lineWidth = 1.5; lx.stroke();
    lx.fillStyle = '#2c2a2e'; lx.strokeStyle = 'rgba(200,190,170,.4)'; lx.beginPath(); lx.arc(base[0] + (tip[0] - base[0])*.12, base[1] + (tip[1] - base[1])*.12, Math.max(7, W*.012), 0, TAU); lx.fill(); lx.stroke();
    // la ligne
    const col = `rgba(${Math.round(220 + 35*k)},${Math.round(230 - 150*k)},${Math.round(220 - 170*k)},.9)`;
    lx.strokeStyle = col; lx.lineWidth = 1.3 + k;
    if (L.state === 'idle' || L.state === 'pose') { lx.beginPath(); lx.moveTo(tip[0], tip[1]); lx.quadraticCurveTo(tip[0] + 8, tip[1] + H*.1, tip[0] + 2, tip[1] + H*.16 + Math.sin(tNow*2)*3); lx.stroke(); }
    else if (L.state === 'lance' && L.lance < 1) { const u = L.lance, ex = tip[0] + (px - tip[0])*u, ey = tip[1] + (py - tip[1])*u - Math.sin(Math.PI*u)*H*.18; lx.beginPath(); lx.moveTo(tip[0], tip[1]); lx.quadraticCurveTo((tip[0] + ex)/2, Math.min(tip[1], ey) - 20, ex, ey); lx.stroke(); }
    else if (L.casse) { const u = L.casse, a = 1 - u; lx.globalAlpha = Math.max(0, a); lx.beginPath(); lx.moveTo(tip[0], tip[1]); lx.quadraticCurveTo(tip[0] + 30, tip[1] + H*.2*u + 40, tip[0] + 10, tip[1] + H*.3*u + 30); lx.stroke(); lx.beginPath(); lx.moveTo(px, py); lx.lineTo(px - 20, py - H*.15*(1 - u)); lx.stroke(); lx.globalAlpha = 1; }
    else {
      let ex = px, ey = py + Math.sin(tNow*3)*2 + L.morsure*10;
      if (L.sortie && L.prise) { ey = py - (1 - Math.pow(1 - L.sortie, 3))*(L.prise === 4 ? H*.25 : H*.2); }
      const jit = (L.state === 'ferre' || L.state === 'tire') ? (1 + k*5)*Math.sin(tNow*55) : 0, mx = (tip[0] + ex)/2, my = (tip[1] + ey)/2;
      const ang = Math.atan2(ey - tip[1], ex - tip[0]) + Math.PI/2;
      lx.beginPath(); lx.moveTo(tip[0], tip[1]); lx.quadraticCurveTo(mx + Math.cos(ang)*jit, my + Math.sin(ang)*jit + (1 - k)*14, ex, ey); lx.stroke();
      if (k > .55 && (L.state === 'ferre' || L.state === 'tire')) { lx.save(); lx.globalCompositeOperation = 'lighter'; lx.strokeStyle = `rgba(255,90,60,${(k - .55)*.9*(.6 + .4*Math.sin(tNow*20))})`; lx.lineWidth = 4; lx.stroke(); lx.restore(); }
      // le flotteur
      if (!L.sortie) { lx.fillStyle = '#e8dcc4'; lx.beginPath(); lx.arc(ex, ey - 3, 4, Math.PI, TAU); lx.fill(); lx.fillStyle = '#a32a22'; lx.beginPath(); lx.arc(ex, ey - 3, 4, 0, Math.PI); lx.fill(); }
    }
    // les gouttes
    lx.fillStyle = 'rgba(170,235,245,.8)'; for (const g of L.gouttes) { lx.globalAlpha = 1 - g.life/g.max; lx.fillRect(g.x, g.y, 2.5, 2.5); } lx.globalAlpha = 1;
    const vg = lx.createRadialGradient(W/2, H/2, H*.35, W/2, H/2, H*.95); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.6)'); lx.fillStyle = vg; lx.fillRect(0, 0, W, H);
    lx.restore();
  }
  $('lGo').onclick = () => { ac(); lStart(); };
  $('lTirer').onclick = () => lTirer(); $('lCouper').onclick = () => lCouper();
  lHud(); lHist(); lButtons();

  // ================= JEU 5 : LE ROI LICHE =================
  // Chaque échange est résolu par le serveur ; on rejoue ici ce qu'il raconte (mon geste, puis sa riposte).
  const kcv = $('kc'), kx = kcv.getContext('2d'); let KW = 0, KH = 0, kdpr = 1, kRock = null;
  const K = { state:'idle', bet:0, manche:0, pv:LICHE.pv, pvL:LICHE.pvLiche[0], pvLMax:LICHE.pvLiche[0], sort:0, potions:LICHE.potions, affPv:LICHE.pv, affPvL:LICHE.pvLiche[0],
    coup:0, frappe:0, garde:0, soin:0, reforme:0, brise:0, mort:0, shake:0, parts:[], hist:[], sortJoue:false };
  const kBet = makeBet($('kBet'));
  const kSay = t => { $('ks').textContent = t; };
  const kMult = () => LICHE.mult[K.manche];
  function kFit() {
    const r = $('kStage').getBoundingClientRect(); if (r.width < 10) return;
    KW = r.width; KH = r.height; kdpr = Math.min(2, devicePixelRatio || 1); kcv.width = KW*kdpr; kcv.height = KH*kdpr;
    kRock = caveTexture(KW, KH, kdpr, ['#07040c','#150b20','#06030a','rgba(180,120,255,.03)','rgba(160,110,255,.2)'], 57);
  }
  function kHud() {
    $('kBarL').style.width = clamp(K.affPvL/K.pvLMax*100, 0, 100) + '%'; $('kPvL').textContent = `${Math.max(0, Math.round(K.affPvL))} / ${K.pvLMax}`;
    $('kBarJ').style.width = clamp(K.affPv/LICHE.pv*100, 0, 100) + '%'; $('kPvJ').textContent = `${Math.max(0, Math.round(K.affPv))} / ${LICHE.pv}`;
    $('kBarJ').classList.toggle('bas', K.affPv < 35);
    const enJeu = K.state !== 'idle' && K.state !== 'pose';
    $('kManche').textContent = `MANCHE ${Math.min(LICHE.manches, K.manche + 1)} / ${LICHE.manches}`;
    $('km').textContent = '×' + (enJeu ? kMult() : LICHE.mult[1]).toFixed(2);
    $('kmS').textContent = enJeu ? (K.manche ? `GAIN ACTUEL · PROCHAINE MANCHE ×${LICHE.mult[Math.min(LICHE.manches, K.manche + 1)]}` : 'FUIR MAINTENANT : LA MOITIÉ DE LA MISE') : 'LA PREMIÈRE MANCHE GAGNÉE';
    const it = $('kInt'); it.textContent = !enJeu ? 'Le Roi Liche attend sur son trône.' : K.sort ? 'Il prépare un sort dévastateur !' : 'Il lève son bâton pour frapper.';
    it.classList.toggle('sort', enJeu && !!K.sort);
  }
  function kHist() { $('kHist').innerHTML = K.hist.slice(-9).map(h => `<span class="${h.mort ? '' : h.m >= 4.8 ? 'h' : 'm'}">${h.texte}</span>`).join(''); }
  function kButtons() {
    const idle = K.state === 'idle' || K.state === 'pose';
    $('kGo').style.display = idle ? '' : 'none'; ['kAtq', 'kDef', 'kSoin', 'kFuir'].forEach(id => { $(id).style.display = idle ? 'none' : ''; });
    $('kGo').disabled = K.state === 'pose' || !peutMiser(); $('kGoT').textContent = K.state === 'pose' ? 'Tu entres dans la crypte…' : 'Défier le Roi Liche'; $('kGoS').textContent = `MISE ${fmt(BET)} ${unite().toUpperCase()} · ESPACE`;
    if (idle) return;
    const libre = K.state === 'combat';
    $('kAtq').disabled = !libre; $('kDef').disabled = !libre;
    $('kSoin').disabled = !libre || K.potions <= 0 || K.pv >= LICHE.pv; $('kSoinS').textContent = `${K.potions} POTION${K.potions > 1 ? 'S' : ''} · S`;
    $('kFuir').disabled = !libre; $('kFuirT').textContent = `Fuir avec ${gain(K.bet, kMult())}`; $('kFuirS').textContent = 'ENTRÉE';
  }
  function kEtat(e) { K.manche = e.manche; K.pv = e.pv; K.pvL = e.pv_liche; K.pvLMax = e.pv_liche_max ?? K.pvLMax; K.sort = e.intention; K.potions = e.potions; }
  async function kStart() {
    if (K.state !== 'idle' || !peutMiser()) return; ac();
    K.state = 'pose'; setBusy(4, true); kBet.lock(true); kButtons();
    const r = await appel(serveur.commencer('liche', monnaie, BET));
    if (!r) { if (!demonte) { K.state = 'idle'; setBusy(4, false); kBet.lock(false); kButtons(); } return; }
    setBourse(r.bourse); annoncerReglee(r.reglee);
    K.bet = r.mise; kEtat(r.liche); K.affPv = K.pv; K.affPvL = K.pvL; K.brise = 0; K.mort = 0; K.reforme = 0;
    K.state = 'combat'; tone(110, 55, .9, 'sawtooth', .1); noise(1, 'lowpass', 500, 80, .2);
    kSay('« Encore un mortel venu mourir sur mon trésor… »'); kButtons(); kHud();
  }
  const kRect = () => kcv.getBoundingClientRect();
  const kTete = () => { const r = kRect(); return [r.left + KW/2, r.top + KH*.3]; };
  const kMoi = () => { const r = $('kBarJ').getBoundingClientRect(); return [r.left + r.width/2, r.top - 10]; };
  function kParts(x, y, n, col, f) { for (let i = 0; i < n; i++) K.parts.push({ x, y, vx: rnd(-1, 1)*120*f, vy: rnd(-1, .3)*160*f, life: 0, max: rnd(.5, 1.1), col, r: rnd(1.5, 3.5) }); }
  async function kAgir(a) {
    if (K.state !== 'combat') return;
    if (a === 'soin' && (K.potions <= 0 || K.pv >= LICHE.pv)) return;
    ac(); K.state = 'action'; kButtons();
    const r = await appel(serveur.agir(a));
    if (!r) { if (!demonte) { K.state = 'combat'; kButtons(); } return; }
    const [tx, ty] = kTete();
    if (a === 'attaque') {
      K.coup = 1; K.pvL = Math.max(0, K.pvL - r.degats); noise(.2, 'highpass', 3000, 800, .25); tone(320, 120, .18, 'square', .06);
      floatText(tx, ty, (r.critique ? 'CRITIQUE −' : '−') + r.degats, r.critique ? 'big' : ''); kParts(KW/2, KH*.4, r.critique ? 30 : 14, '255,240,200', 1.2);
    } else if (a === 'defense') {
      K.garde = 1; K.pvL = Math.max(0, K.pvL - r.degats); tone(520, 480, .4, 'triangle', .07); tone(780, 760, .5, 'sine', .04, .05);
      floatText(tx, ty, '−' + r.degats, 'blue');
    } else {
      K.soin = 1; K.pv = Math.min(LICHE.pv, K.pv + r.soin); K.potions--; sPing(660);
      const [mx, my] = kMoi(); floatText(mx, my, '+' + r.soin, 'blue');
    }
    kButtons();
    plusTard(() => {
      if (r.recu > 0) {
        K.frappe = 1; K.sortJoue = !!r.sort; K.pv = Math.max(0, K.pv - r.recu); K.shake = r.sort ? 26 : 12;
        if (r.sort) { noise(.9, 'bandpass', 700, 150, .4); tone(220, 60, 1, 'sawtooth', .12); flashScreen('rgba(170,80,255,.5)', 200); }
        else { noise(.35, 'lowpass', 900, 100, .35); tone(90, 50, .3, 'sine', .25); flashScreen('rgba(200,40,40,.35)', 130); }
        const [mx, my] = kMoi(); floatText(mx, my, '−' + r.recu, 'bad');
      }
      plusTard(() => kSuite(r), r.recu > 0 ? 700 : 250);
    }, a === 'soin' ? 450 : 550);
  }
  function kSuite(r) {
    const [tx, ty] = kTete();
    if (r.mort) {
      K.state = 'fin'; K.mort = .0001; K.pv = 0; setBourse(r.bourse); tone(150, 40, 2, 'sawtooth', .14); noise(1.6, 'lowpass', 600, 60, .3);
      kSay('Le Roi Liche t\'a vaincu. Ton âme rejoint son armée… et ta mise est perdue.');
      K.hist.push({ texte: 'Vaincu', mort: true }); kHist(); kButtons(); kHud(); plusTard(kFin, 2800); return;
    }
    if (r.victoire) {
      K.state = 'fin'; K.brise = .0001; K.pvL = 0; K.manche = LICHE.manches; setBourse(r.bourse); flashScreen('rgba(220,200,255,.6)', 260); K.shake = 30;
      noise(1.4, 'highpass', 4000, 300, .35); sPing(880); kParts(KW/2, KH*.4, 80, '210,190,255', 2.2);
      plusTard(() => { const [x, y] = kTete(); flyCoins(x, y + 40, 44); sCoins(16); floatText(x, y, '+' + fmt(r.gain), 'big'); }, 700);
      kSay(`Le Roi Liche tombe en poussière ! Son trésor est à toi : ${fmt(r.gain)} ${unite()}.`);
      K.hist.push({ texte: '×19,2', m: 19.2 }); kHist(); kButtons(); plusTard(kFin, 3400); return;
    }
    kEtat(r);
    if (r.manche_gagnee) {
      K.reforme = 1; K.affPv = K.pv; tone(200, 400, .6, 'triangle', .08); kParts(KW/2, KH*.4, 50, '190,160,255', 1.6);
      floatText(tx, ty, '×' + String(kMult()).replace('.', ','), 'big');
      kSay(`Manche gagnée ! Tu reprends ton souffle… mais le Roi Liche se relève, plus fort. (manche ${K.manche + 1} / ${LICHE.manches})`);
    } else kSay(K.sort ? 'Ses yeux s\'embrasent : il prépare un sort dévastateur ! Te défendre en réduit les trois quarts.' : ['Il ricane.', 'Ses os craquent.', 'Le froid de la crypte te mord.', '« Tu faiblis, mortel. »'][Math.floor(Math.random()*4)]);
    K.state = 'combat'; kButtons(); kHud();
  }
  async function kFuir() {
    if (K.state !== 'combat') return; ac(); K.state = 'action'; kButtons();
    const r = await appel(serveur.encaisser());
    if (!r) { if (!demonte) { K.state = 'combat'; kButtons(); } return; }
    setBourse(r.bourse); K.state = 'fin';
    const [x, y] = kMoi(); if (r.gain > 0) { flyCoins(x, y - 40, Math.min(40, 8 + K.manche*8)); sCoins(10); } floatText(x, y - 40, '+' + fmt(r.gain), K.manche ? 'big' : 'blue');
    kSay(K.manche ? `Tu t'enfuis de la crypte avec ${fmt(r.gain)} ${unite()}.` : `Tu t'enfuis… et sauves la moitié de ta mise (${fmt(r.gain)}).`);
    K.hist.push({ texte: K.manche ? '×' + String(LICHE.mult[K.manche]).replace('.', ',') : 'Fuite', m: LICHE.mult[K.manche], mort: !K.manche }); kHist(); kButtons(); plusTard(kFin, 1500);
  }
  function kFin() {
    K.state = 'idle'; K.manche = 0; K.pv = LICHE.pv; K.pvL = K.pvLMax = LICHE.pvLiche[0]; K.potions = LICHE.potions; K.brise = 0; K.mort = 0; K.reforme = 0;
    setBusy(4, false); kBet.lock(false); kSay('Le Roi Liche attend sur son trône. Oseras-tu le défier ?'); kButtons(); kHud();
  }
  // le Roi Liche : une silhouette en facettes (robe, épaulières, crâne, couronne, bâton et son orbe)
  function drawLiche(cx, cy, u, sortCol, alpha) {
    kx.save(); kx.globalAlpha = alpha; kx.translate(cx, cy); kx.scale(u, u);
    // la robe
    kx.beginPath(); kx.moveTo(-58, -165); kx.lineTo(58, -165); kx.lineTo(86, -40); kx.lineTo(112, 120); kx.lineTo(70, 98); kx.lineTo(44, 132); kx.lineTo(12, 104); kx.lineTo(-20, 136); kx.lineTo(-50, 100); kx.lineTo(-84, 128); kx.lineTo(-106, 110); kx.lineTo(-86, -40); kx.closePath();
    let g = kx.createLinearGradient(0, -170, 0, 130); g.addColorStop(0, '#2a2236'); g.addColorStop(1, '#07050c'); kx.fillStyle = g; kx.fill();
    kx.strokeStyle = 'rgba(200,180,230,.18)'; kx.lineWidth = 1.5; kx.beginPath();
    for (const [a, b] of [[[-58,-165],[-20,136]],[[58,-165],[12,104]],[[0,-165],[44,132]],[[-86,-40],[-50,100]],[[86,-40],[70,98]]]) { kx.moveTo(a[0], a[1]); kx.lineTo(b[0], b[1]); }
    kx.stroke();
    kx.strokeStyle = 'rgba(217,205,180,.55)'; kx.lineWidth = 3; kx.beginPath(); kx.moveTo(-10, -160); kx.lineTo(-4, 120); kx.moveTo(10, -160); kx.lineTo(4, 120); kx.stroke();
    // les épaulières
    kx.fillStyle = '#3d3846'; kx.strokeStyle = 'rgba(220,210,190,.35)'; kx.lineWidth = 1.5;
    for (const s of [-1, 1]) { kx.beginPath(); kx.moveTo(s*30, -170); kx.lineTo(s*96, -178); kx.lineTo(s*118, -214); kx.lineTo(s*82, -160); kx.lineTo(s*64, -138); kx.closePath(); kx.fill(); kx.stroke(); }
    // la capuche et le crâne
    kx.fillStyle = '#120d1a'; kx.beginPath(); kx.moveTo(-40, -150); kx.lineTo(-46, -214); kx.lineTo(0, -250); kx.lineTo(46, -214); kx.lineTo(40, -150); kx.closePath(); kx.fill();
    kx.beginPath(); kx.moveTo(-24, -226); kx.lineTo(24, -226); kx.lineTo(28, -196); kx.lineTo(16, -172); kx.lineTo(-16, -172); kx.lineTo(-28, -196); kx.closePath();
    g = kx.createLinearGradient(-28, -226, 28, -172); g.addColorStop(0, '#e6dfcc'); g.addColorStop(1, '#8f8676'); kx.fillStyle = g; kx.fill();
    kx.strokeStyle = 'rgba(40,30,30,.5)'; kx.lineWidth = 1.2; kx.beginPath(); kx.moveTo(0, -226); kx.lineTo(0, -196); kx.moveTo(-28, -196); kx.lineTo(28, -196); kx.stroke();
    kx.fillStyle = '#0a0610'; for (const s of [-1, 1]) { kx.beginPath(); kx.moveTo(s*4, -206); kx.lineTo(s*20, -212); kx.lineTo(s*16, -198); kx.closePath(); kx.fill(); }
    kx.beginPath(); kx.moveTo(-10, -182); kx.lineTo(10, -182); kx.lineTo(6, -176); kx.lineTo(-6, -176); kx.closePath(); kx.fill();
    // la couronne
    kx.beginPath(); kx.moveTo(-30, -232); kx.lineTo(-34, -262); kx.lineTo(-18, -244); kx.lineTo(-8, -274); kx.lineTo(0, -248); kx.lineTo(8, -274); kx.lineTo(18, -244); kx.lineTo(34, -262); kx.lineTo(30, -232); kx.closePath();
    g = kx.createLinearGradient(0, -274, 0, -232); g.addColorStop(0, '#c9b37a'); g.addColorStop(1, '#5e4f2c'); kx.fillStyle = g; kx.fill(); kx.strokeStyle = 'rgba(30,20,10,.6)'; kx.stroke();
    // le bâton et son orbe
    kx.strokeStyle = '#1e1622'; kx.lineWidth = 7; kx.lineCap = 'round'; kx.beginPath(); kx.moveTo(128, -230); kx.lineTo(140, 130); kx.stroke();
    kx.strokeStyle = 'rgba(200,180,150,.3)'; kx.lineWidth = 1.5; kx.stroke();
    kx.fillStyle = '#d9d2c0'; kx.beginPath(); kx.moveTo(84, -150); kx.lineTo(126, -170); kx.lineTo(132, -158); kx.lineTo(92, -140); kx.closePath(); kx.fill();
    kx.globalCompositeOperation = 'lighter';
    const p = .75 + .25*Math.sin(tNow*(K.sort ? 9 : 3)), orbe = kx.createRadialGradient(128, -246, 0, 128, -246, K.sort ? 60 : 34);
    orbe.addColorStop(0, `rgba(255,255,255,${.9*p})`); orbe.addColorStop(.25, `rgba(${sortCol},${.8*p})`); orbe.addColorStop(1, `rgba(${sortCol},0)`); kx.fillStyle = orbe; kx.fillRect(68, -306, 120, 120);
    for (const s of [-1, 1]) { const e = kx.createRadialGradient(s*12, -205, 0, s*12, -205, K.sort ? 22 : 14); e.addColorStop(0, `rgba(${sortCol},1)`); e.addColorStop(1, `rgba(${sortCol},0)`); kx.fillStyle = e; kx.fillRect(s*12 - 24, -229, 48, 48); }
    kx.restore();
  }
  function licheFrame(dt) {
    if (KW < 10 || !kRock) return;
    for (const c of ['coup', 'frappe', 'garde', 'soin']) K[c] = Math.max(0, K[c] - dt*1.6);
    K.reforme = Math.max(0, K.reforme - dt*.8); K.shake = Math.max(0, K.shake - dt*40);
    if (K.brise) K.brise = Math.min(1, K.brise + dt*.7); if (K.mort) K.mort = Math.min(1, K.mort + dt*.8);
    K.affPv += (K.pv - K.affPv)*Math.min(1, dt*6); K.affPvL += (K.pvL - K.affPvL)*Math.min(1, dt*6); kHud();
    K.parts = K.parts.filter(p => { p.life += dt; p.x += p.vx*dt; p.y += p.vy*dt; p.vy -= 30*dt; return p.life < p.max; });
    const W = KW, H = KH, sol = H*.86, u = Math.min(H/560, W/520)*.92, cyL = H*.62 + Math.sin(tNow*1.4)*6*u, sortCol = K.sort && K.state !== 'idle' ? '220,90,255' : '110,240,230';
    kx.setTransform(kdpr,0,0,kdpr,0,0); kx.clearRect(0,0,W,H); kx.save(); if (K.shake > .1) kx.translate(rnd(-K.shake, K.shake), rnd(-K.shake, K.shake));
    kx.drawImage(kRock, 0, 0, W, H);
    // la salle du trône : deux piliers, des cierges, le sol
    for (const fx_ of [.1, .9]) { const x = W*fx_, w = Math.max(30, W*.06); const g = kx.createLinearGradient(x - w/2, 0, x + w/2, 0); g.addColorStop(0, '#0a0710'); g.addColorStop(.5, '#1d1726'); g.addColorStop(1, '#07050b'); kx.fillStyle = g; kx.fillRect(x - w/2, 0, w, sol); kx.fillStyle = '#241d2e'; kx.fillRect(x - w*.65, sol - 14, w*1.3, 14);
      kx.save(); kx.globalCompositeOperation = 'lighter'; for (const d of [-1, 1]) { const cx_ = x + d*w*.9, cy_ = sol - 26, fl = 1 + .12*Math.sin(tNow*13 + fx_*7 + d); kx.fillStyle = '#d9cfb8'; kx.fillRect(cx_ - 3, cy_, 6, 24); const g2 = kx.createRadialGradient(cx_, cy_ - 6, 0, cx_, cy_ - 6, 60*fl); g2.addColorStop(0, 'rgba(255,190,110,.45)'); g2.addColorStop(1, 'rgba(255,140,60,0)'); kx.fillStyle = g2; kx.fillRect(cx_ - 60, cy_ - 66, 120, 120); kx.fillStyle = 'rgba(255,230,170,.95)'; kx.beginPath(); kx.ellipse(cx_, cy_ - 6, 3*fl, 7*fl, 0, 0, TAU); kx.fill(); } kx.restore(); }
    const gs = kx.createLinearGradient(0, sol, 0, H); gs.addColorStop(0, '#120c18'); gs.addColorStop(1, '#030205'); kx.fillStyle = gs; kx.fillRect(0, sol, W, H - sol);
    // son aura
    kx.save(); kx.globalCompositeOperation = 'lighter'; const au = kx.createRadialGradient(W/2, cyL - 120*u, 0, W/2, cyL - 120*u, 260*u); au.addColorStop(0, `rgba(${sortCol},${K.sort && K.state !== 'idle' ? .28 : .14})`); au.addColorStop(1, `rgba(${sortCol},0)`); kx.fillStyle = au; kx.fillRect(0, 0, W, H); kx.restore();
    // le Roi Liche (qui tremble quand on le frappe, se brise et se relève entre deux manches)
    const a = K.brise ? 1 - K.brise : K.reforme ? .35 + .65*Math.abs(Math.sin(K.reforme*14)) : 1;
    const jx = K.coup ? rnd(-6, 6)*K.coup : 0;
    if (a > .01) drawLiche(W/2 + jx, cyL, u, sortCol, a);
    if (K.coup > .01) { kx.save(); kx.globalCompositeOperation = 'lighter'; kx.strokeStyle = `rgba(255,245,220,${K.coup})`; kx.lineWidth = 4; kx.beginPath(); kx.moveTo(W/2 - 90*u, cyL - 220*u); kx.lineTo(W/2 + 80*u, cyL - 40*u); kx.moveTo(W/2 + 70*u, cyL - 210*u); kx.lineTo(W/2 - 60*u, cyL - 60*u); kx.stroke(); kx.restore(); }
    // sa riposte : un trait de magie vers toi (en bas)
    if (K.frappe > .01) { kx.save(); kx.globalCompositeOperation = 'lighter'; kx.strokeStyle = K.sortJoue ? `rgba(220,90,255,${K.frappe})` : `rgba(255,120,90,${K.frappe})`; kx.lineWidth = K.sortJoue ? 7 : 4; kx.beginPath(); let x = W/2 + 128*u, y = cyL - 246*u; kx.moveTo(x, y); for (let i = 1; i <= 8; i++) { x += (W/2 - (W/2 + 128*u))/8 + rnd(-18, 18); y += (H - (cyL - 246*u))/8; kx.lineTo(x, y); } kx.stroke(); kx.restore(); }
    // ta garde, tes soins
    if (K.garde > .01) { kx.save(); kx.globalCompositeOperation = 'lighter'; kx.strokeStyle = `rgba(140,220,255,${K.garde})`; kx.lineWidth = 5; kx.beginPath(); kx.arc(W/2, H + 40, Math.min(W*.45, 260), Math.PI*1.15, Math.PI*1.85); kx.stroke(); kx.restore(); }
    if (K.soin > .01 && Math.random() < .6) kParts(W/2 + rnd(-W*.25, W*.25), H - 10, 1, '120,255,170', .6);
    kx.save(); kx.globalCompositeOperation = 'lighter'; for (const p of K.parts) { const k = 1 - p.life/p.max; kx.fillStyle = `rgba(${p.col},${k})`; kx.beginPath(); kx.arc(p.x, p.y, p.r, 0, TAU); kx.fill(); } kx.restore();
    if (K.mort) { kx.fillStyle = `rgba(40,0,10,${K.mort*.55})`; kx.fillRect(0, 0, W, H); }
    const vg = kx.createRadialGradient(W/2, H/2, H*.35, W/2, H/2, H*.95); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.6)'); kx.fillStyle = vg; kx.fillRect(0, 0, W, H);
    kx.restore();
  }
  $('kGo').onclick = () => { ac(); kStart(); };
  $('kAtq').onclick = () => kAgir('attaque'); $('kDef').onclick = () => kAgir('defense'); $('kSoin').onclick = () => kAgir('soin'); $('kFuir').onclick = () => kFuir();
  kHud(); kHist(); kButtons();

  // ================= BOUCLE / ENTRÉES =================
  function fitAll() { fitBG(); fitFX(); fitD(); cFit(); lFit(); kFit(); }
  const ro = new ResizeObserver(() => { fitBG(); fitD(); cFit(); lFit(); kFit(); }); ro.observe(racine.querySelector('.jeux'));
  const surTaille = () => { fitBG(); fitFX(); };
  const surTouche = e => {
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
    if (e.code === 'Space') {
      e.preventDefault(); ac();
      if (active === 0) { if (D.state === 'idle') dStart(); else if (D.state === 'run') dFuir(); }
      else if (active === 1) { if (B.state === 'play') bCash(); else bStart(); }
      else if (active === 2) { if (C.state === 'idle') cStart(); else cAdvance(1); }
      else if (active === 3) { if (L.state === 'idle') lStart(); else lTirer(); }
      else { if (K.state === 'idle') kStart(); else kAgir('attaque'); }
    } else if (active === 2 && e.code === 'Enter') { e.preventDefault(); cCash(); }
    else if (active === 2 && (e.code === 'KeyS' || e.code === 'ArrowRight')) { e.preventDefault(); cAdvance(2); }
    else if (active === 3 && e.code === 'Enter') { e.preventDefault(); lCouper(); }
    else if (active === 4 && e.code === 'Enter') { e.preventDefault(); kFuir(); }
    else if (active === 4 && e.code === 'KeyD') { e.preventDefault(); kAgir('defense'); }
    else if (active === 4 && e.code === 'KeyS') { e.preventDefault(); kAgir('soin'); }
  };
  const surGeste = () => ac();
  addEventListener('resize', surTaille);
  addEventListener('keydown', surTouche);
  addEventListener('pointerdown', surGeste, { once: true });

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(.05, (now - last)/1000); last = now; tNow += dt;
    for (const m of ['or', 'cristaux']) {
      disp[m] += (solde[m] - disp[m])*Math.min(1, dt*5); if (Math.abs(solde[m] - disp[m]) < .6) disp[m] = solde[m];
      racine.querySelector(`.bal[data-m="${m}"] span`).textContent = fmt(disp[m]);
    }
    drawBG(dt);
    if (active === 0) { dragonFrame(dt); if (D.state === 'idle') dButton(); }
    else if (active === 2) pontFrame(dt);
    else if (active === 3) lacFrame(dt);
    else if (active === 4) licheFrame(dt);
    stepFX(dt);
    raf = requestAnimationFrame(frame);
  }
  fitAll(); syncBalance(); plusTard(fitAll, 250);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (!demonte) fitAll(); });
  raf = requestAnimationFrame(frame);

  return () => {
    demonte = true;
    cancelAnimationFrame(raf);
    minuteurs.forEach(clearTimeout);
    ro.disconnect();
    removeEventListener('resize', surTaille);
    removeEventListener('keydown', surTouche);
    removeEventListener('pointerdown', surGeste);
    if (AC) AC.close().catch(() => {});
  };
}
