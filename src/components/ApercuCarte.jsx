// =====================================================================
//  Une carte en grand avec son Codex (ancien ouvrirApercu et htmlCodex de JS/cartes.js, même HTML)
//  - le Codex : le récit de la carte, son origine (rareté, rang, Veines, provenance), son illustration
//    en grand, et sa page dans le Codex du site quand elle en a une ;
//  - fermeture : ×, Échap, ou un clic à côté de la carte.
//  createPortal : la fenêtre est posée directement dans <body>, par-dessus tout le reste de la page.
// =====================================================================
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Carte from './Carte.jsx';
import { RARETES, VEINES, RANGS, PAGES_CODEX, PROVENANCES, sansAccents, attaquesDe } from '../data/affichage.js';
import { urlPublique } from '../lib/chemins.js';
import { lienSite } from '../lib/lienSite.js';

// Garde la dernière version d'une fonction donnée par le parent, sans relancer les effets à chaque affichage
function useDernier(fonction) {
  const ref = useRef(fonction);
  useEffect(() => { ref.current = fonction; });
  return ref;
}

// L'illustration en grand, par-dessus l'aperçu. Un clic n'importe où (ou Échap) la ferme.
function IllustrationGrande({ carte, surFermeture }) {
  const bouton = useRef(null);
  const fermer = useDernier(surFermeture);
  useEffect(() => {
    bouton.current.focus();
    // Phase de capture + stopPropagation : Échap ferme l'illustration SANS fermer l'aperçu dessous
    const clavier = (e) => { if (e.key === 'Escape') { e.stopPropagation(); fermer.current(); } };
    document.addEventListener('keydown', clavier, true);
    return () => document.removeEventListener('keydown', clavier, true);
  }, [fermer]);
  return createPortal(
    <div className="illustration-grande" role="dialog" aria-modal="true" aria-label={carte.name}
      onClick={(e) => { e.stopPropagation(); surFermeture(); }}>
      <img src={urlPublique(carte.image)} alt={carte.name} />
      <button type="button" className="apercu-carte__fermer" aria-label="Fermer" ref={bouton}>×</button>
    </div>,
    document.body,
  );
}

export function Codex({ carte }) {
  const [illustration, setIllustration] = useState(false);
  const boutonIllustration = useRef(null);
  const veines = [...new Set(attaquesDe(carte).map((a) => a.veine).filter(Boolean))];
  const page = PAGES_CODEX[sansAccents(carte.name)];
  const lignes = [
    ['Rareté', RARETES[carte.rarity] ?? carte.rarity],
    carte.rank ? ['Rang', RANGS[carte.rank] ?? carte.rank] : null,
    veines.length ? ['Veines', veines.map((v) => (VEINES[v] ? `${VEINES[v][1]} ${VEINES[v][0]}` : v)).join(' · ')] : null,
    carte.source ? ['Provenance', PROVENANCES[carte.source] ?? carte.source] : null,
  ].filter(Boolean);
  const fermerIllustration = () => { setIllustration(false); boutonIllustration.current?.focus(); };

  return (
    <section className="codex-carte" aria-label="Codex">
      <h3 className="codex-carte__titre">Codex</h3>
      <p className="codex-carte__recit">{carte.description || 'Le Codex ne dit encore rien de cette carte.'}</p>
      <dl className="codex-carte__origine">
        {lignes.map(([t, v]) => <div key={t}><dt>{t}</dt><dd>{v}</dd></div>)}
      </dl>
      <p className="codex-carte__liens">
        {carte.image && (
          <button type="button" className="codex-carte__bouton" ref={boutonIllustration} onClick={() => setIllustration(true)}>
            Voir l&apos;illustration en grand
          </button>
        )}
        {page && (
          <a className="codex-carte__bouton" href={lienSite(page)} target="_blank" rel="noopener noreferrer">
            Lire sa page dans le Codex de Nocthémar
          </a>
        )}
      </p>
      {illustration && <IllustrationGrande carte={carte} surFermeture={fermerIllustration} />}
    </section>
  );
}

export default function ApercuCarte({ carte, surFermeture }) {
  const boutonFermer = useRef(null);
  const fermer = useDernier(surFermeture);

  // Une seule fois, à l'ouverture : le focus sur ×, et Échap pour fermer
  useEffect(() => {
    const retour = document.activeElement;   // l'élément à qui rendre le focus à la fermeture
    boutonFermer.current.focus();
    const clavier = (e) => { if (e.key === 'Escape') fermer.current(); };
    document.addEventListener('keydown', clavier);
    return () => {
      document.removeEventListener('keydown', clavier);
      retour?.focus?.();
    };
  }, [fermer]);

  return createPortal(
    <div className="apercu-carte" role="dialog" aria-modal="true" aria-label={carte.name}
      // Clic à côté de la carte ou sur × : fermeture
      onClick={(e) => { if (!e.target.closest('.carte-jeu, .apercu-carte__codex')) surFermeture(); }}>
      <div className="apercu-carte__carte"><Carte carte={carte} /></div>
      <div className="apercu-carte__codex"><Codex carte={carte} /></div>
      <button type="button" className="apercu-carte__fermer" aria-label="Fermer" ref={boutonFermer}>×</button>
    </div>,
    document.body,
  );
}
