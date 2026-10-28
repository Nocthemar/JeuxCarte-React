// =====================================================================
//  Kaéliss, la petite gardienne du portail (components/caverne/Portail.jsx) : son image (img/Mascotte/Kaeliss.webp,
//  tirée de Mascotte_Kaeilis.png) flotte, se balance et respire, un éclat de sang tourne autour d'elle ; elle parle
//  selon le moment (situation) : sa phrase du moment d'abord, puis, si on la laisse parler, ses conseils, l'un
//  après l'autre. Un clic sur elle : le conseil suivant.
//  props : situation (une clé de PAROLES), details ({ temps } : le temps d'ouverture, pour ses phrases)
//  Styles : styles/caverne-portail.css (.kaeliss)
// =====================================================================
import { useEffect, useState } from 'react';
import { urlPublique } from '../../lib/chemins.js';

const PAUSE = 9000;   // ms entre deux conseils, si on la laisse parler

// Ce qu'elle dit : sa phrase pour chaque moment, puis les conseils qui vont avec
const CONSEILS_CAVERNE = [
  'Dans la Caverne, une seule règle : savoir s\'arrêter à temps.',
  'Le dragon dort… pour l\'instant. Ne sois pas trop gourmand.',
  'Les bourses piégées ne préviennent jamais. Encaisse avant.',
  'Sur le Pont Maudit, chaque planche est plus fragile que la précédente.',
  'Au Lac des Esprits, écoute la tension de la ligne : elle ne ment pas.',
];
const PAROLES = {
  erreur: { dit: () => 'La Caverne dort encore. Reviens un peu plus tard, voyageur.', conseils: [] },
  sansBadge: {
    dit: () => 'Sans badge, l\'arche reste muette. Il t\'en faut un pour l\'éveiller.',
    conseils: [
      'La Boutique en vend : vingt-quatre heures, une semaine, un mois ou trois mois.',
      'Certains succès et le Pass de saison en offrent aussi. Ouvre l\'œil.',
      ...CONSEILS_CAVERNE.slice(0, 2),
    ],
  },
  avecBadge: {
    dit: () => 'Pose un badge sur le socle, juste là, et l\'arche s\'éveillera.',
    conseils: [
      'Plus le badge est rare, plus le portail reste ouvert longtemps.',
      'Le temps des badges s\'ajoute : en poser un autre prolonge ton passage.',
      'Tu peux déplacer le socle : tiens-le, puis fais-le glisser.',
      ...CONSEILS_CAVERNE.slice(0, 1),
    ],
  },
  choix: {
    dit: () => 'Choisis bien… La couleur du portail sera celle de ton badge.',
    conseils: ['Argent, bleu, rouge ou or : à toi de voir quelle lumière te plaît.'],
  },
  eveil: {
    dit: (d) => `Tu sens ce frisson ? Le portail s'ouvre pour ${d.temps}.`,
    conseils: ['Touche son cœur quand tu es prêt.', ...CONSEILS_CAVERNE],
  },
  ouvert: {
    dit: () => 'Le passage est ouvert. Touche le cœur du portail pour descendre.',
    conseils: [...CONSEILS_CAVERNE, 'Tu peux déplacer le socle : tiens-le, puis fais-le glisser.'],
  },
  survol: { dit: () => 'Oui, là ! Plonge.', conseils: [] },
  route: { dit: () => 'À tout de suite, de l\'autre côté !', conseils: [] },
};

export default function Kaeliss({ situation, details = {} }) {
  const p = PAROLES[situation] ?? PAROLES.ouvert;
  // ce qu'elle dit : -1 sa phrase du moment, puis le numéro du conseil ; on repart de sa phrase quand le moment change
  const [parole, setParole] = useState({ pour: situation, n: -1 });
  const n = parole.pour === situation ? parole.n : -1;
  const suivant = () => setParole({ pour: situation, n: p.conseils.length ? (n + 1) % p.conseils.length : -1 });

  // si on la laisse parler, elle passe d'elle-même au conseil suivant
  useEffect(() => {
    if (!p.conseils.length) return undefined;
    const t = setTimeout(() => setParole({ pour: situation, n: (n + 1) % p.conseils.length }), PAUSE);
    return () => clearTimeout(t);
  }, [situation, n, p.conseils.length]);

  const texte = n < 0 ? p.dit(details) : p.conseils[n];
  return (
    <div className={`kaeliss kaeliss--${situation}`}>
      <button type="button" className="kaeliss__corps" onClick={suivant} title="Kaéliss : touche-la pour un autre conseil" aria-label="Kaéliss, un autre conseil">
        <span className="kaeliss__ombre" aria-hidden="true" />
        <span className="kaeliss__flotte" aria-hidden="true">
          <img className="kaeliss__image" src={urlPublique('img/Mascotte/Kaeliss.webp')} alt="" draggable="false" />
          {/* l'éclat de sang qui tourne autour d'elle */}
          <span className="kaeliss__eclat"><i /></span>
        </span>
      </button>
      <p key={`${situation}-${n}`} className="kaeliss__bulle" aria-live="polite">
        <b>Kaéliss</b>
        {texte}
      </p>
    </div>
  );
}
