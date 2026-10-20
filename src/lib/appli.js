// =====================================================================
//  Le jeu comme une appli (téléphone, ordinateur)
//  - inscrit le service worker (src/appli/service-worker.js), seulement dans la version publiée ;
//  - repère une nouvelle version prête : le bandeau « Mettre à jour » (components/MiseAJour.jsx) ;
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

let versionEnAttente = null;
let invitation = null;
let miseAJourDemandee = false;

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

  // Le nouveau service worker a pris la main APRÈS « Mettre à jour » : on recharge sur la nouvelle version
  // (à la toute première installation il prend aussi la main, mais sans rechargement)
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (miseAJourDemandee) location.reload();
  });

  navigator.serviceWorker.register(urlPublique('sw.js')).then((inscription) => {
    const signaler = (sw) => {
      versionEnAttente = sw;
      changer({ majPrete: true });
    };
    // (controller : une version est déjà installée ; sinon c'est la première visite, rien à proposer)
    if (inscription.waiting && navigator.serviceWorker.controller) signaler(inscription.waiting);
    inscription.addEventListener('updatefound', () => {
      const sw = inscription.installing;
      sw?.addEventListener('statechange', () => {
        if (sw.state === 'installed' && navigator.serviceWorker.controller) signaler(sw);
      });
    });
    // Une nouvelle version publiée ? On regarde au retour sur le jeu, et toutes les 30 minutes
    const verifier = () => inscription.update().catch(() => {});
    setInterval(verifier, 30 * 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') verifier();
    });
  }).catch(() => {});
}

export function mettreAJour() {
  if (!versionEnAttente) return;
  miseAJourDemandee = true;
  versionEnAttente.postMessage('activer');
}

export async function installer() {
  if (!invitation) return;
  invitation.prompt();
  const { outcome } = await invitation.userChoice;
  invitation = null;
  changer({ installable: false, installee: outcome === 'accepted' });
}
