// =====================================================================
//  useScene : l'état du duel affiché à l'écran, et l'animation des événements du moteur
//  (partagé par le duel contre l'Ombre et le duel en ligne)
//
//  const { etat, partie, actif, afficher, animerEvenements } = useScene(etatDeDepart);
//    etat     : l'état affiché (React redessine le plateau quand il change)
//    partie   : le même état dans une ref, toujours à jour pour les tâches en cours (tour de l'Ombre…)
//    actif    : faux quand on quitte le duel (les tâches en cours s'arrêtent)
//    afficher(e)                  : affiche un état tout de suite
//    animerEvenements(evs, e)     : anime chaque événement (avant / après l'affichage), puis affiche e
// =====================================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { terrainDe } from '../../moteur/index.js';
import { jouerSon } from '../son.js';
import { animer, banniere, montrerTouches } from './animations.js';

export function useScene(etatDeDepart) {
  const [etat, setEtat] = useState(etatDeDepart);
  const partie = useRef(null);
  const actif = useRef(true);
  const terrainAnnonce = useRef(false);   // le terrain est annoncé une fois, au premier tour

  useEffect(() => {
    actif.current = true;
    return () => { actif.current = false; };
  }, []);
  // L'état de départ, dès le premier affichage
  useEffect(() => { if (partie.current === null) partie.current = etat; }, [etat]);

  // Affiche un état tout de suite (flushSync : React dessine maintenant, pas plus tard),
  // pour que les animations qui suivent trouvent la page à jour
  const afficher = useCallback((e) => {
    partie.current = e;
    flushSync(() => setEtat(e));
    // L'animation d'une carte jouée cache la carte de départ dans la main. L'ancien jeu redessinait
    // toute la main ; React, lui, réutilise les mêmes éléments : on leur rend leur visibilité.
    document.querySelectorAll('#main-joueur > *, #main-adverse > *').forEach((el) => { el.style.visibility = ''; });
  }, []);

  // Un début de tour : les bannières (terrain, « À toi de jouer »…), les soins, la carte brûlée, l'épuisement
  const afficherTour = useCallback(async (ev, e) => {
    const monTour = ev.qui === 'joueur' && e.moiActif !== false;
    if (monTour && ev.pioche.piochees.length) jouerSon('pioche');
    afficher(e);
    const terrain = terrainDe(e);
    if (!terrainAnnonce.current && terrain) {
      terrainAnnonce.current = true;
      await banniere(terrain.nom, terrain.texte, 'banniere--terrain');
    }
    const nomActif = e.nomActif ?? e.camps.adverse.nom;
    await banniere(monTour ? 'À toi de jouer' : `Tour de ${nomActif}${e.equipes && e.actif === 'joueur' ? ' (ton allié)' : ''}`,
      `Tour ${e.tour} · ${e.camps[e.actif].actionsMax} actions`, monTour ? 'banniere--moi' : '');
    if (ev.touches?.length) await montrerTouches(ev.touches);   // Soin en début de tour
    if (ev.pioche.brulees.length) await banniere('Main pleine', `${ev.pioche.brulees[0].n} est brûlée et part au Tombeau.`, 'banniere--malediction');
    if (ev.fatigue) await banniere('Épuisement', `Grimoire vide : ${ev.qui === 'joueur' ? 'ton héros' : e.camps.adverse.nom} perd ${ev.fatigue} PV.`, 'banniere--malediction');
  }, [afficher]);

  // Anime chaque événement, puis affiche l'état final e
  const animerEvenements = useCallback(async (evs, e) => {
    for (const ev of evs) {
      if (!actif.current) return;
      if (ev.type === 'tour') { await afficherTour(ev, e); continue; }
      if (['renvoi', 'refus', 'abandon', 'debut', 'etat'].includes(ev.type)) {
        if (ev.type === 'renvoi' && ev.qui === 'joueur' && !ev.coequipier && ev.n) jouerSon('pioche');
        afficher(e);
        continue;
      }
      await animer(ev);          // sur l'ancien plateau (les unités mortes y sont encore)
      afficher(e);
      // Après le nouveau rendu : l'arrivée sur le plateau, la capacité unique d'arrivée, le Milicien du Destin
      if (ev.type === 'pose') {
        await animer({ ...ev, type: 'apres-pose' });
        if (ev.effet) await animer({ ...ev, type: 'effet' });
      }
      if (ev.type === 'destin' && ev.uid) await animer({ type: 'apres-pose', uid: ev.uid, carte: { n: 'Milicien de la Couronne' } });
    }
    afficher(e);
  }, [afficher, afficherTour]);

  return { etat, partie, actif, afficher, animerEvenements };
}
