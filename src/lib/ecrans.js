// =====================================================================
//  Les écrans du jeu : le code de chacun (chargé à la demande, App.jsx) et l'id de ses feuilles de style
//  (styles/feuilles.js). prechargerEcran(chemin) télécharge les deux en avance : la barre l'appelle dès que
//  la souris survole un bouton (ou que le doigt le touche), l'écran s'ouvre alors sans attente.
// =====================================================================
import { chargerFeuilles } from '../styles/feuilles.js';

export const CODE = {
  connexion: () => import('../pages/Connexion.jsx'),
  duel: () => import('../pages/Duel.jsx'),
  histoire: () => import('../pages/Histoire.jsx'),
  collection: () => import('../pages/Collection.jsx'),
  cartes: () => import('../pages/ToutesLesCartes.jsx'),
  succes: () => import('../pages/Succes.jsx'),
  boutique: () => import('../pages/Boutique.jsx'),
  caverne: () => import('../pages/Caverne.jsx'),
  marche: () => import('../pages/Marche.jsx'),
  amis: () => import('../pages/Amis.jsx'),
  pass: () => import('../pages/Pass.jsx'),
  profil: () => import('../pages/Profil.jsx'),
  parametres: () => import('../pages/Parametres.jsx'),
  mj: () => import('../pages/Mj.jsx'),
};

// L'adresse d'un écran -> l'id de son code et de ses feuilles
const PAR_CHEMIN = {
  '/connexion': 'connexion', '/duel': 'duel', '/histoire': 'histoire', '/collection': 'collection',
  '/toutes-les-cartes': 'cartes', '/succes': 'succes', '/boutique': 'boutique', '/caverne': 'caverne',
  '/marche': 'marche', '/amis': 'amis', '/pass': 'pass', '/profil': 'profil', '/parametres': 'parametres', '/mj': 'mj',
};

const deja = new Set();
export function prechargerEcran(chemin) {
  const id = PAR_CHEMIN[chemin];
  if (!id || deja.has(id)) return;
  deja.add(id);
  CODE[id]().catch(() => deja.delete(id));
  chargerFeuilles(id).catch(() => {});
}
