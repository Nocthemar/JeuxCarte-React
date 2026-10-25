// =====================================================================
//  Les animations du duel (ancien JS/jeu-cartes-arene.js, partie « Animations », reprise telle quelle)
//  animer(ev) joue l'animation d'un événement du moteur (ev = un élément de etat.evenements) :
//  la carte qui vole de la main, le d20 qui roule, l'attaque, les dégâts, les morts qui éclatent…
//  Elle agit directement sur la page (classes, particules), en retrouvant les éléments par leurs
//  classes et identifiants (.dc-unite[data-uid], #main-joueur, #d20…), les mêmes qu'avant.
//  À appeler AVANT d'afficher le nouvel état (les unités mortes sont encore à l'écran), puis
//  animer({ ...ev, type: 'apres-pose' }) APRÈS (la nouvelle unité est à sa place) : voir DuelSolo.
// =====================================================================
import { animationsReduites } from '../preferences.js';
import { pause } from '../pause.js';
import { flotter, secouer, classeTemporaire } from '../fx.js';
import { jouerSon, SM } from '../son.js';
import { capsDe } from '../../moteur/index.js';
import { particules, onde, flash, voile, secousseEcran, eclair, briser, recul, annonce, envol, symbole } from './effets.js';
import { styleAttaque, couleursVeine } from './attaques.js';
import { htmlCarte } from './htmlCarte.js';
import { grandDe } from './grandDe.js';
import { arretSurImage, coupDeCamera, chiffreDegats, pvTouches } from './frappe.js';

const reduit = animationsReduites;
const $ = (id) => document.getElementById(id);
// Protège un texte inséré dans du HTML (noms de cartes, de joueurs…)
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const elUnite = (uid) => document.querySelector(`.dc-unite[data-uid="${uid}"]`);
const elHeros = (qui) => document.querySelector(`.dc-heros[data-heros="${qui}"]`);
export const elCible = (c) => (c.heros ? elHeros(c.camp) : elUnite(c.uid));

// L'intensité des effets selon la rareté : 0 (commune, éveillée, troupes du Codex), 1 (mythique),
// 2 (légendaire), 3 (transcendante). Pour une carte (sa définition) ou une unité à l'écran (rar-…).
const NIVEAUX = { mythique: 1, legendaire: 2, transcendante: 3 };
const niveauCarte = (def) => NIVEAUX[def?.carte?.rarity] ?? 0;
const niveauElement = (el) => Object.entries(NIVEAUX).find(([r]) => el?.classList.contains(`rar-${r}`))?.[1] ?? 0;

// Chiffre flottant (dégâts en rouge, soin en vert, bonus en ambre)
// Effets de pioche d'un événement (sorts, Destin, défausse) : cartes piochées, brûlées, épuisement.
// Le début de tour a ses propres bannières (JS/jeu-cartes.js, afficherTour).
async function effetsPioche(ev) {
  const r = ev.pioche;
  if (!r) return;
  const pile = $(`pioche-${ev.qui}`);
  const tombe = $(`tombeau-${ev.qui}`);
  if (r.piochees?.length) {
    flotter(pile, `+${r.piochees.length} carte${r.piochees.length > 1 ? 's' : ''}`, 'buff');
    jouerSon('pioche');
  }
  if (r.brulees?.length) {
    await pause(250);
    flotter(tombe, `Brûlée : ${r.brulees[0].n ?? 'une carte'}`, 'rate');
    particules(tombe, { n: 22, couleurs: BRAISES, vitesse: 90, monte: 70, gravite: -40, depuis: 'surface' });
    jouerSon('feu');
  }
  if (r.epuisement) {
    await pause(250);
    const heros = elHeros(ev.qui);
    secouer(heros);
    flotter(heros, `Épuisement -${r.epuisement}`);
    particules(heros, { n: 16, couleurs: ['#a66cd9', '#6e3a9a', '#d2b4f0'], vitesse: 70, monte: 30, rond: true, depuis: 'surface' });
  }
  await pause(300);
}


