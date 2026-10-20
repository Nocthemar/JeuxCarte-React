// =====================================================================
//  Recycler les exemplaires en trop d'une carte, contre de l'or et de l'XP de pass (ancien JS/collection.js)
//  Le dernier exemplaire est toujours gardé (recycler_carte, supabase/schema.sql).
//  props : id (de la carte), entree ({ carte, quantite }), surRecycle(restants), surFermeture()
// =====================================================================
import { useEffect, useRef, useState } from 'react';
import Carte from '../Carte.jsx';
import { supabase } from '../../lib/supabase.js';
import { useNotifier } from '../../lib/notification.js';
import { valeurCarte, texteGains } from '../../lib/collection.js';

export default function Recyclage({ id, entree, surRecycle, surFermeture }) {
  const notifier = useNotifier();
  const fenetre = useRef(null);
  const ok = useRef(null);
  const [nombre, setNombre] = useState(entree.quantite - 1);
  const [envoi, setEnvoi] = useState(false);
  const n = Math.max(1, Math.min(nombre, entree.quantite - 1));

  useEffect(() => {
    const d = fenetre.current;
    if (!d.open) d.showModal();
    ok.current.focus();
    return () => { if (d.open) d.close(); };
  }, []);

  const recycler = async () => {
    if (envoi) return;
    setEnvoi(true);
    const { data, error } = await supabase.rpc('recycler_carte', { p_card_id: id, p_nombre: n });
    setEnvoi(false);
    if (error) { notifier(error.message || 'Recyclage impossible.', 'erreur'); return; }
    surRecycle(data.restants);
    surFermeture();
    notifier(`♻ ${data.exemplaires} exemplaire${data.exemplaires > 1 ? 's' : ''} recyclé${data.exemplaires > 1 ? 's' : ''} : ${texteGains(data.or, data.exemplaires)}`);
  };

  return (
    <dialog className="recyclage" id="recyclage" aria-labelledby="recyclage-titre" ref={fenetre}
      onCancel={(e) => { e.preventDefault(); surFermeture(); }}
      onClick={(e) => { e.stopPropagation(); if (e.target === fenetre.current) surFermeture(); }}>
      <div className="recyclage__carte" id="recyclage-carte"><Carte carte={entree.carte} /></div>
      <div className="recyclage__corps">
        <h2 id="recyclage-titre" className="recyclage__titre">Recycler « {entree.carte.name} »</h2>
        <p className="recyclage__texte" id="recyclage-texte">Tu en as {entree.quantite} exemplaires. Le dernier est toujours gardé dans ton grimoire.</p>
        <label className="recyclage__nombre">
          Exemplaires à recycler
          <span className="recyclage__choix">
            <button type="button" className="recyclage__pas" data-pas="-1" aria-label="Un de moins" disabled={n <= 1} onClick={() => setNombre(n - 1)}>−</button>
            <output id="recyclage-nombre">{n}</output>
            <button type="button" className="recyclage__pas" data-pas="1" aria-label="Un de plus" disabled={n >= entree.quantite - 1} onClick={() => setNombre(n + 1)}>+</button>
          </span>
        </label>
        <p className="recyclage__gain" id="recyclage-gain">{texteGains(valeurCarte(entree.carte) * n, n)}</p>
        <div className="recyclage__boutons">
          <button type="button" className="btn-recycler btn-recycler--plein" id="recyclage-ok" ref={ok} disabled={envoi} onClick={recycler}>♻ Recycler</button>
          <button type="button" className="recyclage__annuler" id="recyclage-annuler" onClick={surFermeture}>Annuler</button>
        </div>
      </div>
    </dialog>
  );
}
