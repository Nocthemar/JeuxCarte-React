// =====================================================================
//  Une carte du catalogue (ancien htmlCarte et htmlInfos de JS/cartes.js, même HTML)
//  - l'illustration, et en bas le cadre d'informations : nom, rang, attaques (Veine, effet, puissance), rareté ;
//  - une infobulle avec tout le texte de la carte (lisible même quand la carte est petite) ;
//  - image introuvable : on garde le cadre de la carte avec son nom.
//  Styles : styles/cartes-jeu.css (.carte-jeu) et styles/carte-infos.css (.carte-infos).
// =====================================================================
import { useState } from 'react';
import { RARETES, VEINES, RANGS, rareteDe, attaquesDe } from '../data/affichage.js';
import { urlPublique } from '../lib/chemins.js';

// Le cadre d'informations du bas de la carte, à la manière d'une carte Pokémon. Seulement pour les
// cartes qui ont un rang ou des attaques, et pour les Transcendantes (illustration pleine carte).
export function CarteInfos({ carte, rarete = rareteDe(carte) }) {
  const attaques = attaquesDe(carte);
  if (!carte.rank && !attaques.length && rarete !== 'transcendante') return null;
  const rang = RANGS[carte.rank];
  return (
    <div className={`carte-infos carte-infos--${rarete}`}>
      <div className="carte-infos__tete">
        <span className="carte-infos__nom">{carte.name}</span>
        {rang && <span className="carte-infos__rang" data-rang={rang} title={`Rang ${rang}`}>Rang {rang}</span>}
      </div>
      {attaques.length > 0 && (
        <div className="carte-infos__attaques">
          {attaques.map((a, i) => {
            const [veine, icone] = VEINES[a.veine] ?? ['Veine inconnue', '✦'];
            return (
              <div className="carte-attaque" key={i}>
                <span className="carte-attaque__veine" title={veine}>{icone}</span>
                <span className="carte-attaque__texte">
                  <span className="carte-attaque__nom">{a.nom}</span>
                  {a.effet && <span className="carte-attaque__effet">{a.effet}</span>}
                </span>
                {a.puissance != null && <span className="carte-attaque__puissance">{a.puissance}</span>}
              </div>
            );
          })}
        </div>
      )}
      <div className="carte-infos__rarete"><span className="carte-infos__gemme" />{RARETES[rarete]}</div>
    </div>
  );
}

// Infobulle : tout le texte de la carte
function infobulleDe(carte, rarete) {
  const rang = RANGS[carte.rank];
  const lignes = [`${carte.name}${rang ? ` — Rang ${rang}` : ''} — ${RARETES[rarete]}`];
  for (const a of attaquesDe(carte)) {
    const puissance = a.puissance != null ? ` (${a.puissance})` : '';
    lignes.push(`${VEINES[a.veine]?.[1] ?? '✦'} ${a.nom}${puissance}${a.effet ? ` : ${a.effet}` : ''}`);
  }
  if (carte.description) lignes.push(carte.description);
  return lignes.join('\n');
}

export default function Carte({ carte }) {
  const [imageCassee, setImageCassee] = useState(false);
  const rarete = rareteDe(carte);
  const avecImage = !!carte.image && !imageCassee;
  return (
    <div className={`carte-jeu carte-jeu--${rarete}${avecImage ? '' : ' carte-jeu--sans-image'}`}
      data-carte={carte.id} title={infobulleDe(carte, rarete)}>
      {avecImage && (
        <img src={urlPublique(carte.image)} alt="" draggable="false" loading="lazy" onError={() => setImageCassee(true)} />
      )}
      {/* comme avant : le cadre d'informations reste si l'image n'a pas pu se charger */}
      {carte.image && <CarteInfos carte={carte} rarete={rarete} />}
      <span className="carte-jeu__nom">{carte.name}</span>
    </div>
  );
}