// Un effet sur une cible (moteur : ev.touches) : dégâts, soin, bonus, état (Gelée, Bouclier…)
function montrerTouche(t, el = elCible(t)) {
  if (!el) return;
  if (t.texte) flotter(el, t.texte, t.etat ? 'rate' : 'buff');
  else if (t.soin) flotter(el, `+${t.valeur}`, 'soin');
  else if (t.buff) flotter(el, `+${t.valeur}/+${t.valeur}`, 'buff');
  else { secouer(el); chiffreDegats(el, t.valeur); if (t.heros) pvTouches(el); }
}
export async function montrerTouches(touches = []) {
  for (const t of touches) {
    const el = elCible(t);
    if (t.soin) EFFET_SORT.heal(el);
    else if (t.etat) onde(el, '#bfe3f0', 2, 600);
    else if (t.buff) EFFET_SORT.buff(el);
    else if (el) particules(el, { n: 14, couleurs: BRAISES, vitesse: 90, gravite: 40, rond: true });
    montrerTouche(t, el);
  }
  if (touches.length) await pause(450);
}


// Bannière en travers de l'écran (changement de tour, Destin…) : le texte entre en glissant,
// reste un instant, puis repart de l'autre côté (styles/duel-spectacle.css)
export async function banniere(texte, sous = '', type = '') {
  const b = $('banniere');
  b.innerHTML = `<strong>${esc(texte)}</strong>${sous ? `<span>${esc(sous)}</span>` : ''}`;
  b.className = `banniere est-visible ${type}`;
  await pause(reduit() ? 1100 : 820);
  if (!reduit()) {
    b.className = `banniere est-visible est-sortie ${type}`;
    await pause(240);
  }
  b.className = 'banniere';
}

// d20 : pour un jet important (important : un 20, un 1, le Destin, l'attaque d'une grande carte), le grand
// dé est jeté au centre de l'écran (lib/duel/grandDe.js), puis rejoint le petit dé du plateau, qui garde
// le résultat et le détail du calcul (label) ; court : le résultat seul, écrit en grand.
// Les autres jets : le petit dé roule un instant sur le plateau (le jeu va plus vite).
// Le petit dé n'apparaît que pendant un lancer (attaque ou Jet du Destin), puis s'efface.
// Animations coupées (ou onglet caché) : seulement le petit dé, sans roulement.
let minuteurDe = null;
export async function lancerDe(de, label, q, destin = false, court = label, important = true) {
  const zone = $('d20');
  const face = $('d20-face');
  const res = $('d20-resultat');
  clearTimeout(minuteurDe);
  res.textContent = '';
  res.className = 'centre__resultat';
  jouerSon('de');
  const anime = !reduit() && !document.hidden;
  const grand = anime && (important || de === 20 || de === 1);
  if (grand) {
    zone.className = `d20${destin ? ' d20--destin' : ''}`;   // caché pendant le grand jet
    // les sons du résultat partent quand le grand dé se pose
    setTimeout(() => { if (de === 20) jouerSon('fanfare'); if (de === 1) jouerSon('echec'); }, 900);
    await grandDe(de, q, court, destin);
  } else if (anime) {
    // le petit dé roule, ses chiffres défilent
    zone.className = `d20 est-visible roule${destin ? ' d20--destin' : ''}`;
    const defile = setInterval(() => { face.textContent = 1 + Math.floor(Math.random() * 20); }, 55);
    await pause(320);
    clearInterval(defile);
  }
  face.textContent = de;
  zone.className = `d20 est-visible d20--${q}${destin ? ' d20--destin' : ''}`;
  res.textContent = label;
  res.className = `centre__resultat est-visible centre__resultat--${q}`;
  if (!grand) {
    if (de === 20) jouerSon('fanfare');
    if (de === 1) jouerSon('echec');
  }
  await pause(grand ? 150 : 300);
  // Le résultat reste lisible un moment, puis le dé et son étiquette s'effacent
  minuteurDe = setTimeout(() => {
    zone.classList.remove('est-visible');
    res.classList.remove('est-visible');
  }, reduit() ? 2500 : 2200);
}

// Effets visuels à l'arrivée d'une unité (UFX) et des sorts (SFX), indexés par nom de carte.
// Les cartes sans entrée prennent l'effet par défaut de leur type.
const BRAISES = ['#ffd27a', '#ff9a3d', '#e8553a', '#ffb347'];
const OR = ['#f6d995', '#f0c873', '#ffffff', '#d9a441'];
const SEVE = ['#9fd9b0', '#d5f5de', '#7fb08f'];
const ONDE_MAREE = ['#bfe3f0', '#7fbcd6', '#ffffff'];
const POUSSIERE = ['#9aa1ad', '#6b717c', '#c5cad3'];

