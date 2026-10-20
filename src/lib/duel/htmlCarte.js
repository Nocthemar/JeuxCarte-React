// Le HTML (texte) d'une carte du duel, pour les animations qui fabriquent leurs propres éléments
// (la carte qui vole de la main au plateau, le sort montré en grand au centre).
// React dessine CarteDuel dans un élément invisible (jamais ajouté à la page), on en lit le HTML,
// puis on le défait. flushSync : le dessin est fait tout de suite, pas plus tard.
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import CarteDuel from '../../components/duel/CarteDuel.jsx';

export function htmlCarte(c) {
  const conteneur = document.createElement('div');
  const racine = createRoot(conteneur);
  flushSync(() => racine.render(createElement(CarteDuel, { c })));
  const html = conteneur.innerHTML;
  racine.unmount();
  return html;
}
