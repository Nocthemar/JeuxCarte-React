// =====================================================================
//  Les échanges du Marché : un contrat comme un parchemin, et ses éléments (ancien JS/marche-echanges.js, même HTML)
//  - Eventail : des cartes en éventail (avec 🔍) ; PuceObjet : un objet ou cosmétique ; Sceau : le sceau de cire
//    d'un joueur (ses initiales dans la cire, son pseudo autour) ;
//  - Contrat : ce que chacun donne, la valeur estimée, les deux sceaux, et les actions (sceau, modifier, rompre) ;
//  - AnnonceConclue : une vente du Marché, dans le registre.
//
//  infos : { carte(id), objet(id), nom(discordId), moi } (les cartes, objets et joueurs déjà connus)
// =====================================================================
import { useState } from 'react';
import Carte from '../Carte.jsx';
import { STATUTS, TYPES_OBJET, nombre, valeurCote } from '../../lib/marche.js';

export const Loupe = ({ carte, surApercu }) => (
  <button type="button" className="echange__loupe" title="Voir la carte en grand" aria-label="Voir la carte en grand"
    onClick={(e) => { e.stopPropagation(); surApercu(carte); }}>🔍</button>
);

export function Eventail({ ids, infos, surApercu, vide = 'Aucune carte' }) {
  if (!ids.length) return <div className="eventail eventail--vide"><span>{vide}</span></div>;
  return (
    <div className="eventail" style={{ '--n': ids.length }}>
      {ids.map((id, i) => {
        const c = infos.carte(id);
        return c ? (
          <span key={id} className="eventail__carte" style={{ '--k': (i - (ids.length - 1) / 2).toFixed(1) }}>
            <Carte carte={c} /><Loupe carte={c} surApercu={surApercu} />
          </span>
        ) : null;
      })}
    </div>
  );
}

export function PuceObjet({ o, nom }) {
  return <span className="objet-puce">{o?.kind && TYPES_OBJET[o.kind] && <small>{TYPES_OBJET[o.kind]}</small>}{o?.name ?? nom ?? 'Objet'}</span>;
}

function Sceau({ nom, pose }) {
  if (!pose) {
    return (
      <span className="sceau sceau--vide" title={`En attente du sceau de ${nom}`}>
        <span className="sceau__cercle" /><span className="sceau__nom">{nom}</span>
      </span>
    );
  }
  const initiales = nom.split(/[\s_.-]+/).filter(Boolean).slice(0, 2).map((m) => m[0]).join('').toUpperCase() || '✦';
  return (
    <span className="sceau sceau--pose" title={`Sceau de ${nom}`}>
      <span className="sceau__cire"><b>{initiales}</b></span><span className="sceau__nom">{nom}</span>
    </span>
  );
}

// clos : dans le registre (ratifié, rompu, impossible)
export function Contrat({ c, clos = false, infos, surApercu, surSceau, surModifier, surRompre }) {
  const [envoi, setEnvoi] = useState(false);
  const moi = infos.moi;
  const jeSuisDe = c.de === moi;
  const autre = jeSuisDe ? c.pour : c.de;
  const monSceau = jeSuisDe ? c.sceau_de : c.sceau_pour;
  const brises = !clos && !c.sceau_de && !c.sceau_pour && c.version > 1 && c.modifie_par;
  const date = new Date(c.ratifie_le ?? c.maj_le ?? c.cree_le);
  const agir = async (fn) => { setEnvoi(true); await fn(); setEnvoi(false); };

  const cote = (joueur, cartes, or, objets) => (
    <div className="contrat__cote">
      <h4>{joueur === moi ? 'Tu donnes' : `${infos.nom(joueur)} donne`}</h4>
      <Eventail ids={cartes} infos={infos} surApercu={surApercu} />
      {or > 0 && <p className="contrat__or"><span aria-hidden="true">◉</span> {nombre(or)} or</p>}
      {objets.length > 0 && <p className="contrat__objets">{objets.map((id) => <PuceObjet key={id} o={infos.objet(id)} />)}</p>}
      <p className="contrat__valeur">≈ {nombre(valeurCote(infos, cartes, or, objets))} or</p>
    </div>
  );

  return (
    <article className={`contrat${clos ? ` contrat--clos contrat--${c.statut}` : ''}`} data-contrat={c.id}>
      <header className="contrat__tete">
        <h3 className="contrat__titre">Contrat n°{c.id}</h3>
        <p className="contrat__parties">Entre <b>{infos.nom(c.de)}</b> et <b>{infos.nom(c.pour)}</b></p>
        {clos && <span className="contrat__statut">{STATUTS[c.statut] ?? c.statut}</span>}
        <time dateTime={date.toISOString()}>{date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}</time>
      </header>
      {c.message && <p className="contrat__clause">« {c.message} »</p>}
      <div className="contrat__termes">
        {cote(c.de, c.cartes_de, c.or_de, c.objets_de)}
        <span className="contrat__balance" aria-hidden="true">⚖</span>
        {cote(c.pour, c.cartes_pour, c.or_pour, c.objets_pour)}
      </div>
      {brises && <p className="contrat__brise">Sceaux brisés : {c.modifie_par === moi ? 'tu as' : `${infos.nom(c.modifie_par)} a`} modifié le contrat. Relisez-le et apposez à nouveau vos sceaux.</p>}
      {c.raison && <p className="contrat__raison">{c.raison}</p>}
      <div className="contrat__sceaux">
        <Sceau nom={infos.nom(c.de)} pose={c.statut === 'ratifie' || c.sceau_de} />
        <Sceau nom={infos.nom(c.pour)} pose={c.statut === 'ratifie' || c.sceau_pour} />
      </div>
      {!clos && (
        <footer className="contrat__actions">
          {monSceau
            ? <span className="contrat__attente">Ton sceau est apposé : en attente de celui de {infos.nom(autre)}…</span>
            : <button type="button" className="btn-dc-or btn-sceau" data-sceau={c.id} data-version={c.version} disabled={envoi} onClick={() => agir(surSceau)}>Apposer mon sceau</button>}
          <button type="button" className="btn-petit" data-modifier={c.id} onClick={surModifier}>Modifier</button>
          <button type="button" className="btn-petit btn-petit--retirer" data-rompre={c.id} disabled={envoi} onClick={() => agir(surRompre)}>Rompre</button>
        </footer>
      )}
    </article>
  );
}

export function AnnonceConclue({ a, infos }) {
  const c = infos.carte(a.card_id);
  const vendeur = a.type === 'vente' ? a.auteur : a.conclu_par;
  const acheteur = a.type === 'vente' ? a.conclu_par : a.auteur;
  return (
    <article className="contrat contrat--clos contrat--ratifie contrat--annonce">
      <header className="contrat__tete">
        <h3 className="contrat__titre">Marché</h3>
        <p className="contrat__parties"><b>{infos.nom(vendeur)}</b> a vendu « {c?.name ?? 'une carte'} » à <b>{infos.nom(acheteur)}</b> pour {nombre(a.prix)} or</p>
        <time dateTime={a.conclu_le}>{new Date(a.conclu_le).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}</time>
      </header>
    </article>
  );
}