export const UFX = {
  'Milicien de la Couronne': (el) => { onde(el, '#f0c873', 2.4); particules(el, { n: 16, couleurs: OR, vitesse: 110, monte: 40, gravite: -20 }); jouerSon('acier', 0.1); },
};
// Effet d'un sort sur une cible touchée (el), selon son effet (fx)
const EFFET_SORT = {
  unit: (el) => { flash(el, 'rgba(255,170,90,.95)'); particules(el, { n: 22, couleurs: BRAISES, vitesse: 70, monte: 90, gravite: -40, rond: true, depuis: 'surface', duree: 900 }); },
  face: (el) => { eclair(el); secousseEcran(9); voile('rgba(140,160,255,.35)', 500); },
  heal: (el) => { particules(el, { n: 16, couleurs: SEVE, vitesse: 25, monte: 70, gravite: -35, rond: true, depuis: 'surface', duree: 1100 }); onde(el, '#9fd9b0', 1.8); },
  buff: (el) => { particules(el, { n: 18, couleurs: OR, vitesse: 30, monte: 80, gravite: -40, depuis: 'surface', duree: 1000 }); onde(el, '#f0c873', 1.8); },
  aoe: (el) => { onde(el, '#7fbcd6', 2.2, 700); particules(el, { n: 14, couleurs: ONDE_MAREE, vitesse: 110, gravite: 40, rond: true }); },
  // Objets
  ready: (el) => { onde(el, '#9fd9b0', 2, 600); particules(el, { n: 16, couleurs: ['#d5f5de', '#9fd9b0', '#ffffff'], vitesse: 90, monte: 40, gravite: 10 }); },
  rage: (el) => { flash(el, 'rgba(255,90,80,.85)', 2, 400); particules(el, { n: 22, couleurs: ['#ff6b5b', '#ffb347', '#c33a42'], vitesse: 120, monte: 60, gravite: -10, depuis: 'surface' }); },
  talisman: () => { const d = $('d20'); onde(d, '#c9b2fb', 2.6, 800); particules(d, { n: 22, couleurs: ['#c9b2fb', '#ffffff', '#9a6cf0'], vitesse: 100, monte: 30, gravite: 0 }); },
  coffre: (el) => { flash(el, 'rgba(255,224,150,.9)', 2, 400); particules(el, { n: 20, couleurs: OR, vitesse: 140, monte: 80, gravite: 60 }); },
  jeton: (el) => { onde(el, '#f0c873', 2, 600); particules(el, { n: 12, couleurs: OR, vitesse: 70, monte: 60, gravite: -20, rond: true }); },
};
export const SFX = {
  'Raz-de-Marée': () => secousseEcran(7, 600),
};

// Coup porté à une cible : étincelles, et plus fort sur un critique, ou quand une grande carte frappe
// (niveau : celui de l'attaquant, voir niveauCarte)
function impact(el, q, heros, niveau = 0) {
  if (!el) return;
  if (niveau >= 2) {
    onde(el, niveau === 3 ? '#fff1c8' : '#f3cf7c', niveau === 3 ? 3 : 2.4, 600);
    particules(el, { n: niveau === 3 ? 18 : 10, couleurs: OR, vitesse: 170, gravite: 60, taille: [2, 7], duree: 700 });
    if (!heros && q !== 'critique') secousseEcran(niveau === 3 ? 8 : 5, 350);
  }
  if (q === 'critique') {
    flash(el, 'rgba(255,224,150,.95)', 3);
    onde(el, '#f0c873', 3, 700);
    particules(el, { n: 30, couleurs: OR, vitesse: 230, gravite: 90, taille: [3, 9], duree: 900 });
    secousseEcran(12, 500);
  } else {
    flash(el, 'rgba(255,255,255,.85)', 1.6, 300);
    particules(el, { n: q === 'solide' ? 16 : 10, couleurs: ['#ffffff', '#f6d995', '#c5cad3'], vitesse: 140, gravite: 70, taille: [2, 6], duree: 600 });
  }
  if (heros) { voile('rgba(183,40,48,.5)'); secousseEcran(q === 'critique' ? 14 : 7); }
}

