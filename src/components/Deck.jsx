// =====================================================================
//  Le deck du profil à l'écran : 5 emplacements (ancienne classe Deck de JS/cartes.js, même HTML)
//  - un clic sur une carte la retourne (recto <-> verso), Entrée / Espace aussi ;
//  - 🔍 : la carte en grand ; × : la retirer du deck (propriétaire) ; « Renommer » (propriétaire).
//  Les données et leur enregistrement : lib/deck.js (useDeck).
//
//  props : deck ({ nom, ids, cartes }), editable, lienAjout (adresse « + » des places vides, ou null),
//          surRetirer(position), surRenommer(nom) -> Promise<bool>, surLoupe(carte)
// =====================================================================
import { useState } from 'react';
import { Link } from 'react-router-dom';
import Carte from './Carte.jsx';
import { RARETES, versoDe } from '../data/affichage.js';
import { urlPublique } from '../lib/chemins.js';

// Le formulaire « Renommer »
function FormulaireNom({ nom, surValider, surAnnuler }) {
  const [valeur, setValeur] = useState(nom);
  const [envoi, setEnvoi] = useState(false);
  const valider = async (e) => {
    e.preventDefault();
    const n = valeur.trim();
    if (!n || n === nom) return surAnnuler();
    setEnvoi(true);
    if (!(await surValider(n))) setEnvoi(false);
  };
  return (
    <form className="deck-renommer" onSubmit={valider}>
      <input type="text" name="nom" maxLength={40} required aria-label="Nom du deck" value={valeur} disabled={envoi}
        autoFocus onFocus={(e) => e.target.select()} onChange={(e) => setValeur(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') surAnnuler(); }} />
      <button type="submit" className="btn-petit" disabled={envoi}>Enregistrer</button>
      <button type="button" className="btn-petit btn-petit--retirer" disabled={envoi} onClick={surAnnuler}>Annuler</button>
    </form>
  );
}

export default function Deck({ deck, editable = false, lienAjout = null, surRetirer, surRenommer, surLoupe }) {
  const [retournees, setRetournees] = useState(() => new Set());   // positions montrées de dos
  const [renommage, setRenommage] = useState(false);
  const retourner = (i) => setRetournees((r) => { const n = new Set(r); if (n.has(i)) n.delete(i); else n.add(i); return n; });

  return (
    <div id="deck">
      <div className="deck-tete">
        {renommage
          ? <FormulaireNom nom={deck.nom} surAnnuler={() => setRenommage(false)}
              surValider={async (n) => { const ok = await surRenommer(n); if (ok) setRenommage(false); return ok; }} />
          : (
            <>
              <h2 className="deck-nom">{deck.nom}</h2>
              {editable && <button type="button" className="btn-petit btn-petit--lien" data-action="renommer" onClick={() => setRenommage(true)}>Renommer</button>}
            </>
          )}
      </div>
      <div className="deck-emplacements">
        {deck.ids.map((id, i) => {
          const carte = id != null ? deck.cartes.get(id) : null;
          if (!carte) return (
            <div key={i} className="deck-emplacement" data-position={i}>
              {editable && lienAjout
                ? <Link className="deck-emplacement__ajout" to={lienAjout} title="Choisir une carte dans ma collection">+</Link>
                : <span className="deck-emplacement__num">{i + 1}</span>}
            </div>
          );
          const rarete = RARETES[carte.rarity] ? carte.rarity : 'commune';
          const retournee = retournees.has(i);
          return (
            <div key={i} className="deck-emplacement deck-emplacement--plein" data-position={i} data-nom={carte.name} data-rarete={rarete}>
              <div className={`deck-flip${retournee ? ' deck-flip--retournee' : ''}`} role="button" tabIndex={0} aria-pressed={retournee}
                title="Cliquer pour retourner la carte" aria-label={`Retourner ${carte.name}`}
                onClick={() => retourner(i)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); retourner(i); } }}>
                <Carte carte={carte} />
                <div className={`carte-verso carte-verso--${rarete}`} aria-hidden="true">
                  <img src={urlPublique(versoDe(carte.rarity))} alt="" draggable="false" loading="lazy" />
                </div>
              </div>
              <button type="button" className="carte-loupe" data-action="loupe" title="Voir la carte en grand" aria-label="Voir la carte en grand"
                onClick={() => surLoupe(carte)}>🔍</button>
              {editable && (
                <button type="button" className="deck-retirer" data-action="retirer" title="Retirer du deck" aria-label={`Retirer ${carte.name} du deck`}
                  onClick={() => surRetirer(i)}>×</button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
