// =====================================================================
//  La fenêtre « Règles du Duel des Couronnes » (ancien <dialog id="regles"> de jeu-cartes.html)
//  Les listes (jets, capacités, terrains, Destin) viennent des données du moteur : elles suivent
//  toute modification des règles.
//  <dialog> : la fenêtre native du navigateur (showModal ouvre, Échap ferme, fond assombri).
// =====================================================================
import { useEffect, useRef } from 'react';
import { JETS, CAPACITES, TERRAINS, DESTIN, PV_HEROS } from '../../data/regles.js';

export default function Regles({ ouverte, surFermeture }) {
  const dialogue = useRef(null);

  // ouverte (vrai / faux) pilote la fenêtre native
  useEffect(() => {
    const d = dialogue.current;
    if (ouverte && !d.open) d.showModal();
    if (!ouverte && d.open) d.close();
  }, [ouverte]);

  return (
    <dialog className="regles" id="regles" aria-labelledby="regles-titre" ref={dialogue}
      onClose={surFermeture} onClick={(e) => { if (e.target === dialogue.current) surFermeture(); }}>
      <h2 id="regles-titre">Règles du Duel des Couronnes</h2>
      <ul>
        <li><strong>But</strong> : faire tomber les <span>{PV_HEROS}</span> PV du héros adverse avant que les tiens ne tombent.</li>
        <li><strong>Énergie</strong> : 1 de plus à chaque tour (10 au plus), rechargée au début de ton tour. Chaque carte coûte de l&apos;énergie (le chiffre en haut à gauche).</li>
        <li><strong>Actions</strong> : <strong>2 par tour</strong>, puis <strong>3 à partir du tour 5</strong>. Une action sert à jouer une carte, attaquer avec une unité, défendre avec une unité ou activer la capacité d&apos;une grande carte. Les Transcendantes demandent <strong>2 actions</strong> et une de tes unités déjà en jeu.</li>
        <li><strong>Les unités</strong> ont <strong>Attaque</strong> (à gauche), <strong>Défense</strong> (au milieu) et <strong>PV</strong> (à droite). Une unité posée attend le tour suivant pour attaquer (sauf Charge), et chaque unité agit une fois par tour.</li>
        <li><strong>Attaquer</strong> : touche une de tes unités (bord ambre), puis sa cible. Jet : <strong>d20 + Attaque</strong> contre <strong>8 + Défense</strong> de la cible (un héros a 2 de Défense). Touché : la cible perd autant de PV que l&apos;Attaque. Raté avec un dé de 5 ou plus : Éraflure, 1 dégât quand même.
          <ul className="regles__table">
            {JETS.map((j) => <li key={j.q}><b>{j.jet}</b> {j.label.replace(' !', '')} : {j.texte}</li>)}
          </ul>
        </li>
        <li><strong>Défendre</strong> (1 action) : touche une de tes unités puis « Défendre » (ou G). Jusqu&apos;à ton prochain tour, elle a <strong>+2 Défense</strong> et <strong>riposte</strong> quand on l&apos;attaque ; elle n&apos;attaque pas ce tour.</li>
        <li><strong>Capacités</strong> : plus une carte est rare, plus elle change le combat. Éveillée : une capacité, Mythique : deux, Légendaire et Transcendante : en plus une <strong>capacité unique</strong> (couronne), à son arrivée ou à activer (1 action). Certaines agissent pendant le tour adverse (réactions).
          <ul className="regles__table">
            {Object.entries(CAPACITES).map(([k, c]) => <li key={k}><b>{c.nom}</b> {c.texte}</li>)}
          </ul>
        </li>
        <li><strong>Le terrain</strong> : chaque duel se joue sur un terrain tiré au hasard, qui change une petite règle (affiché à droite) :
          <ul className="regles__table">
            {Object.entries(TERRAINS).map(([k, t]) => <li key={k}><b>{t.nom}</b> {t.texte}</li>)}
          </ul>
        </li>
        <li><strong>Le Grimoire</strong> : ton deck de 20 cartes, choisies dans ta collection (2 exemplaires au plus d&apos;une carte, 1 seul d&apos;une Transcendante, 2 Transcendantes et 4 objets au plus) et complétées par des cartes de base. Il est mélangé au début de chaque partie.</li>
        <li><strong>Début de partie</strong> : celui qui commence pioche 3 cartes, l&apos;autre 4. Puis, une seule fois, tu peux <strong>renvoyer</strong> les cartes de ta main que tu veux : elles retournent dans ton Grimoire, qui est remélangé, et tu en repioches autant.</li>
        <li><strong>Pioche</strong> : 1 carte au début de chacun de tes tours. 7 cartes en main au plus : une carte piochée main pleine est <strong>brûlée</strong> et va au Tombeau.</li>
        <li><strong>Le Tombeau</strong> : la défausse, visible des deux joueurs (touche-la pour voir son contenu). Y vont les troupes mortes, les sorts joués, les cartes brûlées et défaussées.</li>
        <li><strong>Défausser</strong> et <strong>Méditer</strong> (1 énergie chacun, une fois par tour, sans action) : défausser une carte pour en piocher une ; regarder les 3 premières cartes de ton Grimoire et en placer une dessous.</li>
        <li><strong>Épuisement</strong> : si tu dois piocher et que ton Grimoire est vide, ton héros perd 1 PV, puis 2 la fois suivante, puis 3…</li>
        <li><strong>Jet du Destin</strong> : pour 2 énergie (sans action), une fois par tour, un second d20 déclenche un événement, du pire (1) au meilleur (20) :
          <ul className="regles__table">
            {DESTIN.map((j) => <li key={j.q}><b>{j.min === j.max ? j.min : `${j.min}–${j.max}`}</b> {j.label} : {j.texte}</li>)}
          </ul>
        </li>
        <li><strong>2 contre 2</strong> (en ligne : salon à quatre ou classé) : chaque équipe partage <strong>un héros de 30 PV</strong> et <strong>une rangée de 5 places</strong> ; chaque joueur garde sa main, son Grimoire, son énergie et ses actions. Les tours alternent : un joueur de l&apos;équipe A, un de l&apos;équipe B, l&apos;autre joueur de A, l&apos;autre de B… Pendant ton tour, tu commandes toutes les unités de ton équipe.</li>
        <li><strong>Raccourcis</strong> : Espace pour finir le tour, D pour le Destin, G pour défendre, Échap pour annuler. Clic droit (ou appui long) sur une carte : tout ce qu&apos;elle fait.</li>
      </ul>
      <button type="button" className="btn-dc btn-dc--ambre" onClick={surFermeture}>Compris</button>
    </dialog>
  );
}
