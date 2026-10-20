// =====================================================================
//  Une récompense de la piste du Pass (ancien htmlRecompense et contenuRecompense de JS/pass.js, même HTML)
//  Son type, son visuel (pièce, carte, dos de carte de la rareté, booster, plateau, icône), son nom,
//  et selon son état : « Réclamer », « Réclamée », ou verrouillée (« Premium » si la piste n'est pas débloquée).
// =====================================================================
import { useState } from 'react';
import Carte from '../Carte.jsx';
import { RARETES, versoDe } from '../../data/affichage.js';
import { urlPublique } from '../../lib/chemins.js';
import { TYPES, nombre, PIECE } from '../../data/pass.js';

const ICONES = {
  dos_carte: <><rect x="6" y="3" width="12" height="18" rx="1.5" /><path d="M12 7l3 5-3 5-3-5z" /></>,
  cadre_portrait: <><path d="M12 2l8 4.5v11L12 22l-8-4.5v-11z" /><circle cx="12" cy="10" r="3" /><path d="M7.5 17a5 5 0 0 1 9 0" /></>,
  titre: <><path d="M4 7h16v10H4z" /><path d="M8 11h8M8 14h5" /></>,
  fond_plateau: <><path d="M3 17l5-6 4 4 3-3 6 5z" /><circle cx="16" cy="7" r="2" /><path d="M3 20h18" /></>,
  cadenas: <><rect x="5" y="10" width="14" height="10" rx="1.5" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  coche: <path d="M5 12.5l4.5 4.5L19 7" />,
};
export const Icone = ({ nom }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONES[nom]}</svg>
);

// Le visuel et le nom
function Contenu({ p, catalogue, surApercu }) {
  const v = p.valeur ?? {};
  if (p.type_recompense === 'or') {
    return (
      <>
        <span className="recompense__visuel recompense__visuel--or"><img src={urlPublique(PIECE)} alt="" /></span>
        <span className="recompense__nom">{nombre(v.montant)} or</span>
      </>
    );
  }
  if (p.type_recompense === 'carte') {
    const c = catalogue.cartes.get(v.nom);
    return (
      <>
        <span className="recompense__visuel recompense__visuel--carte">
          {c?.image
            ? <button type="button" className="recompense__loupe" title="Voir la carte en grand" aria-label={`Voir la carte ${v.nom}`} onClick={() => surApercu(c)}><Carte carte={c} /></button>
            : <Icone nom="dos_carte" />}
        </span>
        <span className="recompense__nom">{v.nom ?? 'Carte'}</span>
      </>
    );
  }
  if (p.type_recompense === 'carte_rarete') {
    // Une carte au hasard de cette rareté : son dos, de la couleur de la rareté
    const r = RARETES[v.rarete] ? v.rarete : 'mythique';
    return (
      <>
        <span className={`recompense__visuel recompense__visuel--carte recompense__visuel--${r}`}><img src={urlPublique(versoDe(r))} alt="" loading="lazy" /></span>
        <span className="recompense__nom">Carte {RARETES[r].toLowerCase()}</span>
      </>
    );
  }
  if (p.type_recompense === 'booster') {
    const b = catalogue.boosters.get(v.booster ?? 'cendres');
    const n = v.quantite ?? 1;
    return (
      <>
        <span className="recompense__visuel recompense__visuel--carte">{b?.image ? <img src={urlPublique(b.image)} alt="" loading="lazy" /> : <Icone nom="dos_carte" />}</span>
        <span className="recompense__nom">{b?.nom ?? 'Booster'}{n > 1 ? ` ×${n}` : ''}</span>
      </>
    );
  }
  if (p.type_recompense === 'fond_plateau' && v.plateau) {
    // Un vrai plateau de la Boutique (sa miniature), à choisir ensuite dans la Collection
    const pl = catalogue.plateaux.get(v.plateau);
    return (
      <>
        <span className="recompense__visuel recompense__visuel--plateau">{pl?.miniature ? <img src={urlPublique(pl.miniature)} alt="" loading="lazy" /> : <Icone nom="fond_plateau" />}</span>
        <span className="recompense__nom">{pl?.nom ?? v.nom ?? 'Plateau'}</span>
      </>
    );
  }
  return (
    <>
      <span className="recompense__visuel recompense__visuel--cosmetique"><Icone nom={p.type_recompense} /></span>
      <span className="recompense__nom">{v.nom ?? TYPES[p.type_recompense]}</span>
    </>
  );
}

// etat : 'disponible' | 'reclamee' | 'verrouillee' ; premiumBloque : la piste premium n'est pas débloquée
export default function Recompense({ p, piste, etat, premiumBloque, catalogue, surApercu, surReclamer }) {
  const [envoi, setEnvoi] = useState(false);
  if (!p) return <div className="recompense recompense--absente" />;
  const titre = `${TYPES[p.type_recompense]}${['dos_carte', 'cadre_portrait', 'fond_plateau'].includes(p.type_recompense) && !p.valeur?.plateau
    ? ' (bientôt visible en jeu)' : p.valeur?.plateau ? ' : à choisir ensuite dans ta Collection' : ''}`;
  return (
    <div className={`recompense recompense--${etat} recompense--${piste} recompense--${p.type_recompense}`} title={titre}>
      <span className="recompense__type">{TYPES[p.type_recompense]}</span>
      <Contenu p={p} catalogue={catalogue} surApercu={surApercu} />
      {etat === 'disponible'
        ? <button type="button" className="btn-reclamer" data-numero={p.numero} data-piste={piste} disabled={envoi}
            onClick={async () => { setEnvoi(true); await surReclamer(p.numero, piste); setEnvoi(false); }}>{envoi ? '…' : 'Réclamer'}</button>
        : etat === 'reclamee'
          ? <span className="recompense__etat recompense__etat--ok"><Icone nom="coche" /> Réclamée</span>
          : <span className="recompense__etat"><Icone nom="cadenas" /> {piste === 'premium' && premiumBloque ? 'Premium' : 'Verrouillée'}</span>}
    </div>
  );
}
