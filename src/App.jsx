// =====================================================================
//  Les adresses du jeu (une par ancienne page HTML)
//  HashRouter : l'adresse de l'écran est après le « # » (…/#/boutique). Ainsi GitHub Pages sert
//  toujours le même fichier index.html, quel que soit l'écran demandé.
// =====================================================================
import { lazy } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';

// Chaque écran est chargé seulement quand on l'ouvre (lazy) : le premier chargement du jeu est plus léger.
// Suspense : ce qui s'affiche le temps qu'il arrive (rien : la page garde son fond).
const Duel = lazy(() => import('./pages/Duel.jsx'));
const Histoire = lazy(() => import('./pages/Histoire.jsx'));
const Collection = lazy(() => import('./pages/Collection.jsx'));
const ToutesLesCartes = lazy(() => import('./pages/ToutesLesCartes.jsx'));
const Succes = lazy(() => import('./pages/Succes.jsx'));
const Boutique = lazy(() => import('./pages/Boutique.jsx'));
const Marche = lazy(() => import('./pages/Marche.jsx'));
const Pass = lazy(() => import('./pages/Pass.jsx'));
const Profil = lazy(() => import('./pages/Profil.jsx'));
const Parametres = lazy(() => import('./pages/Parametres.jsx'));

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/duel" element={<Duel />} />
          <Route path="/histoire" element={<Histoire />} />
          <Route path="/collection" element={<Collection />} />
          <Route path="/toutes-les-cartes" element={<ToutesLesCartes />} />
          <Route path="/succes" element={<Succes />} />
          <Route path="/boutique" element={<Boutique />} />
          <Route path="/marche" element={<Marche />} />
          <Route path="/pass" element={<Pass />} />
          <Route path="/profil" element={<Profil />} />
          <Route path="/parametres" element={<Parametres />} />
          {/* L'entrée du jeu (et toute adresse inconnue) mène au Duel, comme l'ancien index.html */}
          <Route path="*" element={<Navigate to="/duel" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
