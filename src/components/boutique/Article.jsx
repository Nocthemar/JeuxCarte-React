// =====================================================================
//  Boutique : ce qui est commun aux étals (ancien JS/boutique-commun.js, même HTML)
//  - Article : l'objet posé dans sa niche sur l'étagère, et son étiquette suspendue en dessous
//    (type, nom, description, prix, achat) ;
//  - Apercu : le petit aperçu selon la sorte d'objet ; Pastilles : les couleurs d'un thème ;
//  - Piece : la petite pièce d'or à côté des prix ; BoutonAchat : le bouton selon le solde.
// =====================================================================
import { useState } from 'react';
import { urlPublique } from '../../lib/chemins.js';
import { lienSite } from '../../lib/lienSite.js';

const LIBELLES = { banner: 'Bannière', title: 'Titre', theme: 'Thème', rp: 'Objet', wallpaper: 'Fond', access: 'Accès', other: 'Divers' };
const couleur = (c) => (/^#[0-9a-f]{3,8}$/i.test(c ?? '') ? c : null);

export const Piece = () => <img className="piece" src={urlPublique('img/Equipement/Or-icone.webp')} alt="pièces" />;

// Petit aperçu visuel selon le type d'objet ; une image introuvable est retirée (ou remplacée par l'étoile)
// (les images des articles, bannières et potions, restent sur le site Nocthémar)
function Apercu({ item }) {
  const [cassee, setCassee] = useState(false);
  const p = item.payload ?? {};
  if (item.kind === 'banner' && p.image) {
    return cassee ? null : <div className="apercu"><img src={lienSite(p.image)} alt="" onError={() => setCassee(true)} /></div>;
  }
  // Thème : son nom dans la case (comme un titre) ; ses couleurs sont en pastilles sous le nom
  if (item.kind === 'theme') {
    const nom = item.name.match(/«\s*(.+?)\s*»/)?.[1] ?? item.name;
    return <div className="apercu apercu--titre">« {nom} »</div>;
  }
  if (item.kind === 'title' && p.text) return <div className="apercu apercu--titre">« {p.text} »</div>;
  // Tous les autres objets (potions, jetons…) peuvent avoir une image
  if (item.kind !== 'banner' && p.image && !cassee) {
    return <img className="article__icone" src={lienSite(p.image)} alt="" onError={() => setCassee(true)} />;
  }
  // Pas d'image : une petite étoile au centre de la niche
  return <span className="article__sans-image" aria-hidden="true">✦</span>;
}

// Couleurs d'un thème en petites pastilles rondes (rien pour les autres objets)
export function Pastilles({ item }) {
  if (item.kind !== 'theme') return null;
  const couleurs = [item.payload?.accent, item.payload?.accent2].map(couleur).filter(Boolean);
  if (!couleurs.length) return null;
  return (
    <div className="pastilles" aria-label="Couleurs du thème">
      {couleurs.map((c, i) => <span key={i} className="pastille" style={{ '--c': c }} title={c} />)}
    </div>
  );
}

export function Article({ item, prix, bouton, extra = null }) {
  return (
    <article className="article">
      <div className="article__niche"><Apercu item={item} /></div>
      <div className="article__etiquette">
        <span className="article__type">{LIBELLES[item.kind] ?? item.kind}</span>
        <h3 className="article__nom">{item.name}</h3>
        {extra}
        <p className="article__desc">{item.description ?? ''}</p>
        <div className="article__prix">{prix} <Piece /></div>
        {bouton}
      </div>
    </article>
  );
}

// Bouton d'achat : bloqué (texte donné), pas connecté, pas assez de pièces, ou « Acheter »
// (désactivé dès le premier clic, pour qu'un double-clic ne lance pas deux achats)
export function BoutonAchat({ connecte, solde, prix, bloque = null, surAchat, texte = 'Acheter', attributs = {} }) {
  const [achat, setAchat] = useState(false);
  if (bloque) return <button type="button" className="btn-acheter" disabled>{bloque}</button>;
  if (!connecte) return <button type="button" className="btn-acheter" disabled>Connecte-toi pour acheter</button>;
  if (solde < prix) return <button type="button" className="btn-acheter" disabled>Pas assez de pièces</button>;
  return (
    <button type="button" className="btn-acheter" disabled={achat} {...attributs}
      onClick={async () => { setAchat(true); await surAchat(); setAchat(false); }}>
      {achat ? 'Achat…' : texte}
    </button>
  );
}
