// =====================================================================
//  Le son, pendant une partie de Gemmes : un bouton pour couper / remettre le son, et un petit panneau
//  avec les trois volumes (général, effets, musique), les mêmes que dans Paramètres (lib/son.js).
// =====================================================================
import { useEffect, useRef, useState } from 'react';
import {
  jouerSon, basculerMuet, estMuet, lireVolumes, reglerVolume, reglerVolumeEffets, reglerVolumeMusique,
} from '../../lib/son.js';

const CURSEURS = [
  ['general', 'Général', reglerVolume],
  ['effets', 'Effets', reglerVolumeEffets],
  ['musique', 'Musique', reglerVolumeMusique],
];

export default function ReglageSon() {
  const [muet, setMuet] = useState(estMuet);
  const [ouvert, setOuvert] = useState(false);
  const [volumes, setVolumes] = useState(() => {
    const v = lireVolumes();
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, Math.round(x * 100)]));
  });
  const zone = useRef(null);

  // Un clic ailleurs, ou Échap : le panneau se ferme
  useEffect(() => {
    if (!ouvert) return undefined;
    const dehors = (e) => { if (!zone.current?.contains(e.target)) setOuvert(false); };
    const echap = (e) => { if (e.key === 'Escape') setOuvert(false); };
    addEventListener('pointerdown', dehors);
    addEventListener('keydown', echap);
    return () => { removeEventListener('pointerdown', dehors); removeEventListener('keydown', echap); };
  }, [ouvert]);

  const couper = () => { basculerMuet(); setMuet(estMuet()); jouerSon('clic'); };
  const regler = (cle, fixer, valeur) => {
    fixer(valeur / 100);
    setVolumes((v) => ({ ...v, [cle]: valeur }));
    setMuet(estMuet());
  };

  return (
    <div className="gm-son" ref={zone}>
      <button type="button" className={`gm-outil${muet ? ' est-muet' : ''}`} aria-pressed={muet}
        title={muet ? 'Remettre le son' : 'Couper le son'} aria-label={muet ? 'Remettre le son' : 'Couper le son'} onClick={couper}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 9h4l5-4v14l-5-4H4z" />
          {muet ? <path d="M16 9l6 6M22 9l-6 6" /> : <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" />}
        </svg>
      </button>
      <button type="button" className={`gm-outil${ouvert ? ' est-actif' : ''}`} aria-expanded={ouvert} aria-controls="gm-volumes"
        title="Régler le son" aria-label="Régler le son" onClick={() => { setOuvert((o) => !o); jouerSon('clic'); }}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4v16M12 4v16M19 4v16" /><path d="M3 15h4M10 8h4M17 13h4" /></svg>
      </button>
      {ouvert && (
        <div className="gm-volumes" id="gm-volumes" role="group" aria-label="Volumes">
          <span className="gm-volumes__titre">Le son</span>
          {CURSEURS.map(([cle, nom, fixer]) => (
            <label key={cle} className="gm-volumes__ligne">
              <span>{nom}</span>
              <input type="range" min="0" max="100" step="5" value={volumes[cle]} style={{ '--pct': `${volumes[cle]}%` }}
                onChange={(e) => regler(cle, fixer, Number(e.target.value))}
                onPointerUp={() => jouerSon('clic')} onKeyUp={() => jouerSon('clic')} />
              <b>{volumes[cle]} %</b>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
