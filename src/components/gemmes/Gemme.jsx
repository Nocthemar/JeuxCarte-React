// =====================================================================
//  Une gemme du mode Gemmes, taillée en facettes (low-poly, comme les décors de Nocthémar) : un contour,
//  une table au centre, et des facettes plus claires du côté de la lumière (en haut à gauche).
//  Les dégradés de chaque sorte (#gm-<sorte>) sont posés une seule fois par <DefsGemmes />.
// =====================================================================
const FORMES = {
  sang: { contour: [[50, 5], [89, 27], [89, 73], [50, 95], [11, 73], [11, 27]], table: [[50, 27], [70, 38], [70, 62], [50, 73], [30, 62], [30, 38]] },
  ambre: { contour: [[50, 4], [95, 50], [50, 96], [5, 50]], table: [[50, 29], [71, 50], [50, 71], [29, 50]] },
  azur: { contour: [[33, 7], [67, 7], [93, 33], [93, 67], [67, 93], [33, 93], [7, 67], [7, 33]], table: [[41, 30], [59, 30], [70, 41], [70, 59], [59, 70], [41, 70], [30, 59], [30, 41]] },
  os: { contour: [[50, 5], [80, 36], [64, 95], [36, 95], [20, 36]], table: [[50, 30], [64, 45], [57, 76], [43, 76], [36, 45]] },
  pierre: { contour: [[22, 12], [78, 9], [92, 46], [80, 88], [24, 92], [8, 52]], table: [[34, 32], [64, 30], [72, 50], [64, 70], [36, 72], [28, 52]] },
};
const COULEURS_GEMMES = {
  sang: ['#e2606a', '#9b2730', '#4a0d12'],
  ambre: ['#f6dc96', '#c8962e', '#5e3f0e'],
  azur: ['#9cc8f2', '#3a6cb0', '#13264a'],
  os: ['#f1ead8', '#b9ad92', '#5f5747'],
  pierre: ['#8d8880', '#55514b', '#26241f'],
};

const pts = (l) => l.map((p) => p.join(',')).join(' ');
// L'éclairage d'une facette : positif vers la lumière (en haut à gauche), négatif à l'ombre
function lumiere(a, b) {
  const x = (a[0] + b[0]) / 2 - 50, y = (a[1] + b[1]) / 2 - 50;
  const l = Math.hypot(x, y) || 1;
  return (-x - y) / (l * Math.SQRT2);
}
const FACETTES = Object.fromEntries(Object.entries(FORMES).map(([sorte, { contour, table }]) => [sorte, contour.map((a, k) => {
  const b = contour[(k + 1) % contour.length];
  const l = lumiere(a, b);
  return { points: pts([a, b, table[(k + 1) % table.length], table[k]]), fill: l > 0 ? '#fff' : '#000', opacity: Math.abs(l) * (l > 0 ? 0.32 : 0.42) };
})]));

export function DefsGemmes() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        {Object.entries(COULEURS_GEMMES).map(([sorte, [clair, milieu, sombre]]) => (
          <linearGradient key={sorte} id={`gm-${sorte}`} x1="0.15" y1="0.05" x2="0.85" y2="0.95">
            <stop offset="0" stopColor={clair} />
            <stop offset="0.5" stopColor={milieu} />
            <stop offset="1" stopColor={sombre} />
          </linearGradient>
        ))}
      </defs>
    </svg>
  );
}

export default function Gemme({ sorte }) {
  const { contour, table } = FORMES[sorte];
  return (
    <svg className="gm-gemme__svg" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <polygon points={pts(contour)} fill={`url(#gm-${sorte})`} />
      {FACETTES[sorte].map((f) => <polygon key={f.points} points={f.points} fill={f.fill} opacity={f.opacity} />)}
      <polygon points={pts(table)} fill={`url(#gm-${sorte})`} />
      <polygon points={pts(table)} fill="#fff" opacity="0.14" />
      <polygon points={pts(contour)} fill="none" stroke="rgba(10,8,6,.75)" strokeWidth="3" strokeLinejoin="round" />
    </svg>
  );
}
