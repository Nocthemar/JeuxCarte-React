// =====================================================================
//  L'enveloppe de chaque écran : ce que faisait le <head> et le <body> de chaque ancienne page HTML
//  - les feuilles de style de la page (styles/feuilles.js), dans le même ordre qu'avant ;
//  - les classes du <body> (ex. « page-profil page-jeu »), dont dépend le CSS ;
//  - le titre de l'onglet (« Boutique — Nocthémar ») ;
//  - la barre du haut (visible sur téléphone) et, sur certaines pages, les braises qui montent.
// =====================================================================
import { use, useLayoutEffect } from 'react';
import { chargerFeuilles } from '../styles/feuilles.js';
import { NOCTHEMAR_SITE } from '../lib/lienSite.js';
import Braises from './Braises.jsx';

// id : la clé de FEUILLES ; classes : celles du <body> ; titre : le nom de la page ;
// braises : les particules de l'ancien embers.js ; rail : la place de la barre latérale (pas sur l'écran de connexion)
export default function Page({ id, classes, titre, braises = false, rail = true, children }) {
  // Les feuilles de l'écran, téléchargées à la demande : use() attend qu'elles soient arrivées
  // (pendant ce temps, le <Suspense> de Layout.jsx n'affiche rien)
  const feuilles = use(chargerFeuilles(id));
  // useLayoutEffect (et non useEffect) : les styles sont posés avant que l'écran soit dessiné,
  // donc la page n'apparaît jamais sans son style, même un instant
  useLayoutEffect(() => {
    const balises = feuilles.map(([nom, texte]) => {
      const style = document.createElement('style');
      style.dataset.feuille = nom;
      style.textContent = texte;
      document.head.appendChild(style);
      return style;
    });
    // En quittant l'écran : ses styles s'en vont
    return () => balises.forEach((b) => b.remove());
  }, [feuilles]);

  // Les classes du <body> (elles peuvent changer sans changer d'écran : le plateau du Duel…)
  useLayoutEffect(() => {
    document.body.className = rail ? `${classes} has-rail` : classes;
    return () => { document.body.className = ''; };
  }, [classes, rail]);

  useLayoutEffect(() => { document.title = `${titre} — Nocthémar`; }, [titre]);

  return (
    <>
      {braises && <Braises />}
      {/* La barre du haut : affichée sur téléphone (styles/barre-laterale.css) */}
      {rail && <header className="topbar">
        <a className="brand" href={NOCTHEMAR_SITE}>Nocthémar</a>
        <span className="brand-sub">Duel des Couronnes</span>
        <span className="crumb">/ <span className="cur">{titre}</span></span>
      </header>}
      {children}
    </>
  );
}
