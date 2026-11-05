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
  // Les styles sont rendus avec l'écran lui-même (balises <style> ci-dessous) : ils entrent dans la page
  // en même temps que lui, et s'en vont avec lui. Posés plus tard (dans un effet), le navigateur avait parfois
  // déjà calculé l'apparence de la barre sans eux : ses liens partaient de la couleur par défaut des liens
  // visités (violet) et y revenaient en fondu (transition de couleur) au chargement.

  // Les classes du <body> (elles peuvent changer sans changer d'écran : le plateau du Duel…)
  useLayoutEffect(() => {
    document.body.className = rail ? `${classes} has-rail` : classes;
    return () => { document.body.className = ''; };
  }, [classes, rail]);

  useLayoutEffect(() => { document.title = `${titre} — Nocthémar`; }, [titre]);

  return (
    <>
      {feuilles.map(([nom, texte]) => <style key={nom} data-feuille={nom}>{texte}</style>)}
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
