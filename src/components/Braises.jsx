// =====================================================================
//  Légères particules d'embrasement qui remontent (ancien JS/embers.js, même dessin)
//  Rien ne s'anime si l'utilisateur préfère moins de mouvement, ou a choisi « effets légers ».
// =====================================================================
import { useEffect, useRef } from 'react';
import { effetsLegers } from '../lib/preferences.js';

const COULEURS = ['200,60,50', '224,90,40', '160,40,40'];
const TAILLE_SPRITE = 64;   // taille fixe des sprites pré-rendus (évite createRadialGradient à chaque image)

export default function Braises() {
  const ref = useRef(null);

  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || effetsLegers()) return;
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');

    const sprites = COULEURS.map((couleur) => {
      const s = document.createElement('canvas');
      s.width = TAILLE_SPRITE; s.height = TAILLE_SPRITE;
      const sctx = s.getContext('2d');
      const grad = sctx.createRadialGradient(TAILLE_SPRITE / 2, TAILLE_SPRITE / 2, 0, TAILLE_SPRITE / 2, TAILLE_SPRITE / 2, TAILLE_SPRITE / 2);
      grad.addColorStop(0, `rgba(${couleur},1)`);
      grad.addColorStop(1, `rgba(${couleur},0)`);
      sctx.fillStyle = grad;
      sctx.fillRect(0, 0, TAILLE_SPRITE, TAILLE_SPRITE);
      return s;
    });

    let w; let h;
    function redimensionner() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    let minuteurTaille;
    const surTaille = () => { clearTimeout(minuteurTaille); minuteurTaille = setTimeout(redimensionner, 150); };
    window.addEventListener('resize', surTaille);
    redimensionner();

    const NOMBRE = window.innerWidth < 700 ? 10 : 18;
    function naitre(p) {
      p.x = Math.random() * w;
      p.y = h + Math.random() * 60;
      p.r = 0.6 + Math.random() * 1.4;
      p.speed = 0.25 + Math.random() * 0.55;
      p.drift = (Math.random() - 0.5) * 0.4;
      p.wobble = Math.random() * Math.PI * 2;
      p.wobbleSpeed = 0.01 + Math.random() * 0.02;
      p.life = 0;
      p.maxLife = h / p.speed * (0.85 + Math.random() * 0.3);
      p.spriteIndex = Math.floor(Math.random() * sprites.length);
      p.baseAlpha = 0.16 + Math.random() * 0.22;
    }
    const particules = Array.from({ length: NOMBRE }, () => {
      const p = {};
      naitre(p);
      p.y = Math.random() * h;
      p.life = Math.random() * p.maxLife;
      return p;
    });

    let image = null;   // la prochaine image demandée (requestAnimationFrame)
    function dessiner() {
      ctx.clearRect(0, 0, w, h);
      for (const p of particules) {
        p.life += 1;
        p.wobble += p.wobbleSpeed;
        p.y -= p.speed;
        p.x += p.drift + Math.sin(p.wobble) * 0.3;

        const ratio = p.life / p.maxLife;
        let alpha = p.baseAlpha;
        if (ratio < 0.12) alpha *= ratio / 0.12;
        else if (ratio > 0.75) alpha *= Math.max(0, 1 - (ratio - 0.75) / 0.25);

        if (p.y < -20 || p.life >= p.maxLife) { naitre(p); continue; }

        const lueur = p.r * 10;
        ctx.globalAlpha = alpha;
        ctx.drawImage(sprites[p.spriteIndex], p.x - lueur / 2, p.y - lueur / 2, lueur, lueur);
        ctx.fillStyle = 'rgb(255,220,190)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      image = requestAnimationFrame(dessiner);
    }

    // Onglet caché : l'animation s'arrête, et reprend au retour
    const surVisibilite = () => {
      cancelAnimationFrame(image);
      if (!document.hidden) image = requestAnimationFrame(dessiner);
    };
    document.addEventListener('visibilitychange', surVisibilite);
    dessiner();

    // En quittant la page : tout s'arrête
    return () => {
      cancelAnimationFrame(image);
      clearTimeout(minuteurTaille);
      window.removeEventListener('resize', surTaille);
      document.removeEventListener('visibilitychange', surVisibilite);
    };
  }, []);

  return <canvas id="embers" ref={ref} />;
}
