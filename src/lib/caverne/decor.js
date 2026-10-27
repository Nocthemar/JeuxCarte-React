// =====================================================================
//  Le dessin low-poly de la Caverne (lib/caverne/caverne.js) : de grandes facettes triangulaires, chacune
//  d'une couleur unie, éclairées par une lumière — le style Nocthémar, sans aucune image.
//
//   facettes(ctx, forme, options)  remplit une forme (liste de points [x, y]) de facettes ;
//   options : taille (la taille moyenne d'une facette, en px), graine (le même dessin à chaque fois),
//             couleur(x, y) -> [r, g, b] (la teinte au centre de la facette), lumiere [x, y, z] (d'où vient
//             la lumière), relief (de 0 à 1 : à quel point les facettes se cabossent), contour (un filet clair)
//   eclat(ctx, x, y, h, teinte, options)  un éclat de cristal debout (pointe en haut), en facettes
//   melange(a, b, t)  mélange deux couleurs [r, g, b]
// =====================================================================

// Un hasard toujours le même pour une même graine (le dessin ne change pas à chaque image)
export function hasard(graine) {
  let a = graine | 0;
  return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export const melange = (a, b, t) => [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t);
const rgb = (c, k = 1) => `rgb(${Math.max(0, Math.min(255, c[0] * k)) | 0},${Math.max(0, Math.min(255, c[1] * k)) | 0},${Math.max(0, Math.min(255, c[2] * k)) | 0})`;

function chemin(ctx, forme) {
  ctx.beginPath();
  forme.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

// Remplit la forme de facettes : une grille de points décalés au hasard, coupée en triangles ;
// chaque point a une hauteur, d'où la pente de chaque triangle, et donc sa lumière.
export function facettes(ctx, forme, { taille = 60, graine = 1, couleur = () => [40, 40, 48], lumiere = [-0.4, -0.8, 0.6], relief = 0.6, contour = 0 } = {}) {
  const xs = forme.map((p) => p[0]), ys = forme.map((p) => p[1]);
  const x0 = Math.min(...xs) - taille, x1 = Math.max(...xs) + taille, y0 = Math.min(...ys) - taille, y1 = Math.max(...ys) + taille;
  const r = hasard(graine);
  const nx = Math.ceil((x1 - x0) / taille) + 1, ny = Math.ceil((y1 - y0) / (taille * 0.87)) + 1;
  const pts = [];
  for (let j = 0; j < ny; j++) {
    const ligne = [];
    for (let i = 0; i < nx; i++) {
      const x = x0 + i * taille + (j % 2 ? taille / 2 : 0) + (r() - 0.5) * taille * 0.7;
      const y = y0 + j * taille * 0.87 + (r() - 0.5) * taille * 0.6;
      ligne.push([x, y, (r() - 0.5) * taille * relief]);
    }
    pts.push(ligne);
  }
  const L = (() => { const n = Math.hypot(...lumiere); return lumiere.map((v) => v / n); })();
  const tri = (a, b, c) => {
    // la pente du triangle (sa normale), et la lumière qu'il reçoit
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (n[2] < 0) n = n.map((k) => -k);
    const l = Math.hypot(...n) || 1, d = (n[0] * L[0] + n[1] * L[1] + n[2] * L[2]) / l;
    const k = 0.55 + 0.75 * Math.max(0, d);
    const cx = (a[0] + b[0] + c[0]) / 3, cy = (a[1] + b[1] + c[1]) / 3;
    ctx.fillStyle = rgb(couleur(cx, cy), k);
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 1; ctx.stroke();   // pas de jour entre deux facettes
  };
  ctx.save();
  chemin(ctx, forme); ctx.clip();
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = pts[j][i], b = pts[j][i + 1], c = pts[j + 1][i], d = pts[j + 1][i + 1];
      if (j % 2) { tri(a, b, d); tri(a, d, c); } else { tri(a, b, c); tri(b, d, c); }
    }
  }
  ctx.restore();
  if (contour) { chemin(ctx, forme); ctx.strokeStyle = `rgba(255,255,255,${contour})`; ctx.lineWidth = 1.2; ctx.stroke(); }
}

// Un éclat de cristal debout : quatre faces, une claire, une moyenne, deux sombres, et une arête vive
export function eclat(ctx, x, y, h, teinte, { largeur = 0.34, penche = 0, lueur = 0.6 } = {}) {
  const w = h * largeur, sx = penche * h;
  const sommet = [x + sx, y - h], gauche = [x - w / 2, y - h * 0.32], droite = [x + w / 2, y - h * 0.38], milieu = [x + w * 0.08 + sx * 0.3, y - h * 0.3];
  const bas = [x, y], basG = [x - w * 0.36, y], basD = [x + w * 0.36, y];
  if (lueur > 0) {
    const g = ctx.createRadialGradient(x, y - h * 0.45, 0, x, y - h * 0.45, h * 0.9);
    g.addColorStop(0, `rgba(${teinte[0]},${teinte[1]},${teinte[2]},${0.28 * lueur})`); g.addColorStop(1, `rgba(${teinte[0]},${teinte[1]},${teinte[2]},0)`);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(x - h, y - h * 1.4, h * 2, h * 1.6); ctx.restore();
  }
  const face = (pts, k) => { chemin(ctx, pts); ctx.fillStyle = rgb(teinte, k); ctx.fill(); };
  face([sommet, gauche, basG, bas, milieu], 0.42);
  face([sommet, milieu, bas, basD, droite], 0.75);
  face([sommet, gauche, milieu], 1.05);
  face([sommet, milieu, droite], 1.35);
  ctx.strokeStyle = `rgba(255,255,255,${0.35 * lueur + 0.15})`; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(...sommet); ctx.lineTo(...milieu); ctx.lineTo(...bas); ctx.stroke();
}

// Une rangée de pointes (stalactites en haut, sol rocheux en bas) : la forme à remplir de facettes
export function pointes(largeur, base, longueur, sens, graine, pas = 70) {
  const r = hasard(graine), forme = [[-20, base - sens * 40]];
  let x = -20;
  while (x < largeur + 20) {
    const w = pas * (0.6 + r() * 0.9);
    forme.push([x, base], [x + w * (0.35 + r() * 0.3), base + sens * longueur * (0.25 + r() * 0.75)]);
    x += w;
  }
  forme.push([x, base], [x, base - sens * 40]);
  return forme;
}