// Joue l'animation d'un événement du moteur (avant le nouveau rendu)
export async function animer(ev) {
  switch (ev.type) {
    case 'pose': {
      // la carte quitte la main et vole jusqu'à sa place sur le terrain ;
      // une Transcendante se montre d'abord en grand au centre, dans la pénombre
      const place = $(`terrain-${ev.qui}`)?.children[ev.place];
      if (niveauCarte(ev.carte) === 3 && !reduit()) await entreeTranscendante(ev, place);
      else await volerDepuisMain(ev, place);
      jouerSon('pose');
      return;
    }
    case 'apres-pose': {
      const el = elUnite(ev.uid);
      const niveau = niveauCarte(ev.carte);
      classeTemporaire(el, 'fx-arrivee', 700);
      // la carte s'écrase sur le plateau, d'autant plus fort qu'elle est rare :
      //  0 : un peu de poussière ; 1 (mythique) : la couleur de sa Veine ; 2 (légendaire) : éclat d'or,
      //  couronne, le plateau tremble ; 3 (transcendante) : onde de choc dorée sur tout le plateau
      setTimeout(() => {
        particules(el, { n: niveau ? 14 : 8, couleurs: POUSSIERE, vitesse: 80, gravite: 15, taille: [5, 12], rond: true, duree: 700 });
        onde(el, 'rgba(197,202,211,.7)', 1.6, 500);
        const teinte = couleursVeine(ev.carte?.veine);
        if (teinte && niveau >= 1) {
          onde(el, teinte[0], 2.2, 700);
          particules(el, { n: 16, couleurs: teinte, vitesse: 40, monte: 70, gravite: -40, rond: true, depuis: 'surface', duree: 1000 });
        }
        if (niveau === 1) secousseEcran(3, 250);
        if (niveau >= 2) {
          flash(el, 'rgba(255,230,170,.9)', 3, 500);
          symbole(el, '♛', { couleur: '#f6d995', taille: 48, duree: 900 });
          secousseEcran(niveau === 3 ? 11 : 6, niveau === 3 ? 500 : 350);
          jouerSon('couronne');
        }
        if (niveau === 3) {
          onde(el, '#fff1c8', 5, 800);
          onde(el, '#f3cf7c', 3.4, 650);
          particules(el, { n: 30, couleurs: OR, vitesse: 260, gravite: 90, taille: [3, 9], duree: 900 });
          jouerSon('tonnerre', 0.05);
        }
        (UFX[ev.carte.n] ?? ((e) => {
          const caps = capsDe(ev.carte);
          if (caps.includes('charge')) { particules(e, { n: 16, couleurs: OR, vitesse: 150, gravite: 50 }); jouerSon('acier', 0.05); }
          if (caps.includes('garde') || caps.includes('provocation')) onde(e, '#e6eaf1', 1.9, 650);
        }))(el);
      }, reduit() ? 0 : 260);
      await pause(380);
      return;
    }
    case 'sort': {
      const apercu = $('apercu');
      apercu.innerHTML = htmlCarte(ev.carte);
      // la carte vole de la main jusqu'au centre, puis s'y montre en grand
      await volerDepuisMain(ev, apercu.firstElementChild);
      apercu.className = `apercu est-visible ${ev.qui === 'adverse' ? 'apercu--adverse' : ''}`;
      await pause(700);
      apercu.className = 'apercu';
      jouerSon(SM[ev.carte.fx] ?? 'cloche');
      SFX[ev.carte.n]?.();
      for (const t of ev.touches ?? []) {
        const el = elCible(t);
        EFFET_SORT[ev.carte.fx]?.(el);
        montrerTouche(t, el);
      }
      if (ev.carte.fx === 'draw') particules($('main-joueur'), { n: 12, couleurs: ['#c5d2ef', '#ffffff'], vitesse: 60, monte: 50, gravite: -20, depuis: 'surface' });
      await pause(250);
      await mourir(ev.morts);
      await effetsPioche(ev);
      await pause(350);
      return;
    }
    case 'attaque': {
      const att = elUnite(ev.uid);
      const cib = elCible(ev.cible);
      const niveau = niveauElement(att);   // une grande carte frappe plus fort, et son jet passe en grand
      // Interception : une unité adverse s'interpose devant son héros
      if (ev.interception && cib) {
        flotter(cib, 'Interception !', 'buff');
        onde(cib, '#e6eaf1', 2, 600);
        jouerSon('acier', 0.05);
        await pause(450);
      }
      // Chorégraphie de l'attaque (par son nom, sinon sa Veine : JS/jeu-cartes-attaques.js)
      const style = styleAttaque(ev.attaque);
      // 1. le nom de l'attaque s'affiche, l'attaquant se charge, le dé roule ; la cible est marquée
      const retirerAnnonce = annonce(att, ev.attaque?.nom ?? ev.n ?? 'Attaque', style.icone, style.couleur);
      att?.classList.add('fx-prepare');
      cib?.classList.add('fx-visee');
      style.charge?.(att);
      if (ev.esquive && cib) flotter(cib, `Esquive : ${ev.des.join(' et ')}, le plus bas compte`, 'buff');
      const calcul = ev.total != null ? `${ev.esquive ? ` · Esquive (${ev.des.join(' / ')})` : ''} · ${ev.de}${ev.atk ? ` + ${ev.atk}` : ''}${ev.bonus ? ` + ${ev.bonus}` : ''} = ${ev.total} / ${ev.seuil}` : '';
      await lancerDe(ev.de, `${ev.info.label}${calcul}`, ev.info.q, false, ev.info.label, niveau >= 2);
      att?.classList.remove('fx-prepare');
      cib?.classList.remove('fx-visee');
      // 2. l'attaque part (projectile, rayon, élan…) et touche
      let retour = null;
      if (ev.degats > 0) {
        retour = await style.coup(att, cib, ev);
      } else if (att && cib && !reduit()) {
        // Raté : l'attaquant s'élance mais le coup passe à côté
        att.style.setProperty('--dx', `${(cib.getBoundingClientRect().left - att.getBoundingClientRect().left) * 0.35}px`);
        att.style.setProperty('--dy', `${(cib.getBoundingClientRect().top - att.getBoundingClientRect().top) * 0.35}px`);
        att.classList.add('fx-elan');
        await pause(230);
        retour = () => att.classList.remove('fx-elan');
      }
      // 3. le coup : la cible recule, chiffres de dégâts
      if (ev.info.q === 'echec') jouerSon('echec');
      else if (ev.info.q === 'critique') jouerSon('tonnerre');
      if (ev.degats > 0) {
        const critique = ev.info.q === 'critique';
        // l'impact : tout se fige un instant (plus longtemps sur un critique), puis la caméra donne un coup vers la cible
        await arretSurImage(critique ? 170 : ev.cible.heros ? 120 : 90);
        coupDeCamera(cib, critique ? 0.07 : ev.cible.heros ? 0.05 : 0.03);
        if (att && cib) {
          const ra = att.getBoundingClientRect(); const rc = cib.getBoundingClientRect();
          recul(cib, rc.left - ra.left, rc.top - ra.top, critique ? 30 : 18);
        }
        impact(cib, ev.info.q, !!ev.cible.heros, niveau);
        if (ev.cible.heros && !ev.bouclier) pvTouches(cib);
      }
      if (ev.bouclier) {
        flotter(cib, 'Bouclier !', 'buff');
        onde(cib, '#bfe3f0', 2.2, 600);
        jouerSon('acier', 0.05);
      } else if (ev.degats > 0) chiffreDegats(cib, ev.degats, ev.info.q === 'critique');
      else flotter(cib, 'Raté', 'rate');
      if (ev.tenace) setTimeout(() => flotter(cib, 'Tenace ! Reste à 1 PV', 'buff'), reduit() ? 0 : 300);
      retirerAnnonce();
      if (ev.drain > 0) {
        const heros = elHeros(ev.qui);
        setTimeout(() => { flotter(heros, `+${ev.drain}`, 'soin'); EFFET_SORT.heal(heros); }, reduit() ? 0 : 250);
      }
      if (ev.riposte > 0 || ev.bouclierAttaquant) {
        setTimeout(() => {
          if (ev.bouclierAttaquant) { flotter(att, 'Bouclier !', 'buff'); return; }
          secouer(att);
          chiffreDegats(att, ev.riposte);
          flotter(att, 'Riposte', 'rate');
          if (ev.tenaceAttaquant) flotter(att, 'Tenace ! Reste à 1 PV', 'buff');
          particules(att, { n: 8, couleurs: ['#ffffff', '#c5cad3'], vitesse: 110, gravite: 60, taille: [2, 5], duree: 500 });
        }, reduit() ? 0 : 200);
      }
      if (ev.expose) {
        flotter(att, 'Exposée : -2 Défense', 'rate');
        particules(att, { n: 18, couleurs: ['#9aa1ad', '#c5cad3', '#5d6574'], vitesse: 150, gravite: 120, taille: [3, 7], duree: 800 });
      }
      await pause(260);
      retour?.();
      await mourir(ev.morts);
      await effetsPioche(ev);
      await pause(120);
      return;
    }
    case 'destin': {
      await lancerDe(ev.de, `Destin : ${ev.info.label}`, ev.info.q, true, ev.info.label);
      const sons = { malediction: 'tonnerre', soin: 'soin', pioche: 'pioche', renfort: 'acier', benediction: 'cloche', grace: 'cloche' };
      jouerSon(sons[ev.info.q]);
      if (ev.info.q === 'malediction') { voile('rgba(110,40,150,.55)', 800); secousseEcran(8); }
      if (ev.info.q === 'grace') { onde($('d20'), '#f0c873', 4, 900); particules($('d20'), { n: 30, couleurs: OR, vitesse: 220, gravite: 60 }); }
      await banniere(ev.info.label, ev.info.texte + (ev.complet ? ' (mais il n\'y a plus de place)' : ''), `banniere--${ev.info.q}`);
      for (const t of ev.touches) {
        const el = elCible(t);
        if (t.soin) { EFFET_SORT.heal(el); flotter(el, `+${t.valeur}`, 'soin'); }
        else if (t.buff) { EFFET_SORT.buff(el); flotter(el, `+${t.valeur}/+${t.valeur}`, 'buff'); }
        else {
          particules(el, { n: 18, couleurs: ['#a66cd9', '#6e3a9a', '#d2b4f0'], vitesse: 80, monte: 30, rond: true, depuis: 'surface', duree: 900 });
          secouer(el);
          flotter(el, `-${t.valeur}`);
        }
      }
      await mourir(ev.morts);
      await effetsPioche(ev);
      await pause(300);
      return;
    }
    case 'defense': {
      // L'unité se met en garde
      const el = elUnite(ev.uid);
      onde(el, '#e6eaf1', 2, 650);
      particules(el, { n: 12, couleurs: ['#e6eaf1', '#c5cad3', '#ffffff'], vitesse: 60, monte: 30, gravite: 0, depuis: 'surface' });
      flotter(el, 'En garde : +2 Défense', 'buff');
      jouerSon('acier', 0.05);
      await pause(450);
      return;
    }
    case 'capacite': {
      // Capacité d'une grande carte : son nom s'affiche, puis ses effets
      const el = elUnite(ev.uid);
      const teinte = couleursVeine(ev.veine) ?? OR;
      const retirer = annonce(el, ev.nom, '✦', teinte[0]);
      flash(el, 'rgba(255,230,170,.9)', 2.4, 450);
      onde(el, teinte[0], 2.6, 750);
      particules(el, { n: 22, couleurs: teinte, vitesse: 120, monte: 60, gravite: 0 });
      jouerSon('couronne');
      await pause(480);
      retirer();
      await montrerTouches(ev.touches);
      await mourir(ev.morts);
      await effetsPioche(ev);
      await pause(250);
      return;
    }
    case 'effet': {
      // Capacité unique à l'arrivée d'une grande carte (après sa pose)
      await banniere(ev.effet.nom, ev.effet.texte, 'banniere--grace');
      if (ev.destin) await lancerDe(ev.destin.de, `Destin : ${ev.destin.info.label}`, ev.destin.info.q, true, ev.destin.info.label);
      await montrerTouches(ev.touches);
      if (ev.renfort) await animer({ type: 'apres-pose', uid: ev.renfort, carte: { n: 'Milicien de la Couronne' } });
      await mourir(ev.morts);
      await effetsPioche(ev);
      return;
    }
    case 'defausse': {
      // La carte glisse vers le Tombeau puis s'y efface
      const tombe = $(`tombeau-${ev.qui}`);
      flotter(tombe, `Défaussée : ${ev.carte.n}`, 'rate');
      particules(tombe, { n: 16, couleurs: ['#9aa1ad', '#c5cad3', '#5d6574'], vitesse: 70, monte: 40, gravite: 30, depuis: 'surface' });
      jouerSon('pioche');
      await pause(350);
      await effetsPioche(ev);
      return;
    }
    case 'mediter': {
      const pile = $(`pioche-${ev.qui}`);
      flotter(pile, 'Méditation…', 'buff');
      onde(pile, '#c9b2fb', 1.8, 700);
      jouerSon('cloche');
      await pause(400);
      return;
    }
    case 'placer': {
      if (ev.sous) flotter($(`pioche-${ev.qui}`), 'Une carte sous le Grimoire', 'buff');
      await pause(250);
      return;
    }
    default: return;
  }
}

