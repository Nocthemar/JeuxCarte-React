// =====================================================================
//  Le jeu comme une appli (téléphone, ordinateur)
//  - inscrit le service worker (src/appli/service-worker.js), seulement dans la version publiée ;
//  - repère qu'une nouvelle version a pris la main : le bandeau « Mettre à jour » (components/MiseAJour.jsx),
//    qui recharge la page quand le joueur le décide ;
//  - garde l'invitation « Installer » du navigateur pour le bouton des Paramètres.
//  useAppli() : l'état, partagé par tous les écrans (useSyncExternalStore).
// =====================================================================
import { useSyncExternalStore } from 'react';
import { urlPublique } from './chemins.js';

const estInstallee = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
// iPhone et iPad : pas de bouton « Installer », il faut passer par le menu Partager de Safari
export const estIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

let etat = { majPrete: false, installable: false, installee: estInstallee() };
const abonnes = new Set();
const changer = (modif) => {
  etat = { ...etat, ...modif };
  abonnes.forEach((f) => f());
};
const sAbonner = (f) => {
  abonnes.add(f);
  return () => abonnes.delete(f);
};
export const useAppli = () => useSyncExternalStore(sAbonner, () => etat);

let invitation = null;

export function demarrerAppli() {
  // Chrome, Edge (ordinateur, Android) : le navigateur propose d'installer ; on garde sa proposition
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    invitation = e;
    changer({ installable: true });
  });
  window.addEventListener('appinstalled', () => {
    invitation = null;
    changer({ installable: false, installee: true });
  });

  // En développement (npm run dev), pas de service worker : on verrait d'anciennes copies du code
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

  // Une nouvelle version a pris la main pendant qu'on joue : on le propose, sans recharger
  // (à la toute première visite, le service worker prend aussi la main : rien à proposer)
  const dejaInstallee = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (dejaInstallee) changer({ majPrete: true });
  });

  navigator.serviceWorker.register(urlPublique('sw.js')).then((inscription) => {
    // Une nouvelle version publiée ? On regarde au retour sur le jeu, et toutes les 30 minutes
    const verifier = () => inscription.update().catch(() => {});
    setInterval(verifier, 30 * 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') verifier();
    });
  }).catch(() => {});
}

export function mettreAJour() {
  location.reload();
}

export async function installer() {
  if (!invitation) return;
  invitation.prompt();
  const { outcome } = await invitation.userChoice;
  invitation = null;
  changer({ installable: false, installee: outcome === 'accepted' });
}
