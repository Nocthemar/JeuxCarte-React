// =====================================================================
//  La vérification anti-robot (Cloudflare Turnstile) des formulaires de connexion, FACULTATIVE :
//  active seulement si VITE_TURNSTILE_SITE_KEY est donnée (.env.local, Variables du dépôt) ET si la
//  protection « CAPTCHA » est activée dans Supabase > Authentication > Attack Protection (avec la clé secrète).
//  Sans clé : rien ne s'affiche et les formulaires marchent sans.
//
//  <Captcha surJeton={(jeton) => …} />  (jeton : à passer à Supabase ; null quand il expire)
// =====================================================================
import { useEffect, useRef } from 'react';
import { CLE_CAPTCHA } from '../lib/auth.js';

let chargement = null;
function chargerTurnstile() {
  chargement ??= new Promise((ok, echec) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = () => ok(window.turnstile);
    s.onerror = () => { chargement = null; echec(new Error('Turnstile indisponible')); };
    document.head.appendChild(s);
  });
  return chargement;
}

export default function Captcha({ surJeton }) {
  const zone = useRef(null);
  const rappel = useRef(surJeton);
  useEffect(() => { rappel.current = surJeton; });
  useEffect(() => {
    if (!CLE_CAPTCHA) return undefined;
    let id = null;
    let actif = true;
    chargerTurnstile().then((turnstile) => {
      if (!actif || !zone.current) return;
      id = turnstile.render(zone.current, {
        sitekey: CLE_CAPTCHA, theme: 'dark', language: 'fr',
        callback: (jeton) => rappel.current(jeton),
        'expired-callback': () => rappel.current(null),
        'error-callback': () => rappel.current(null),
      });
    }).catch(() => {});
    return () => { actif = false; if (id !== null) window.turnstile?.remove(id); };
  }, []);
  if (!CLE_CAPTCHA) return null;
  return <div className="connexion__captcha" ref={zone} />;
}