// L'entrée d'une Transcendante (court, moins de 1,5 s) : la scène s'assombrit, la carte apparaît en grand
// au centre dans un halo de rayons dorés, puis plonge jusqu'à sa place (l'arrivée, apres-pose, suit)
async function entreeTranscendante(ev, dest) {
  const apercu = $('apercu');
  const source = ev.qui === 'joueur' ? $('main-joueur')?.querySelector(`[data-index="${ev.index}"]`) : null;
  if (source) source.style.visibility = 'hidden';
  apercu.innerHTML = htmlCarte(ev.carte);
  voile('rgba(4,5,9,.72)', 1300);
  apercu.className = `apercu est-visible apercu--entree ${ev.qui === 'adverse' ? 'apercu--adverse' : ''}`;
  jouerSon('couronne');
  particules(apercu.firstElementChild, { n: 22, couleurs: OR, vitesse: 120, monte: 40, gravite: -10, depuis: 'surface', duree: 900 });
  await pause(750);
  jouerSon('elan');
  const vol = envol(apercu.firstElementChild, dest, { duree: 360 });   // une copie part, la grande carte s'efface
  apercu.className = 'apercu';
  await vol;
}

// Une carte jouée quitte la main (la tienne : la vraie carte ; l'adverse : un dos qui se retourne)
// et vole jusqu'à dest. La carte d'origine est cachée pendant le vol (le plateau est redessiné après).
async function volerDepuisMain(ev, dest) {
  if (!dest || reduit()) return;
  // 2 contre 2 : une carte de mon allié part de son encart, à côté de mon héros (JS/jeu-cartes.js)
  const allie = !!ev.coequipier;
  const source = allie ? $('equipe-allie')
    : ev.qui === 'joueur'
      ? $('main-joueur')?.querySelector(`[data-index="${ev.index}"]`)
      : $('main-adverse')?.lastElementChild;
  if (!source || (allie && source.hidden)) return;
  if (!allie) source.style.visibility = 'hidden';
  jouerSon('elan');
  await envol(source, dest, {
    html: ev.qui === 'adverse' || allie ? htmlCarte(ev.carte) : null,
    rotation: ev.qui === 'joueur' ? -10 : 10,
    duree: 440,
  });
}

// Les unités tombées éclatent en morceaux ; une grande carte tombe dans un dernier éclat d'or
async function mourir(uids = []) {
  if (!uids?.length) return;
  uids.forEach((uid, i) => setTimeout(() => {
    const el = elUnite(uid);
    const niveau = niveauElement(el);
    if (niveau >= 2) {
      onde(el, '#f3cf7c', niveau === 3 ? 3.4 : 2.6, 700);
      particules(el, { n: niveau === 3 ? 26 : 16, couleurs: OR, vitesse: 150, monte: 40, gravite: 80, taille: [2, 8], duree: 900 });
      secousseEcran(niveau === 3 ? 9 : 5, 380);
    }
    briser(el);
  }, reduit() ? 0 : i * 90));
  jouerSon('choc', 0.02);
  jouerSon('acier', 0.08);
  await pause(480);
}
