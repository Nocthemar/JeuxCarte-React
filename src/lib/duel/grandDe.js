// =====================================================================
//  Le grand d20 (styles/duel-spectacle.css)
//  À chaque jet important (un 20, un 1, le Destin, l'attaque d'une grande carte : lib/duel/animations.js),
//  un grand dé à facettes est jeté au centre de l'écran : il tombe en tournant,
//  rebondit, se pose, puis montre son résultat en grand. Il rejoint ensuite le petit dé du plateau
//  (#d20), qui garde le détail du calcul.
//   - un 20 (critique, ou grâce du Destin) : arrêt sur image, le dé grossit dans un halo de rayons dorés,
//     onde sur tout l'écran, « CRITIQUE ! » frappé en grand ;
//   - un 1 (échec critique, ou malédiction) : le dé se fissure, teinte rouge, il tremble.
//  Rien de tout cela avec « Animations réduites » : le petit dé suffit (lib/duel/animations.js).
// =====================================================================
import { pause } from '../pause.js';
import { jouerSon } from '../son.js';
import { onde, particules, secousseEcran } from './effets.js';
import { effetsLegers, quandPresse } from '../preferences.js';

const legers = effetsLegers;

// Le dé vu de face : un hexagone découpé en facettes (la facette du milieu porte le chiffre)
const FACETTES = [
  ['f2', '50,4 93,28 50,30'], ['f3', '50,4 50,30 7,28'],
  ['f3', '7,28 50,30 26,70'], ['f4', '7,28 26,70 7,72'],
  ['f2', '93,28 74,70 50,30'], ['f3', '93,28 93,72 74,70'],
  ['f4', '7,72 26,70 50,96'], ['f3', '26,70 74,70 50,96'], ['f4', '74,70 93,72 50,96'],
  ['f1', '50,30 26,70 74,70'],
];
const SVG = `<svg viewBox="0 0 100 100" aria-hidden="true">
  ${FACETTES.map(([c, p]) => `<polygon class="gd__facette gd__${c}" points="${p}"/>`).join('')}
  <polygon class="gd__contour" points="50,4 93,28 93,72 50,96 7,72 7,28"/>
  <path class="gd__fissure" d="M47 6 L53 22 L44 34 L56 47 L45 60 L55 73 L47 86 L51 95 M44 34 L30 40 M56 47 L70 52 M45 60 L33 66"/>
</svg>`;

// Ce qu'on écrit en grand sous le dé
const texteDe = (q, court) => (q === 'critique' ? 'Critique !' : q === 'echec' ? 'Échec critique' : court);

const hasard = () => 1 + Math.floor(Math.random() * 20);

