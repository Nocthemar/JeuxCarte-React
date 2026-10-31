// =====================================================================
//  Les adresses du jeu (une par ancienne page HTML)
//  HashRouter : l'adresse de l'écran est après le « # » (…/#/boutique). Ainsi GitHub Pages sert
//  toujours le même fichier index.html, quel que soit l'écran demandé.
//  Tous les écrans du jeu demandent d'être connecté (RoutePrivee) : sinon, l'écran de connexion.
// =====================================================================
import { lazy } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import RoutePrivee from './components/RoutePrivee.jsx';
import { CODE } from './lib/ecrans.js';

// Chaque écran est chargé seulement quand on l'ouvre (lazy) : le premier chargement du jeu est plus léger.
// Suspense : ce qui s'affiche le temps qu'il arrive (rien : la page garde son fond).
const Connexion = lazy(CODE.connexion);
const Duel = lazy(CODE.duel);
const Gemmes = lazy(CODE.gemmes);
const Histoire = lazy(CODE.histoire);
const Collection = lazy(CODE.collection);
const ToutesLesCartes = lazy(CODE.cartes);
const Succes = lazy(CODE.succes);
const Boutique = lazy(CODE.boutique);
const Caverne = lazy(CODE.caverne);
const Marche = lazy(CODE.marche);
const Amis = lazy(CODE.amis);
const Pass = lazy(CODE.pass);
const Profil = lazy(CODE.profil);
const Parametres = lazy(CODE.parametres);
const Mj = lazy(CODE.mj);

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          {/* Connexion, création de compte, mot de passe oublié, double authentification, pseudo */}
          <Route path="/connexion" element={<Connexion />} />
          <Route path="/mot-de-passe" element={<Connexion nouveauMotDePasse />} />
          <Route element={<RoutePrivee />}>
            <Route path="/duel" element={<Duel />} />
            <Route path="/gemmes" element={<Gemmes />} />
            <Route path="/histoire" element={<Histoire />} />
            <Route path="/collection" element={<Collection />} />
            <Route path="/toutes-les-cartes" element={<ToutesLesCartes />} />
            <Route path="/succes" element={<Succes />} />
            <Route path="/boutique" element={<Boutique />} />
            <Route path="/caverne" element={<Caverne />} />
            <Route path="/marche" element={<Marche />} />
            <Route path="/amis" element={<Amis />} />
            <Route path="/pass" element={<Pass />} />
            <Route path="/profil" element={<Profil />} />
            <Route path="/parametres" element={<Parametres />} />
            <Route path="/mj" element={<Mj />} />
            {/* L'entrée du jeu (et toute adresse inconnue) mène au Duel, comme l'ancien index.html */}
            <Route path="*" element={<Navigate to="/duel" replace />} />
          </Route>
        </Route>
      </Routes>
    </HashRouter>
  );
}