export async function grandDe(de, q, court, destin = false) {
  const scene = document.createElement('div');
  // (la couleur du résultat n'apparaît qu'à l'atterrissage : pas de suspense gâché pendant le roulement)
  scene.className = `gd-scene${destin ? ' gd-scene--destin' : ''}`;
  scene.innerHTML = `<div class="gd-halo"></div><div class="gd"><div class="gd__corps">${SVG}<span class="gd__chiffre">20</span></div></div><p class="gd-texte"></p>`;
  document.body.appendChild(scene);
  const gd = scene.querySelector('.gd');
  const corps = scene.querySelector('.gd__corps');
  const chiffre = scene.querySelector('.gd__chiffre');
  const texte = scene.querySelector('.gd-texte');

  // 1. Le jet : il arrive du coin, en tournant, touche la table, rebondit et se pose
  const cote = Math.random() < 0.5 ? -1 : 1;
  const jet = gd.animate([
    { transform: `translate(${cote * 46}vw, -58vh) rotate(${cote * -620}deg) scale(.55)`, opacity: 0 },
    { opacity: 1, offset: 0.12 },
    { transform: 'translate(0, 0) rotate(-38deg) scale(1.1, .9)', offset: 0.56, easing: 'ease-out' },
    { transform: 'translate(0, -7vh) rotate(-12deg) scale(.98, 1.03)', offset: 0.72, easing: 'ease-in' },
    { transform: 'translate(0, 0) rotate(5deg) scale(1.04, .97)', offset: 0.86, easing: 'ease-out' },
    { transform: 'translate(0, 0) rotate(0) scale(1)' },
  ], { duration: 860, easing: 'cubic-bezier(.3,.6,.4,1)', fill: 'forwards' });
  // les chiffres défilent pendant qu'il roule
  const defile = setInterval(() => { chiffre.textContent = hasard(); }, 70);
  // le choc sur la table : poussière
  setTimeout(() => {
    jouerSon('choc', 0.02);
    onde(gd, 'rgba(230,235,245,.55)', 1.5, 420);
    if (!legers()) particules(gd, { n: 12, couleurs: ['#c5cad3', '#9aa1ad', '#ffffff'], vitesse: 110, gravite: 60, taille: [3, 7], rond: true, duree: 600 });
  }, 480);
  const oublier = quandPresse(() => jet.finish());   // un clic du joueur : le dé se pose aussitôt
  await jet.finished;
  oublier();
  clearInterval(defile);

  // 2. Le résultat
  chiffre.textContent = de;
  scene.classList.add('est-pose', `gd-scene--${q}`);
  texte.textContent = texteDe(q, court);
  // (les sons du résultat, fanfare et échec, sont joués par lancerDe)
  if (de === 20) {
    // arrêt sur image, puis l'éclat doré
    await pause(140);
    scene.classList.add('est-eclatant');
    onde(gd, '#f3cf7c', 6, 900);
    onde(gd, '#ffffff', 3.2, 600);
    particules(gd, { n: legers() ? 24 : 48, couleurs: ['#fff1c8', '#f3cf7c', '#d9a441', '#ffffff'], vitesse: 320, gravite: 120, taille: [3, 10], duree: 1100 });
    secousseEcran(10, 450);
    corps.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.32)', offset: 0.35 }, { transform: 'scale(1.18)' }], { duration: 700, easing: 'cubic-bezier(.2,.9,.3,1.3)', fill: 'forwards' });
    texte.animate([{ transform: 'scale(2.6)', opacity: 0 }, { transform: 'scale(.94)', opacity: 1, offset: 0.55 }, { transform: 'scale(1)', opacity: 1 }], { duration: 420, easing: 'ease-out', fill: 'forwards' });
    await pause(900);
  } else if (de === 1) {
    // il se fissure et tremble
    await pause(80);
    scene.classList.add('est-brise');
    corps.animate([0, 1, 2, 3, 4, 5, 6].map((i) => ({ transform: `translate(${i % 2 ? -7 : 7}px, ${i % 3 ? 2 : -2}px) rotate(${i % 2 ? -3 : 3}deg)` })).concat([{ transform: 'none' }]), { duration: 420, easing: 'ease-out' });
    if (!legers()) particules(gd, { n: 16, couleurs: ['#c45b61', '#5d2a30', '#9aa1ad'], vitesse: 130, gravite: 160, taille: [3, 8], duree: 800 });
    texte.animate([{ transform: 'translateY(10px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 300, easing: 'ease-out', fill: 'forwards' });
    await pause(820);
  } else {
    corps.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12)', offset: 0.4 }, { transform: 'scale(1)' }], { duration: 320, easing: 'ease-out' });
    texte.animate([{ transform: 'translateY(10px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: 'ease-out', fill: 'forwards' });
    await pause(480);
  }

  // 3. Il rejoint le petit dé du plateau, et le jeu reprend sans l'attendre
  const petit = document.getElementById('d20')?.getBoundingClientRect();
  const r = gd.getBoundingClientRect();
  const dx = petit && petit.width ? petit.left + petit.width / 2 - (r.left + r.width / 2) : 0;
  const dy = petit && petit.width ? petit.top + petit.height / 2 - (r.top + r.height / 2) : 0;
  const echelle = petit && petit.width ? petit.width / r.width : 0.3;
  texte.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' });
  scene.querySelector('.gd-halo').animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: 'forwards' });
  const sortie = gd.animate([
    { transform: 'translate(0, 0) scale(1)', opacity: 1 },
    { transform: `translate(${dx}px, ${dy}px) scale(${echelle})`, opacity: 0.2 },
  ], { duration: 380, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' });
  sortie.finished.then(() => scene.remove(), () => scene.remove());
}
